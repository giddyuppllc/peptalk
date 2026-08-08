#!/usr/bin/env npx ts-node
/**
 * Data Validation Script
 *
 * Validates all peptide data files for:
 * - Required fields present
 * - No duplicate IDs
 * - PubMed/DOI link format
 * - Cross-reference integrity (peptide IDs referenced in stacks, interactions, etc. exist)
 * - Missing optional fields (reported as warnings)
 *
 * Usage:
 *   npx ts-node scripts/validatePeptideData.ts
 *   npx ts-node scripts/validatePeptideData.ts --strict   # treat warnings as errors
 */

import { PEPTIDES } from '../src/data/peptides';
import { KNOWN_INTERACTIONS } from '../src/data/interactions';
import { CURATED_STACKS } from '../src/data/curatedStacks';
import { CLINICAL_TRIALS } from '../src/data/clinicalTrials';
import { SAFETY_PROFILES } from '../src/data/safetyProfiles';
import { EDUCATIONAL_ARTICLES } from '../src/data/educationalArticles';
import { HOW_TO_GUIDES } from '../src/data/howToGuides';
import { VIDEOS } from '../src/data/videos';
import { PROTOCOL_TEMPLATES } from '../src/data/protocols';
import { PEPTIDE_DOSING_TABLE, getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getSupplierVialSizes } from '../src/data/supplierVialSizes';
import {
  PEPTIDE_DOSING_REFERENCE,
  PEPTIDE_VARIANT_PARENTS,
  getDosingReference,
} from '../src/data/peptideDosingReference';
import { PEPTIDE_NUTRITION } from '../src/data/peptideNutrition';
import { PEPTIDE_TIMING } from '../src/data/peptideTiming';

// ─── Config ──────────────────────────────────────────────────────────────────

const strict = process.argv.includes('--strict');

let errors = 0;
let warnings = 0;

function error(msg: string) {
  errors++;
  console.error(`  ❌ ERROR: ${msg}`);
}

function warn(msg: string) {
  warnings++;
  if (strict) {
    errors++;
    console.error(`  ❌ ERROR (strict): ${msg}`);
  } else {
    console.warn(`  ⚠️  WARN: ${msg}`);
  }
}

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─── Regex patterns ──────────────────────────────────────────────────────────

const PUBMED_URL_RE = /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/;
const DOI_URL_RE = /^https:\/\/doi\.org\/10\.\d{4,}/;
const NCT_RE = /^NCT\d{8}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Build peptide ID set ────────────────────────────────────────────────────

const peptideIds = new Set(PEPTIDES.map((p) => p.id));

// ─── 1. Validate Peptides ────────────────────────────────────────────────────

section(`Peptides (${PEPTIDES.length})`);

const seenPeptideIds = new Set<string>();

for (const p of PEPTIDES) {
  // Required fields
  if (!p.id) error('Peptide missing id');
  if (!p.name) error(`Peptide ${p.id || '???'} missing name`);
  if (!p.categories || p.categories.length === 0)
    error(`Peptide ${p.id} has no categories`);
  if (!p.researchSummary)
    error(`Peptide ${p.id} missing researchSummary`);
  if (!p.mechanismOfAction)
    error(`Peptide ${p.id} missing mechanismOfAction`);
  if (!p.stabilityNotes)
    error(`Peptide ${p.id} missing stabilityNotes`);

  // Duplicate check
  if (seenPeptideIds.has(p.id)) {
    error(`Duplicate peptide ID: ${p.id}`);
  }
  seenPeptideIds.add(p.id);

  // PubMed links format
  if (p.pubmedLinks) {
    for (const link of p.pubmedLinks) {
      if (!PUBMED_URL_RE.test(link)) {
        warn(`Peptide ${p.id}: invalid PubMed URL format: ${link}`);
      }
    }
  }

  // DOI links format
  if (p.doiLinks) {
    for (const link of p.doiLinks) {
      if (!DOI_URL_RE.test(link)) {
        warn(`Peptide ${p.id}: invalid DOI URL format: ${link}`);
      }
    }
  }

  // NCT IDs format
  if (p.clinicalTrialNCT) {
    for (const nct of p.clinicalTrialNCT) {
      if (!NCT_RE.test(nct)) {
        warn(`Peptide ${p.id}: invalid NCT ID format: ${nct}`);
      }
    }
  }

  // Optional field coverage (informational)
  const optionalFields = [
    'abbreviation',
    'sequenceLength',
    'molecularWeight',
    'halfLife',
    'pubmedLinks',
    'approvalStatus',
    'evidenceGrade',
    'adverseEffects',
    'routeOfAdministration',
  ] as const;

  const missing = optionalFields.filter(
    (f) => p[f] === undefined || p[f] === null
  );
  if (missing.length > 5) {
    warn(
      `Peptide ${p.id} missing ${missing.length}/${optionalFields.length} optional fields: ${missing.join(', ')}`
    );
  }
}

