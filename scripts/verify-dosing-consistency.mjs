/**
 * verify:dosingconsistency — the dosing TABLE and the PROTOCOL must agree.
 *
 * These are two independently authored sources for the same fact, and BOTH
 * reach the user. On app/peptide/[id] they are rendered on the SAME SCREEN:
 * DosingReferenceTableCard shows the table range, BeginnerAdvancedDoseCard
 * shows a range derived from the protocol a few hundred pixels below. The
 * calculators and quick-dose use the protocol; the dosing card uses the table.
 *
 * They disagree for 27 of the 37 mass-dosed compounds. Some are large:
 *
 *   TB-500        table  330-1000 mcg   protocol  2000-5000 mcg   ~6x
 *   Cagrilintide  table  300-4500 mcg   protocol  1200-2400 mcg
 *   Survodutide   table  500-2700 mcg   protocol  2400-6000 mcg
 *
 * This check picks NO winner. Choosing between two clinical figures is not a
 * code decision — the wrong choice is a dose error carrying the app's full
 * authority — so it reports the pairs and Jamie settles them.
 *
 * Reported as a WARNING, not a build failure, for one reason only: making it
 * fatal today would leave the repo permanently red and the check would be
 * switched off within a week. The moment the list is settled, flip
 * FAIL_ON_MISMATCH to true and it becomes a real gate.
 */
import { execSync } from 'child_process';

const FAIL_ON_MISMATCH = false;

const raw = execSync(
  'npx tsx -e "' +
    "import {PEPTIDES} from './src/data/peptides';" +
    "import {getDosingTableEntry} from './src/data/peptideDosingTable';" +
    "import {getProtocolsByPeptide} from './src/data/protocols';" +
    "import {normalizeDoseRange} from './src/lib/doseUnits';" +
    'const out=[];' +
    'for (const p of PEPTIDES) {' +
    '  const t=getDosingTableEntry(p.id); const pr=getProtocolsByPeptide(p.id)[0];' +
    '  if(!t||!t.dosingRange||!pr||!pr.typicalDose) continue;' +
    '  const d=normalizeDoseRange(pr.typicalDose.min,pr.typicalDose.max,pr.typicalDose.unit);' +
    '  if(!d.massBased) continue;' +
    '  out.push({id:p.id,name:p.name,table:t.dosingRange,min:d.min,max:d.max});' +
    '}' +
    'console.log(JSON.stringify(out));"',
  { encoding: 'utf8', maxBuffer: 1e8 },
);

const rows = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('[')).pop());

/**
 * Positive control: a codebase with 79 peptides must yield a meaningful number
 * of comparable pairs. Zero would mean the extraction broke, and a clean run
 * from a broken extraction is worse than no check.
 */
if (rows.length < 10) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${rows.length} comparable dose pairs found.` +
      '\n  The extraction is broken; a clean result would be meaningless.',
  );
  process.exit(1);
}

function tableToMcg(range) {
  const nums = (range.match(/[\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
  const sides = range.split(/[-–]/);
  if (nums.length !== 2 || sides.length !== 2) return null;
  const conv = (side, v) => {
    if (/mcg|µg/i.test(side)) return v;
    if (/mg/i.test(side)) return v * 1000;
    return null;
  };
  let lo = conv(sides[0], nums[0]);
  const hi = conv(sides[1], nums[1]);
  if (lo === null && hi !== null) {
    lo = /mg/i.test(sides[1]) && !/mcg/i.test(sides[1]) ? nums[0] * 1000 : nums[0];
  }
  return lo === null || hi === null ? null : { lo, hi };
}

const agree = [];
const differ = [];
const unparsed = [];
for (const r of rows) {
  const t = tableToMcg(r.table);
  if (!t) {
    unparsed.push(r);
    continue;
  }
  const off = (a, b) => (Math.max(a, b) > 0 ? (Math.abs(a - b) / Math.max(a, b)) * 100 : 0);
  const worst = Math.max(off(t.lo, r.min), off(t.hi, r.max));
  if (worst <= 2) agree.push(r);
  else differ.push({ ...r, t, worst, ratio: Math.max(t.hi / r.max, r.max / t.hi) });
}

console.log('\n— Dosing consistency: table vs protocol —');
console.log(`  ${rows.length} mass-dosed compounds carry BOTH a table range and a protocol`);
console.log(`  ✓ agree      : ${agree.length}`);
console.log(`  ⚠️  disagree  : ${differ.length}`);
if (unparsed.length) console.log(`  ?  unparsed  : ${unparsed.length} (${unparsed.map((u) => u.id).join(', ')})`);

if (differ.length) {
  console.log('\n  Both figures reach users, and on app/peptide/[id] both render on the');
  console.log('  same screen. Needs Jamie to say which is right — no code can decide it.\n');
  differ
    .sort((a, b) => b.worst - a.worst)
    .forEach((d) => {
      console.log(
        `  ${d.name.padEnd(22)} table ${String(d.t.lo).padStart(6)}-${String(d.t.hi).padEnd(7)}mcg` +
          `   protocol ${String(d.min).padStart(6)}-${String(d.max).padEnd(7)}mcg`,
      );
    });
  console.log('');
}

if (differ.length && FAIL_ON_MISMATCH) process.exit(1);
process.exit(0);
