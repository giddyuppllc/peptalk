#!/usr/bin/env node
/**
 * Entitlements must never depend on build configuration.
 *
 * The paid tier used to be granted whenever `EXPO_PUBLIC_ENV !== 'production'`,
 * while eas.json's `preview` profile set EXPO_PUBLIC_ENV=preview AND
 * `distribution: "store"` — a shippable binary with the giveaway switched on.
 * Promote that to the App Store or Play production and every customer holds Pro
 * for nothing, while Subscribe does nothing because they already own it.
 *
 * The fix pinned the bypass to `__DEV__`, which is false in every release
 * binary and cannot be set by a build profile. This guards that property,
 * because the original mistake is easy to make again and reads as harmless.
 *
 * It deliberately does NOT police the EXPO_PUBLIC_ENV values in eas.json. They
 * are descriptive labels now — no client code reads them — and forcing the
 * preview profile to say "production" would just make the label lie.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const failures = [];

// ── 1. The bypass stays pinned to __DEV__ ──────────────────────────────────
const STORE = 'src/store/useSubscriptionStore.ts';
const store = readFileSync(join(ROOT, STORE), 'utf8');

if (!/export function isDevBuildBypass\(\): boolean \{\s*return __DEV__ === true/.test(store)) {
  failures.push(
    `isDevBuildBypass() in ${STORE} no longer keys off __DEV__. Anything else — ` +
      'an env var, a build profile, a hostname — can be set on a binary that ' +
      'reaches customers. Do not widen it.',
  );
}

// ── 2. No client code may read EXPO_PUBLIC_ENV at all ──────────────────────
// Not just the store: the next version of this bug will be in a different file.
{
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const rel = relative(ROOT, full);
        readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          // Prose explaining the history is fine; reading the value is not.
          if (/process\.env\.EXPO_PUBLIC_ENV/.test(line)) {
            offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }
  };
  for (const dir of ['src', 'app']) walk(join(ROOT, dir));

  if (offenders.length) {
    failures.push(
      'Client code reads process.env.EXPO_PUBLIC_ENV. Build config must not ' +
        'decide what a user has paid for:\n    ' + offenders.join('\n    '),
    );
  }
}

// ── 3. A stale grant must still be purged on load ──────────────────────────
const purges = /state\?\.productId === BETA_GRANT_PRODUCT_ID && !isDevBuildBypass\(\)/.test(store);
if (!store.includes('onRehydrateStorage') || !purges) {
  failures.push(
    `${STORE} no longer purges a stale beta grant on rehydrate. Closing the ` +
      'bypass is not enough on its own: the grant was written to persisted ' +
      "state with expiresAt:null, which never expires, so it outlives the build " +
      'that created it.',
  );
}

if (failures.length) {
  console.error('\n✗ entitlement-bypass check failed\n');
  for (const f of failures) console.error('  • ' + f + '\n');
  process.exit(1);
}
console.log('✓ entitlements: bypass is __DEV__-only, no build-config readers, stale grants purged');
