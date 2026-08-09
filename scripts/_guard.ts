import { PEPTIDES } from '../src/data/peptides';
import { PROTOCOL_TEMPLATES } from '../src/data/protocols';
import { getSafetyProfileByPeptideId } from '../src/data/safetyProfiles';
const ps = PEPTIDES as any[];
const byPeptide = new Map<string, any[]>();
for (const t of PROTOCOL_TEMPLATES as any[]) {
  byPeptide.set(t.peptideId, [...(byPeptide.get(t.peptideId) ?? []), t]);
}
const preg = /pregnan|nursing|breastfeed/i;
let withProtoContra = 0, withPregGuard = 0, withProfileContra = 0;
const noPregButProfileSays: string[] = [];
for (const p of ps) {
  const protos = byPeptide.get(p.id) ?? [];
  const contras = protos.flatMap((t) => t.contraindications ?? []);
  if (contras.length) withProtoContra++;
  const guarded = contras.some((c: string) => preg.test(c));
  if (guarded) withPregGuard++;
  const sp = getSafetyProfileByPeptideId(p.id);
  const spContras = (sp?.contraindications ?? []) as string[];
  if (spContras.length) withProfileContra++;
  if (!guarded && spContras.some((c) => preg.test(c))) noPregButProfileSays.push(p.id);
}
console.log(`peptides: ${ps.length}`);
console.log(`  protocol carries ANY contraindication : ${withProtoContra}`);
console.log(`  → pregnancy/nursing GUARD fires       : ${withPregGuard}`);
console.log(`  safetyProfile carries contraindications: ${withProfileContra}`);
console.log(`\nsafetyProfile flags pregnancy but the GUARD does not fire (${noPregButProfileSays.length}):`);
console.log('  ' + (noPregButProfileSays.join(', ') || 'none'));
