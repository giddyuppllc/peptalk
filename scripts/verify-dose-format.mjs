/**
 * verify:doseformat — one dose renderer, and a display unit derived from data.
 *
 * WHY THIS EXISTS
 * Edward, on why every pass finds a new units problem: "instead of changing
 * things or working them out so they don't error it feels like just a weird
 * rule is made that fixes the minor issue once, system breaks and we lost data
 * and knowledge of how to proceed."
 *
 * The dose units were the clearest instance of it. Two separate symptoms, one
 * cause — a rule applied locally instead of centrally:
 *
 *   1. FOUR functions rendered a dose and no two agreed. 1000 mcg came out as
 *      "1.00 mg" (doseUnits), "1 mg" (doseCalculator) and "1000 mcg"
 *      (calculatorV2). 60 mg of NAD+ rendered "60000 mcg" on the calculator.
 *      Each was locally reasonable; there was no one place to fix it, so every
 *      complaint produced another local rule.
 *
 *   2. calculatorMetadata carried `displayUnit: 'mcg'` as a hand-written list
 *      of NINE peptides, under a comment stating the rule ("typically dosed in
 *      the 100s of mcg"). The rule is computable from the dosing ladder, but it
 *      was frozen into a list, and the list missed FOURTEEN mcg-native
 *      compounds — Ipamorelin's 100 mcg dose rendered as "0.1 mg".
 *
 * This check guards both: no new competing formatter, and no compound whose
 * display unit contradicts its own doses. It FAILS rather than warns — unlike
 * the dosing-consistency checks, nothing here needs clinical judgement. Both
 * questions have a right answer computable from data already in the repo.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
// node:fs, not the `glob` package. The installed glob is v7, which is CommonJS
// and exports no named `globSync` — that arrived in v9 — so this import threw on
// load. Node's built-in has the same signature and no dependency at all.
import { globSync } from 'node:fs';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');
let failed = false;

/* ── 1. Exactly one dose-rendering implementation ─────────────────────────── */

/**
 * Files allowed to define a dose formatter, with the reason. Everything else
 * must call formatDoseAmount / formatMassMcg.
 */
const FORMATTER_OWNERS = new Map([
  ['src/lib/doseUnits.ts', 'THE canonical implementation — formatMassMcg + formatDoseAmount.'],
  [
    'src/utils/calculatorV2.ts',
    'Honours the calculator\'s explicit mg/mcg toggle, which formatDoseAmount ' +
      'deliberately does not. Calls formatDoseAmountExact: a drawn dose is not display-rounded.',
  ],
]);

const sources = globSync('{src,app}/**/*.{ts,tsx}')
  .map(slash)
  .filter((f) => !f.includes('__tests__') && !f.endsWith('.d.ts'));

/** A function whose name says it renders a dose/mass amount. */
const FORMATTER_RE =
  /(?:export\s+)?(?:function\s+(format(?:Dose|Mass|Mcg|Mg)[A-Za-z]*)|const\s+(format(?:Dose|Mass|Mcg|Mg)[A-Za-z]*)\s*=\s*(?:\(|function))/g;

const offenders = [];
let definitionsFound = 0;
for (const file of sources) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(FORMATTER_RE)) {
    const name = m[1] ?? m[2];
    definitionsFound++;
    if (FORMATTER_OWNERS.has(file)) continue;
    offenders.push({ file, name });
  }
}

/**
 * Positive control. The canonical file defines formatMassMcg, formatDoseAmount
 * and formatDoseRange; if the pattern finds nothing the scan is broken, and a
 * clean run from a broken scan is worse than no check. Several scanners in this
 * repo's history reported success purely by matching nothing.
 */
