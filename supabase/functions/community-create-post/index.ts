/**
 * community-create-post — Plus+ tier required.
 *
 * Validates topic / title / body, runs profanity check on body+title,
 * applies rate limiting (10 posts/day), enforces new-account cooldown
 * (1 post/24h for accounts <24h old), and inserts into community_posts.
 *
 * Deploy: supabase functions deploy community-create-post
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

const TITLE_MIN = 3, TITLE_MAX = 140;
const BODY_MIN = 1,  BODY_MAX  = 8000;
const POSTS_PER_DAY_PLUS = 10;
const POSTS_PER_DAY_PRO  = 30;
const NEW_ACCOUNT_COOLDOWN_HOURS = 24;
const NEW_ACCOUNT_POST_LIMIT = 1;

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

    // Tier gate — Plus+ for posting (Edward's call).
    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const isBetaTester =
      !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await admin
      .from('profiles').select('subscription_tier, username, created_at')
      .eq('id', user.id).maybeSingle();

    const tier = await resolveEffectiveTier(admin, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    if (tier === 'free') {
      return json({ error: 'Posting requires PepTalk+ or Pro.', upgrade: true }, 403);
    }
    if (!profile?.username) {
      return json({ error: 'Set a community handle first.', needsUsername: true }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim();
    const postBody = String(body?.body ?? '').trim();
    const topicSlug = String(body?.topicSlug ?? '').trim();
    const isAnonymous = !!body?.isAnonymous;

    // Image attachments — already R2-public URLs minted by
    // community-upload-image. We re-validate the host to make sure the
    // client isn't sneaking arbitrary URLs into the body.
    const R2_PUBLIC_BASE = (Deno.env.get('R2_PUBLIC_BASE') ?? '').replace(/\/$/, '');
    const rawImageUrls = Array.isArray(body?.imageUrls) ? body.imageUrls : [];
    const imageUrls: string[] = [];
    for (const u of rawImageUrls) {
      if (typeof u !== 'string') continue;
      if (R2_PUBLIC_BASE && !u.startsWith(R2_PUBLIC_BASE + '/')) continue;
      imageUrls.push(u);
      if (imageUrls.length >= 4) break;
    }

    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return json({ error: `Title must be ${TITLE_MIN}-${TITLE_MAX} characters.` }, 400);
    }
    if (postBody.length < BODY_MIN || postBody.length > BODY_MAX) {
      return json({ error: `Body must be ${BODY_MIN}-${BODY_MAX} characters.` }, 400);
    }
    if (!topicSlug) return json({ error: 'Pick a topic.' }, 400);
    if (looksProfane(title) || looksProfane(postBody)) {
      return json({ error: 'Post contains language not allowed in the community.' }, 400);
    }

    // Topic must exist + be approved.
    const { data: topic } = await admin
      .from('community_topics').select('slug, is_active, status')
      .eq('slug', topicSlug).maybeSingle();
    if (!topic || !topic.is_active || topic.status !== 'approved') {
      return json({ error: 'Topic not available.' }, 400);
    }

    // New-account cooldown (1 post in first 24h).
    const accountAgeMs = Date.now() - new Date(profile.created_at ?? Date.now()).getTime();
    const isNewAccount = accountAgeMs < NEW_ACCOUNT_COOLDOWN_HOURS * 3600 * 1000;
    if (isNewAccount) {
      const { count: postsInWindow } = await admin
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - NEW_ACCOUNT_COOLDOWN_HOURS * 3600 * 1000).toISOString());
      if ((postsInWindow ?? 0) >= NEW_ACCOUNT_POST_LIMIT) {
        return json({
          error: 'New accounts can post once in the first 24 hours. Try again later.',
          cooldown: true,
        }, 429);
      }
    }

    // Daily rate limit.
    const dayCap = tier === 'pro' ? POSTS_PER_DAY_PRO : POSTS_PER_DAY_PLUS;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: postsToday } = await admin
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if ((postsToday ?? 0) >= dayCap) {
      return json({ error: `Daily post limit (${dayCap}) reached. Try again tomorrow.` }, 429);
    }

    // Insert.
    const { data: created, error: insertErr } = await admin
      .from('community_posts')
      .insert({
        user_id: user.id,
        topic_slug: topicSlug,
        title,
        body: postBody,
        is_anonymous: isAnonymous,
        image_urls: imageUrls,
      })
      .select('id, created_at')
      .single();

    if (insertErr) throw insertErr;

    return json({ ok: true, postId: created!.id, createdAt: created!.created_at });
  } catch (err) {
    console.error('[community-create-post]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
