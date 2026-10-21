/**
 * Which dose the "Today's planned dose" card shows — and logs on one tap.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE LINES IN A SCREEN
 * It was three lines in a screen:
 *
 *     const dose = phase?.doseMcg
 *       ? { amount: phase.doseMcg, unit: 'mcg' }
 *       : { amount: active.protocol.dose, unit: active.protocol.unit };
 *
 * That silently overrode the dose the USER set on their own protocol with the
 * first step of the reconstitution ladder, hardcoded to mcg. Two things came
 * out of it:
 *
 *   1. The figure rendered raw, so glutathione read "300000 mcg", NAD+
 *      "60000 mcg" and MOTS-c "1000 mcg" — the exact complaint quoted in
 *      doseUnits.ts's own header.
 *   2. Several of those ladder values are MIDPOINTS of a documented range, not
 *      prescribed doses. The reference file says so itself: "60 mg midpoint of
 *      20-100 mg", "mid of 200-400 mg". The card presented one as a prescribed
 *      dose and wrote it to the dose log on a single tap.
 *
 * THE RULE
 * A ladder step is used only when it states ONE dose. When the source stated a
 * range, the user's own protocol dose wins — they chose it, nobody chose the
 * midpoint. The unit travels with the number it belongs to, so nothing is
 * relabelled.
 *
 * Rendering is the caller's job, through formatDoseAmount. This function
 * returns the number and its unit, never a string.
 *
 * WHY IT READS THROUGH THE DISPLAY BOUNDARY (2026-09-16)
 * The ladder is a suggestion the app makes. For a safety-information-only
 * compound the app makes none, so the boundary returns nothing and the user's
 * own protocol dose is what the card shows and one-tap logs — their number,
 * not ours. Reading the raw store here would have put a withdrawn figure back
 * on screen through the one file the screen-level scan does not look at, which
 * is exactly what `verify:safetyonly` caught when these two changes met.
 */
import { phaseStatesRange } from '../data/peptideDosingReference';
import { getDosingReferenceForDisplay } from '../data/dosingDisplay';
import type { DoseUnit } from '../types';

export interface PlannedDose {
  amount: number;
  unit: DoseUnit;
  /** Where the figure came from, for tests and for anything that must explain it. */
  source: 'ladder' | 'protocol';
}

export function plannedDoseForProtocol(protocol: {
  peptideId: string;
  dose: number;
  unit: DoseUnit;
}): PlannedDose {
  const phase = getDosingReferenceForDisplay(protocol.peptideId)?.schedule?.[0];
  if (phase?.doseMcg && !phaseStatesRange(phase)) {
    return { amount: phase.doseMcg, unit: 'mcg', source: 'ladder' };
  }
  return { amount: protocol.dose, unit: protocol.unit, source: 'protocol' };
}
