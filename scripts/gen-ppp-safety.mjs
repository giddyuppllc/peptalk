/**
 * Generate src/data/safetyProfilesFromGuides.ts from the PPP guides.
 *
 * Run: node scripts/gen-ppp-safety.mjs > src/data/safetyProfilesFromGuides.ts
 *
 * WHY A SEPARATE FILE RATHER THAN EDITING safetyProfiles.ts
 * The 15 hand-curated profiles in safetyProfiles.ts stay authoritative and
 * untouched — this only fills peptides that have none. Keeping generated data
 * in its own file means it can be regenerated wholesale when the guides change
 * without risking a hand-written entry, and the provenance of every line is
 * unambiguous: if it is in this file, it came out of a guide.
 *
 * The extraction rules and the reasoning behind them live in
 * scripts/import-ppp-safety.mjs.
 */
import { guides, matchPeptide, SELF_CHECK_OK, MANUAL_SLUG_MAP } from './import-ppp-safety.mjs';
import { execSync } from 'child_process';

if (!SELF_CHECK_OK) {
  console.error('extraction self-check failed — refusing to generate');
  process.exit(1);
}

const raw = execSync(
  'npx tsx -e "import {PEPTIDES} from \'./src/data/peptides\'; import {SAFETY_PROFILES} from \'./src/data/safetyProfiles\'; console.log(JSON.stringify({peptides:PEPTIDES.map(p=>({id:p.id,name:p.name,aliases:p.aliases??[]})),existing:SAFETY_PROFILES.map(s=>s.peptideId)}))"',
  { encoding: 'utf8', maxBuffer: 1e8 },
);
const { peptides, existing } = JSON.parse(
  raw.trim().split('\n').filter((l) => l.startsWith('{')).pop(),
);
const curated = new Set(existing);

const q = (s) => JSON.stringify(s);

/** Split a flat list into labelled buckets so Absolute/Relative survive. */
function partition(lines) {
  const absolute = [];
  const relative = [];
  let bucket = absolute;
  let sawLabel = false;
  for (const line of lines) {
    if (/^absolute\b/i.test(line)) {
      bucket = absolute;
      sawLabel = true;
      continue;
    }
    if (/^relative\b/i.test(line)) {
      bucket = relative;
      sawLabel = true;
      continue;
    }
    bucket.push(line);
  }
  return { absolute, relative, sawLabel };
}

const rows = [];
const skippedCurated = [];
const unmatched = [];

for (const p of peptides) {
  const slug = matchPeptide(p);
  if (!slug) {
    unmatched.push(p.id);
    continue;
  }
  if (curated.has(p.id)) {
    skippedCurated.push(p.id);
    continue;
  }
  const g = guides.get(slug);
  if (!g) continue;

  const { absolute, relative, sawLabel } = partition(g.contraindications);
  // Absolute contraindications are prefixed so severity survives into a flat
  // string[]. Without it "Pregnancy" and "Gastroparesis" render identically,
  // and one of those is an absolute bar.
  const contraindications = sawLabel
    ? [...absolute.map((c) => `Absolute: ${c}`), ...relative.map((c) => `Relative: ${c}`)]
    : g.contraindications;

  if (contraindications.length === 0 && g.adverse.length === 0) continue;

  rows.push({
    peptideId: p.id,
    sourceSlug: slug,
    manual: MANUAL_SLUG_MAP[p.id] === slug,
    contraindications,
    commonSideEffects: g.adverse,
    monitoringRequired: g.monitoring,
  });
}

const lines = [];
lines.push('/**');
lines.push(' * Safety profiles transcribed from the Peptide Protocol Portal guides.');
lines.push(' *');
lines.push(' * GENERATED — do not hand-edit. Regenerate with:');
lines.push(' *   node scripts/gen-ppp-safety.mjs > src/data/safetyProfilesFromGuides.ts');
lines.push(' *');
lines.push(" * Edward, 2026-08-09: \"if the information exists in the peptide protocol");
lines.push(' * portal we can use it as our own data.\" It is his own doctor-reviewed');
lines.push(' * clinical content, which is what makes this transcription rather than the');
lines.push(' * invention this app cannot afford.');
lines.push(' *');
lines.push(' * The 15 hand-curated entries in safetyProfiles.ts are AUTHORITATIVE and are');
lines.push(' * deliberately not included here — getSafetyProfileByPeptideId checks those');
lines.push(' * first and only falls through to this file. Generated data never overwrites');
lines.push(' * a reviewed one.');
lines.push(' *');
lines.push(' * Contraindications carry an "Absolute:" / "Relative:" prefix where the guide');
lines.push(' * distinguished them. That distinction has to survive into a flat string[] —');
lines.push(' * without it "Pregnancy" and "Gastroparesis" render identically, and one of');
lines.push(' * those is an absolute bar.');
lines.push(' *');
lines.push(` * ${rows.length} profiles · sourced from ${new Set(rows.map((r) => r.sourceSlug)).size} guides`);
lines.push(' */');
lines.push("import type { SafetyProfile } from '../types';");
lines.push('');
lines.push('export const GUIDE_SAFETY_PROFILES: SafetyProfile[] = [');
for (const r of rows) {
  lines.push('  {');
  lines.push(`    // source: PPP guide "${r.sourceSlug}"${r.manual ? ' (hand-checked slug map)' : ''}`);
  lines.push(`    peptideId: ${q(r.peptideId)},`);
  lines.push('    contraindications: [');
  for (const c of r.contraindications) lines.push(`      ${q(c)},`);
  lines.push('    ],');
  lines.push('    seriousAdverseEffects: [],');
  lines.push('    commonSideEffects: [');
  for (const c of r.commonSideEffects) lines.push(`      ${q(c)},`);
  lines.push('    ],');
  lines.push('    drugInteractions: [],');
  if (r.monitoringRequired.length) {
    lines.push('    monitoringRequired: [');
    for (const c of r.monitoringRequired) lines.push(`      ${q(c)},`);
    lines.push('    ],');
  }
  lines.push('  },');
}
lines.push('];');
lines.push('');

process.stdout.write(lines.join('\n'));

console.error(`generated ${rows.length} profiles`);
console.error(`skipped (already hand-curated): ${skippedCurated.length}`);
console.error(`unmatched peptides: ${unmatched.length} — ${unmatched.join(', ')}`);