info(`${PEPTIDES.length} peptides, ${seenPeptideIds.size} unique IDs`);

// ─── 2. Validate Interactions ────────────────────────────────────────────────

section(`Interactions (${KNOWN_INTERACTIONS.size} pairs)`);

let interactionCount = 0;
for (const [key, interaction] of KNOWN_INTERACTIONS) {
  interactionCount++;

  if (!peptideIds.has(interaction.peptideA)) {
    error(`Interaction ${key}: peptideA "${interaction.peptideA}" not found in peptides`);
  }
  if (!peptideIds.has(interaction.peptideB)) {
    error(`Interaction ${key}: peptideB "${interaction.peptideB}" not found in peptides`);
  }

  if (interaction.synergyScore < 1 || interaction.synergyScore > 10) {
    error(`Interaction ${key}: synergyScore ${interaction.synergyScore} out of range (1-10)`);
  }

  if (!interaction.mechanismAnalysis) {
    warn(`Interaction ${key}: missing mechanismAnalysis`);
  }

  if (interaction.pubmedLinks) {
    for (const link of interaction.pubmedLinks) {
      if (!PUBMED_URL_RE.test(link)) {
        warn(`Interaction ${key}: invalid PubMed URL: ${link}`);
      }
    }
  }
}

info(`${interactionCount} interactions validated`);

// ─── 3. Validate Curated Stacks ──────────────────────────────────────────────

section(`Curated Stacks (${CURATED_STACKS.length})`);

const seenStackIds = new Set<string>();

for (const stack of CURATED_STACKS) {
  if (!stack.id) error('Stack missing id');
  if (!stack.name) error(`Stack ${stack.id || '???'} missing name`);

  if (seenStackIds.has(stack.id)) {
    error(`Duplicate stack ID: ${stack.id}`);
  }
  seenStackIds.add(stack.id);

  if (!stack.peptideIds || stack.peptideIds.length === 0) {
    error(`Stack ${stack.id} has no peptideIds`);
  }

  for (const pid of stack.peptideIds) {
    if (!peptideIds.has(pid)) {
      error(`Stack ${stack.id}: references unknown peptide "${pid}"`);
    }
  }

  if (stack.peptideIds.length > 5) {
    warn(`Stack ${stack.id}: has ${stack.peptideIds.length} peptides (max recommended: 5)`);
  }

  if (!stack.targetGoals || stack.targetGoals.length === 0) {
    warn(`Stack ${stack.id}: no targetGoals`);
  }
}

info(`${CURATED_STACKS.length} stacks validated`);

// ─── 4. Validate Clinical Trials ─────────────────────────────────────────────

section(`Clinical Trials (${CLINICAL_TRIALS.length})`);

