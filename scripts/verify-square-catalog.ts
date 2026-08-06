/**
 * verify:square — assert the Square catalog agrees with the app's catalog.
 *
 * channel-parity.test.ts proves the app is internally consistent: the paywall
 * price, PRODUCT_IDS, PRODUCT_TO_TIER and SQUARE_PLANS all line up. It cannot
 * see Square itself. The remaining drift is the one that actually charges a
 * card:
 *
 *   - a plan variation is deleted or replaced in the Square dashboard, so
 *     square-subscribe creates the customer, saves the card, and then fails at
 *     the final call with an unknown plan
 *   - the price is edited in Square but not in the app, so the buyer is charged
 *     an amount they were never shown
 *   - a plan is switched to a non-monthly cadence, quietly breaking the
 *     monthly-only product rule
 *
 * READ-ONLY. It creates nothing and cancels nothing. Needs SQUARE_ACCESS_TOKEN
 * (and optionally SQUARE_ENV, SQUARE_LOCATION_ID, plus the SQUARE_PLAN_* ids);
 * without a token it skips cleanly so it is safe in CI with no secrets.
 */

import { SQUARE_PLANS } from '../supabase/functions/_shared/square';

const TOKEN = process.env.SQUARE_ACCESS_TOKEN ?? '';
const ENV = process.env.SQUARE_ENV ?? 'sandbox';
const LOCATION_ID = process.env.SQUARE_LOCATION_ID ?? '';
const BASE =
  ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

let errors = 0;
const fail = (m: string) => {
  errors++;
  console.error(`  ❌ ${m}`);
};
const ok = (m: string) => console.log(`  ✅ ${m}`);
const info = (m: string) => console.log(`  ℹ️  ${m}`);

async function sq(path: string) {
  const res = await fetch(BASE + path, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-10-17',
    },
  });
  return { ok: res.ok, status: res.status, data: (await res.json()) as any };
}

async function main() {
  console.log(`\n━━━ Square catalog (${ENV}) ━━━`);

  if (!TOKEN) {
    info('skipped — SQUARE_ACCESS_TOKEN not set');
    return;
  }

  // 1) Token works, and the location the client tokenizes against is real.
  const loc = await sq('/v2/locations');
  if (!loc.ok) {
    fail(`token rejected by Square (HTTP ${loc.status}) — ${JSON.stringify(loc.data?.errors ?? {})}`);
    return;
  }
  const locations: { id: string; status: string; currency: string }[] = loc.data.locations ?? [];
  ok(`token valid · ${locations.length} location(s)`);
  if (LOCATION_ID) {
    const match = locations.find((l) => l.id === LOCATION_ID);
    if (!match) fail(`SQUARE_LOCATION_ID "${LOCATION_ID}" is not a location on this account`);
    else if (match.status !== 'ACTIVE') fail(`location ${LOCATION_ID} is ${match.status}, not ACTIVE`);
    else ok(`location ${LOCATION_ID} ACTIVE (${match.currency})`);
  } else {
    info('SQUARE_LOCATION_ID not set — skipped the location check');
  }

  // 2) Every plan the app can sell must exist in Square, monthly, at the price
  //    the app believes it costs.
  for (const [productId, plan] of Object.entries(SQUARE_PLANS)) {
    const variationId = process.env[plan.planEnv];
    if (!variationId) {
      info(`${productId}: ${plan.planEnv} not set locally — skipped`);
      continue;
    }

    const res = await sq(`/v2/catalog/object/${variationId}`);
    if (!res.ok) {
      fail(`${productId}: plan variation ${variationId} not found in Square (HTTP ${res.status}) — every purchase of this plan fails at the subscription step`);
      continue;
    }

    const obj = res.data.object ?? {};
    if (obj.type !== 'SUBSCRIPTION_PLAN_VARIATION') {
      fail(`${productId}: ${variationId} is a ${obj.type}, not a SUBSCRIPTION_PLAN_VARIATION`);
      continue;
    }

    const phases: any[] = obj.subscription_plan_variation_data?.phases ?? [];
    if (phases.length === 0) {
      fail(`${productId}: plan variation has no phases — nothing to charge`);
      continue;
    }

    const cadences = phases.map((p) => p.cadence);
    if (!cadences.every((c) => c === 'MONTHLY')) {
      fail(`${productId}: cadence ${cadences.join('/')} — the product is monthly-only`);
    }

    const amounts = phases
      .map((p) => p.pricing?.price_money?.amount ?? p.recurring_price_money?.amount)
      .filter((a) => typeof a === 'number' || typeof a === 'bigint')
      .map(Number);

    if (amounts.length === 0) {
      info(`${productId}: relative pricing, no absolute amount to compare`);
    } else if (!amounts.every((a) => a === plan.amountCents)) {
      fail(`${productId}: Square charges ${amounts.join('/')} cents but the app shows ${plan.amountCents} — the buyer is billed an amount they were never shown`);
    } else {
      ok(`${productId} · MONTHLY · ${plan.amountCents} cents — matches the app`);
    }
  }
}

main()
  .catch((err) => {
    fail(`unexpected failure: ${err?.message ?? err}`);
  })
  .finally(() => {
    console.log('');
    if (errors > 0) {
      console.error(`  ${errors} problem${errors === 1 ? '' : 's'} found\n`);
      process.exit(1);
    }
    process.exit(0);
  });
