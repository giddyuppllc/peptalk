import { PEPTIDE_DOSING_REFERENCE } from '../src/data/peptideDosingReference';
const refs = PEPTIDE_DOSING_REFERENCE as any[];
let bad = 0;
console.log('A. mgPerMl vs vialMg/diluentMl (stored vs derivable)');
for (const r of refs) {
  if (!r.vialMg || !r.diluentMl || !r.mgPerMl) continue;
  const derived = r.vialMg / r.diluentMl;
  const off = Math.abs(derived - r.mgPerMl) / Math.max(derived, r.mgPerMl) * 100;
  if (off > 1) { bad++; console.log(`  ✗ ${r.peptideId.padEnd(24)} stored ${r.mgPerMl}  derived ${derived.toFixed(2)}  (${r.vialMg}mg / ${r.diluentMl}mL)`); }
}
console.log(`  ${bad === 0 ? '✓ all consistent' : bad + ' inconsistent'}  (${refs.length} references)\n`);

console.log('B. schedule units vs dose at that concentration');
let bad2 = 0, checked = 0;
for (const r of refs) {
  if (!r.mgPerMl || !r.schedule) continue;
  for (const s of r.schedule) {
    if (s.units == null || s.doseMcg == null) continue;
    checked++;
    const expected = (s.doseMcg / 1000) / r.mgPerMl * 100;
    const off = Math.abs(expected - s.units) / Math.max(expected, s.units) * 100;
    if (off > 5) { bad2++; if (bad2 <= 10) console.log(`  ✗ ${r.peptideId.padEnd(22)} ${s.label?.padEnd(12) ?? ''} ${s.doseMcg}mcg → stored ${s.units}u, math says ${expected.toFixed(1)}u`); }
  }
}
console.log(`  ${bad2 === 0 ? '✓ all consistent' : bad2 + ' inconsistent'}  (${checked} schedule rows checked)`);