for (const trial of CLINICAL_TRIALS) {
  if (!trial.peptideId) error('Trial missing peptideId');
  if (!trial.name) error(`Trial for ${trial.peptideId || '???'} missing name`);

  if (trial.peptideId && !peptideIds.has(trial.peptideId)) {
    error(`Trial "${trial.name}": references unknown peptide "${trial.peptideId}"`);
  }

  if (trial.nctId && !NCT_RE.test(trial.nctId)) {
    warn(`Trial "${trial.name}": invalid NCT ID format: ${trial.nctId}`);
  }

  if (trial.publicationDOI && !DOI_URL_RE.test(`https://doi.org/${trial.publicationDOI}`)) {
    warn(`Trial "${trial.name}": DOI may be malformed: ${trial.publicationDOI}`);
  }
}

if (CLINICAL_TRIALS.length === 0) {
  info('Clinical trials array is empty (to be populated via Grok prompts)');
}

// ─── 5. Validate Safety Profiles ─────────────────────────────────────────────

section(`Safety Profiles (${SAFETY_PROFILES.length})`);

const seenSafetyIds = new Set<string>();

for (const sp of SAFETY_PROFILES) {
  if (!sp.peptideId) error('Safety profile missing peptideId');

  if (sp.peptideId && !peptideIds.has(sp.peptideId)) {
    error(`Safety profile references unknown peptide "${sp.peptideId}"`);
  }

  if (seenSafetyIds.has(sp.peptideId)) {
    error(`Duplicate safety profile for peptide: ${sp.peptideId}`);
  }
  seenSafetyIds.add(sp.peptideId);

  if (!sp.contraindications || sp.contraindications.length === 0) {
    warn(`Safety profile ${sp.peptideId}: no contraindications listed`);
  }
}

if (SAFETY_PROFILES.length === 0) {
  info('Safety profiles array is empty (to be populated via Grok prompts)');
}

// ─── 6. Validate Educational Articles ────────────────────────────────────────

section(`Educational Articles (${EDUCATIONAL_ARTICLES.length})`);

const seenArticleSlugs = new Set<string>();

for (const article of EDUCATIONAL_ARTICLES) {
  if (!article.id) error('Article missing id');
  if (!article.title) error(`Article ${article.id || '???'} missing title`);
  if (!article.slug) error(`Article ${article.id || '???'} missing slug`);

  if (article.slug && !SLUG_RE.test(article.slug)) {
    warn(`Article ${article.id}: slug "${article.slug}" contains invalid characters`);
  }

  if (seenArticleSlugs.has(article.slug)) {
    error(`Duplicate article slug: ${article.slug}`);
  }
  seenArticleSlugs.add(article.slug);

  if (!article.sections || article.sections.length === 0) {
    error(`Article ${article.id}: has no sections`);
  }

  if (article.relatedPeptideIds) {
    for (const pid of article.relatedPeptideIds) {
      if (!peptideIds.has(pid)) {
        warn(`Article ${article.id}: references unknown peptide "${pid}"`);
      }
    }
  }
}

// ─── 7. Validate How-To Guides ───────────────────────────────────────────────

section(`How-To Guides (${HOW_TO_GUIDES.length})`);

const seenGuideSlugs = new Set<string>();

for (const guide of HOW_TO_GUIDES) {
  if (!guide.id) error('Guide missing id');
  if (!guide.title) error(`Guide ${guide.id || '???'} missing title`);
  if (!guide.slug) error(`Guide ${guide.id || '???'} missing slug`);

  if (guide.slug && !SLUG_RE.test(guide.slug)) {
    warn(`Guide ${guide.id}: slug "${guide.slug}" contains invalid characters`);
  }

  if (seenGuideSlugs.has(guide.slug)) {
    error(`Duplicate guide slug: ${guide.slug}`);
  }
  seenGuideSlugs.add(guide.slug);

  if (!guide.steps || guide.steps.length === 0) {
    error(`Guide ${guide.id}: has no steps`);
  } else {
    // Check step numbering is sequential
    for (let i = 0; i < guide.steps.length; i++) {
      if (guide.steps[i].stepNumber !== i + 1) {
        warn(
          `Guide ${guide.id}: step ${i + 1} has stepNumber ${guide.steps[i].stepNumber}`
        );
      }
    }
  }

  if (guide.relatedPeptideIds) {
    for (const pid of guide.relatedPeptideIds) {
      if (!peptideIds.has(pid)) {
        warn(`Guide ${guide.id}: references unknown peptide "${pid}"`);
      }
    }
  }
}

