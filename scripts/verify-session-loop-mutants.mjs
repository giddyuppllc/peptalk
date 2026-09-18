#!/usr/bin/env node
/**
 * Mutation-test the App Review 2.1(a) death loop: break one part of "a lost
 * session explains itself" at a time, and the tests that claim to pin it must
 * FAIL.
 *
 *   node scripts/verify-session-loop-mutants.mjs
 *
 * What this protects. Two rejections were "sent back to the login page after
 * logging in", both on a clean install, and every individual step was correct:
 *
 *   sign in → the session write does not stick → getSession() returns nothing
 *   → the store clears the user (right: a ghost session 401s on every call)
 *   → routeGuard rule 3 sends a signed-out visitor to /auth → sign in again
 *
 * The loop is silent because no step owns saying so. `sessionPersistenceHealthy()`
 * carried a doc comment claiming "the app uses it to warn the user" while its
 * only consumer was a Sentry `extra` field.
 *
 * Two things have to hold at once, and they pull in opposite directions:
 *
 *   1. the redirect STAYS. An unverifiable session must not reach the app —
 *      that hole was closed on 2026-09-12 and softening it to smooth over a
 *      loop would trade a confusing screen for a real one;
 *   2. the loop must be explained, in copy that names the cause when we know
 *      it and refuses to invent one when we do not.
 *
 * A fix that satisfies either alone reads fine and leaves a reviewer stuck,
 * which is why each is mutated separately here.
 *
 * Rules this repo learned the hard way, followed here:
 *   - verify by EXIT CODE. `status: null` (killed / timed out) is
 *     INCONCLUSIVE, not a catch;
 *   - restore from the content read into memory, never `git checkout --`;
 *   - a mutation whose search text is missing, or not unique, is INCONCLUSIVE
 *     — it would otherwise "pass" by testing unmutated code;
 *   - match against LF-normalised text and write back in the file's own ending
 *     style. Every source file here is CRLF on a Windows checkout, and that is
 *     exactly how two verify:safetyonly mutants sat dead for months.
 *
 * Not in verify:all: it runs jest once per mutant. Run it after touching the
 * auth store, the storage adapters, the auth screen or the route guard.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const STORE = 'src/store/useAuthStore.ts';
const SUPABASE = 'src/services/supabase.ts';
const SCREEN = 'app/auth.tsx';
const COPY = 'src/lib/sessionLostNotice.ts';
const GUARD = 'src/lib/routeGuard.ts';

const T = 'src/lib/__tests__/sessionLostNotice.test.ts';

const MUTANTS = [
  // ── the loss is recorded, and only when it IS one ──
  {
    file: STORE, tests: [T],
    why: 'store stops recording the loss at all',
    find: 'sessionLostAt: hadUser ? Date.now() : null,',
    replace: 'sessionLostAt: null,',
  },
  {
    file: STORE, tests: [T],
    why: 'records a loss on a cold start with nobody signed in',
    find: 'sessionLostAt: hadUser ? Date.now() : null,',
    replace: 'sessionLostAt: Date.now(),',
  },
  {
    file: STORE, tests: [T],
    why: 'a deliberate sign-out stops clearing it',
    find: '          // would erase the message on the way out.\n          sessionLostAt: null,\n',
    replace: '          // would erase the message on the way out.\n',
  },
  {
    file: STORE, tests: [T],
    why: 'persisted, so last week\'s failure accuses today\'s good session',
    find: '        isAuthenticated: state.isAuthenticated,\n      }),',
    replace: '        isAuthenticated: state.isAuthenticated,\n        sessionLostAt: state.sessionLostAt,\n      }),',
  },
  // ── the persistence flag stays observable ──
  {
    file: SUPABASE, tests: [T],
    why: 'a bare assignment bypasses the listeners — the screen never hears',
    find: '      setSessionPersistOk(false);\n      captureException(',
    replace: '      sessionPersistOk = false;\n      captureException(',
  },
  {
    file: SUPABASE, tests: [T],
    why: 'the subscription is no longer exported',
    find: 'export function subscribeSessionPersistence',
    replace: 'function subscribeSessionPersistence',
  },
  // ── the screen shows it ──
  {
    file: SCREEN, tests: [T],
    why: 'screen stops subscribing, so a mid-session flip never lands',
    find: '  useEffect(() => subscribeSessionPersistence(setPersistHealthy), []);\n',
    replace: '',
  },
  {
    file: SCREEN, tests: [T],
    why: 'screen stops deciding whether to show it',
    find: 'shouldShowSessionLost(sessionLostAt)',
    replace: 'false',
  },
  // ── the copy stays honest ──
  {
    file: COPY, tests: [T],
    why: 'invents a cause it does not know — sends someone to change a setting that was fine',
    find: '"Your session ended on its own rather than because you signed out. Signing "',
    replace: '"You are in private browsing, so your session ended. Signing "',
  },
  {
    file: COPY, tests: [T],
    why: 'promises the blocked-storage case will not recur',
    find: '      willRecur: true,',
    replace: '      willRecur: false,',
  },
  {
    file: COPY, tests: [T],
    why: 'drops the support route from the case we cannot diagnose',
    find: "'support@peptalk.bio and we will get you in.'",
    replace: "'us and we will get you in.'",
  },
  // ── and the redirect is NOT softened to paper over it ──
  {
    file: GUARD, tests: [T],
    why: 'guard stops evicting a signed-out visitor — reopens the 2026-09-12 hole',
    find: "    return s.inAuth || s.inOnboarding ? null : '/auth';",
    replace: '    return null;',
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
    if (hits < 1) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — search text found ${hits}x`]);
      bad++;
      continue;
    }

    // Some anchors legitimately appear twice (the notice renders on both the
    // login and the sign-up tab). Mutating every occurrence is the honest
    // reading of "break this behaviour".
    writeFileSync(m.file, asFound(normalised.split(find).join(m.replace)));
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

const allTests = [...new Set(MUTANTS.flatMap((m) => m.tests))];
const control = jest(allTests);
rows.push([
  control.status === 0 ? '✓  control passes (exit 0)' : `✗  CONTROL FAILED (exit ${control.status})`,
  '(restored sources)',
  `${allTests.length} test files`,
]);
if (control.status !== 0) bad++;

for (const [verdict, file, why] of rows) console.log(`${verdict.padEnd(28)} ${file.padEnd(30)} ${why}`);
console.log(bad ? `\n${bad} problem(s)` : `\nall ${MUTANTS.length} mutants killed; control green`);
process.exit(bad ? 1 : 0);
