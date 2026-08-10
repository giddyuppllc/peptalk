/**
 * Extraction half of verify:doseprovenance — emits one JSON row per compound
 * that carries all three dosing sources, normalised to mcg.
 *
 * Split out of the verifier because the data modules are TypeScript and the
 * verifier is .mjs; shelling `tsx -e` with an inline program was how an earlier
 * script in this repo ended up with a regex mangled by the shell.
 */
import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';
import { PEPTIDE_DOSING_REFERENCE } from '../src/data/peptideDosingReference';

type Range = [number, number];

/**
 * PEPTALK_DOSES is a ladder of worked doses, not a range. BPC-157 is a single
 * 333mcg step. Comparing it to a range as if it were one manufactures
 * disagreements — the min/max of the ladder is the envelope Edward actually
 * doses across the titration.
 */
function ladderRange(peptideId: string): Range | null {
  const entry = (PEPTIDE_DOSING_REFERENCE as any[]).find((r) => r.peptideId === peptideId);
  const doses: number[] = (entry?.schedule ?? [])
    .map((s: any) => s.doseMcg)
    .filter((n: any) => Number.isFinite(n) && n > 0);
  return doses.length ? [Math.min(...doses), Math.max(...doses)] : null;
}

/**
 * The table stores its range as display text ("250mcg-1mg"), so each side
 * carries its own unit. No \b before "mg": in "0.25mg" the m follows a digit
 * and both are word characters, so there is no boundary there — \bmg\b silently
 * failed to match every decimal-milligram range and filed 17 compounds as
 * "unparseable" instead of "disagrees".
 */
function tableRange(text?: string): Range | null {
  if (!text) return null;
  const nums = (text.match(/[\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
  const sides = text.split(/[-–]/);
  if (nums.length !== 2 || sides.length !== 2) return null;
  const conv = (side: string, v: number) =>
    /mcg|µg/i.test(side) ? v : /mg/i.test(side) ? v * 1000 : null;
  let lo = conv(sides[0], nums[0]);
  const hi = conv(sides[1], nums[1]);
  // A bare leading number ("250-500mcg") inherits the trailing side's unit.
  if (lo === null && hi !== null) {
    lo = /mg/i.test(sides[1]) && !/mcg/i.test(sides[1]) ? nums[0] * 1000 : nums[0];
  }
  return lo === null || hi === null ? null : [lo, hi];
}

const out: Array<{ id: string; name: string; ladder: Range; table: Range; protocol: Range }> = [];

for (const p of PEPTIDES as any[]) {
  const ladder = ladderRange(p.id);
  if (!ladder) continue;
  const table = tableRange(getDosingTableEntry(p.id)?.dosingRange);
  if (!table) continue;
  const dose = getProtocolsByPeptide(p.id)[0]?.typicalDose;
  if (!dose) continue;
  // IU is an activity unit with no peptide-agnostic mass conversion and ml is
  // already a volume; deriving mcg from either would be inventing a number.
  const mult = dose.unit === 'mg' ? 1000 : dose.unit === 'mcg' ? 1 : 0;
  if (!mult) continue;
  out.push({
    id: p.id,
    name: p.name,
    ladder,
    table,
    protocol: [dose.min * mult, dose.max * mult],
  });
}

console.log(JSON.stringify(out));
