/**
 * square-webhook — receives Square events for PepTalk WEB subscriptions and
 * grants entitlement by writing a `platform:'web'` row into `subscriptions`
 * (mirrors what validate-purchase does for IAP). Native IAP is UNAFFECTED.
 *
 * Configure in Square dashboard → Webhooks → subscribe to at least:
 *   payment.updated, order.updated  (invoice.payment_made / subscription.updated
 *   once recurring Catalog plans are wired).
 *
 * Secrets (Supabase edge-fn env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SQUARE_ACCESS_TOKEN, SQUARE_ENV
 *   SQUARE_WEBHOOK_SIGNATURE_KEY   (from the webhook subscription)
 *   SQUARE_WEBHOOK_URL             (this function's public URL — signed into the HMAC)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
const SQUARE_ENV = Deno.env.get('SQUARE_ENV') ?? 'sandbox';
const SIGNATURE_KEY = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? '';
const WEBHOOK_URL = Deno.env.get('SQUARE_WEBHOOK_URL') ?? '';
const SQUARE_BASE =
  SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Verify Square's HMAC-SHA256 signature over (notificationUrl + rawBody). */
async function verify(rawBody: string, signature: string): Promise<boolean> {
  if (!SIGNATURE_KEY || !WEBHOOK_URL || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SIGNATURE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(WEBHOOK_URL + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

/** reference_id we set in square-checkout: "<userId>:<tier>:<productId>". */
function parseRef(ref: string | undefined): { userId: string; tier: string; productId: string } | null {
  if (!ref) return null;
  const [userId, tier, productId] = ref.split(':');
  if (!userId || (tier !== 'plus' && tier !== 'pro')) return null;
  return { userId, tier, productId: productId ?? `peptalk_${tier}_monthly` };
}

async function fetchOrderRef(orderId: string): Promise<string | undefined> {
  const res = await fetch(`${SQUARE_BASE}/v2/orders/${orderId}`, {
    headers: { 'Square-Version': '2024-07-17', Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` },
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data?.order?.reference_id;
}

const ok = () => new Response('ok', { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const rawBody = await req.text();
  const signature = req.headers.get('x-square-hmacsha256-signature') ?? '';

  if (!(await verify(rawBody, signature))) {
    console.error('[square-webhook] signature verification failed');
    return new Response('invalid signature', { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new Response('bad json', { status: 400 }); }

  const type: string = event?.type ?? '';
  const obj = event?.data?.object ?? {};

  // Only act on a completed payment / order. (Recurring renewals arrive as
  // invoice.payment_made / subscription.updated once Catalog plans are wired —
  // TODO handle those the same way.)
  let referenceId: string | undefined;
  let paid = false;

  if (type === 'payment.updated') {
    const payment = obj.payment ?? {};
    paid = payment.status === 'COMPLETED' || payment.status === 'APPROVED';
    if (paid && payment.order_id) referenceId = await fetchOrderRef(payment.order_id);
  } else if (type === 'order.updated') {
    const order = obj.order_updated ?? obj.order ?? {};
    paid = order.state === 'COMPLETED';
    referenceId = order.reference_id;
    if (paid && !referenceId && order.order_id) referenceId = await fetchOrderRef(order.order_id);
  } else {
    return ok(); // event we don't act on — ack so Square stops retrying
  }

  if (!paid) return ok();
  const ref = parseRef(referenceId);
  if (!ref) {
    console.error('[square-webhook] no/invalid reference_id on paid event', type, referenceId);
    return ok();
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + MONTH_MS).toISOString();

  // Authoritative row (mirrors validate-purchase). onConflict (user_id, product_id).
  const { error: subErr } = await admin.from('subscriptions').upsert(
    {
      user_id: ref.userId,
      product_id: ref.productId,
      tier: ref.tier,
      platform: 'web',
      expires_at: expiresAt,
      is_active: true,
      last_validated_at: nowIso,
    },
    { onConflict: 'user_id,product_id' },
  );
  if (subErr) {
    console.error(`[square-webhook] CRITICAL subscriptions upsert failed for ${ref.userId}:`, subErr);
    // 500 so Square retries — better than silently dropping a paid entitlement.
    return new Response('db error', { status: 500 });
  }

  // Best-effort event log (dedupe on platform+external_event_id).
  await admin
    .from('subscription_events')
    .insert({
      platform: 'web',
      external_event_id: event.event_id ?? event.id ?? crypto.randomUUID(),
      event_type: 'purchase',
      user_id: ref.userId,
      tier: ref.tier,
    })
    .then(({ error }) => { if (error) console.warn('[square-webhook] event log skipped:', error.message); });

  console.log(`[square-webhook] granted ${ref.tier} (web) to ${ref.userId}`);
  return ok();
});
