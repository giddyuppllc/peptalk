#!/usr/bin/env node
/**
 * verify-skips — say plainly, at the END of the run, which deep checks did not
 * actually execute.
 *
 * WHY THIS EXISTS
 * On 2026-08-21 the live PWA was found shipping Square's sandbox SDK: a
 * checkout that cannot take a real payment. `npm run verify:all` had been
 * exiting 0 the whole time. Two of its checks skip themselves when a
 * credential is missing —
 *
 *   verify:functions  "skipped the remote check — no SUPABASE_ACCESS_TOKEN"
 *   verify:square     "skipped — SQUARE_ACCESS_TOKEN not set"
 *
 * — and those lines sat at line 93 of 649 lines of output, above a green
 * summary. A check that skips on a missing credential is indistinguishable
 * from a check that passed, and that is precisely the failure this suite was
 * built to prevent.
 *
 * This runs last so the skipped set is the last thing printed rather than the
 * first thing scrolled past. It does not fail the build by default — the
 * credentials are legitimately absent on a dev machine and in CI, and making
 * that fatal would only teach everyone to ignore a red run. Set
 * VERIFY_STRICT=1 to turn skips into a failure once the secrets exist.
 */

import { execFileSync } from 'node:child_process';

const CHECKS = [
  {
    env: 'SUPABASE_ACCESS_TOKEN',
    name: 'verify:functions — remote deployment check',
    covers:
      'whether the edge functions the client calls are actually DEPLOYED. ' +
      'Without it the check only proves they exist in the repo.',
    /**
     * The env var is not the only way this check can run.
     * verify-edge-functions.ts does not read SUPABASE_ACCESS_TOKEN — it shells
     * out to `supabase functions list` and uses whatever auth the CLI has,
     * which includes a token stored by `supabase login`. So after a CLI login
     * the remote half runs fine while this reporter, keying off the env var
     * alone, still announced it as skipped.
     *
     * A reporter that under-claims coverage is safer than one that over-claims,
     * but it is still wrong, and "which checks actually ran" is the one thing
     * this file exists to answer truthfully. So probe the same way the real
     * check does. Failure of any kind counts as "cannot run" — the
     * conservative direction.
     */
    canRunAnyway: () => {
      try {
        execFileSync('npx', ['supabase', 'projects', 'list'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          shell: process.platform === 'win32',
          timeout: 60_000,
        });
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    env: 'SQUARE_ACCESS_TOKEN',
    name: 'verify:square — catalog check',
    covers:
      'whether the Square catalog matches the plans the app sells. ' +
      'Note this would NOT have caught the sandbox-SDK bug: that one is ' +
      'client-side config, and verify-build now reads the built bundle for it.',
  },
];

// A check counts as skipped only when the env var is absent AND it has no
// other way to run. Without the second clause this file reports gaps that do
// not exist — see canRunAnyway above.
const missing = CHECKS.filter(
  (c) => !process.env[c.env] && !(c.canRunAnyway ? c.canRunAnyway() : false),
);
const strict = process.env.VERIFY_STRICT === '1';

console.log('\n━━━ Checks that did not run ━━━\n');

if (missing.length === 0) {
  console.log('  ✅ none — every credential-gated check executed.\n');
  process.exit(0);
}

for (const c of missing) {
  console.log(`  ⚠️  SKIPPED  ${c.name}`);
  console.log(`      needs ${c.env}`);
  console.log(`      unverified: ${c.covers}\n`);
}

console.log(
  `  ${missing.length} check(s) reported no failures because they never ran.\n` +
    '  Set the variables above to close the gap, or VERIFY_STRICT=1 to make\n' +
    '  this fatal once they exist.\n',
);

process.exit(strict ? 1 : 0);
