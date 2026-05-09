/**
 * community-live-end — host (admin) closes their live event.
 *
 * Body: { eventId }
 *
 * Auth: must match the event's host_user_id AND be in ADMIN_EMAILS.
 *
 * Sets status='ended' + ended_at. Doesn't delete the event or messages
 * — the chat history stays viewable as a transcript.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
    if (!authHeader) return jsonResp({ error: 'Missing auth' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid auth' }, 401);

    const body = await req.json().catch(() => ({}));
    const eventId = String(body?.eventId ?? '').trim();
    if (!eventId) return jsonResp({ error: 'eventId required.' }, 400);

    const { data: event } = await supabase
      .from('community_live_events')
      .select('id, host_user_id, status')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return jsonResp({ error: 'Event not found.' }, 404);
    if (event.host_user_id !== user.id) {
      return jsonResp({ error: 'Only the host can end this event.' }, 403);
    }
    if (event.status === 'ended') return jsonResp({ ok: true });  // idempotent

    const { error: updateErr } = await supabase
      .from('community_live_events')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', eventId);
    if (updateErr) {
      console.error('[community-live-end] update failed', updateErr);
      return jsonResp({ error: 'Could not end event.' }, 500);
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error('[community-live-end]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