// ─── 8. Validate Videos ──────────────────────────────────────────────────────

section(`Videos (${VIDEOS.length})`);

const seenVideoSlugs = new Set<string>();

for (const video of VIDEOS) {
  if (!video.id) error('Video missing id');
  if (!video.title) error(`Video ${video.id || '???'} missing title`);
  if (!video.slug) error(`Video ${video.id || '???'} missing slug`);
  if (!video.videoUrl) error(`Video ${video.id || '???'} missing videoUrl`);

  if (video.slug && !SLUG_RE.test(video.slug)) {
    warn(`Video ${video.id}: slug "${video.slug}" contains invalid characters`);
  }

  if (seenVideoSlugs.has(video.slug)) {
    error(`Duplicate video slug: ${video.slug}`);
  }
  seenVideoSlugs.add(video.slug);

  if (video.relatedPeptideIds) {
    for (const pid of video.relatedPeptideIds) {
      if (!peptideIds.has(pid)) {
        warn(`Video ${video.id}: references unknown peptide "${pid}"`);
      }
    }
  }
}

if (VIDEOS.length === 0) {
  info('Videos array is empty (to be populated by user)');
}

// ─── 9. Validate Protocols ───────────────────────────────────────────────────

section(`Protocols (${PROTOCOL_TEMPLATES.length})`);

const seenProtocolIds = new Set<string>();

for (const protocol of PROTOCOL_TEMPLATES) {
  if (!protocol.id) error('Protocol missing id');
  if (!protocol.name) error(`Protocol ${protocol.id || '???'} missing name`);

  if (seenProtocolIds.has(protocol.id)) {
    error(`Duplicate protocol ID: ${protocol.id}`);
  }
  seenProtocolIds.add(protocol.id);

  if (!protocol.peptideId) {
    error(`Protocol ${protocol.id}: missing peptideId`);
  } else if (!peptideIds.has(protocol.peptideId)) {
    error(`Protocol ${protocol.id}: references unknown peptide "${protocol.peptideId}"`);
  }
}

// ─── 10. Cross-reference coverage ────────────────────────────────────────────

section('Cross-Reference Coverage');

const peptidsWithInteractions = new Set<string>();
for (const [, interaction] of KNOWN_INTERACTIONS) {
  peptidsWithInteractions.add(interaction.peptideA);
  peptidsWithInteractions.add(interaction.peptideB);
}

const peptidsWithProtocols = new Set(PROTOCOL_TEMPLATES.map((p) => p.peptideId));
const peptidsWithSafety = new Set(SAFETY_PROFILES.map((s) => s.peptideId));
const peptidsWithTrials = new Set(CLINICAL_TRIALS.map((t) => t.peptideId));

info(`Peptides with interactions: ${peptidsWithInteractions.size}/${PEPTIDES.length}`);
info(`Peptides with protocols: ${peptidsWithProtocols.size}/${PEPTIDES.length}`);
info(`Peptides with safety profiles: ${peptidsWithSafety.size}/${PEPTIDES.length}`);
info(`Peptides with clinical trials: ${peptidsWithTrials.size}/${PEPTIDES.length}`);

const noProtocol = PEPTIDES.filter((p) => !peptidsWithProtocols.has(p.id));
if (noProtocol.length > 0 && noProtocol.length < 30) {
  info(`Peptides missing protocols: ${noProtocol.map((p) => p.id).join(', ')}`);
}

