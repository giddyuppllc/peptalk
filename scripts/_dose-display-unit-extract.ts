/**
 * Extraction half of verify:doseformat — one JSON row per compound that has
 * both a calculator display unit and a dosing ladder to judge it against.
 *
 * Split out because the data modules are TypeScript and the verifier is .mjs.
 */
import { PEPTIDES } from '../src/data/peptides';
import { getCalculatorMetadata } from '../src/data/calculatorMetadata';
import { PEPTIDE_DOSING_REFERENCE } from '../src/data/peptideDosingReference';

const out: Array<{
  id: string; name: string; actual: string; expected: string; min: number; max: number;
}> = [];

for (const p of PEPTIDES as any[]) {
  const ref: any = (PEPTIDE_DOSING_REFERENCE as any[]).find((r) => r.peptideId === p.id);
  const doses: number[] = (ref?.schedule ?? [])
    .map((s: any) => s.doseMcg)
    .filter((n: any) => Number.isFinite(n) && n > 0);
  if (!doses.length) continue;
  const min = Math.min(...doses);
  out.push({
    id: p.id,
    name: p.name,
    actual: getCalculatorMetadata(p.id).displayUnit,
    // Same rule as inferDisplayUnit(): the SMALLEST routine dose decides,
    // because that is the one needing sub-milligram precision.
    expected: min < 1000 ? 'mcg' : 'mg',
    min,
    max: Math.max(...doses),
  });
}

console.log(JSON.stringify(out));
