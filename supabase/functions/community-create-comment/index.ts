/**
 * community-create-comment — Plus+ tier required (same gate as posting).
 *
 * Validates body length, profanity check, rate-limits to 30 comments/hour
 * per user, blocks comments on posts where the user is blocked OR has
 * blocked the post author (symmetric block model).
 *
 * Triggers fire downstream: notify post author + parent-comment author.
 *
 * Deploy: supabase functions deploy community-create-comment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BODY_MIN = 1, BODY_MAX = 4000;
const COMMENTS_PER_HOUR = 30;

const PROFANITY = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'faggot', 'retard',
];

function looksProfane(s: string): boolean {
  const lower = s.toLowerCase();
  return PROFANITY.some((p) => lower.includes(p));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid session' }, 401);

    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const isBetaTester = !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await admin
      .from('profiles').select('subscription_tier, username').eq('id', user.id).maybeSingle();

    const tier = await resolveEffectiveTier(admin, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    if (tier === 'free') {
      return json({ error: 'Commenting requires PepTalk+ or Pro.', upgrade: true }, 403);
    }
    if (!profile?.username) {
      return json({ error: 'Set a community handle first.', needsUsername: true }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const postId = String(body?.postId ?? '').trim();
    const parentCommentId = body?.parentCommentId ? String(body.parentCommentId).trim() : null;
    const text = String(body?.body ?? '').trim();
    const isAnonymous = !!body?.isAnonymous;

    if (!postId) return json({ error: 'postId required' }, 400);
    if (text.length < BODY_MIN || text.length > BODY_MAX) {
      return json({ error: `Comment must be ${BODY_MIN}-${BODY_MAX} characters.` }, 400);
    }
    if (looksProfane(text)) {
      return json({ error: 'Comment contains language not allowed in the community.' }, 400);
    }

    // Hourly rate limit.
    const sinceHour = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count: hourly } = await admin
      .from('community_comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', sinceHour);
    if ((hourly ?? 0) >= COMMENTS_PER_HOUR) {
      return json({ error: `Slow down — ${COMMENTS_PER_HOUR} comments/hour limit hit.` }, 429);
    }

    // Block check: bail if user blocked the post author OR vice versa.
    const { data: post } = await admin
      .from('community_posts').select('user_id, is_deleted').eq('id', postId).maybeSingle();
    if (!post || post.is_deleted) return json({ error: 'Post not found.' }, 404);

    if (post.user_id !== user.id) {
      const { data: blockA } = await admin
        .from('community_blocks').select('id')
        .eq('blocker_id', user.id).eq('blocked_id', post.user_id).maybeSingle();
      const { data: blockB } = await admin
        .from('community_blocks').select('id')
        .eq('blocker_id', post.user_id).eq('blocked_id', user.id).maybeSingle();
      if (blockA || blockB) {
        return json({ error: 'You can\'t comment here.' }, 403);
      }
    }

    const { data: created, error: insertErr } = await admin
      .from('community_comments')
      .insert({
        post_id: postId,
        parent_comment_id: parentCommentId,
        user_id: user.id,
        body: text,
        is_anonymous: isAnonymous,
      })
      .select('id, created_at')
      .single();

    if (insertErr) throw insertErr;

    // ─── @mention notifications ──────────────────────────────────────────
    // Parse @username tokens from the body, resolve them to user ids via
    // public_profiles, and insert one 'mention' community_notifications row
    // per mentioned user. The existing community_notifications_push_fanout
    // AFTER INSERT trigger then delivers each row to the recipient's devices,
    // and the tap router + local-banner poller already render 'mention'.
    // Reactions are handled by a DB trigger (migration); mentions need the
    // parsed body so they live here. Bounded + guards self/post-author
    // double-pings. Best-effort — never fail the comment on a mention error.
    try {
      const MAX_MENTIONS = 10;
      // Handles are [a-z0-9_], 1-30 chars; lowercased + de-duped.
      const handles = Array.from(
        new Set(
          (text.match(/@([a-zA-Z0-9_]{1,30})/g) ?? []).map((m) =>
            m.slice(1).toLowerCase(),
          ),
        ),
      ).slice(0, MAX_MENTIONS);

      if (handles.length > 0) {
        // Load every block row touching the commenter in EITHER direction so a
        // @mention can't push-notify someone the commenter blocked or who blocked
        // the commenter (mirrors the symmetric post-author block check above).
        const { data: blockRows } = await admin
          .from('community_blocks')
          .select('blocker_id, blocked_id')
          .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
        const blockedParties = new Set<string>();
        for (const b of blockRows ?? []) {
          // The "other" party in each block relative to the commenter.
          if (b.blocker_id === user.id && b.blocked_id) blockedParties.add(b.blocked_id);
          if (b.blocked_id === user.id && b.blocker_id) blockedParties.add(b.blocker_id);
        }

        // Case-insensitive exact match (ilike, no wildcards). Handles are
        // \w-only so they're safe to interpolate into a PostgREST .or filter.
        const orFilter = handles.map((h) => `username.ilike.${h}`).join(',');
        const { data: mentioned } = await admin
          .from('public_profiles')
          .select('id, username')
          .or(orFilter);

        const seen = new Set<string>();
        const rows = (mentioned ?? [])
          .filter((p: any) => {
            if (!p?.id) return false;
            if (p.id === user.id) return false;        // no self-mention
            if (p.id === post.user_id) return false;   // post author already gets reply_to_post
            if (blockedParties.has(p.id)) return false; // symmetric block: no mention ping
            if (seen.has(p.id)) return false;          // de-dupe
            seen.add(p.id);
            return true;
          })
          .map((p: any) => ({
            user_id: p.id,
            kind: 'mention',
            post_id: postId,
            comment_id: created!.id,
            actor_id: user.id,
          }));

        if (rows.length > 0) {
          await admin.from('community_notifications').insert(rows);
        }
      }
    } catch (mentionErr) {
      console.warn('[community-create-comment] mention dispatch failed:', mentionErr);
    }

    return json({ ok: true, commentId: created!.id, createdAt: created!.created_at });
  } catch (err) {
    console.error('[community-create-comment]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
