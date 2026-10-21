/**
 * Generate src/data/safetyProfilesFromGuides.ts from the PPP guides.
 *
 * Run it through a temp file — NOT straight into its own input:
 *   node scripts/gen-ppp-safety.mjs > /tmp/spg.ts && mv /tmp/spg.ts src/data/safetyProfilesFromGuides.ts
 *
 * Redirecting directly at src/data/safetyProfilesFromGuides.ts truncates that
 * file before node starts, and the tsx probe below reads it back through
 * safetyProfiles.ts, so the run dies and you are left with an empty file where
 * 39 safety profiles used to be. The exit code is honest (1); the damage is
 * done by the redirect, not by the script. Recover with
 * `git checkout -- src/data/safetyProfilesFromGuides.ts`.
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
lines.push(' * portal we can use it as our own data." That is the permission to');
lines.push(' * transcribe, and transcription rather than invention is the point — this');
lines.push(' * app cannot afford to author safety content.');
lines.push(' *');
lines.push(' * PROVENANCE, CORRECTED 2026-09-16. This header used to call the source');
lines.push(" * \"his own doctor-reviewed clinical content\". Both halves were wrong and");
lines.push(' * the sentence must not be quoted to App Review or to a customer:');
lines.push(' *   - The Peptide Protocol Portal is LANCE\'s, not Edward\'s. Edward built');
lines.push(' *     it; he does not own it. (A comment in the PPP repo itself says');
lines.push(' *     "Edward\'s PPP" and is wrong about the same thing.)');
lines.push(' *   - No named doctor and no review record backs "doctor-reviewed". The');
lines.push(' *     one byline that looks like one, "Dr. Sean McGrath", is stamped');
lines.push(' *     automatically by the portal\'s AI writer — not a person with an');
lines.push(' *     account, a bio or a licence.');
lines.push(' * What is true: these 39 profiles are a faithful transcription of the');
lines.push(' * portal guides. Reusing them needs Lance\'s permission, not Edward\'s.');
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

// FLOOR — refuse to emit a file that would delete the profiles.
//
// This guards a guide-extraction regression: if the guides stop matching and
// this emits a handful of profiles, writing that over the catalogue would
// silently drop safety content for peptides that had it.
//
// It does NOT rescue you from redirecting into this script's own input. The
// SHELL truncates the target before node starts, the tsx probe above then
// reads an empty file, and the run dies inside execSync — exit 1, well before
// this point. That is the correct exit code; the file is blanked all the same,
// because `>` already did the damage. Hence the temp-file instruction in the
// header. Restore with `git checkout -- src/data/safetyProfilesFromGuides.ts`.
const FLOOR = 30;
if (rows.length < FLOOR) {
  console.error(
    `refusing to generate: ${rows.length} profiles is below the floor of ${FLOOR}.\n` +
      'If you redirected into src/data/safetyProfilesFromGuides.ts, that file is now\n' +
      'truncated and this script can no longer read the catalogue. Restore it\n' +
      '(git checkout -- src/data/safetyProfilesFromGuides.ts), then generate to a\n' +
      'temporary file and move it into place.',
  );
  process.exit(1);
}

process.stdout.write(lines.join('\n'));

console.error(`generated ${rows.length} profiles`);
console.error(`skipped (already hand-curated): ${skippedCurated.length}`);
console.error(`unmatched peptides: ${unmatched.length} — ${unmatched.join(', ')}`);
