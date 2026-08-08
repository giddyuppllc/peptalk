/** Produce the exact outstanding-data list, from live data. */
import { PEPTIDES } from '../src/data/peptides';
import { getDosingReference } from '../src/data/peptideDosingReference';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getSupplierVialSizes } from '../src/data/supplierVialSizes';
import { getProtocolsByPeptide } from '../src/data/protocols';

const NOT_RECONSTITUTED = new Set([
  'mk-677','cardarine','noopept','alpha-gpc','cdp-choline','l-carnitine','methylene-blue',
  'coq10','tesofensine','enclomiphene','yk-11','9-me-bc','bam15','gc-1','itpp','dada',
  'nad-carnitine-blend','kpv-oral','5-amino-1mq','glow','klow',
]);

const name = (id: string) => PEPTIDES.find((p) => p.id === id)?.name ?? id;

const noCard = PEPTIDES.filter((p) => !getDosingTableEntry(p.id)).map((p) => p.id);
const noRef = PEPTIDES.filter(
  (p) => !getDosingReference(p.id) && !NOT_RECONSTITUTED.has(p.id),
).map((p) => p.id);

console.log('# PepTalk — outstanding dosing data\n');

console.log(`## A. No dosing card at all (${noCard.length}) — needs a full protocol\n`);
console.log('These render NO dosing section. Need: dose range, frequency, cycle length.\n');
for (const id of noCard) console.log(`- [ ] **${name(id)}**  (\`${id}\`)`);

const withVial = noRef.filter((id) => getSupplierVialSizes(id));
const withoutVial = noRef.filter((id) => !getSupplierVialSizes(id));

console.log(`\n## B. Have vial size, need diluent + schedule (${withVial.length})\n`);
console.log('Calculator can\'t compute reconstitution. Need: mL of bac water, and dose per draw.\n');
console.log('| compound | vial (mg) | bac water (mL) | dose | units | frequency |');
console.log('|---|---|---|---|---|---|');
for (const id of withVial) {
  const v = getSupplierVialSizes(id)!;
  const p = getProtocolsByPeptide(id)[0];
  const known = p ? `${p.typicalDose.min}-${p.typicalDose.max} ${p.typicalDose.unit}` : '?';
  console.log(`| **${name(id)}** | ${v.vialMg.join(' / ')} | ? | ${known} | ? | ${p?.frequency ?? '?'} |`);
}

console.log(`\n## C. Need vial size too (${withoutVial.length})\n`);
console.log('| compound | vial (mg) | bac water (mL) | dose | units | frequency |');
console.log('|---|---|---|---|---|---|');
for (const id of withoutVial) {
  const p = getProtocolsByPeptide(id)[0];
  const known = p ? `${p.typicalDose.min}-${p.typicalDose.max} ${p.typicalDose.unit}` : '?';
  console.log(`| **${name(id)}** | ? | ? | ${known} | ? | ${p?.frequency ?? '?'} |`);
}

console.log(`\n## D. Oral / ready-to-use — nothing needed (${NOT_RECONSTITUTED.size})\n`);
console.log([...NOT_RECONSTITUTED].map(name).join(' · '));

console.log(`\n---\nCoverage: ${PEPTIDES.length - noCard.length}/${PEPTIDES.length} dosing cards · ` +
  `${PEPTIDES.filter((p) => getDosingReference(p.id)).length}/${PEPTIDES.length} reconstitution references`);
