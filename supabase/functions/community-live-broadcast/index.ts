/**
 * community-live-broadcast — push fanout when a community_live_event
 * flips to 'live'. Called by the AFTER-INSERT/UPDATE trigger via
 * pg_net.http_post.
 *
 * Body: { eventId }
 *
 * Flow:
 *   1. Hydrate the event + host display name
 *   2. SELECT all push_tokens whose user has tier matching the event's
 *      required_tier (plus = plus + pro; pro = pro only; free = anyone)
 *   3. Build one Expo push message per token; POST in batch to Expo
 *   4. Prune DeviceNotRegistered tokens
 *
 * Idempotency: trigger only fires on transition INTO 'live'. Re-updates
 * to 'live' status (rare, the trigger guards) won't re-broadcast.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface LiveEvent {
  id: string;
  host_user_id: string;
  title: string;
  description: string | null;
  required_tier: 'free' | 'plus' | 'pro';
}

interface PushTokenRow {
  id: string;
  user_id: string;
  expo_push_token: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  // 2026-05-17 security fix: this entrypoint was unauthenticated. The
  // function URL is public — anyone with the project ref could POST any
  // eventId and fan out pushes to every tier-matched user (push spam +
  // cost door open). The trigger that actually invokes us passes a
  // shared secret via pg_net.http_post; require it here.
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const providedSecret = req.headers.get('x-internal-key') ?? '';
  if (!internalSecret || providedSecret !== internalSecret) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  try {
    const { eventId } = await req.json().catch(() => ({}));
    if (!eventId || typeof eventId !== 'string') {
      return jsonResp({ error: 'eventId required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: event, error: eventErr } = await admin
      .from('community_live_events')
      .select('id, host_user_id, title, description, required_tier')
      .eq('id', eventId)
      .maybeSingle();
    if (eventErr || !event) {
      console.warn('[live-broadcast] event not found:', eventId, eventErr);
      return jsonResp({ ok: false, reason: 'not_found' }, 200);
    }
    const e = event as LiveEvent;

    // Resolve host display name for the push body.
    const { data: hostProfile } = await admin
      .from('profiles')
      .select('username, display_name')
      .eq('id', e.host_user_id)
      .maybeSingle();
    const hostName =
      hostProfile?.display_name?.trim() ||
      hostProfile?.username?.trim() ||
      'PepTalk';

    // Build the tier filter set. 'plus' includes plus + pro; 'pro' is
    // pro-only; 'free' means broadcast to everyone.
    const tierFilter: string[] = (() => {
      if (e.required_tier === 'pro') return ['pro'];
      if (e.required_tier === 'plus') return ['plus', 'pro'];
      return ['free', 'plus', 'pro'];
    })();

    // Pull eligible push tokens. A user with multiple devices = multiple
    // rows (we cap at 4 per user via the push-token sync flow).
    const { data: tokenRows, error: tokenErr } = await admin
      .from('push_tokens')
      .select('id, user_id, expo_push_token, profiles:user_id(subscription_tier)')
      .order('last_seen_at', { ascending: false });
    if (tokenErr) {
      console.error('[live-broadcast] token lookup failed:', tokenErr);
      return jsonResp({ ok: false, reason: 'token_lookup_failed' }, 200);
    }

    const eligible: PushTokenRow[] = (tokenRows ?? []).filter((row: any) => {
      const tier = row.profiles?.subscription_tier ?? 'free';
      return tierFilter.includes(tier);
    });

    if (eligible.length === 0) {
      return jsonResp({ ok: true, delivered: 0, reason: 'no_eligible_tokens' });
    }

    // Cap at 100 messages per Expo push-API call. Chunk if larger.
    const messages = eligible.map((tok) => ({
      to: tok.expo_push_token,
      title: `${hostName} just went live`,
      body: e.title,
      sound: 'default',
      data: {
        kind: 'live_started',
        eventId: e.id,
      },
    }));

    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    const idsToPrune: string[] = [];
    let delivered = 0;

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const chunkBaseIdx = chunkIdx * 100;
      try {
        const expoRes = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
        if (!expoRes.ok) {
          console.warn('[live-broadcast] Expo error', expoRes.status);
          continue;
        }
        const payload = await expoRes.json();
        const tickets: Array<{ status: string; details?: { error?: string } }> = payload?.data ?? [];
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'ok') {
            delivered++;
          } else if (ticket.status === 'error') {
            const err = ticket.details?.error ?? '';
            if (err === 'DeviceNotRegistered' || err === 'InvalidCredentials') {
              const t = eligible[chunkBaseIdx + idx];
              if (t?.id) idsToPrune.push(t.id);
            }
          }
        });
      } catch (err) {
        console.warn('[live-broadcast] chunk delivery failed', err);
      }
    }

    if (idsToPrune.length > 0) {
      await admin.from('push_tokens').delete().in('id', idsToPrune);
    }

    return jsonResp({
      ok: true,
      delivered,
      pruned: idsToPrune.length,
      eligible: eligible.length,
    });
  } catch (err) {
    console.error('[community-live-broadcast]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