if (definitionsFound < 3) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${definitionsFound} formatter definitions found.` +
      '\n  The pattern is broken; a clean result would be meaningless.',
  );
  process.exit(1);
}

console.log('\n— Dose formatting: one implementation —');
console.log(`  ${sources.length} source files · ${definitionsFound} formatter definition(s)`);
for (const [f, why] of FORMATTER_OWNERS) console.log(`  ✓ ${f} — ${why}`);

if (offenders.length) {
  failed = true;
  console.log('');
  for (const o of offenders) {
    console.log(`  ❌ ${o.file} defines ${o.name}()`);
    console.log('     Call formatDoseAmount/formatMassMcg from src/lib/doseUnits instead,');
    console.log('     or add this file to FORMATTER_OWNERS with the reason.\n');
  }
} else {
  console.log('  ✓ no competing dose renderer');
}

/* ── 2. displayUnit must match the compound's own doses ───────────────────── */

const raw = execSync('npx tsx scripts/_dose-display-unit-extract.ts', {
  encoding: 'utf8',
  maxBuffer: 1e8,
});
const rows = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('[')).pop());

if (rows.length < 10) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${rows.length} compounds have both a display unit and a ladder.`,
  );
  process.exit(1);
}

const wrong = rows.filter((r) => r.actual !== r.expected);
console.log('\n— Dose display units: derived, not listed —');
console.log(`  ${rows.length} compounds carry both a display unit and a dosing ladder`);

if (wrong.length) {
  failed = true;
  console.log('');
  for (const r of wrong) {
    console.log(
      `  ❌ ${r.name.padEnd(22)} shows ${r.actual}, but doses run ${r.min}-${r.max} mcg → ${r.expected}`,
    );
  }
  console.log(
    '\n  A dose under 1 mg should read in mcg — "0.1 mg" is not an increment\n' +
      '  anyone uses. Fix the ladder, or add a displayUnit override in\n' +
      '  calculatorMetadata OVERRIDES with the reason it is a real exception.\n',
  );
} else {
  console.log('  ✓ every display unit matches the compound\'s own doses');
}

/* ── 3. No raw `{amount} {unit}` interpolation of a dose ──────────────────── */

/**
 * WHY (2026-09-16)
 * Owning the one formatter is not enough if a screen never calls it. The
 * "Today's planned dose" card on app/(tabs)/my-stacks.tsx printed
 * `{slot.amount} {slot.unit}` straight out of the reconstitution ladder, so
 * glutathione read "300000 mcg", NAD+ "60000 mcg" and MOTS-c "1000 mcg" — the
 * exact complaint quoted in doseUnits.ts's own header, still on screen months
 * after the header was written. Section 1 passed the whole time: the file
 * defines no competing formatter, it just calls none.
 *
 * A pair like `{x.amount} {x.unit}` is a dose rendered by string
 * concatenation. It must go through formatDoseAmount (or
 * formatDoseAmountExact where a drawn dose needs its exact figure).
 */
const RAW_DOSE_PATTERNS = [
  // JSX:  {slot.amount} {slot.unit}
  /\{\s*([A-Za-z_$][\w$]*\.)?(amount|dose|doseAmount)\s*\}\s*\{\s*([A-Za-z_$][\w$]*\.)?(unit|doseUnit)\s*\}/,
  // Template literal:  `${slot.amount} ${slot.unit}`
  /\$\{\s*([A-Za-z_$][\w$]*\.)?(amount|dose|doseAmount)\s*\}\s*\$\{\s*([A-Za-z_$][\w$]*\.)?(unit|doseUnit)\s*\}/,
];

/**
 * SCOPE: rendered surfaces only — screens under app/ and the components they
 * render. src/services is excluded deliberately: doseSafety's warning copy
 * must echo the user's OWN figure back verbatim ("250 mg is more than 3× …"),
 * and privacyGuard/peptalkBot build text for redaction and for the model, not
 * for a dose card. Formatting those would change what the guard quotes.
 */
const isRenderedSurface = (f) => f.startsWith('app/') || f.startsWith('src/components/');

/** A comment line is not a render. */
const isComment = (line) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line);

/**
 * Screens that still concatenate a dose, with the reason. Each is a separate
 * screen and a separate change; this section was added with my-stacks.tsx in
 * scope. An entry that no longer matches is a STALE entry and fails, so this
 * list cannot quietly become permanent.
 */
