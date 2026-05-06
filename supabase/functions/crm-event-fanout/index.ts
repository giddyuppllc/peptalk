/**
 * crm-event-fanout — outbound webhook delivery to Edward's external CRM(s).
 *
 * Triggered by:
 *   - subscription_events trigger (subscription.* events)
 *   - referral_redemptions trigger (referral.redeemed)
 *
 * Body shape from triggers:
 *   { eventKind, subscriptionEventId? } or
 *   { eventKind, redemptionId? }
 *
 * Steps:
 *   1. Hydrate the relevant row + cross-reference (referral attribution
 *      checks if the user has an open redemption to attribute to).
 *   2. Build a normalized event payload.
 *   3. For each crm_webhook_endpoints row matching the event type, POST
 *      with HMAC-SHA256 signature header X-PepTalk-Signature.
 *
 * Failure to deliver to one endpoint doesn't block the others — best
 * effort, retries are NOT attempted (CRMs typically idempotent on a
 * delivery key, and we don't have a queue infra yet).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface CRMEndpoint {
  id: string;
  url: string;
  secret: string;
  event_types: string[] | null;
  is_active: boolean;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const eventKind: string = String(body?.eventKind ?? '');
    if (!eventKind) return jsonResp({ error: 'eventKind required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hydrate event payload based on kind.
    let payload: Record<string, unknown> = {
      kind: eventKind,
      occurredAt: new Date().toISOString(),
    };

    if (eventKind.startsWith('subscription.')) {
      const seId: string = body?.subscriptionEventId;
      if (!seId) return jsonResp({ error: 'subscriptionEventId required' }, 400);
      const { data: se } = await admin
        .from('subscription_events')
        .select('user_id, product_id, platform, event_type, expires_at, external_event_id')
        .eq('id', seId)
        .maybeSingle();
      if (!se) return jsonResp({ ok: false, reason: 'event_not_found' }, 200);

      payload = {
        ...payload,
        userId: se.user_id,
        productId: se.product_id,
        platform: se.platform,
        appleEventType: se.event_type,
        expiresAt: se.expires_at,
        externalEventId: se.external_event_id,
      };

      // If the user has an open referral redemption, attribute this purchase to the agent.
      if (se.user_id && eventKind === 'subscription.activated') {
        const { data: red } = await admin
          .from('referral_redemptions')
          .select('id, code_id, attribution_state')
          .eq('user_id', se.user_id)
          .maybeSingle();
        if (red && red.attribution_state === 'pending') {
          await admin
            .from('referral_redemptions')
            .update({
              attribution_state: 'attributed',
              attributed_at: new Date().toISOString(),
              attributed_product_id: se.product_id ?? null,
            })
            .eq('id', red.id);

          const { data: codeRow } = await admin
            .from('referral_codes')
            .select('code, agent_id, agent_email, agent_name, discount_percent')
            .eq('id', red.code_id)
            .maybeSingle();

          payload = {
            ...payload,
            attributedAgent: codeRow
              ? {
                  agentId: codeRow.agent_id,
                  agentEmail: codeRow.agent_email,
                  agentName: codeRow.agent_name,
                  code: codeRow.code,
                  discountPercent: codeRow.discount_percent,
                }
              : null,
          };
        }
      }
    } else if (eventKind === 'referral.redeemed') {
      const redemptionId: string = body?.redemptionId;
      if (!redemptionId) return jsonResp({ error: 'redemptionId required' }, 400);
      const { data: red } = await admin
        .from('referral_redemptions')
        .select('user_id, code_id, applied_at')
        .eq('id', redemptionId)
        .maybeSingle();
      if (!red) return jsonResp({ ok: false, reason: 'redemption_not_found' }, 200);

      const { data: codeRow } = await admin
        .from('referral_codes')
        .select('code, agent_id, agent_email, agent_name, discount_percent')
        .eq('id', red.code_id)
        .maybeSingle();

      payload = {
        ...payload,
        userId: red.user_id,
        appliedAt: red.applied_at,
        code: codeRow?.code,
        agentId: codeRow?.agent_id,
        agentEmail: codeRow?.agent_email,
        agentName: codeRow?.agent_name,
        discountPercent: codeRow?.discount_percent,
      };
    }

    // Fan out to every active endpoint that subscribes to this event type
    // (or to all events when event_types is empty/null).
    const { data: endpoints } = await admin
      .from('crm_webhook_endpoints')
      .select('id, url, secret, event_types, is_active')
      .eq('is_active', true);

    if (!endpoints || endpoints.length === 0) {
      return jsonResp({ ok: true, delivered: 0, reason: 'no_endpoints' });
    }

    const eligible = (endpoints as CRMEndpoint[]).filter((e) => {
      if (!e.url.startsWith('https://')) return false; // HTTPS only
      if (!e.event_types || e.event_types.length === 0) return true;
      return e.event_types.includes(eventKind);
    });

    const bodyJson = JSON.stringify(payload);
    let delivered = 0;
    let failed = 0;
    for (const ep of eligible) {
      try {
        const sig = await hmacSha256Hex(ep.secret, bodyJson);
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PepTalk-Signature': `sha256=${sig}`,
            'X-PepTalk-Event': eventKind,
          },
          body: bodyJson,
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) delivered++;
        else {
          failed++;
          console.warn('[crm-fanout] non-2xx from', ep.url, res.status);
        }
      } catch (err) {
        failed++;
        console.warn('[crm-fanout] delivery failed', ep.url, err);
      }
    }

    return jsonResp({ ok: true, delivered, failed, kind: eventKind });
  } catch (err) {
    console.error('[crm-event-fanout]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
