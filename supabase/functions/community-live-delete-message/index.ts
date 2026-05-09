/**
 * community-live-delete-message — owner OR host soft-deletes a message.
 *
 * Body: { messageId }
 *
 * Soft-delete (sets is_deleted=true) so the row stays in the transcript
 * for audit purposes; client filters deleted rows from view.
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

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Sign in required.' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid session.' }, 401);

    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.messageId ?? '').trim();
    if (!messageId) return jsonResp({ error: 'messageId required.' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: msg } = await admin
      .from('community_live_messages')
      .select('id, user_id, event_id, is_deleted')
      .eq('id', messageId)
      .maybeSingle();
    if (!msg) return jsonResp({ error: 'Message not found.' }, 404);
    if (msg.is_deleted) return jsonResp({ ok: true });  // idempotent

    const { data: event } = await admin
      .from('community_live_events')
      .select('host_user_id')
      .eq('id', msg.event_id)
      .maybeSingle();

    const isOwner = msg.user_id === user.id;
    const isHost = event?.host_user_id === user.id;
    if (!isOwner && !isHost) return jsonResp({ error: 'Not your message.' }, 403);

    const { error: updateErr } = await admin
      .from('community_live_messages')
      .update({ is_deleted: true })
      .eq('id', messageId);
    if (updateErr) {
      console.error('[community-live-delete-message] update failed', updateErr);
      return jsonResp({ error: 'Could not delete.' }, 500);
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error('[community-live-delete-message]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
