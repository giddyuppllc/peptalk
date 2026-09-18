/**
 * verify:safetyonly — nothing reaches past the dosing display boundary, and
 * the suite that proves it is not vacuous.
 *
 * WHY THIS EXISTS
 * Edward, 2026-09-16, made a named list of compounds safety-information-only:
 * no dose number renders for them, anywhere. The suppression itself is held by
 * src/lib/__tests__/safetyOnlyCompounds.test.tsx, which renders the real
 * components and asserts no figure comes out.
 *
 * That suite can only test surfaces that exist when it was written. The leak
 * this check exists for is the NEXT screen — a new card that imports
 * `getProtocolsByPeptide` directly, ships a dose for Cardarine, and passes
 * every test in the repo because no test knows to look at it. So:
 *
 *   1. STRUCTURAL — no file under app/ or src/components/ may import a raw
 *      dose getter or a raw dose store. They read through
 *      src/data/dosingDisplay.ts, which is the single place the list is
 *      applied. A new surface that reaches around it fails here.
 *   2. MIRROR — the Deno copy of the id list matches the TypeScript one.
 *   3. MUTATION (--mutate) — remove an id from the list, and from the renderer,
 *      and require the jest suite to go RED both times. A check that passes
 *      without reading anything is worse than no check; this is how this one
 *      proves it reads something. Not part of the default run because it
 *      executes jest twice; `npm run verify:safetyonly:mutation` runs it.
 *
 * Exit code is the result. Nothing here greps for the word "FAIL" in someone
 * else's output — a crashing check prints no FAIL and would look green.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');
const MUTATE = process.argv.includes('--mutate');

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  ok    ${msg}`);

/* ── 0. The list itself ───────────────────────────────────────────────────── */

const LIST_PATH = 'src/data/safetyOnlyCompounds.ts';
const MIRROR_PATH = 'supabase/functions/_shared/safetyOnlyCompounds.ts';

