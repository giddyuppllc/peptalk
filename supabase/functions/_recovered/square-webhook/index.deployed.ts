// DEPLOYED source of supabase/functions/square-webhook/index.ts, recovered 2026-09-01. NOT applied.
//
// The repo and production have BOTH changed here — each has lines the other
// lacks — so this cannot be adopted mechanically. Diff against the repo copy
// and decide. See docs/EDGE-FUNCTION-DRIFT.md.

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
import { timingSafeEqual, parseRef, planForProduct } from '../_shared/square.ts';
import { parseCreditRef } from '../_shared/credits.ts';
import { withErrorReporting } from '../_shared/sentry.ts';

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
  return timingSafeEqual(expected, signature);
}

// timingSafeEqual (HMAC signature compare) and parseRef (reference_id parser)
// now live in ../_shared/square.ts so they can be unit-tested. Behaviour is
// identical to the previous inline versions.

async function fetchOrderRef(orderId: string): Promise<string | undefined> {
  const res = await fetch(`${SQUARE_BASE}/v2/orders/${orderId}`, {
    headers: { 'Square-Version': '2024-07-17', Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}` },
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data?.order?.reference_id;
}

const ok = () => new Response('ok', { status: 200 });

/** Recurring renewal (invoice.payment_made): extend the web sub's expiry. */
async function onInvoicePaid(invoice: any): Promise<Response> {
  const subId = invoice?.subscription_id;
  if (!subId) return ok();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await admin
    .from('subscriptions')
    .update({
      expires_at: new Date(Date.now() + MONTH_MS).toISOString(),
      is_active: true,
      last_validated_at: new Date().toISOString(),
    })
    .eq('original_transaction_id', subId)
    .eq('platform', 'web')
    .select('user_id');
  if (error) {
    console.error('[square-webhook] invoice renew failed', error);
    return new Response('db error', { status: 500 });
  }
  if (!data?.length) console.warn('[square-webhook] invoice.payment_made for unknown sub', subId);
  else console.log('[square-webhook] renewed web sub', subId);
  return ok();
}

/** Subscription lifecycle (subscription.created/updated): active/cancel + expiry. */
async function onSubscription(sub: any): Promise<Response> {
  const subId = sub?.id;
  if (!subId) return ok();
  const status: string = sub?.status ?? ''; // ACTIVE | CANCELED | DEACTIVATED | PAUSED
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // charged_through_date ('YYYY-MM-DD') = paid-through; keep access until then
  // even after a cancel, then it expires naturally.
  const chargedThroughMs = sub?.charged_through_date
    ? new Date(`${sub.charged_through_date}T23:59:59Z`).getTime()
    : null;
  const paidThroughFuture = chargedThroughMs != null && chargedThroughMs > Date.now();

  /* CANCELED does NOT mean "access ends now". Square cancels at the END of the
     billing period already paid for, so a subscription sits in CANCELED with a
     charged_through_date still in the future — Square's own example shows
     status CANCELED, canceled_date 2021-10-30, charged_through_date 2021-11-20.
     This previously read `is_active: status === 'ACTIVE'`, and because
     resolveEffectiveTier() selects on is_active = true, cancelling revoked a
     paying customer's Pro instantly and threw away up to a month they had
     already been billed for — the exact opposite of the line above it.
     DEACTIVATED (billing failure / hard stop) and PAUSED still revoke. */
  const patch: Record<string, unknown> = {
    is_active: status === 'ACTIVE' || (status === 'CANCELED' && paidThroughFuture),
    last_validated_at: new Date().toISOString(),
  };
  if (chargedThroughMs != null) {
    patch.expires_at = new Date(chargedThroughMs).toISOString();
  }
  const { data, error } = await admin
    .from('subscriptions')
    .update(patch)
    .eq('original_transaction_id', subId)
    .eq('platform', 'web')
    .select('user_id');
  if (error) {
    console.error('[square-webhook] subscription update failed', error);
    return new Response('db error', { status: 500 });
  }
  if (!data?.length) console.warn('[square-webhook] subscription event for unknown sub', subId, status);
  else console.log(`[square-webhook] sub ${subId} → ${status}`);
  return ok();
}

// Wrapped: this handler had no outer try/catch, so an unexpected throw
// returned an opaque runtime error to Square, which then retries a webhook
// that will fail again — with nothing recorded anywhere.
Deno.serve(withErrorReporting('square-webhook', async (req) => {
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

  // ── Recurring subscription lifecycle (PRIMARY web path) ──
  // square-subscribe stored original_transaction_id = the Square subscription id,
  // so these match the existing row directly (no customer lookup needed).
  if (type === 'subscription.created' || type === 'subscription.updated') {
    return await onSubscription(obj.subscription ?? {});
  }
  if (type === 'invoice.payment_made') {
    return await onInvoicePaid(obj.invoice ?? {});
  }

  // ── One-time payment-link fallback (payment.updated / order.updated) ──
  let referenceId: string | undefined;
  let paid = false;
  /** Amount actually captured, in cents — used to flag a tier/price mismatch. */
  let paidCents: number | undefined;

  if (type === 'payment.updated') {
    const payment = obj.payment ?? {};
    paidCents = Number(payment.amount_money?.amount ?? NaN);
    // COMPLETED only. APPROVED means Square authorized the card but has NOT
    // captured the funds — an auth that is later voided would otherwise buy a
    // free month. Payment links autocomplete, so COMPLETED is the normal
    // terminal state and arrives seconds later.
    paid = payment.status === 'COMPLETED';
    if (payment.status === 'APPROVED') {
      console.log('[square-webhook] payment APPROVED but not captured — waiting for COMPLETED, not granting');
    }
    if (paid && payment.order_id) referenceId = await fetchOrderRef(payment.order_id);
  } else if (type === 'order.updated') {
    const order = obj.order_updated ?? obj.order ?? {};
    paidCents = Number(order.total_money?.amount ?? NaN);
    paid = order.state === 'COMPLETED';
    referenceId = order.reference_id;
    if (paid && !referenceId && order.order_id) referenceId = await fetchOrderRef(order.order_id);
  } else {
    return ok(); // event we don't act on — ack so Square stops retrying
  }

  if (!paid) return ok();

  // Credit packs, before the subscription parse.
  //
  // A credit ref is "<userId>:credits:<sku>", which parseRef rejects (it
  // requires segment 2 to be exactly 'plus' or 'pro'). Handling it here means
  // a paid credit pack can never fall through to the subscription grant --
  // and the shapes are deliberately distinct so a malformed one fails closed
  // rather than granting the wrong thing.
  const creditRef = parseCreditRef(referenceId);
  if (creditRef) {
    const creditAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    // The Square payment/order id is the idempotency key. Square retries until
    // it gets a 2xx, so this WILL arrive more than once; grant_ai_credits is
    // keyed on (source, external_id) and a replay moves no balance.
    const externalId = String(
      obj?.payment?.id ?? obj?.order_updated?.order_id ?? obj?.order?.id ?? referenceId,
    );
    const { data, error } = await creditAdmin.rpc('grant_ai_credits', {
      p_user_id: creditRef.userId,
      p_source: 'square',
      p_external_id: externalId,
      p_product_id: creditRef.productId,
      p_microcents: creditRef.microcents,
      p_price_cents: Number.isFinite(paidCents as number) ? paidCents : null,
    });
    if (error) {
      console.error('[square-webhook] CRITICAL grant_ai_credits failed:', error);
      // 500 so Square retries -- dropping a paid grant is the worse outcome.
      return new Response('db error', { status: 500 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    console.log(
      `[square-webhook] credits ${creditRef.productId} for ${creditRef.userId} ` +
        `(duplicate=${row?.was_duplicate === true})`,
    );
    return ok();
  }

  const ref = parseRef(referenceId);
  if (!ref) {
    console.error('[square-webhook] no/invalid reference_id on paid event', type, referenceId);
    return ok();
  }

  /* The granted tier comes from reference_id alone — nothing here checks that
     the money actually captured matches what that tier costs. Deliberately a
     LOUD WARNING and not a rejection: Square totals can legitimately differ
     from the plan price (tax, tips, a partial refund landing first), and
     refusing a real payment is worse than granting one that needs review.
     Promote to a hard reject only with a tolerance that accounts for tax. */
  const expectedCents = planForProduct(ref.productId)?.amountCents;
  if (expectedCents != null && paidCents != null && Number.isFinite(paidCents) && paidCents !== expectedCents) {
    console.warn(
      `[square-webhook] AMOUNT MISMATCH — captured ${paidCents}c but ` +
        `${ref.productId} lists ${expectedCents}c. Granting on reference_id; review this payment.`,
    );
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
  // Column/value shape MUST match validate-purchase's insert: there is no
  // `tier` column on subscription_events (tier rides in raw_payload), and
  // event_type is constrained to the RevenueCat-style vocabulary — 'purchase'
  // is NOT in it, 'initial_purchase' is.
  await admin
    .from('subscription_events')
    .insert({
      user_id: ref.userId,
      product_id: ref.productId,
      platform: 'web',
      event_type: 'initial_purchase',
      external_event_id: event.event_id ?? event.id ?? crypto.randomUUID(),
      raw_payload: { source: 'square-webhook', tier: ref.tier, expiresAt },
      expires_at: expiresAt,
    })
    .then(({ error }) => { if (error) console.warn('[square-webhook] event log skipped:', error.message); });

  console.log(`[square-webhook] granted ${ref.tier} (web) to ${ref.userId}`);
  return ok();
}));
