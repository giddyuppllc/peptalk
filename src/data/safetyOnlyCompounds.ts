/**
 * Safety-information-only compounds — the one list.
 *
 * EDWARD'S DECISION, 2026-09-16. In his words, tightly paraphrased: the app
 * sells nothing; it is education and harm reduction, and the calculator should
 * do arithmetic. For prescription compounds PepTalk may show a general dosing
 * reference with a line to speak to a doctor, because those protocols were
 * designed by clinicians. For the compounds listed BELOW he decided to remove
 * dosing entirely — they carry safety information and nothing numeric.
 *
 * Two groups, both his:
 *   1. Compounds with no approved human use, or whose only human-facing route
 *      is a prescriber's (Cardarine, YK-11, MK-677, Dermorphin, Follistatin
 *      344, and the hCG hormone neighbours: hMG, somatropin, testosterone,
 *      gonadorelin, enclomiphene).
 *   2. His "no validated human dose" class: PEG-MGF, BAM15, FoxO4-DRI,
 *      SLU-PP-332, AOD-9604, 5-Amino-1MQ (injectable).
 *
 * WHAT THIS FILE DOES AND DOES NOT DO
 * It suppresses dose numbers at the READ/RENDER boundary. It deletes nothing:
 * every figure stays in protocols.ts, peptideDosingTable.ts, the
 * reconstitution ladder and clinicianRulings.ts, so the decision is one line
 * to reverse and the clinical-consistency suite keeps holding every store to
 * Jamie's rulings.
 *
 * The dose SAFETY guard is deliberately NOT suppressed. A user may still log
 * what they actually took, and a decimal-point error is still a decimal-point
 * error — so `checkDoseSafety` keeps computing against the stored range and
 * keeps firing. What it no longer does is PRINT that range back, because a
 * guard message that names the typical window is a dose recommendation wearing
 * a warning's clothes. See src/services/doseSafety.ts.
 *
 * ADDING OR REMOVING A COMPOUND IS ONE LINE IN THE ARRAY BELOW.
 *
 * Ids are the canonical ids from src/data/peptides.ts. Two of Edward's names
 * have no compound row in this app today and are listed anyway so that the
 * suppression is already in force if one is ever added:
 *   - `testosterone` — exists only as a LAB MARKER here, never as a compound.
 *   - `gonadorelin`  — appears only in goalPeptideMatrix.ts as a goal tier
 *                      entry, with no catalog row and no dosing data.
 *
 * This module is intentionally dependency-free so that every layer — data,
 * hooks, screens, the on-device bot — can import it without a cycle.
 */

export const SAFETY_ONLY_DECISION_DATE = '2026-09-16';

/**
 * Canonical peptide ids that render safety information only.
 * ONE LINE PER COMPOUND — add or remove here and every surface follows.
 */
export const SAFETY_ONLY_COMPOUND_IDS = [
  'cardarine', // Cardarine (GW-501516) — animal carcinogen; abandoned in development
  'yk-11', // YK-11 — never in a human trial
  'mk-677', // MK-677 (Ibutamoren) — investigational, never approved
  'dermorphin', // Dermorphin — opioid agonist ~30-40x morphine
  'follistatin-344', // Follistatin 344
  'hcg', // hCG — prescription hormone
  'hmg', // hMG — prescription hormone
  'somatropin', // Somatropin — prescription hormone
  'testosterone', // no compound row in this app (lab marker only) — listed defensively
  'gonadorelin', // no compound row in this app (goal-matrix entry only) — listed defensively
  'enclomiphene', // Enclomiphene — prescription
  'peg-mgf', // no validated human dose
  'bam15', // no validated human dose
  'foxo4-dri', // no validated human dose
  'slu-pp-332', // no validated human dose (murine only)
  'aod-9604', // no validated human dose
  '5-amino-1mq-inj', // 5-Amino-1MQ (INJECTABLE) only — the oral entry is unaffected
] as const;

export type SafetyOnlyCompoundId = (typeof SAFETY_ONLY_COMPOUND_IDS)[number];

const SAFETY_ONLY_SET: ReadonlySet<string> = new Set<string>(SAFETY_ONLY_COMPOUND_IDS);

/**
 * True when this peptide id renders safety information only — no dose number,
 * range, ladder, cycle plan, supplies estimate or pre-fill, on any surface.
 *
 * Tolerant of casing and surrounding whitespace because ids arrive here from
 * route params, deep links and Aimee tool payloads as well as from the catalog.
 * A non-string (undefined id, a number from a bad param) is NOT safety-only —
 * callers must not rely on this to mean "unknown compound".
 */
export function isSafetyOnly(peptideId: string | null | undefined): boolean {
  if (typeof peptideId !== 'string') return false;
  return SAFETY_ONLY_SET.has(peptideId.trim().toLowerCase());
}
