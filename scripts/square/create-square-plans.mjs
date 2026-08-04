#!/usr/bin/env node
/**
 * One-time: create the PepTalk recurring subscription plans in Square (Catalog),
 * then paste the printed plan_variation_ids into the edge-fn secrets:
 *   SQUARE_PLAN_PLUS_MONTHLY, SQUARE_PLAN_PRO_MONTHLY
 *
 * Run:  node scripts/square/create-square-plans.mjs
 * Reads SQUARE_ACCESS_TOKEN + SQUARE_ENV from env, or from ~/Projects/.square-creds.
 * Idempotent-ish: re-running creates NEW plans (Square has no upsert-by-name),
 * so run once and keep the IDs. Prices must match the app ($9.99 / $49.99).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function loadCreds() {
  const env = { ...process.env };
  const p = path.join(os.homedir(), 'Projects', '.square-creds');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/\s*#.*$/, '').trim();
    }
  }
  return env;
}

const env = loadCreds();
const TOKEN = env.SQUARE_ACCESS_TOKEN;
const BASE =
  (env.SQUARE_ENV ?? 'sandbox') === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

if (!TOKEN) {
  console.error('Missing SQUARE_ACCESS_TOKEN (env or ~/Projects/.square-creds).');
  process.exit(1);
}

const PLANS = [
  { key: 'SQUARE_PLAN_PLUS_MONTHLY', name: 'PepTalk+', variation: 'Monthly', amount: 999 },
  { key: 'SQUARE_PLAN_PRO_MONTHLY', name: 'PepTalk Pro', variation: 'Monthly', amount: 4999 },
];

async function createPlan(plan) {
  const body = {
    idempotency_key: `${plan.key}-${Date.now()}`,
    object: {
      type: 'SUBSCRIPTION_PLAN',
      id: `#${plan.key}`,
      subscription_plan_data: {
        name: plan.name,
        subscription_plan_variations: [
          {
            type: 'SUBSCRIPTION_PLAN_VARIATION',
            id: `#${plan.key}_var`,
            subscription_plan_variation_data: {
              name: plan.variation,
              phases: [
                {
                  cadence: 'MONTHLY',
                  pricing: {
                    type: 'STATIC',
                    price_money: { amount: plan.amount, currency: 'USD' },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
  const res = await fetch(`${BASE}/v2/catalog/object`, {
    method: 'POST',
    headers: {
      'Square-Version': '2024-07-17',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  // The plan variation is nested; grab its id.
  const variation = data.catalog_object?.subscription_plan_data?.subscription_plan_variations?.[0];
  return variation?.id;
}

console.log(`Creating subscription plans in Square (${env.SQUARE_ENV ?? 'sandbox'})…\n`);
for (const plan of PLANS) {
  try {
    const variationId = await createPlan(plan);
    console.log(`  ${plan.key}=${variationId}   (${plan.name} ${plan.variation}, $${(plan.amount / 100).toFixed(2)})`);
  } catch (e) {
    console.error(`  FAILED ${plan.key}:`, e.message);
  }
}
console.log(`\nSet those in the edge-fn secrets:\n  supabase secrets set SQUARE_PLAN_PLUS_MONTHLY=… SQUARE_PLAN_PRO_MONTHLY=… --project-ref zniucpbeepxysvkshpir`);
