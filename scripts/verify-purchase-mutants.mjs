#!/usr/bin/env node
/**
 * Mutation-test the money path: break one part of "a refused purchase reaches
 * the buyer" at a time, and the tests that claim to pin it must FAIL.
 *
 *   node scripts/verify-purchase-mutants.mjs
 *
 * What this protects. The native sheet closes successfully, Apple or Google
 * has taken the money, `validate-purchase` refuses to grant entitlement, and
 * the paywall stays exactly as it was. That failure went to Sentry and nowhere
 * else, so from the buyer's side paying did nothing and the app never
 * mentioned it. Two things have to hold at once, and they pull in opposite
 * directions:
 *
 *   1. the callback must still REJECT — iapService only skips
 *      finishTransaction when it does, and finishing consumes the receipt and
 *      entitles nobody;
 *   2. the buyer must be told, and told NOT to buy again, which is the one
 *      instruction that would make the situation materially worse.
 *
 * A fix that satisfies either one alone reads fine and is still broken, which
 * is why each is mutated separately here.
 *
 * Rules this repo learned the hard way, followed here:
 *   - verify by EXIT CODE. A crashed run prints no "FAIL"; `status: null`
 *     (killed / timed out) is INCONCLUSIVE, not a catch;
 *   - restore from the content read into memory, never `git checkout --`,
 *     which reverts to HEAD rather than to the work in progress;
 *   - a mutation whose search text is missing, or not unique, is
 *     INCONCLUSIVE — it would otherwise "pass" by testing unmutated code;
 *   - match against LF-normalised text and write back in the file's own ending
 *     style. Every source file here is CRLF on a Windows checkout, and an
 *     anchor spanning a line break silently matches nothing — which is exactly
 *     how two of the three verify:safetyonly mutants sat dead for months.
 *
 * Not in verify:all: it runs jest once per mutant. Run it after touching the
 * purchase callbacks, the subscription store or the paywall screen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LAYOUT = 'app/_layout.tsx';
const SCREEN = 'app/subscription.tsx';
const STORE = 'src/store/useSubscriptionStore.ts';

const T = 'src/lib/__tests__/failedPurchaseVisible.test.ts';

const MUTANTS = [
  // ── the failure is recorded at all ──
  {
    file: LAYOUT, tests: [T],
    why: 'cold-boot registration throws without telling anyone',
    find: '                useSubscriptionStore.getState().setFailedPurchase({ productId });\n',
    replace: '',
  },
  {
    file: LAYOUT, tests: [T],
    why: 'post-sign-in registration throws without telling anyone',
    // Carries the comment line above it. The two registrations' bodies are
    // identical apart from indentation, and the shorter indent is a substring
    // of the longer one — so the bare statement matches twice and the mutation
    // is INCONCLUSIVE rather than applied.
    find:
      '            // left the person who paid staring at an unchanged screen.\n' +
      '            useSubscriptionStore.getState().setFailedPurchase({ productId });\n',
    replace: '            // left the person who paid staring at an unchanged screen.\n',
  },
  // ── …without giving up the rejection that keeps the receipt replayable ──
  {
    file: LAYOUT, tests: [T],
    why: 'tells the buyer but resolves — iapService finishes the transaction and the receipt is consumed',
    find: '            useSubscriptionStore.getState().setFailedPurchase({ productId });\n            throw new Error(',
    replace: '            useSubscriptionStore.getState().setFailedPurchase({ productId });\n            void new Error(',
  },
  // ── the screen actually shows it ──
  {
    file: SCREEN, tests: [T],
    why: 'screen stops reading the flag',
    find: 'useSubscriptionStore((s) => s.failedPurchase)',
    replace: '(null as any)',
  },
  {
    file: SCREEN, tests: [T],
    why: 'flag is set and the banner never renders',
    find: '{failedPurchase && (',
    replace: '{false && (',
  },
  {
    file: SCREEN, tests: [T],
    why: 'banner tells a charged user to buy again',
    find: "on us — don't buy again.",
    replace: 'on us — please try again.',
  },
  // ── and stops showing it once it is no longer true ──
  {
    file: STORE, tests: [T],
    why: 'entitlement arrives and the banner outlives the problem',
    find: '            pendingPurchase: null,\n            failedPurchase: null,',
    replace: '            pendingPurchase: null,',
  },
  {
    file: STORE, tests: [T],
    why: 'signing out leaves a stranger holding the previous account\'s failure',
    find: '        pendingPurchase: null,\n        failedPurchase: null,\n      }),',
    replace: '        pendingPurchase: null,\n      }),',
  },
  {
    file: STORE, tests: [T],
    why: 'persisted, so a stale "we owe you a plan" survives the replay that fixed it',
    find: '        lastSyncedAt: state.lastSyncedAt,',
    replace: '        lastSyncedAt: state.lastSyncedAt,\n        failedPurchase: state.failedPurchase,',
  },
];

const isWin = process.platform === 'win32';

function jest(tests) {
  return spawnSync(isWin ? 'npx.cmd' : 'npx', ['jest', '--ci', '--silent', ...tests], {
    encoding: 'utf8',
    timeout: 600_000,
    shell: isWin,
  });
}

const originals = new Map();
const restoreAll = () => {
  for (const [file, content] of originals) writeFileSync(file, content);
};
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

let bad = 0;
const rows = [];

try {
  for (const m of MUTANTS) {
    if (!originals.has(m.file)) originals.set(m.file, readFileSync(m.file, 'utf8'));
    const original = originals.get(m.file);
    const crlf = original.includes('\r\n');
    const asFound = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t);
    const normalised = original.split('\r\n').join('\n');
    const find = m.find.split('\r\n').join('\n');

    const hits = normalised.split(find).length - 1;
    if (hits !== 1) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — search text found ${hits}x`]);
      bad++;
      continue;
    }

    writeFileSync(m.file, asFound(normalised.replace(find, () => m.replace)));
    let run;
    try {
      run = jest(m.tests);
    } finally {
      writeFileSync(m.file, original);
    }

    if (run.error || run.status === null) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — ${run.error?.message ?? `signal ${run.signal}`}`]);
      bad++;
    } else if (run.status === 0) {
      rows.push(['✗  SURVIVED', m.file, m.why]);
      bad++;
    } else {
      rows.push([`✓  killed (exit ${run.status})`, m.file, m.why]);
    }
  }
} finally {
  restoreAll();
}

// The control: with every file restored, the same tests must pass. Without
// this, a suite that was red to begin with would "kill" every mutant.
const allTests = [...new Set(MUTANTS.flatMap((m) => m.tests))];
const control = jest(allTests);
rows.push([
  control.status === 0 ? '✓  control passes (exit 0)' : `✗  CONTROL FAILED (exit ${control.status})`,
  '(restored sources)',
  `${allTests.length} test files`,
]);
if (control.status !== 0) bad++;

for (const [verdict, file, why] of rows) console.log(`${verdict.padEnd(28)} ${file.padEnd(28)} ${why}`);
console.log(bad ? `\n${bad} problem(s)` : `\nall ${MUTANTS.length} mutants killed; control green`);
process.exit(bad ? 1 : 0);
