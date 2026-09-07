// DEPLOYED source of supabase/functions/square-subscribe/index.ts, recovered 2026-09-01. NOT applied.
//
// The repo and production have BOTH changed here — each has lines the other
// lacks — so this cannot be adopted mechanically. Diff against the repo copy
// and decide. See docs/EDGE-FUNCTION-DRIFT.md.

/**
 * square-subscribe — start a RECURRING PepTalk web subscription (PWA only).
 *
 * Flow (Square Subscriptions API):
 *   1. auth the user from the Supabase JWT
 *   2. find/create a Square Customer whose reference_id = the PepTalk user id
 *      (so square-webhook can map renewals/cancels back to the user)
 *   3. save the card on file from the Web Payments SDK token (cardToken)
 *   4. create a Subscription on the plan variation for the tier
 *   5. grant the tier immediately (subscriptions row); square-webhook keeps it
 *      renewed (invoice.payment_made) and revokes on cancel (subscription.updated)
 *
 * Native IAP is unaffected. Secrets: SQUARE_ACCESS_TOKEN, SQUARE_ENV,
 * SQUARE_LOCATION_ID, SQUARE_PLAN_PLUS_MONTHLY, SQUARE_PLAN_PRO_MONTHLY,
 * SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SQUARE_PLANS } from '../_shared/square.ts';
import { reportError } from '../_shared/sentry.ts';
import { sendEmail, wrap } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
const SQUARE_ENV = Deno.env.get('SQUARE_ENV') ?? 'sandbox';
const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID') ?? '';
const SQUARE_BASE =
  SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

// Product catalog lives in ../_shared/square.ts (SQUARE_PLANS). Only .tier and
// .planEnv are read here; the extra amountCents/name fields are unused by this
// function. Behaviour is identical to the previous inline map.
const PLAN = SQUARE_PLANS;

// CORS. This function is called from the PWA in a browser, and it had NO cors
// headers and no OPTIONS handler — so the preflight that the browser sends
// before any POST carrying Content-Type and Authorization got no answer, the
// POST was never sent, and supabase.functions.invoke surfaced
// "Failed to send a request to the Edge Function". Web checkout could never
// have worked from a browser. aimee-chat-stream, which the web app calls
// successfully, has had this since it shipped.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

async function sq(pathname: string, method: string, body?: unknown) {
  const res = await fetch(`${SQUARE_BASE}${pathname}`, {
    method,
    headers: {
      'Square-Version': '2024-07-17',
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req) => {
  // Answer the preflight before anything else, including auth — a browser
  // sends OPTIONS with no Authorization header by design.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? '');
    const cardToken = String(body?.cardToken ?? '');
    const plan = PLAN[productId];
    if (!plan) return json({ error: 'Unknown product' }, 400);
    if (!cardToken) return json({ error: 'Missing card token' }, 400);

    const standardVariationId = Deno.env.get(plan.planEnv) ?? '';
    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID || !standardVariationId) {
      return json({ error: 'Square subscriptions not configured (token/location/plan).' }, 503);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Launch promotion: 2 weeks free, then the normal monthly price ──────
    //
    // A SEPARATE Square plan variation carries the trial phase, rather than a
    // trial being added to the standard plan. That keeps the promo reversible:
    // clearing SQUARE_LAUNCH_TRIAL_UNTIL ends it immediately, and every
    // subscription already created keeps whatever terms it was sold on.
    //
    // Time-boxed by an explicit end date because "the first month of launch"
    // is a window, not a permanent feature — a promo with no end date is how
    // a launch offer quietly becomes the price.
    const trialUntilRaw = Deno.env.get('SQUARE_LAUNCH_TRIAL_UNTIL') ?? '';
    const trialUntil = trialUntilRaw ? Date.parse(trialUntilRaw) : NaN;
    const promoWindowOpen = Number.isFinite(trialUntil) && Date.now() < trialUntil;
    const trialVariationId = Deno.env.get(`${plan.planEnv}_TRIAL`) ?? '';

    // Only ever a FIRST subscription. Without this, cancelling and
    // re-subscribing would hand out another free fortnight every time.
    let eligibleForTrial = false;
    if (promoWindowOpen && trialVariationId) {
      const { count } = await admin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      eligibleForTrial = (count ?? 0) === 0;
    }
    const planVariationId = eligibleForTrial ? trialVariationId : standardVariationId;

    // Guard against double-charging: refuse if the user already has an active web
    // subscription (they'd otherwise get a second Square subscription + charge).
    const { data: existing } = await admin
      .from('subscriptions')
      .select('tier')
      .eq('user_id', user.id)
      .eq('platform', 'web')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (existing) {
      return json({ error: 'You already have an active subscription. Manage it from your account.' }, 409);
    }

    // 1) Find or create the Square Customer (reference_id = PepTalk user id).
    let customerId: string | undefined;
    const search = await sq('/v2/customers/search', 'POST', {
      query: { filter: { reference_id: { exact: user.id } } },
      limit: 1,
    });
    customerId = search.data?.customers?.[0]?.id;
    if (!customerId) {
      const created = await sq('/v2/customers', 'POST', {
        idempotency_key: crypto.randomUUID(),
        reference_id: user.id,
        email_address: user.email ?? undefined,
      });
      if (!created.ok) {
        console.error('[square-subscribe] customer create failed', JSON.stringify(created.data));
        return json({ error: 'Could not create customer' }, 502);
      }
      customerId = created.data?.customer?.id;
    }

    // 2) Save the card on file from the Web Payments token.
    const card = await sq('/v2/cards', 'POST', {
      idempotency_key: crypto.randomUUID(),
      source_id: cardToken,
      card: { customer_id: customerId },
    });
    if (!card.ok) {
      console.error('[square-subscribe] card create failed', JSON.stringify(card.data));
      return json({ error: 'Card could not be saved' }, 402);
    }
    const cardId = card.data?.card?.id;

    // 3) Create the recurring subscription.
    const sub = await sq('/v2/subscriptions', 'POST', {
      idempotency_key: crypto.randomUUID(),
      location_id: SQUARE_LOCATION_ID,
      plan_variation_id: planVariationId,
      customer_id: customerId,
      card_id: cardId,
      timezone: 'America/New_York',
    });
    if (!sub.ok) {
      console.error('[square-subscribe] subscription create failed', JSON.stringify(sub.data));
      return json({ error: 'Subscription could not be started' }, 502);
    }
    const subscriptionId = sub.data?.subscription?.id;

    // 4) Grant the tier immediately (webhook keeps it renewed / revokes on cancel).
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const { error: subErr } = await admin.from('subscriptions').upsert(
      {
        user_id: user.id,
        product_id: productId,
        tier: plan.tier,
        platform: 'web',
        expires_at: expiresAt,
        is_active: true,
        last_validated_at: nowIso,
        original_transaction_id: subscriptionId, // Square subscription id as the txn key
      },
      { onConflict: 'user_id,product_id' },
    );
    if (subErr) console.error('[square-subscribe] grant upsert failed', subErr);

    // Purchase confirmation. Fire-and-forget on purpose: the money has already
    // moved and the entitlement is already granted, so a mail failure must not
    // turn a successful payment into an error response. sendEmail never throws
    // and no-ops when the provider key is unset.
    const planLabel = plan.tier === 'pro' ? 'PepTalk Pro' : 'PepTalk+';
    // When a trial applies, say WHEN billing starts. "Active" is true either
    // way, but a free fortnight that silently becomes a $49.99 charge is the
    // kind of surprise that produces chargebacks and one-star reviews.
    const priceLine = eligibleForTrial
      ? `Your first two weeks are free. After that it renews monthly at ` +
        `$${(plan.amountCents / 100).toFixed(2)}.`
      : `It renews monthly.`;
    if (user.email) {
      void sendEmail({
        to: user.email,
        subject: `Your ${planLabel} subscription is active`,
        text:
          `Your ${planLabel} subscription is active.

` +
          `${priceLine} You can change or cancel it any time from ` +
          `Profile > Subscription in the app.

` +
          `PepTalk is for educational purposes only and does not provide ` +
          `medical advice. Consult your healthcare provider before making ` +
          `health decisions.`,
        html: wrap(
          `Your ${planLabel} subscription is active`,
          `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${priceLine}</p>
           <p style="margin:0;font-size:15px;line-height:1.55;">You can change or cancel it any time from <strong>Profile &rsaquo; Subscription</strong> in the app.</p>`,
        ),
      });
    }

    return json({ ok: true, subscriptionId, tier: plan.tier, trial: eligibleForTrial });
  } catch (e) {
    // console.error alone put this in a log nobody reads. A card payment
    // failing on the live PWA produced "failed to call the edge function" on
    // the client and left no way to see which step threw.
    reportError('square-subscribe', e);
    console.error('[square-subscribe] error', e);
    return json({ error: 'Subscription error' }, 500);
  }
});
