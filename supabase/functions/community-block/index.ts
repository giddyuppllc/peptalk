/**
 * community-block — block / unblock another user.
 *
 * Symmetric model: blocker doesn't see blocked user's content AND
 * blocked user can't comment on blocker's posts (enforced in
 * community-create-comment).
 *
 * Deploy: supabase functions deploy community-block
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
    const blockedId = String(body?.blockedId ?? '').trim();
    const action = body?.action === 'unblock' ? 'unblock' : 'block';

    if (!blockedId) return json({ error: 'blockedId required' }, 400);
    if (blockedId === user.id) return json({ error: 'Can\'t block yourself.' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === 'unblock') {
      const { error: delErr } = await admin
        .from('community_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedId);
      if (delErr) throw delErr;
      return json({ ok: true, action: 'unblocked' });
    }

    const { error: insertErr } = await admin
      .from('community_blocks')
      .insert({ blocker_id: user.id, blocked_id: blockedId });
    if (insertErr && !String(insertErr.message ?? '').toLowerCase().includes('duplicate')) {
      throw insertErr;
    }

    return json({ ok: true, action: 'blocked' });
  } catch (err) {
    console.error('[community-block]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
