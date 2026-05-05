/**
 * community-follow — toggle follow / unfollow for a target user.
 *
 * Mirrors community-block's shape — same auth pattern, same idempotency
 * (no-op when already in the desired state). Free for any authenticated
 * user; following is a community-engagement action, not a paid feature.
 *
 * Deploy: supabase functions deploy community-follow
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

    const body = await req.json().catch(() => ({}));
    const followedId = String(body?.followedId ?? '').trim();
    const action = body?.action === 'unfollow' ? 'unfollow' : 'follow';

    if (!followedId) return json({ error: 'followedId required' }, 400);
    if (followedId === user.id) return json({ error: 'Can\'t follow yourself.' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === 'unfollow') {
      const { error: delErr } = await admin
        .from('community_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('followed_id', followedId);
      if (delErr) throw delErr;
      return json({ ok: true, action: 'unfollowed' });
    }

    const { error: insertErr } = await admin
      .from('community_follows')
      .insert({ follower_id: user.id, followed_id: followedId });
    if (insertErr && !String(insertErr.message ?? '').toLowerCase().includes('duplicate')) {
      throw insertErr;
    }

    return json({ ok: true, action: 'followed' });
  } catch (err) {
    console.error('[community-follow]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
