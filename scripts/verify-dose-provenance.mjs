/**
 * verify:doseprovenance — three dosing sources, none of which agree.
 *
 * PepTalk stores a dose for the same compound in THREE places, and all three
 * reach users. They are not equally trustworthy, and the difference is
 * provenance, not opinion:
 *
 *   1. src/data/peptideDosingReference.ts   "PEPTALK_DOSES"
 *      Edward's reconstitution document, 2026-05-15. A ladder of WORKED doses:
 *      vial mg, diluent mL, syringe units, resulting mcg.
 *      >> THE ONLY SELF-VERIFYING SOURCE. Because it stores the concentration
 *      AND the unit count AND the resulting dose, the arithmetic can be checked
 *      from inside the app: 10mg/3mL, 6 units = 0.06mL x 3.333mg/mL = 200mcg.
 *      All 33 entries pass that check. Nothing else here can be checked at all.
 *
 *   2. src/data/peptideDosingTable.ts       "master table"
 *      Transcribed verbatim from Edward's photographed reference
 *      (IMG_4146.jpeg, "page 2 of 11"), ingested 2026-06-16, commit 649603b.
 *      Real provenance — but a verbatim transcription of ONE page of eleven,
 *      and transcription can slip. NAD+ is stored as "200mcg-600mcg" for a
 *      compound Edward's own ladder doses at 60mg: a 100x unit error, not a
 *      clinical disagreement.
 *
 *   3. src/data/protocols.ts                 uncited
 *      From the launch commit cb57f66 (2026-02-16). The header claims it was
 *      "compiled from published literature, clinical guidelines, and
 *      widely-referenced research sources" — but the `source` field on all 46
 *      entries is one of exactly two placeholder strings ('published research'
 *      x40, 'common practice' x6). Zero PMIDs, DOIs, author names or study
 *      titles in the whole file. It asserts a source it does not identify.
 *
 * THE PART THAT MATTERS MOST
 * The least attributable source drives the most behaviour. protocols.ts is
 * imported by 11 modules including doseSafety.ts — so the OVERDOSE GUARD RAILS
 * are computed from the uncited figures — plus both calculators, Aimee, dose
 * logging and adherence. Edward's own master table is imported by 3, and only
 * for display.
 *
 * WHAT THIS CHECK DOES
 * It asks one question that needs no clinical judgement: does Edward's own
 * worked dose fall INSIDE the range each source advertises? A source whose
 * range excludes the dose Edward actually reconstitutes is wrong about that
 * compound, whoever wrote it.
 *
 * It picks no winner beyond that. Choosing between two clinical figures is
 * Jamie's call and the wrong choice is a dose error carrying the app's full
 * authority. Warning, not failure, for the same reason as
 * verify:dosingconsistency: a permanently red gate gets switched off.
 */
import { execSync } from 'child_process';

const FAIL_ON_MISMATCH = false;

const raw = execSync(
  'npx tsx scripts/_dose-provenance-extract.ts',
  { encoding: 'utf8', maxBuffer: 1e8 },
);
const rows = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('[')).pop());

/**
 * Positive control. Several scanners in this repo's history reported a clean
 * run because they matched nothing, which is worse than no check at all.
 */
if (rows.length < 10) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${rows.length} compounds carry all three sources.` +
      '\n  The extraction is broken; a clean result from it would be meaningless.',
  );
  process.exit(1);
}

/** 2% slack absorbs rounding at a range boundary, nothing more. */
const contains = (r, p) => p[0] >= r[0] * 0.98 && p[1] <= r[1] * 1.02;

const buckets = { neither: [], protoOnly: [], tableOnly: [], both: [] };
for (const r of rows) {
  const inT = contains(r.table, r.ladder);
  const inP = contains(r.protocol, r.ladder);
  buckets[inT && inP ? 'both' : !inT && !inP ? 'neither' : inT ? 'tableOnly' : 'protoOnly'].push(r);
}

const fmt = (r) =>
  `  ${r.name.padEnd(21)} ladder ${String(r.ladder[0]).padStart(6)}-${String(r.ladder[1]).padEnd(7)}` +
  ` · table ${String(r.table[0]).padStart(6)}-${String(r.table[1]).padEnd(7)}` +
  ` · protocol ${String(r.protocol[0]).padStart(6)}-${r.protocol[1]}  (mcg)`;

console.log('\n— Dose provenance: three sources vs Edward\'s own worked doses —');
console.log(`  ${rows.length} compounds carry all three · ✓ both agree with the ladder: ${buckets.both.length}`);

const section = (key, title, note) => {
  const b = buckets[key];
  if (!b.length) return;
  console.log(`\n  ${title} (${b.length})`);
  console.log(`  ${note}`);
  b.forEach((r) => console.log(fmt(r)));
};

section(
  'neither',
  '🔴 OUTSIDE BOTH published ranges',
  'Every advertised range excludes the dose Edward actually reconstitutes.\n  Highest priority — no source here can be trusted for these compounds.',
);
section(
  'protoOnly',
  '🟠 Only protocols.ts contains the worked dose',
  'Evidence the MASTER TABLE is wrong for these — most likely a transcription\n  slip on page 2, since NAD+ here is off by exactly 100x.',
);
section(
  'tableOnly',
  '🟡 Only the master table contains the worked dose',
  'Evidence PROTOCOLS.TS is wrong for these — and protocols.ts is what\n  doseSafety.ts uses to decide whether a logged dose is an overdose.',
);

const flagged = buckets.neither.length + buckets.protoOnly.length + buckets.tableOnly.length;
console.log(`\n  ${flagged} compound(s) where a source contradicts Edward's own ladder.`);
console.log('  No code picks a winner — that is Jamie\'s call.\n');

if (flagged && FAIL_ON_MISMATCH) process.exit(1);
process.exit(0);
