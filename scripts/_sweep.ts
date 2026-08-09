import { PEPTIDES } from '../src/data/peptides';
const ids = new Set((PEPTIDES as any[]).map(p => p.id));
const mods = ['curatedStacks','clinicalTrials','educationalArticles','howToGuides','knowledgeTopics','peptideNutrition','peptideTiming','safetyProfiles','protocols','peptideDosingReference','peptideDosingTable','calculatorMetadata','bodyMapData','videos','interactions','goalPeptideMatrix'];
const KEYS = /^(peptideId|peptideIds|relatedPeptideIds|relatedPeptides|peptides)$/i;
const bad: Record<string, Set<string>> = {};
let checked = 0;
for (const m of mods) {
  let mod: any;
  try { mod = require(`../src/data/${m}`); } catch (e) { console.log(`skip ${m}: ${(e as Error).message.slice(0,60)}`); continue; }
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const [k, v] of Object.entries(o)) {
      if (KEYS.test(k)) {
        const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
        for (const x of list) {
          if (typeof x !== 'string') continue;
          checked++;
          if (!ids.has(x)) (bad[m] ??= new Set()).add(x);
        }
      }
      walk(v);
    }
  };
  Object.values(mod).forEach(walk);
}
console.log(`\npeptideId refs checked across ${mods.length} modules: ${checked}`);
let total = 0;
for (const [m, s] of Object.entries(bad)) { total += s.size; console.log(`  ${m}: ${[...s].join(', ')}`); }
console.log(total ? `\nBROKEN: ${total}` : '\n✓ all resolve');
