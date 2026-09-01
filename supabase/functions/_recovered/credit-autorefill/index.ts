// RECOVERED ORIGINAL SOURCE — extracted 2026-09-01 from the deployed bundle.
//
// This is NOT a reconstruction. Supabase's deployed ESZIP embeds source maps
// carrying `sourcesContent` — the original TypeScript, types and comments
// intact. The extraction was validated against a control: `_shared/effectiveTier.ts`,
// which the repo already had, came back BYTE-IDENTICAL.
//
// It went missing because it was deployed from a working copy and never
// committed. See supabase/functions/_recovered/README.md.

/**
 * credit-autorefill — top up a WEB user's AI credit against their saved card.
 *
 * WEB ONLY, AND THAT IS NOT AN OVERSIGHT.
 * Apple and Google both require the user to confirm every consumable purchase;
 * neither exposes an auto-recharge primitive for one-time products. The only
 * auto-charging product type on those stores is an auto-renewable
 * subscription, which bills monthly regardless of usage — a different product
 * from "refill when empty". Charging a card we hold for an iOS or Android user
 * to unlock in-app content would also be a guideline violation. So native gets
 * a low-balance nudge and a one-tap purchase, and only the web charges
 * automatically.
 *
 * INTERNAL ONLY. This moves real money without the customer present, so it is
 * not reachable from a client: it requires INTERNAL_FUNCTION_SECRET and is
 * called by aimee-chat-stream after spend, fire-and-forget.
 *
 * ORDER OF OPERATIONS — the part that matters
 *   1. claim_autorefill_slot() decides, inside one locked statement, whether a
 *      charge is permitted (enabled, under the monthly cap, not in a decline
 *      streak) and increments the counter BEFORE any money moves.
 *   2. Only then is the card charged.
 *   3. record_autorefill_result() hands the slot back if the charge failed.
 *
 * Claiming before charging means a crash between the two costs the user one
 * slot out of their monthly allowance. Charging before claiming would risk a
 * second charge. One lost slot is a far better failure than one extra charge.
 *
 * The grant is keyed on the Square payment id, so even a full retry of this
 * function cannot grant twice — `ai_credit_grants` has a unique constraint on
 * (source, external_id).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { packForProduct, MC_PER_CENT } from '../_shared/credits.ts';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
const SQUARE_ENV = Deno.env.get('SQUARE_ENV') ?? 'sandbox';
const SQUARE_LOCATION_ID = Deno.env.get('SQUARE_LOCATION_ID') ?? '';
const SQUARE_BASE =
  SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

/** The one pack. Auto-refill buys exactly this and nothing else. */
const REFILL_SKU = 'peptalk_credits';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function sq(path: string, method: string, body?: unknown) {
  const res = await fetch(SQUARE_BASE + path, {
    method,
    headers: {
      'Square-Version': '2024-07-17',
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Not client-reachable. This spends money.
  const secret = req.headers.get('x-internal-secret') ?? '';
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return json({ error: 'Forbidden' }, 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let userId = '';

  try {
    const body = await req.json().catch(() => ({}));
    userId = String(body?.userId ?? '');
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const pack = packForProduct(REFILL_SKU);
    if (!pack) return json({ error: 'Refill SKU not in catalog' }, 500);

    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
      return json({ skipped: 'square_not_configured' });
    }

    // Is the balance actually low? Checked here rather than trusting the
    // caller, so a buggy caller cannot cause a charge.
    const { data: bal } = await admin
      .from('ai_credit_balance')
      .select('balance_microcents')
      .eq('user_id', userId)
      .maybeSingle();
    const { data: cfg } = await admin
      .from('ai_credit_autorefill')
      .select('enabled, threshold_microcents')
      .eq('user_id', userId)
      .maybeSingle();

    if (!cfg?.enabled) return json({ skipped: 'not_enabled' });
    const balance = Number(bal?.balance_microcents ?? 0);
    if (balance >= Number(cfg.threshold_microcents ?? 0)) {
      return json({ skipped: 'above_threshold', balance });
    }

    // Permission to spend — decided atomically, counter incremented first.
    const { data: claimed, error: claimErr } = await admin.rpc('claim_autorefill_slot', {
      p_user_id: userId,
    });
    if (claimErr) {
      console.error('[credit-autorefill] claim failed:', claimErr);
      return json({ error: 'claim_failed' }, 500);
    }
    if (claimed !== true) return json({ skipped: 'no_slot' });

    // From here a slot is held; every exit must record an outcome.
    try {
      const search = await sq('/v2/customers/search', 'POST', {
        query: { filter: { reference_id: { exact: userId } } },
        limit: 1,
      });
      const customerId = search.data?.customers?.[0]?.id;
      if (!customerId) {
        await admin.rpc('record_autorefill_result', {
          p_user_id: userId, p_success: false, p_error: 'no_square_customer',
        });
        return json({ skipped: 'no_customer' });
      }

      // Read the card from Square rather than storing an id of our own, so a
      // card the user deletes there simply stops working here.
      const cards = await sq(`/v2/cards?customer_id=${encodeURIComponent(customerId)}`, 'GET');
      const card = (cards.data?.cards ?? []).find((c: any) => c?.enabled !== false);
      if (!card?.id) {
        await admin.rpc('record_autorefill_result', {
          p_user_id: userId, p_success: false, p_error: 'no_card_on_file',
        });
        return json({ skipped: 'no_card' });
      }

      const pay = await sq('/v2/payments', 'POST', {
        idempotency_key: crypto.randomUUID(),
        source_id: card.id,
        customer_id: customerId,
        location_id: SQUARE_LOCATION_ID,
        amount_money: { amount: pack.priceCents, currency: 'USD' },
        // Square's own flag for a merchant-initiated charge with the customer
        // not present. Omitting it can get the payment declined by the issuer.
        customer_initiated: false,
        note: `PepTalk AI credit auto-refill · user ${userId}`,
      });

      const paymentId = pay.data?.payment?.id;
      const status = pay.data?.payment?.status;
      if (!pay.ok || status !== 'COMPLETED' || !paymentId) {
        const detail = String(
          pay.data?.errors?.[0]?.detail ?? pay.data?.errors?.[0]?.code ?? `status_${status}`,
        );
        await admin.rpc('record_autorefill_result', {
          p_user_id: userId, p_success: false, p_error: detail,
        });
        return json({ charged: false, reason: detail });
      }

      // Grant against the Square payment id. Idempotent by unique constraint.
      const { error: grantErr } = await admin.rpc('grant_ai_credits', {
        p_user_id: userId,
        p_source: 'square',
        p_external_id: paymentId,
        p_product_id: pack.productId,
        p_microcents: pack.creditCents * MC_PER_CENT,
        p_price_cents: pack.priceCents,
      });
      if (grantErr) {
        // The customer HAS been charged. Do not mark this a failure and hand
        // the slot back — that would invite a second charge. Log loudly; the
        // payment id is in Square and the grant can be replayed by hand.
        console.error(
          `[credit-autorefill] CHARGED ${paymentId} BUT GRANT FAILED for ${userId}:`,
          grantErr,
        );
        reportError('credit-autorefill', grantErr);
        await admin.rpc('record_autorefill_result', {
          p_user_id: userId, p_success: true, p_error: null,
        });
        return json({ charged: true, granted: false, paymentId }, 500);
      }

      await admin.rpc('record_autorefill_result', {
        p_user_id: userId, p_success: true, p_error: null,
      });
      return json({ charged: true, granted: true, paymentId, cents: pack.priceCents });
    } catch (inner) {
      await admin.rpc('record_autorefill_result', {
        p_user_id: userId, p_success: false, p_error: String(inner).slice(0, 200),
      });
      throw inner;
    }
  } catch (err) {
    reportError('credit-autorefill', err);
    console.error('[credit-autorefill]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
