/**
 * Calculator v2.1 metadata per peptide — Master Refactor Plan v3.1 §8 + §13.1.
 *
 * Layers the v3 fields (`displayUnit`, `standardVialSizeMl`,
 * `maxVialCapacityMl`, `diluentType`, `recommendedReconstitutionMl`) on
 * top of the existing `peptideDosingReference.ts` without rewriting
 * that file's schema. Anything not explicitly overridden falls through
 * to defaults derived from the dosing reference.
 *
 * - Acetic-acid peptides (§8.3): AOD-9604, IGF-1, IGF-1 LR3, Dihexa.
 *   These surface a RED FLAG modal on selection. Reconstitute card
 *   uses red accent + "Reconstitute with X mL acetic acid".
 *
 * - 10 mL vials (§8.4): NAD+, Glutathione, L-Carnitine, Epitalon 50 mg.
 *
 * - Reconstitution override (§8.5): Retatrutide 10 mg vial → 1 mL BAC
 *   water for fine titration.
 *
 * - mcg-native display (§8.6): peptides typically dosed in the 100s of
 *   mcg keep mcg as the default UI unit; everything else defaults to mg.
 */

import {
  getDosingReference,
  type DosingReference,
} from './peptideDosingReference';

export interface CalculatorMetadata {
  peptideId: string;
  /** Default unit on screen (toggleable). */
  displayUnit: 'mg' | 'mcg';
  /** Physical vial size in mL — first-class calculator input. */
  standardVialSizeMl: 3 | 5 | 10;
  /** Hard upper bound for diluent input (cannot exceed physical vial). */
  maxVialCapacityMl: number;
  /** Diluent kind — drives the red-flag modal on select. */
  diluentType: 'bacWater' | 'aceticAcid';
  /** Pre-filled diluent volume. Falls back to dosing-reference value. */
  recommendedReconstitutionMl?: number;
}

type Override = Partial<Omit<CalculatorMetadata, 'peptideId'>>;

const OVERRIDES: Record<string, Override> = {
  // §8.3 — acetic-acid peptides. Red flag on selection. AOD-9604 + IGF-1
  // are not in the dosing reference yet but the catalog lists them, so
  // surfacing the diluent flag defensively here means the warning still
  // fires the moment they get a dosing entry.
  'aod-9604': { diluentType: 'aceticAcid' },
  'igf-1': { diluentType: 'aceticAcid' },
  'igf-1-lr3': { diluentType: 'aceticAcid' },
  dihexa: { diluentType: 'aceticAcid' },

  // §8.4 — 10 mL physical vials.
  'nad-plus': { standardVialSizeMl: 10, maxVialCapacityMl: 10 },
  glutathione: { standardVialSizeMl: 10, maxVialCapacityMl: 10 },
  'l-carnitine': { standardVialSizeMl: 10, maxVialCapacityMl: 10 },
  'epithalon-50': { standardVialSizeMl: 10, maxVialCapacityMl: 10 },

  // §8.5 — retatrutide 10 mg high-concentration reconstitution override.
  // The dosing reference already encodes diluentMl: 1; we double-check
  // it here so a later edit to the reference doesn't silently change
  // the calculator pre-fill.
  'retatrutide-10mg': { recommendedReconstitutionMl: 1 },

  // §8.6 — mcg-native peptides. These commonly dose in 100s of mcg, so
  // the user-facing default unit stays mcg even though storage is mg.
  'bpc-157': { displayUnit: 'mcg' },
  kpv: { displayUnit: 'mcg' },
  'tb-500': { displayUnit: 'mcg' },
  'ghk-cu': { displayUnit: 'mcg' },
  'thymosin-alpha-1': { displayUnit: 'mcg' },
  selank: { displayUnit: 'mcg' },
  semax: { displayUnit: 'mcg' },
  dsip: { displayUnit: 'mcg' },
  'll-37': { displayUnit: 'mcg' },
};

/**
 * §8.3 acetic-acid peptides, by display name — the same set encoded in
 * OVERRIDES above (aod-9604, igf-1, igf-1-lr3, dihexa). Exported so screens
 * without a peptide picker (e.g. the standalone reconstitution calculator)
 * can remind users which compounds prefer acetic acid without re-hardcoding
 * the list.
 */
export const ACETIC_ACID_PEPTIDE_NAMES = [
  'IGF-1',
  'IGF-1 LR3',
  'Dihexa',
  'AOD-9604',
] as const;

const DEFAULTS = {
  displayUnit: 'mg' as const,
  standardVialSizeMl: 3 as const,
  diluentType: 'bacWater' as const,
};

function inferVialSize(ref: DosingReference | null): 3 | 5 | 10 {
  // Take the reference's `diluentMl` as a hint about the physical vial
  // the doc author had in mind, then clamp to the three legal sizes.
  const ml = ref?.diluentMl ?? DEFAULTS.standardVialSizeMl;
  if (ml >= 8) return 10;
  if (ml >= 4) return 5;
  return 3;
}

export function getCalculatorMetadata(peptideId: string): CalculatorMetadata {
  const ref = getDosingReference(peptideId);
  const ov = OVERRIDES[peptideId] ?? {};
  const inferredVial = inferVialSize(ref);
  const standardVialSizeMl = ov.standardVialSizeMl ?? inferredVial;
  return {
    peptideId,
    displayUnit: ov.displayUnit ?? DEFAULTS.displayUnit,
    standardVialSizeMl,
    maxVialCapacityMl: ov.maxVialCapacityMl ?? standardVialSizeMl,
    diluentType:
      ov.diluentType ??
      (ref?.diluent === 'acetic_acid' ? 'aceticAcid' : DEFAULTS.diluentType),
    recommendedReconstitutionMl:
      ov.recommendedReconstitutionMl ?? ref?.diluentMl,
  };
}

/** Quick lookup — does this peptide trigger the §8.3 red-flag modal? */
export function requiresAceticAcid(peptideId: string): boolean {
  return getCalculatorMetadata(peptideId).diluentType === 'aceticAcid';
}