// ─── 11. Dosing data reachability ────────────────────────────────────────────
//
// THIS IS THE CHECK THAT WAS MISSING, AND IT COST US REAL CONTENT.
//
// Dosing lives in two files that this validator never looked at:
//   • peptideDosingTable.ts     → the dosing range / cycle card on the peptide
//                                 detail page, and the answers peptalkBot gives
//   • peptideDosingReference.ts → reconstitution + syringe units for the
//                                 calculators and the active-cycle hook
//
// Every consumer joins them to the library by `peptideId` with
// `find(...)` and then silently gives up: `if (!entry) return null`. So a row
// whose peptideId has no entry in peptides.ts is not a warning and not a
// blank space — it is invisible. Nothing in the app or the build ever said so.
//
// That is how 23 transcribed dosing rows (l-carnitine, mk-677, methylene-blue,
// tesofensine, kpv, klow, glow, alpha-gpc, …) sat in the repo unreachable, and
// why adding dosing content kept appearing to "not make it back".
//
// Stranded rows are ERRORS, not warnings: authored content that no user can
// reach is a defect, and warnings here have historically gone unread.

section('Dosing Data Reachability');

const dosingTableIds = (PEPTIDE_DOSING_TABLE as Array<{ peptideId: string }>).map((e) => e.peptideId);
const dosingRefIds = (PEPTIDE_DOSING_REFERENCE as Array<{ peptideId: string }>).map((e) => e.peptideId);

// peptideDosingReference.ts defines variant rows (alternate vial size, combo
// blends) that alias to a parent peptide via PEPTIDE_VARIANT_PARENTS. Those are
// intentional and must not be reported as strandings — a false error in a build
// gate is how build gates get ignored.
//
// They are not fully in the clear either: `getDosingReference` returns the
// DIRECT match first, and `getAllDosingReferencesForPeptide` — the only
// variant-aware accessor — has zero callers. So an aliased row whose parent also
// has a direct entry still never reaches a screen. That is a warning, not an
// error, because the data is one wired-up accessor away rather than orphaned.
const aliasedRefIds = new Set(Object.keys(PEPTIDE_VARIANT_PARENTS));
const aliasedByParent = new Map<string, string[]>();
for (const id of dosingRefIds) {
  if (!aliasedRefIds.has(id)) continue;
  const parent = PEPTIDE_VARIANT_PARENTS[id];
  aliasedByParent.set(parent, [...(aliasedByParent.get(parent) ?? []), id]);
}
for (const [parent, ids] of aliasedByParent) {
  // These used to be unreachable: getDosingReference returns only the direct
  // match, and getAllDosingReferencesForPeptide had zero callers. The dose
  // calculator now renders a preparation picker built from that accessor, so
  // the variant blocks are selectable. Verify the parent is real — a variant
  // pointing at a peptide that does not exist is still a stranding.
  if (!peptideIds.has(parent)) {
    error(
      `dosing reference variant(s) ${ids.map((i) => `"${i}"`).join(', ')} alias to "${parent}", ` +
        `but no peptide has that id — the calculator's preparation picker can never show them.`
    );
    continue;
  }
  info(`${parent}: ${ids.length + 1} preparations selectable in the calculator (${ids.join(', ')})`);
}

for (const [label, ids] of [
  ['dosing table', dosingTableIds],
  ['dosing reference', dosingRefIds.filter((id) => !aliasedRefIds.has(id))],
] as const) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      // find() returns the first match, so a duplicate id is dead data too.
      error(`Duplicate ${label} entry for "${id}" — only the first is ever read`);
    }
    seen.add(id);
    if (!peptideIds.has(id)) {
      error(
        `${label} has an entry for "${id}" but there is no peptide with that id in peptides.ts — ` +
          `this row is unreachable in the app. Add the library entry, or remove the row.`
      );
    }
  }
}

