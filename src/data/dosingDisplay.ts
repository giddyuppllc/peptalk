/**
 * The DISPLAY boundary for dosing data.
 *
 * Every screen, card and on-device bot response reads its dose data through
 * this module. The raw getters next door — `getProtocolsByPeptide`,
 * `getDosingTableEntry`, `getDosingReference`,
 * `getAllDosingReferencesForPeptide` — still return everything, because the
 * data-integrity scripts (verify:dosingconsistency, verify:doseprovenance,
 * verify:dosesanity, validatePeptideData) and the clinical-consistency suite
 * must keep checking compounds whose numbers users no longer see. A checker
 * that stops checking is worse than no checker.
 *
 * So the split is deliberate:
 *   raw getter      = "what is stored"     → verification, guards, tests
 *   *ForDisplay     = "what a user sees"   → screens, cards, the on-device bot
 *
 * `scripts/verify-safety-only.mjs` enforces the direction: no file under
 * `app/` or `src/components/` may import a raw dose getter. A new screen that
 * reaches past this boundary fails the build rather than silently shipping a
 * dose for a compound Edward withdrew one.
 *
 * See src/data/safetyOnlyCompounds.ts for the decision and the list.
 */

import { getProtocolsByPeptide } from './protocols';
import type { ProtocolTemplate } from '../types';
import { getDosingTableEntry, type DosingTableEntry } from './peptideDosingTable';
import {
  getDosingReference,
  getAllDosingReferencesForPeptide,
  type DosingReference,
} from './peptideDosingReference';
import { isSafetyOnly } from './safetyOnlyCompounds';

/**
 * Protocol templates a user may be shown for this peptide.
 *
 * Empty for a safety-only compound. That is load-bearing rather than
 * incidental: `app/peptide/[id].tsx`, `app/calculators/quick-dose.tsx` and
 * `app/calculators/plan.tsx` all gate their dose surfaces on
 * `protocols.length`, and the detail screen already has an authored empty
 * state for compounds with no catalogued protocol which says, in Edward's own
 * words, that PepTalk "intentionally doesn't suggest a dose rather than guess
 * at numbers". Returning [] renders that existing card — no new copy.
 */
export function getProtocolsForDisplay(peptideId: string): ProtocolTemplate[] {
  if (isSafetyOnly(peptideId)) return [];
  return getProtocolsByPeptide(peptideId);
}

/**
 * The master-table row a user may be shown. Null for a safety-only compound:
 * the whole row is a dosing envelope (range, cycle, frequency, time-off,
 * titration prose), so it is suppressed whole rather than field by field.
 */
export function getDosingTableEntryForDisplay(peptideId: string): DosingTableEntry | null {
  if (isSafetyOnly(peptideId)) return null;
  return getDosingTableEntry(peptideId);
}

/**
 * The reconstitution ladder a user may be shown, and which pre-fills the
 * calculator's vial / diluent fields. Null for a safety-only compound.
 *
 * The calculator itself still WORKS for these compounds — Edward's decision is
 * that the app does arithmetic on the vial the user is holding. What it stops
 * doing is handing them a starting vial, diluent and dose to do it with.
 */
export function getDosingReferenceForDisplay(peptideId: string): DosingReference | null {
  if (isSafetyOnly(peptideId)) return null;
  return getDosingReference(peptideId);
}

/** Every ladder variant a user may be shown (alternate vial sizes, blends). */
export function getAllDosingReferencesForDisplay(peptideId: string): DosingReference[] {
  if (isSafetyOnly(peptideId)) return [];
  return getAllDosingReferencesForPeptide(peptideId);
}

/**
 * A figure followed by a dose unit — "250-500 IU", "0.2 mg", "100 mcg",
 * "10 units", "0.1 ml". Deliberately NOT anchored to a compound name: it is
 * applied to prose that has already been narrowed to one compound.
 *
 * `\b` after the unit stops "5mgx" style typos slipping through as a match on
 * "5mg", and stops "10 unitsold"-shaped words; the leading `\d` means a bare
 * "mg" in a sentence is not a hit.
 */
const DOSE_FIGURE = /\d+(?:[.,]\d+)?\s*(?:mcg|µg|ug|mg|g\b|iu|units?|ml|cc)\b/i;

/** True when a sentence states a dose figure. */
export function containsDoseFigure(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  return DOSE_FIGURE.test(text);
}

/**
 * Drop the sentences that state a dose, keep everything else.
 *
 * Used for a safety-only compound's `importantNotes`, which mix the two freely:
 * hCG's notes carry BOTH "Common TRT-adjunct dose: 250-500 IU 2-3× per week"
 * AND "Banned by WADA — competing athletes must abstain". Dropping the array
 * wholesale would take the safety material with the numbers, which is the
 * opposite of the decision — the compound stays present WITH its safety
 * information. Filtering line by line keeps every note that carries no figure.
 *
 * Applied only where `isSafetyOnly` is true; pass-through otherwise.
 */
export function redactDoseBearingNotes(
  peptideId: string,
  notes: readonly string[] | undefined,
): string[] {
  const list = notes ? [...notes] : [];
  if (!isSafetyOnly(peptideId)) return list;
  return list.filter((n) => !containsDoseFigure(n));
}
