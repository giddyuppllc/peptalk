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

    const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
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

    return json({ ok: true, commentId: created!.id, createdAt: created!.created_at });
  } catch (err) {
    console.error('[community-create-comment]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
