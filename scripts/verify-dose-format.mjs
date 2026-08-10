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
import { globSync } from 'glob';

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
      'deliberately does not. Borrows formatMassMcg for the digits.',
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

console.log('');
process.exit(failed ? 1 : 0);
