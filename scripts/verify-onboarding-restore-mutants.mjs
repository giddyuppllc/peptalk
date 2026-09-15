/**
 * Mutation-test the onboarding restore's guards: break each one, and the
 * tests that claim to pin it must FAIL. Then restore, and they must pass.
 *
 *   node scripts/verify-onboarding-restore-mutants.mjs
 *
 * A green test suite proves nothing about a guard it never exercises. Each
 * entry below removes or inverts one decision the restore depends on to never
 * grant onboarding completion for signing in (App Review 2.1(a)), and names the
 * tests that must notice.
 *
 * Rules learned the hard way in this repo:
 *   - verify by EXIT CODE. A crashed run prints no "FAIL"; `status: null`
 *     (killed / timed out) is INCONCLUSIVE, not a catch;
 *   - restore from the content read into memory, never `git checkout --`,
 *     which reverts to HEAD rather than to the work in progress;
 *   - a mutation whose search text is missing, or not unique, is
 *     INCONCLUSIVE — it would otherwise "pass" by testing unmutated code.
 *
 * Not in verify:all: it runs jest ~30 times. Run it after touching any of the
 * files below.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LIB = 'src/lib/onboardingRestore.ts';
const RUNNER = 'src/lib/onboardingRestoreRunner.ts';
const STEPS = 'src/lib/onboardingSteps.ts';
const SERVICE = 'src/services/onboardingRestore.ts';
const STORE = 'src/store/useHealthProfileStore.ts';

const T_LIB = 'src/lib/__tests__/onboardingRestore.test.ts';
const T_RUNNER = 'src/lib/__tests__/onboardingRestoreRunner.test.ts';
const T_STEPS = 'src/lib/__tests__/onboardingSteps.test.ts';
const T_GATE = 'src/lib/__tests__/onboardingCompletionGate.test.ts';
const T_WIRING = 'src/services/__tests__/onboardingRestoreWiring.test.ts';
const T_FETCH = 'src/store/__tests__/healthProfileServerFetch.test.ts';

const MUTANTS = [
  // ── the decision ──
  { file: LIB, tests: [T_LIB], why: 'grant with no session',
    find: "if (!currentUserId) return NOTHING('signed-out');", replace: '' },
  { file: LIB, tests: [T_LIB], why: 'treat a failed fetch as an answer',
    find: "if (fetch.status === 'error') return NOTHING('fetch-failed');", replace: '' },
  { file: LIB, tests: [T_LIB, T_RUNNER], why: 'accept a fetch made for another account',
    find: "if (fetch.userId !== currentUserId) return NOTHING('signed-out');", replace: '' },
  { file: LIB, tests: [T_LIB, T_RUNNER], why: 'complete without the completion record',
    find: 'snapshot?.completedAt &&\n', replace: 'snapshot &&\n' },
  { file: LIB, tests: [T_LIB], why: 'complete on this device\'s body metrics, not the server\'s',
    find: 'basicsAnswered(readBodyAnswers(fetch.profile))', replace: 'basicsAnswered(localBody)' },
  { file: LIB, tests: [T_LIB], why: 'plan over a completion that already exists',
    find: 'if (local.isComplete) {', replace: 'if (false) {' },
  { file: LIB, tests: [T_LIB], why: 'restore from / overwrite a newer build\'s snapshot',
    find: "if (parsed.status === 'unsupported') return NOTHING('unsupported-snapshot');", replace: '' },
  { file: LIB, tests: [T_LIB], why: 'overwrite answers typed on this device',
    find: "if (!local.profile.gender && snapshot?.gender) fill.gender = snapshot.gender;",
    replace: 'if (snapshot?.gender) fill.gender = snapshot.gender;' },
  { file: LIB, tests: [T_LIB, T_WIRING], why: 'record completion for a flag with no answers',
    find: 'if (!local.isComplete || !aboutYouAnswered(local.profile)) return null;',
    replace: 'if (!local.isComplete) return null;' },
  { file: LIB, tests: [T_LIB], why: 'step 1 without a goal',
    find: 'a.healthGoals.length > 0', replace: 'a.healthGoals.length >= 0' },
  { file: LIB, tests: [T_LIB], why: 'loosen the weight rule',
    find: 'weightLbs >= 50 &&', replace: 'weightLbs >= 5 &&' },
  { file: LIB, tests: [T_LIB], why: 'loosen the height rule',
    find: 'feet >= 3 &&', replace: 'feet >= 2 &&' },
  { file: LIB, tests: [T_LIB], why: 'accept an unparseable completion time',
    find: "typeof raw.completedAt === 'string' && !isNaN(Date.parse(raw.completedAt))",
    replace: "typeof raw.completedAt === 'string'" },

  // ── the order of operations ──
  { file: RUNNER, tests: [T_RUNNER], why: 'read the session before the fetch, not after',
    find: 'currentUserId: deps.getCurrentUserId(),', replace: 'currentUserId: userId,' },
  { file: RUNNER, tests: [T_RUNNER], why: 'run with no session',
    find: "if (!userId) return Promise.resolve('signed-out');", replace: "if (!userId) { /* mutant */ }" },
  { file: RUNNER, tests: [T_RUNNER], why: 'never settle',
    find: "deps.setRestoreStatus(userId, 'settled');", replace: '' },
  { file: RUNNER, tests: [T_RUNNER], why: 'no shared run for concurrent callers',
    find: 'if (inflight && inflight.userId === userId) return inflight.promise;', replace: '' },
  { file: RUNNER, tests: [T_RUNNER], why: 'no timeout on the fetch',
    find: 'deps.timeoutMs ?? ONBOARDING_RESTORE_TIMEOUT_MS', replace: '2 ** 31 - 1' },

  // ── the screen ──
  { file: STEPS, tests: [T_STEPS], why: 'keep blanking after the restore settled',
    find: '!ctx.restoreSettled &&', replace: '' },
  { file: STEPS, tests: [T_STEPS], why: 'no ceiling on the blank wait',
    find: '!ctx.waitElapsed\n', replace: 'true\n' },
  { file: STEPS, tests: [T_STEPS], why: 'blank a signed-out visitor',
    find: 'storedStep === WELCOME_STEP &&\n    ctx.isAuthenticated &&\n    !ctx.isComplete &&',
    replace: 'storedStep === WELCOME_STEP &&\n    !ctx.isComplete &&' },
  { file: STEPS, tests: [T_STEPS], why: 'yank a user who is already answering',
    find: 'if (storedStep !== WELCOME_STEP) return null;', replace: '' },
  { file: 'app/onboarding.tsx', tests: [T_STEPS], why: 'render a step while the restore is out',
    find: 'if (forwardHome || awaitRestore) {', replace: 'if (forwardHome) {' },
  { file: 'app/onboarding.tsx', tests: [T_GATE], why: 'attest a resumed user as 18-29',
    find: 'if (attestedRange) void attestAge(attestedRange, MIN_AGE);',
    replace: 'void attestAge(ageToRange(selectedAge), MIN_AGE);' },
  { file: 'app/onboarding.tsx', tests: [T_GATE], why: 'loosen the step 1 requirement the restore mirrors',
    find: 'profile.gender && selectedAge >= MIN_AGE && profile.healthGoals.length > 0',
    replace: 'profile.gender && selectedAge >= MIN_AGE' },

  // ── wiring and callers ──
  { file: SERVICE, tests: [T_GATE, T_WIRING], why: 'let the restore lower or set isComplete outright',
    find: 'isComplete: state.isComplete || patch.isComplete,', replace: 'isComplete: patch.isComplete,' },
  { file: SERVICE, tests: [T_WIRING], why: 'mirror answers while the restore is out',
    find: " || state.restore.status !== 'settled'", replace: '' },
  { file: SERVICE, tests: [T_WIRING], why: 'mirror answers while signed out',
    find: "if (!userId || state.restore.userId !== userId || state.restore.status !== 'settled') return;",
    replace: 'if (false) return;' },
  { file: SERVICE, tests: [T_WIRING], why: 'overwrite targets the user set',
    find: 'if (patch.isComplete && targetsUntouched()) {', replace: 'if (patch.isComplete) {' },
  { file: 'app/_layout.tsx', tests: [T_GATE], why: 'deep link grants completion again',
    find: 'await restoreOnboardingFromServer();\n        const ob = useOnboardingStore.getState();',
    replace: 'useOnboardingStore.getState().completeOnboarding();\n        const ob = useOnboardingStore.getState();' },
  { file: 'app/auth.tsx', tests: [T_GATE], why: 'decide before the restore lands',
    find: 'await restoreOnboardingFromServer();', replace: 'void restoreOnboardingFromServer();' },
  { file: STORE, tests: [T_FETCH], why: 'a query error reads as an empty profile',
    find: "if (error) return { status: 'error' };", replace: '' },
  { file: STORE, tests: [T_FETCH], why: 'an auth failure reads as signed out',
    find: "userError && userError.name !== 'AuthSessionMissingError'", replace: 'false' },
  { file: STORE, tests: [T_FETCH], why: 'concurrent fetches race each other',
    find: 'if (inflightServerProfile) return inflightServerProfile;', replace: '' },
];

