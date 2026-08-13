/**
 * audit:gaps — one-off census of everything in the app that asserts something
 * clinical and has nobody behind it. Feeds the go-live workbench.
 */
import { PEPTIDES } from '../src/data/peptides';
import { SAFETY_PROFILES } from '../src/data/safetyProfiles';
import { KNOWN_INTERACTIONS } from '../src/data/interactions';
import { getSourcesByPeptide } from '../src/data/sources';
import { CURATED_STACKS } from '../src/data/curatedStacks';

const peps = PEPTIDES as any[];
const safety = (SAFETY_PROFILES as any[]) ?? [];
const safetyIds = new Set(safety.map((s) => s.peptideId));

const out: Record<string, unknown> = {};

out.peptides = peps.length;

// 1. safety profile coverage — contraindications / adverse effects / pregnancy
out.safety = {
  withProfile: safetyIds.size,
  missingProfile: peps.filter((p) => !safetyIds.has(p.id)).length,
  missingContraindications: safety.filter((s) => !(s.contraindications ?? []).length).length,
  missingSerious: safety.filter((s) => !(s.seriousAdverseEffects ?? []).length).length,
  missingPregnancy: safety.filter((s) => !s.pregnancyCategory).length,
  missingDrugInteractions: safety.filter((s) => !(s.drugInteractions ?? []).length).length,
};

// 2. peptide-to-peptide interactions: which co-prescribed pairs are unknown?
const pairsCovered = KNOWN_INTERACTIONS.size;
const citedPairs = [...KNOWN_INTERACTIONS.values()].filter((i: any) => (i.pubmedLinks ?? []).length).length;
// pairs the app actively suggests together via `pairsWith`
const suggested = new Set<string>();
for (const p of peps) for (const q of p.uses?.pairsWith ?? []) {
  const k = [p.id, q].sort().join('+');
  if (p.id !== q) suggested.add(k);
}
const covered = new Set([...KNOWN_INTERACTIONS.values()].map((i: any) => [i.peptideA, i.peptideB].sort().join('+')));
out.interactions = {
  pairsCovered,
  pairsWithCitation: citedPairs,
  pairsUncited: pairsCovered - citedPairs,
  suggestedPairs: suggested.size,
  suggestedButUncovered: [...suggested].filter((k) => !covered.has(k)).length,
};

// 3. curated stacks the app ships as recommendations
const stacks = (CURATED_STACKS as any[]) ?? [];
out.stacks = {
  total: stacks.length,
  peptidePairsInStacks: stacks.reduce((n, s) => n + Math.max(0, ((s.peptideIds ?? s.peptides ?? []).length) - 1), 0),
};

// 4. per-peptide field completeness on things a clinician would care about
const missing = (f: string) => peps.filter((p) => !p[f] || (Array.isArray(p[f]) && !p[f].length)).length;
out.peptideFields = {
  noResearchSummary: missing('researchSummary'),
  noMechanism: missing('mechanismOfAction'),
  noHalfLife: missing('halfLife'),
  noStorageTemp: missing('storageTemp'),
  noStabilityNotes: missing('stabilityNotes'),
  noReceptorTargets: missing('receptorTargets'),
  noCitations: peps.filter((p) => getSourcesByPeptide(p.id).length === 0).length,
  noSafetyProfile: peps.filter((p) => !safetyIds.has(p.id)).length,
};

console.log(JSON.stringify(out, null, 2));