info(`Dosing table entries: ${dosingTableIds.length}, all reachable: ${dosingTableIds.every((id) => peptideIds.has(id))}`);
info(`Dosing reference entries: ${dosingRefIds.length}, all reachable: ${dosingRefIds.every((id) => peptideIds.has(id))}`);

// Same reachability rule for the other peptide-keyed datasets that were also
// outside this validator. peptideNutrition is 74KB of authored content keyed
// the same way, and it had a stranded `liraglutide` row nobody could see.
for (const [label, ids] of [
  ['peptide nutrition', Object.values(PEPTIDE_NUTRITION).map((n: { peptideId: string }) => n.peptideId)],
  ['peptide timing', Object.values(PEPTIDE_TIMING).map((t: { peptideId: string }) => t.peptideId)],
] as const) {
  for (const id of ids) {
    if (!peptideIds.has(id)) {
      error(
        `${label} has an entry for "${id}" but there is no peptide with that id in peptides.ts — ` +
          `this content is unreachable in the app. Add the library entry, or remove the row.`
      );
    }
  }
}

// The reverse direction is a coverage gap, not a defect: a library entry with
// no dosing row still renders a full page, it just shows no dosing card.
// Resolve through the SAME accessors the app calls, not raw id membership.
// getDosingTableEntry has its own TABLE_ALIASES map and getDosingReference has
// PEPTIDE_VARIANT_PARENTS, so a peptide can render a dosing card without having
// a row under its own id. Checking membership instead of calling the accessor
// produced a false "KPV has no dosing card" report — KPV resolved fine via an
// alias. If this check does not go through the real lookup, it does not
// describe the app.
const noTable = PEPTIDES.filter((p) => !getDosingTableEntry(p.id)).map((p) => p.id);
const noRef = PEPTIDES.filter((p) => !getDosingReference(p.id)).map((p) => p.id);
info(`Peptides with a dosing table row: ${PEPTIDES.length - noTable.length}/${PEPTIDES.length}`);
info(`Peptides with a dosing reference row: ${PEPTIDES.length - noRef.length}/${PEPTIDES.length}`);

/**
 * ─── RATCHET ───────────────────────────────────────────────────────────────
 *
 * These two were plain warnings, and that is exactly why they went unread for
 * months: "No dosing card will render for: …16 ids" printed on every run,
 * directly beneath 26 cosmetic "missing abbreviation" warnings. Jamie
 * eventually reported one of them (Cerebrolysin) as a bug, which is the
 * expensive way to learn something your own tooling already knew.
 *
 * A warning that is always present carries no information. So the KNOWN gaps
 * are baselined below and everything else is a hard ERROR: adding a peptide
 * without dosing coverage now fails the build, while the existing backlog
 * stays quiet.
 *
 * Same ratchet as verify:routes' KNOWN_ORPHANS, and for the same reason — a
 * permanently red pipeline gets ignored just as reliably as a noisy warning.
 *
 * TO SHRINK THESE: add the missing data, then delete the id from the list.
 * Never add an id to silence a failure — that is how the backlog got here.
 */

/** Peptides with neither a curated dosing row NOR a protocol to derive one from. */
const KNOWN_NO_DOSING_CARD = new Set([
  'adipotide',
  'dermorphin',
  'pnc-27',
  'noopept',
  'humanin',
  'liraglutide',
]);

const unexpectedNoTable = noTable.filter((id) => !KNOWN_NO_DOSING_CARD.has(id));
const fixedNoTable = [...KNOWN_NO_DOSING_CARD].filter((id) => !noTable.includes(id));

if (unexpectedNoTable.length) {
  error(
    `No dosing card will render for: ${unexpectedNoTable.join(', ')}. ` +
      `Add a row to peptideDosingTable.ts, or a protocol in protocols.ts (the card ` +
      `derives from one when no row exists). Do NOT add the id to ` +
      `KNOWN_NO_DOSING_CARD to silence this.`,
  );
}
if (fixedNoTable.length) {
  // Stale baseline entries hide future regressions, so surface them.
  warn(
    `KNOWN_NO_DOSING_CARD is stale — these now render a card and should be ` +
      `removed from the list: ${fixedNoTable.join(', ')}`,
  );
}
if (KNOWN_NO_DOSING_CARD.size) {
  info(
    `Baselined (no dosing card, needs content): ${[...KNOWN_NO_DOSING_CARD].join(', ')}`,
  );
}