const isWin = process.platform === 'win32';

function jest(tests) {
  return spawnSync(isWin ? 'npx.cmd' : 'npx', ['jest', '--ci', '--silent', ...tests], {
    encoding: 'utf8',
    timeout: 300_000,
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
    // Multi-line search text is written with \n; a checkout with CRLF endings
    // would otherwise make it "not found" — reported, but never tested.
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const find = m.find.split('\n').join(eol);
    const replace = m.replace.split('\n').join(eol);
    const hits = original.split(find).length - 1;
    if (hits !== 1) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — search text found ${hits}x`]);
      bad++;
      continue;
    }
    writeFileSync(m.file, original.replace(find, () => replace));
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

// The control: with every file restored, the same tests must pass.
const allTests = [...new Set(MUTANTS.flatMap((m) => m.tests))];
const control = jest(allTests);
rows.push([
  control.status === 0 ? '✓  control passes (exit 0)' : `✗  CONTROL FAILED (exit ${control.status})`,
  '(restored sources)',
  allTests.length + ' test files',
]);
if (control.status !== 0) bad++;

for (const [verdict, file, why] of rows) console.log(`${verdict.padEnd(28)} ${file.padEnd(38)} ${why}`);
console.log(bad ? `\n${bad} problem(s)` : `\nall ${MUTANTS.length} mutants killed; control green`);
process.exit(bad ? 1 : 0);
