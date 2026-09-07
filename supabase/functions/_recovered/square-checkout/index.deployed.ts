// DEPLOYED source of supabase/functions/square-checkout/index.ts, recovered 2026-09-01. NOT applied.
//
// The repo and production have BOTH changed here — each has lines the other
// lacks — so this cannot be adopted mechanically. Diff against the repo copy
// and decide. See docs/EDGE-FUNCTION-DRIFT.md.

/**
 * square-checkout — create a Square-hosted checkout link for a PepTalk WEB
 * subscription (PWA only). Native iOS/Android are UNAFFECTED: they use IAP,
 * validated by `validate-purchase`. This function is only called by the web app.
 *
 * Secrets (Supabase edge-fn env — never in the client):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   SQUARE_ACCESS_TOKEN            (server-only)
 *   SQUARE_ENV                    ('sandbox' | 'production')
 *   SQUARE_LOCATION_ID
 *   SQUARE_RETURN_URL             (post-checkout return; defaults to app.peptalk.bio)
 *   SQUARE_PLAN_PLUS_MONTHLY / SQUARE_PLAN_PRO_MONTHLY   (optional Catalog plan ids)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SQUARE_PLANS } from '../_shared/square.ts';
import { buildCreditRef, isCreditPack, packForProduct } from '../_shared/credits.ts';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
const SQUARE_ENV = Deno.env.get('SQUARE_ENV') ?? 'sandbox';
const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID') ?? '';
const RETURN_URL = Deno.env.get('SQUARE_RETURN_URL') ?? 'https://app.peptalk.bio/subscription';
const SQUARE_BASE =
  SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

// Product catalog + prices live in ../_shared/square.ts (SQUARE_PLANS) so they
// can be unit-tested and stay in one place across the Square edge functions.
const PLAN = SQUARE_PLANS;

// CORS — this is a browser-facing fallback checkout path. Same omission as
// square-subscribe: without an OPTIONS answer the preflight fails and the POST
// is never sent.
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


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    // Authenticate the buyer from the Supabase JWT (same pattern as validate-purchase).
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
    // A credit pack is a one-time purchase, not a subscription. Same payment
    // link mechanism, different reference shape and a different grant path in
    // the webhook -- see _shared/credits.ts for why the two ref formats are
    // deliberately not interchangeable.
    const creditPack = isCreditPack(productId) ? packForProduct(productId) : undefined;
    const plan = creditPack ? undefined : PLAN[productId];
    if (!plan && !creditPack) return json({ error: 'Unknown product' }, 400);

    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      // Keys not set yet — fail clearly instead of hitting Square with empty auth.
      return json({ error: 'Square not configured (missing access token / location).' }, 503);
    }

    // reference_id ties the resulting Square order/payment back to the PepTalk
    // user so square-webhook can grant entitlement. (Square echoes reference_id
    // on order.updated / payment.updated events.)
    const referenceId = creditPack
      ? buildCreditRef(user.id, productId)
      : `${user.id}:${plan!.tier}:${productId}`;
    const lineName = creditPack ? creditPack.name : plan!.name;
    const lineCents = creditPack ? creditPack.priceCents : plan!.amountCents;
    const noteLabel = creditPack ? 'credits' : plan!.tier;

    const res = await fetch(`${SQUARE_BASE}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-07-17',
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        // TODO(recurring): for true auto-renew, swap quick_pay for a Catalog
        // subscription plan (Deno.env.get(plan.planEnv)) via the Subscriptions
        // API. This payment-link scaffold takes the first payment + returns.
        quick_pay: {
          name: lineName,
          price_money: { amount: lineCents, currency: 'USD' },
          location_id: SQUARE_LOCATION_ID,
        },
        checkout_options: {
          redirect_url: `${RETURN_URL}?checkout=success`,
          ask_for_shipping_address: false,
        },
        order: { reference_id: referenceId },
        payment_note: `PepTalk ${noteLabel} web · user ${user.id}`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[square-checkout] Square error', JSON.stringify(data));
      return json({ error: 'Square checkout failed' }, 502);
    }
    const url = data?.payment_link?.url;
    if (!url) return json({ error: 'No checkout URL from Square' }, 502);
    return json({ url });
  } catch (e) {
    reportError('square-checkout', e);
    console.error('[square-checkout] error', e);
    return json({ error: 'Checkout error' }, 500);
  }
});
