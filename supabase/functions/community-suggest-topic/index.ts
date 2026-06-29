/**
 * community-suggest-topic — Plus+ users suggest new topics.
 *
 * Inserts a row with status='pending_review' so it doesn't appear in
 * the public topic list until an admin approves via /admin/community-queue.
 *
 * Deploy: supabase functions deploy community-suggest-topic
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

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,30}$/;

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
      .from('profiles').select('subscription_tier').eq('id', user.id).maybeSingle();
    const tier = await resolveEffectiveTier(admin, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    if (tier === 'free') {
      return json({ error: 'Suggesting topics requires PepTalk+ or Pro.', upgrade: true }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim().slice(0, 40);
    const description = body?.description != null
      ? String(body.description).trim().slice(0, 200)
      : null;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);

    if (!name || name.length < 3) return json({ error: 'Topic name too short.' }, 400);
    if (!SLUG_REGEX.test(slug)) return json({ error: 'Topic name must include letters or digits.' }, 400);

    // De-dupe: same slug already exists (in any status).
    const { data: existing } = await admin
      .from('community_topics').select('id, status').eq('slug', slug).maybeSingle();
    if (existing) {
      return json({
        error: existing.status === 'approved'
          ? 'A topic like that already exists.'
          : 'A topic with that name has already been suggested.',
      }, 409);
    }

    const { error: insertErr } = await admin.from('community_topics').insert({
      slug,
      name,
      description,
      icon: 'pricetag-outline',
      is_default: false,
      is_active: true,
      status: 'pending_review',
      suggested_by: user.id,
    });
    if (insertErr) throw insertErr;

    return json({ ok: true, slug });
  } catch (err) {
    console.error('[community-suggest-topic]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