function idsFrom(path) {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('SAFETY_ONLY_COMPOUND_IDS = [');
  const end = text.indexOf('] as const', start);
  if (start < 0 || end < 0) {
    fail(`${path}: could not find the SAFETY_ONLY_COMPOUND_IDS array`);
    return [];
  }
  return [...text.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

console.log('safety-information-only compounds (Edward, 2026-09-16)');

const ids = idsFrom(LIST_PATH);
if (ids.length < 10) {
  fail(`${LIST_PATH}: only ${ids.length} ids — the list looks truncated`);
} else {
  pass(`${ids.length} ids in ${LIST_PATH}`);
}

/* ── 1. The Deno mirror agrees ────────────────────────────────────────────── */

const mirror = idsFrom(MIRROR_PATH);
const missing = ids.filter((i) => !mirror.includes(i));
const extra = mirror.filter((i) => !ids.includes(i));
if (missing.length || extra.length) {
  fail(
    `${MIRROR_PATH} has drifted from ${LIST_PATH}` +
      (missing.length ? ` — missing: ${missing.join(', ')}` : '') +
      (extra.length ? ` — unexpected: ${extra.join(', ')}` : ''),
  );
} else {
  pass('the Deno mirror of the list matches');
}

/* ── 2. No UI file reaches past the display boundary ──────────────────────── */

/**
 * Raw readers of a dose store. Every one of these returns the stored figure
 * for every compound, including the withdrawn ones.
 */
const RAW_READERS = [
  'getProtocolsByPeptide',
  'getProtocolById',
  'getDosingTableEntry',
  'getAllDosingTableEntries',
  'getDosingReference',
  'getAllDosingReferencesForPeptide',
  'PROTOCOL_TEMPLATES',
  'PEPTIDE_DOSING_TABLE',
  'PEPTIDE_DOSING_REFERENCE',
  'CLINICIAN_RULINGS',
];

/**
 * Files allowed to read raw, each with the reason. A new entry here is a
 * deliberate decision someone has to write down, which is the point.
 */
const RAW_ALLOWED = new Map([
  [
    'app/calculators/plan.tsx',
    'Reads protocols RAW only to check contraindications and caution conditions ' +
      'for the recommendation flags. Suppressing a dose must not suppress a ' +
      'safety flag. Its "Start cycle" path uses getProtocolsForDisplay.',
  ],
  [
    'src/services/peptalkBot.ts',
    'The on-device bot needs the RAW protocol for its SAFETY layer — the ' +
      'health-profile contraindication check, cautions, storage and notes. It ' +
      'calls isSafetyOnly() inline and skips only the dose-bearing lines, and ' +
      'redactDoseBearingNotes() for importantNotes. Covered by the jest suite.',
  ],
  [
    'src/services/llmService.ts',
    'Builds the client-side Aimee prompt. Keeps every protocol ROW (removing ' +
      'one leaves the model answering from general knowledge) and replaces the ' +
      'dose figures with a SAFETY INFORMATION ONLY instruction via isSafetyOnly.',
  ],
  [
    'src/services/aimeeNudges.ts',
    'Reads PROTOCOL_TEMPLATES for titration-bump nudges; suppresses the nudge ' +
      'for a listed compound via isSafetyOnly, because the prompt it generates ' +
      'names both the current and the next dose.',
  ],
  [
    'src/services/doseSafety.ts',
    'The dose guard MUST keep computing against the stored range for a listed ' +
      'compound — a user can still log one and a decimal-point error is still ' +
      'an error. It withholds the DISPLAY string only. See the note in the file.',
  ],
  [
    'src/utils/doseAdherence.ts',
    'Reads durationWeeks and cycleLength to work out how many days a cycle the ' +
      'user is ALREADY tracking should run. Renders counts and a percentage — ' +
      'no dose amount, in any unit.',
  ],
  [
    'src/hooks/useActivePeptideCycle.ts',
    'Reads cycleLength to derive "week n of N" for a cycle the user is ALREADY ' +
      'tracking, and the ladder shape to label the intent. Returns no dose.',
  ],
  [
    'src/data/calculatorMetadata.ts',
    'Returns display unit and vial/diluent starting points — arithmetic inputs ' +
      'about a vial the user is holding, not a dose. The decision keeps ' +
      'the calculator doing arithmetic. See the long note in the file.',
  ],
  [
    'src/data/canonicalDosing.ts',
    'The adjudicated dose store itself. It feeds the guard and the verification ' +
      'scripts and must see every compound; it renders nothing on its own.',
  ],
  [
    'src/data/dosingDisplay.ts',
    'THE display boundary. It is the one module that is supposed to read raw ' +
      'and apply the list.',
  ],
  [
    'src/data/peptideDosingTable.ts',
    'Derives a table row from a protocol when the master table has no explicit ' +
      'row. A data-layer join, not a render.',
  ],
  [
    'src/lib/doseSanity.ts',
    'CI-only dosing audit (verify:dosesanity). It must examine every compound ' +
      'or the audit goes vacuous; it has no UI consumer.',
  ],
]);

const uiFiles = globSync('{app,src/components,src/hooks,src/services,src/utils,src/lib,src/data}/**/*.{ts,tsx}')
  .map(slash)
  .filter((f) => !f.includes('__tests__') && !f.endsWith('.d.ts'));

// SELF-CHECK: a scanner that discovers an empty corpus reports success for
// work it did not do. Exit here rather than accumulating a failure, so the
// output cannot be mistaken for a completed scan. (verify:scannercontrols
// requires exactly this of every verifier that globs its own corpus.)
const MIN_FILES = 200;
if (uiFiles.length < MIN_FILES) {
  console.error(
    `
✗ SELF-CHECK FAILED — found only ${uiFiles.length} source files ` +
      `(expected >= ${MIN_FILES}). The glob is not reading the tree, so ` +
      'nothing below examined anything.',
  );
  process.exit(1);
}
pass(`scanned ${uiFiles.length} files under app/, src/components, hooks, services, utils, lib and data`);

// Positive control: the boundary module itself must be imported by the UI, or
// this whole check is guarding a door nobody uses.
const boundaryUsers = uiFiles.filter((f) =>
  /from ['"][^'"]*data\/dosingDisplay['"]/.test(readFileSync(f, 'utf8')),
);
if (boundaryUsers.length < 4) {
  fail(
    `only ${boundaryUsers.length} UI files import data/dosingDisplay — ` +
      'the display boundary is not actually in use',
  );
} else {
  pass(`${boundaryUsers.length} UI files read through data/dosingDisplay`);
}

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
// llmService lazy-requires its data files so Aimee's knowledge base is not
// built at app startup. A require is still a raw read.
const REQUIRE_RE = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
// Matches both '../data/protocols' and the bare './protocols' that modules
// inside src/data/ use for a sibling. Anchoring on 'data/' missed every one of
// the latter — four allowlisted files reported as stale, which is what caught
// it. The allowlist-staleness rule is doing real work here.
const DOSE_MODULE_RE = /(^|\/)(protocols|peptideDosingTable|peptideDosingReference|clinicianRulings)$/;

/** Files that read a raw dose store, whatever the allowlist says. */
const readsRaw = new Map();

for (const file of uiFiles) {
  const text = readFileSync(file, 'utf8');
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    for (const [, names, source] of text.matchAll(re)) {
      if (!DOSE_MODULE_RE.test(source)) continue;
      const raw = names
        .split(',')
        .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter((n) => RAW_READERS.includes(n));
      if (raw.length === 0) continue;
      readsRaw.set(file, [...(readsRaw.get(file) ?? []), ...raw]);
    }
  }
}

let leaks = 0;
for (const [file, raw] of readsRaw) {
  if (RAW_ALLOWED.has(file)) continue;
  leaks += 1;
  fail(
    `${file} imports ${[...new Set(raw)].join(', ')} from a dose store directly. ` +
      'Anything that can put text in front of a user must read through ' +
      'src/data/dosingDisplay.ts so the safety-information-only list applies. ' +
      'If this file genuinely needs the raw data (a safety flag, not a dose), ' +
      'add it to RAW_ALLOWED in scripts/verify-safety-only.mjs with the reason.',
  );
}
if (leaks === 0) pass(`no unlisted file reads a dose store directly (${readsRaw.size} listed readers)`);

// Positive control on the scanner itself: if the parser stopped matching, it
// would report zero raw readers and pass silently. There ARE raw readers — the
// allowlisted ones — and the count must not collapse.
if (readsRaw.size < 12) {
  fail(
    `the import scanner found only ${readsRaw.size} raw readers; it should ` +
      'find at least the allowlisted ones. The parser is not matching.',
  );
} else {
  pass(`scanner located ${readsRaw.size} raw readers`);
}

// The allowlist must not rot: an entry naming a file that no longer reads raw
// is a hole left open for the next edit to fall through.
for (const [file, reason] of RAW_ALLOWED) {
  if (!readsRaw.has(file)) {
    fail(`RAW_ALLOWED entry for ${file} is stale — it no longer reads raw. Remove it.`);
  } else if (!reason || reason.length < 40) {
    fail(`RAW_ALLOWED entry for ${file} has no real reason recorded`);
  }
}

/* ── 3. Mutation: does the suite actually catch a leak? ───────────────────── */

const SUITE = 'src/lib/__tests__/safetyOnlyCompounds.test.tsx';

/**
 * Run jest through node against its own bin, NOT through `npx`. On Windows
 * execFileSync refuses to spawn a `.cmd` shim without a shell and fails with a
 * null exit status and empty stderr — which this function would have read as
 * "red", so EVERY mutant would have looked caught and the baseline would have
 * looked broken. Resolving the bin removes the shell from the path entirely.
 */
const JEST_BIN = (() => {
  const req = createRequire(import.meta.url);
  // jest's package.json exports map does not expose ./bin/jest.js, so resolve
  // the package root through a subpath it DOES export and walk to the bin.
  const pkgMain = req.resolve('jest-cli/package.json');
  return join(dirname(pkgMain), 'bin', 'jest.js');
})();

function suiteIsRed() {
  try {
    execFileSync(process.execPath, [JEST_BIN, SUITE, '--silent'], { stdio: 'pipe' });
    return false; // exit 0 = green
  } catch (err) {
    if (typeof err.status !== 'number') {
      // Could not run jest at all. Reporting this as "red" would make every
      // mutant look caught — the exact vacuous-check failure this file warns
      // about. Fail loudly instead.
      throw new Error(`could not run jest: ${err.message}`);
    }
    return true; // non-zero = red (a CRASH counts as red, and is reported below)
  }
}

if (MUTATE) {
  console.log('\nmutation testing the suite');

  const mutants = [
    {
      name: 'remove MK-677 from the list',
      file: LIST_PATH,
      find: "  'mk-677', // MK-677 (Ibutamoren) — investigational, never approved\n",
      replace: '',
    },
    {
      name: 'make the dosing-reference card ignore the list (leak a dose)',
      file: 'src/components/DosingReferenceTableCard.tsx',
      find: 'const entry = getDosingTableEntryForDisplay(peptideId);',
      replace: 'const entry = getDosingTableEntry(peptideId);',
      alsoFind: "import { PEPTIDE_DOSING_TABLE_DISCLAIMER } from '../data/peptideDosingTable';",
      alsoReplace:
        "import { PEPTIDE_DOSING_TABLE_DISCLAIMER, getDosingTableEntry } from '../data/peptideDosingTable';",
    },
    {
      name: 'make doseSafety print the withheld range again',
      file: 'src/services/doseSafety.ts',
      find: '        display: isSafetyOnly(peptide.id)\n          ? null\n          : `${fmt(canonical.minMcg)}–${fmt(canonical.maxMcg)}`,',
      replace: '        display: `${fmt(canonical.minMcg)}–${fmt(canonical.maxMcg)}`,',
    },
  ];

  // Baseline first. Mutation results mean nothing if the suite is already red.
  if (suiteIsRed()) {
    fail('baseline: the suite is RED before any mutation — fix that first');
  } else {
    pass('baseline: the suite is green');

    for (const m of mutants) {
      const original = readFileSync(m.file, 'utf8');
      // Match against LF text, always. Every anchor above is written with \n and
      // every source file in this repo is CRLF on a Windows checkout, so an
      // anchor spanning a line break never matched here while matching fine
      // in CI. Two of the three mutants below were silently never applied on
      // Edward's machine - decoration, not tests. The file is written back in
      // its own ending style so a mutation does not also become a whole-file
      // line-ending rewrite.
      const crlf = original.includes('\r\n');
      const asFound = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t);
      const normalized = original.replace(/\r\n/g, '\n');
      if (!normalized.includes(m.find)) {
        fail(`mutant "${m.name}": anchor not found in ${m.file} — the mutation never applied`);
        continue;
      }
      let mutated = normalized.replace(m.find, m.replace);
      if (m.alsoFind) {
        if (!normalized.includes(m.alsoFind)) {
          fail(`mutant "${m.name}": secondary anchor not found in ${m.file}`);
          continue;
        }
        mutated = mutated.replace(m.alsoFind, m.alsoReplace);
      }
      writeFileSync(m.file, asFound(mutated));
      let red;
      try {
        red = suiteIsRed();
      } finally {
        // Restore from the string we read, NOT from git: `git checkout --`
        // would revert to HEAD and throw away uncommitted work.
        writeFileSync(m.file, original);
      }
      if (red) pass(`mutant caught: ${m.name}`);
      else fail(`mutant SURVIVED: ${m.name} — the suite does not test this`);
    }

    // And the suite must be green again after restoring every mutant.
    if (suiteIsRed()) fail('the suite did not return to green after restoring the mutants');
    else pass('suite green again after restore');
  }
}

/* ── done ─────────────────────────────────────────────────────────────────── */

if (failures > 0) {
  console.error(`\nverify:safetyonly — ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify:safetyonly — ok');
