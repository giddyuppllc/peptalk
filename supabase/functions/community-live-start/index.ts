/**
 * community-live-start — admin opens a live community event.
 *
 * Body: { title, description?, requiredTier? }
 *
 * Auth: requires JWT for an email in ADMIN_EMAILS. Non-admins get 403.
 *
 * Flow:
 *   1. Validate admin
 *   2. INSERT a row into community_live_events with status='live'
 *   3. The AFTER-INSERT trigger fires community-live-broadcast which
 *      pushes a notification to every Plus/Pro user's devices
 *   4. Return the event id so the host can navigate into the chat
 *
 * The host's first chat message can be posted immediately via
 * community-live-send-message.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TITLE_MIN = 3, TITLE_MAX = 140;
const DESC_MAX = 600;

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

    const adminEmails = (Deno.env.get('ADMIN_EMAILS') ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
      return jsonResp({ error: 'Admin only.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim();
    const description = body?.description ? String(body.description).trim() : null;
    const requiredTier = body?.requiredTier === 'free' || body?.requiredTier === 'pro'
      ? body.requiredTier
      : 'plus';

    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return jsonResp({ error: `Title must be ${TITLE_MIN}-${TITLE_MAX} characters.` }, 400);
    }
    if (description && description.length > DESC_MAX) {
      return jsonResp({ error: `Description max ${DESC_MAX} characters.` }, 400);
    }

    // Refuse to start if there's already an active event hosted by this
    // admin — keeps the broadcast model sane (one live banner at a time).
    const { data: existing } = await supabase
      .from('community_live_events')
      .select('id')
      .eq('host_user_id', user.id)
      .eq('status', 'live')
      .maybeSingle();
    if (existing) {
      return jsonResp({
        error: 'You already have a live event running. End it first.',
        eventId: existing.id,
      }, 409);
    }

    const { data: created, error: insertErr } = await supabase
      .from('community_live_events')
      .insert({
        host_user_id: user.id,
        title,
        description,
        status: 'live',
        required_tier: requiredTier,
        started_at: new Date().toISOString(),
      })
      .select('id, started_at')
      .single();

    if (insertErr) {
      console.error('[community-live-start] insert failed', insertErr);
      return jsonResp({ error: 'Could not start event.' }, 500);
    }

    return jsonResp({
      ok: true,
      eventId: created!.id,
      startedAt: created!.started_at,
    });
  } catch (err) {
    console.error('[community-live-start]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
