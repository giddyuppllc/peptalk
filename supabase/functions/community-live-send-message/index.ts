/**
 * community-live-send-message — post a message into an active live
 * event chat.
 *
 * Body: { eventId, body }
 *
 * Auth: signed-in user. Tier check verifies the user meets the event's
 * required_tier (default: plus).
 *
 * Rate limit: 30 messages per user per minute. Light enough not to
 * frustrate engaged users; tight enough that a runaway client / bot
 * can't flood the chat.
 *
 * The realtime publication on community_live_messages means inserting
 * here automatically pushes to all subscribed clients.
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

const BODY_MIN = 1, BODY_MAX = 1000;
const MESSAGES_PER_MINUTE = 30;

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
    if (!authHeader) return jsonResp({ error: 'Sign in to chat.' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid session.' }, 401);

    const body = await req.json().catch(() => ({}));
    const eventId = String(body?.eventId ?? '').trim();
    const messageBody = String(body?.body ?? '').trim();
    if (!eventId) return jsonResp({ error: 'eventId required.' }, 400);
    if (messageBody.length < BODY_MIN || messageBody.length > BODY_MAX) {
      return jsonResp({ error: `Message must be ${BODY_MIN}-${BODY_MAX} characters.` }, 400);
    }
    if (looksProfane(messageBody)) {
      return jsonResp({ error: 'Message contains language not allowed.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hydrate the event + verify it's still 'live'.
    const { data: event } = await admin
      .from('community_live_events')
      .select('id, host_user_id, status, required_tier')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return jsonResp({ error: 'Event not found.' }, 404);
    if (event.status !== 'live') return jsonResp({ error: 'Event has ended.' }, 410);

    // Tier gate. Beta-tester / TestFlight users bypass per the existing
    // app convention (BETA_TESTER_EMAILS env var).
    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    );
    const isBetaTester =
      !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());
    const isHost = event.host_user_id === user.id;

    if (!isHost && !isBetaTester) {
      const { data: profile } = await admin
        .from('profiles').select('subscription_tier').eq('id', user.id).maybeSingle();
      // isBetaTester + host already bypassed above, so no override here — just
      // verify a live subscription backs the claimed tier.
      const tier = await resolveEffectiveTier(admin, user.id, {
        profileTier: profile?.subscription_tier,
      });
      const required = event.required_tier;
      const allowed =
        required === 'free' ||
        (required === 'plus' && (tier === 'plus' || tier === 'pro')) ||
        (required === 'pro' && tier === 'pro');
      if (!allowed) {
        return jsonResp({
          error: `Joining the live chat requires PepTalk ${required === 'pro' ? 'Pro' : '+'}.`,
          upgrade: true,
        }, 403);
      }
    }

    // Per-user-per-minute rate limit.
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { count } = await admin
      .from('community_live_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if ((count ?? 0) >= MESSAGES_PER_MINUTE) {
      return jsonResp({ error: 'Slow down — message limit hit.' }, 429);
    }

    const { data: created, error: insertErr } = await admin
      .from('community_live_messages')
      .insert({
        event_id: eventId,
        user_id: user.id,
        body: messageBody,
        is_host: isHost,
      })
      .select('id, created_at')
      .single();

    if (insertErr) {
      console.error('[community-live-send-message] insert failed', insertErr);
      return jsonResp({ error: 'Could not send message.' }, 500);
    }

    return jsonResp({ ok: true, messageId: created!.id, createdAt: created!.created_at });
  } catch (err) {
    console.error('[community-live-send-message]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
