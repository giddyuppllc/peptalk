/**
 * community-live-report-message — flag a live-chat message for moderation.
 *
 * Apple Guideline 1.2 requires every UGC surface to expose a "report"
 * affordance to viewers (not just self-delete to the author). Live chat
 * messages already had edit/delete for owner+host; this is the report path
 * for everyone else.
 *
 * Body: { messageId, reason, notes? }
 *
 * Mirrors community-report but writes to community_live_message_reports.
 * Per-user uniqueness is enforced by a partial index on (message_id,
 * reporter_user_id) so spam-reporting is silently no-op'd.
 *
 * Deploy: supabase functions deploy community-live-report-message
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

const ALLOWED_REASONS = new Set([
  'spam', 'harassment', 'unsafe_medical_advice',
  'misinformation', 'off_topic', 'other',
]);

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
    const messageId = body?.messageId ? String(body.messageId).trim() : '';
    const reason = String(body?.reason ?? '').trim();

    if (!messageId) return json({ error: 'messageId required.' }, 400);
    if (!ALLOWED_REASONS.has(reason)) return json({ error: 'Invalid reason.' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Confirm the message actually exists. Cheap check that also stops
    // people from probing for arbitrary uuids.
    const { data: msg } = await admin
      .from('community_live_messages')
      .select('id, user_id')
      .eq('id', messageId)
      .maybeSingle();
    if (!msg) return json({ error: 'Message not found.' }, 404);

    // Don't let users self-report — self-delete is a separate flow that
    // already exists; reporting yourself just clutters the queue.
    if (msg.user_id === user.id) return json({ ok: true, selfReported: true });

    const { error: insertErr } = await admin
      .from('community_live_message_reports')
      .insert({
        message_id: messageId,
        reporter_user_id: user.id,
        reason,
        status: 'pending',
      });
    if (insertErr) {
      // Per-user uniqueness — repeat reports collapse to one. Silent OK.
      if (String(insertErr.message ?? '').toLowerCase().includes('duplicate')) {
        return json({ ok: true, alreadyReported: true });
      }
      throw insertErr;
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[community-live-report-message]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
