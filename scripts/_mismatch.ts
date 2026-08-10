import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';
import { normalizeDoseRange } from '../src/lib/doseUnits';
let agree=0, differ=0; const ex: string[]=[];
for (const p of PEPTIDES as any[]) {
  const t = getDosingTableEntry(p.id); const pr = getProtocolsByPeptide(p.id)[0];
  if (!t?.dosingRange || !pr?.typicalDose) continue;
  const d = normalizeDoseRange(pr.typicalDose.min, pr.typicalDose.max, pr.typicalDose.unit);
  if (!d.massBased) continue;
  // render the protocol range the same way the table would, in mcg
  const protoStr = `${d.min}-${d.max}mcg`;
  const nums = (t.dosingRange.match(/[\d.]+/g) ?? []).map(Number);
  const isMg = /mg/i.test(t.dosingRange) && !/mcg/i.test(t.dosingRange);
  const tMin = isMg ? nums[0]*1000 : nums[0];
  const tMax = isMg ? nums[1]*1000 : nums[1];
  const same = Math.abs(tMin - d.min) < 1 && Math.abs(tMax - d.max) < 1;
  if (same) agree++; else { differ++; if (ex.length<8) ex.push(`  ${p.name.padEnd(20)} table ${t.dosingRange.padEnd(16)} protocol ${protoStr}`); }
}
console.log(`table vs protocol dose range — agree: ${agree}  DIFFER: ${differ}\n`);
console.log(ex.join('\n'));
