/**
 * community-live-edit-message — owner-only edit of a live chat message.
 *
 * Body: { messageId, body }
 *
 * Constraints:
 *   - Only the message author OR the event host can edit (host edit
 *     handles moderation/typo cleanup during a live session)
 *   - Event must still be 'live' — once ended, transcript is frozen
 *   - Same length + profanity rules as send-message
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

const BODY_MIN = 1, BODY_MAX = 1000;

const PROFANITY = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'faggot', 'retard',
];

function looksProfane(s: string): boolean {
  const lower = s.toLowerCase();
  return PROFANITY.some((p) => lower.includes(p));
}

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
    const newBody = String(body?.body ?? '').trim();
    if (!messageId) return jsonResp({ error: 'messageId required.' }, 400);
    if (newBody.length < BODY_MIN || newBody.length > BODY_MAX) {
      return jsonResp({ error: `Message must be ${BODY_MIN}-${BODY_MAX} characters.` }, 400);
    }
    if (looksProfane(newBody)) {
      return jsonResp({ error: 'Contains language not allowed.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: msg } = await admin
      .from('community_live_messages')
      .select('id, user_id, event_id, is_deleted')
      .eq('id', messageId)
      .maybeSingle();
    if (!msg || msg.is_deleted) return jsonResp({ error: 'Message not found.' }, 404);

    const { data: event } = await admin
      .from('community_live_events')
      .select('id, host_user_id, status')
      .eq('id', msg.event_id)
      .maybeSingle();
    if (!event) return jsonResp({ error: 'Event not found.' }, 404);
    if (event.status !== 'live') return jsonResp({ error: 'Event has ended — transcript is frozen.' }, 410);

    const isOwner = msg.user_id === user.id;
    const isHost = event.host_user_id === user.id;
    if (!isOwner && !isHost) return jsonResp({ error: 'Not your message.' }, 403);

    const { error: updateErr } = await admin
      .from('community_live_messages')
      .update({ body: newBody, last_edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (updateErr) {
      console.error('[community-live-edit-message] update failed', updateErr);
      return jsonResp({ error: 'Could not edit.' }, 500);
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error('[community-live-edit-message]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