const RAW_DOSE_BACKLOG = new Map([
  ['src/components/DaySummarySheet.tsx', 'Day summary sheet — 2026-09-16 backlog.'],
  ['src/components/peptides/DoseStrip.tsx', 'Dose history strip — 2026-09-16 backlog.'],
  ['app/(tabs)/calendar.tsx', 'Calendar day list — 2026-09-16 backlog.'],
  ['app/(tabs)/index.tsx', 'Home active-protocol summary — 2026-09-16 backlog.'],
  ['app/doses/index.tsx', 'Doses hub "last logged" line — 2026-09-16 backlog.'],
  ['app/doses/side-effects.tsx', 'Side-effect report — 2026-09-16 backlog.'],
  ['app/doses/tracker.tsx', 'Tracker dose list — 2026-09-16 backlog.'],
  ['app/health-report/index.tsx', 'Health report protocol list — 2026-09-16 backlog.'],
]);

/** Self-check: the patterns must match what they are for, and nothing else. */
const MUST_MATCH = [
  '{slot.amount} {slot.unit}',
  '{d.amount} {d.unit}',
  '{proto.dose} {proto.unit} · x',
  'label={`${slot.amount} ${slot.unit}`}',
  '{amount} {unit}',
  '{slot.amount}{slot.unit}', // no separator is still a concatenated dose
];
const MUST_NOT_MATCH = [
  '{formatDoseAmount(slot.amount, slot.unit)}',
  '{slot.peptideName} {slot.unit}',
  '{slot.amount} {slot.route}',
  'const { amount, unit } = dose;',
];
const hits = (line) => RAW_DOSE_PATTERNS.some((re) => re.test(line));
const selfFailures = [
  ...MUST_MATCH.filter((s) => !hits(s)).map((s) => `should have matched: ${s}`),
  ...MUST_NOT_MATCH.filter((s) => hits(s)).map((s) => `should NOT have matched: ${s}`),
];
if (selfFailures.length) {
  console.error('\n✗ SELF-CHECK FAILED — the raw-dose pattern is wrong:');
  for (const f of selfFailures) console.error(`    ${f}`);
  process.exit(1);
}

const rawOffenders = [];
const backlogSeen = new Set();
const surfaces = sources.filter(isRenderedSurface);
for (const file of surfaces) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (isComment(line) || !hits(line)) return;
    if (RAW_DOSE_BACKLOG.has(file)) {
      backlogSeen.add(file);
      return;
    }
    rawOffenders.push({ file, line: i + 1, text: line.trim() });
  });
}

console.log('\n— Dose rendering: no raw {amount} {unit} ——');
console.log(`  ${surfaces.length} rendered surfaces scanned · ${backlogSeen.size} on the recorded backlog`);

/** Positive control: the scan must actually be reading screens. */
if (surfaces.length < 50) {
  console.error(`\n✗ SELF-CHECK FAILED — only ${surfaces.length} rendered surfaces found; the glob is wrong.`);
  process.exit(1);
}

const staleBacklog = [...RAW_DOSE_BACKLOG.keys()].filter((f) => !backlogSeen.has(f));
if (staleBacklog.length) {
  failed = true;
  console.log('');
  for (const f of staleBacklog) {
    console.log(`  ❌ ${f} is on the raw-dose backlog but no longer matches.`);
    console.log('     Delete the entry — a stale allowlist hides the next one.\n');
  }
}

if (rawOffenders.length) {
  failed = true;
  console.log('');
  for (const o of rawOffenders) {
    console.log(`  ❌ ${o.file}:${o.line}  ${o.text}`);
    console.log('     Render through formatDoseAmount from src/lib/doseUnits —');
    console.log('     raw concatenation is how "300000 mcg" reached the screen.\n');
  }
} else if (!staleBacklog.length) {
  console.log('  ✓ every dose outside the recorded backlog goes through the formatter');
}

console.log('');
process.exit(failed ? 1 : 0);