/**
 * The reconstitution reference drives the calculator's vial/diluent maths, so
 * it only means anything for something you actually reconstitute.
 *
 * Split deliberately, because lumping them together is what made this a
 * 47-line warning nobody could act on:
 *
 *   NOT_RECONSTITUTED — orals, capsules, blends and ready-to-use solutions.
 *                       These will NEVER need an entry. Not a backlog.
 *   MISSING_RECON_REF — injectables that genuinely lack one. This IS a
 *                       backlog, and it should shrink.
 */
const NOT_RECONSTITUTED = new Set([
  'mk-677', 'cardarine', 'noopept', 'alpha-gpc', 'cdp-choline', 'l-carnitine',
  'methylene-blue', 'coq10', 'tesofensine', 'enclomiphene', 'yk-11', '9-me-bc',
  'bam15', 'gc-1', 'itpp', 'dada', 'nad-carnitine-blend', 'kpv-oral',
  '5-amino-1mq', 'glow', 'klow',
]);

const MISSING_RECON_REF = new Set([
  'tirzepatide', 'mazdutide', 'survodutide', 'aod-9604', 'adipotide', 'ghrp-2',
  'ghrp-6', 'hgh-fragment-176-191', 'cerebrolysin', 'thymalin', 'ss-31',
  'kisspeptin-10', 'hcg', 'hmg', 'snap-8', 'ara-290', 'dermorphin', 'pnc-27',
  'humanin', 'foxo4-dri', 'aicar', 'somatropin', 'follistatin-344',
  'liraglutide', 'peg-mgf', '5-amino-1mq-inj',
]);

const unexpectedNoRef = noRef.filter(
  (id) => !NOT_RECONSTITUTED.has(id) && !MISSING_RECON_REF.has(id),
);
if (unexpectedNoRef.length) {
  error(
    `Calculators have no reconstitution reference for: ${unexpectedNoRef.join(', ')}. ` +
      `Add an entry to peptideDosingReference.ts, or add the id to ` +
      `NOT_RECONSTITUTED if it is an oral/ready-to-use compound.`,
  );
}
info(
  `Reconstitution reference: ${NOT_RECONSTITUTED.size} N/A (oral/ready-to-use), ` +
    `${MISSING_RECON_REF.size} injectables still missing one`,
);

// Make the backlog ACTIONABLE rather than a list of ids. A reference needs
// vialMg + diluentMl + diluent + schedule; the supplier catalog gives the first.
// Printing which ones already have an authoritative vial size turns "26 missing"
// into "13 need only a diluent volume and a schedule".
const withVial = [...MISSING_RECON_REF].filter((id) => getSupplierVialSizes(id));
const withoutVial = [...MISSING_RECON_REF].filter((id) => !getSupplierVialSizes(id));
if (withVial.length) {
  info(
    `  ${withVial.length} have a supplier vial size on file (need diluent mL + schedule): ` +
      withVial
        .map((id) => `${id} [${getSupplierVialSizes(id)!.vialMg.join('/')}mg]`)
        .join(', '),
  );
}
if (withoutVial.length) {
  info(`  ${withoutVial.length} need a vial size too: ${withoutVial.join(', ')}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
console.log(
  `\n  Total: ${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`
);

if (errors > 0) {
  console.log('\n  ❌ Validation FAILED\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('\n  ⚠️  Validation PASSED with warnings\n');
  process.exit(0);
} else {
  console.log('\n  ✅ Validation PASSED\n');
  process.exit(0);
}
