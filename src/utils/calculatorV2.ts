/**
 * Canonical peptide dosing math — Master Refactor Plan v3.1 §14.
 *
 * Pure functions. All inputs in mg + mL; UI converts to mcg / units at
 * the render layer via formatDose() + the U-100 syringe component.
 *
 * Reference formulas (§14):
 *   concentration_mg_per_ml = peptide_mg_in_vial / diluent_volume_ml
 *   draw_per_shot_ml        = per_shot_dose_mg / concentration_mg_per_ml
 *   doses_per_vial          = peptide_mg_in_vial / per_shot_dose_mg
 *
 * Validation (§14.1):
 *   diluent_volume_ml <= vial_size_ml         — hard clamp on UI input
 *   draw_per_shot_ml  <= 1.0                  — U-100 cap → split-injection nudge
 *   diluent_ml deviates from recommendation   — warn but allow
 *   per_shot_dose outside protocol range      — warn but allow
 */

export interface CalculatorInput {
  /** Manufacturer-stated mg in the vial (user-editable, pre-filled). */
  peptideMgInVial: number;
  /** Volume of diluent added (user-editable, clamped to vialSizeMl). */
  diluentVolumeMl: number;
  /** Physical vial — one of the three first-class sizes (§8.1). */
  vialSizeMl: 3 | 5 | 10;
  /** Per-shot dose in mg. */
  perShotDoseMg: number;
  /** Optional recommended reconstitution from the dosing reference. */
  recommendedReconstitutionMl?: number;
  /** Optional protocol range — used to flag deviation. */
  protocolRangeMg?: { min: number; max: number };
}

export type CalculatorWarning =
  | { kind: 'diluent_exceeds_vial'; vialSizeMl: number; diluentMl: number }
  | { kind: 'draw_exceeds_u100'; drawMl: number; suggestedSplit: number }
  | {
      kind: 'diluent_deviates_from_recommendation';
      recommendedMl: number;
      gotMl: number;
    }
  | {
      kind: 'dose_outside_protocol_range';
      minMg: number;
      maxMg: number;
      gotMg: number;
    };

export interface CalculatorResult {
  /** Concentration of reconstituted vial (mg/mL). */
  concentrationMgPerMl: number;
  /** Volume drawn per shot (mL). */
  drawPerShotMl: number;
  /** Equivalent U-100 syringe units per shot. */
  drawPerShotUnits: number;
  /** Number of per-shot doses one vial yields. */
  dosesPerVial: number;
  /** Non-blocking flags surfaced as inline UI warnings. */
  warnings: CalculatorWarning[];
  /**
   * Blocking failures — calculator outputs are not safe to act on. The
   * "Add to calendar" CTA must be disabled until these are cleared.
   */
  hardFailures: CalculatorWarning[];
}

/** U-100 insulin syringe — 1 mL = 100 units, 1 unit = 0.01 mL. */
export const U100_UNITS_PER_ML = 100;

export function calculate(input: CalculatorInput): CalculatorResult {
  const {
    peptideMgInVial,
    diluentVolumeMl,
    vialSizeMl,
    perShotDoseMg,
    recommendedReconstitutionMl,
    protocolRangeMg,
  } = input;

  const warnings: CalculatorWarning[] = [];
  const hardFailures: CalculatorWarning[] = [];

  // §14.1 hard predicate — UI also clamps the slider but defense in depth.
  if (diluentVolumeMl > vialSizeMl) {
    hardFailures.push({
      kind: 'diluent_exceeds_vial',
      vialSizeMl,
      diluentMl: diluentVolumeMl,
    });
  }

  // Guard against div-by-zero so a half-typed input doesn't render NaN.
  const safeDiluent = diluentVolumeMl > 0 ? diluentVolumeMl : 1;
  const concentrationMgPerMl = peptideMgInVial / safeDiluent;
  const drawPerShotMl =
    concentrationMgPerMl > 0 ? perShotDoseMg / concentrationMgPerMl : 0;
  const drawPerShotUnits = drawPerShotMl * U100_UNITS_PER_ML;
  const dosesPerVial =
    perShotDoseMg > 0 ? peptideMgInVial / perShotDoseMg : 0;

  if (drawPerShotMl > 1.0) {
    warnings.push({
      kind: 'draw_exceeds_u100',
      drawMl: drawPerShotMl,
      suggestedSplit: Math.ceil(drawPerShotMl),
    });
  }

  if (
    recommendedReconstitutionMl != null &&
    Math.abs(diluentVolumeMl - recommendedReconstitutionMl) > 0.05
  ) {
    warnings.push({
      kind: 'diluent_deviates_from_recommendation',
      recommendedMl: recommendedReconstitutionMl,
      gotMl: diluentVolumeMl,
    });
  }

  if (protocolRangeMg) {
    const { min, max } = protocolRangeMg;
    if (perShotDoseMg < min || perShotDoseMg > max) {
      warnings.push({
        kind: 'dose_outside_protocol_range',
        minMg: min,
        maxMg: max,
        gotMg: perShotDoseMg,
      });
    }
  }

  return {
    concentrationMgPerMl,
    drawPerShotMl,
    drawPerShotUnits,
    dosesPerVial,
    warnings,
    hardFailures,
  };
}

/** §8.6 display-unit conversion. */
export function formatDose(mg: number, displayUnit: 'mg' | 'mcg'): string {
  if (displayUnit === 'mcg') {
    return `${Math.round(mg * 1000)} mcg`;
  }
  const decimals = mg >= 10 ? 1 : 2;
  return `${mg.toFixed(decimals)} mg`;
}

/** Convert from the chosen display unit back to mg for storage. */
export function parseDoseToMg(
  value: number,
  displayUnit: 'mg' | 'mcg',
): number {
  return displayUnit === 'mcg' ? value / 1000 : value;
}

export function formatVolumeMl(ml: number): string {
  return `${ml.toFixed(2)} mL`;
}

export function formatUnits(units: number): string {
  return `${units.toFixed(1)} units`;
}

// ─── §8.8 — Full-cycle schedule generator ────────────────────────────────────

/**
 * Parse a free-text frequency phrase from peptideDosingReference into the
 * canonical set we know how to schedule. Anything ambiguous (e.g. "as needed",
 * "open") defaults to weekly so we emit *something* the user can edit, not
 * nothing.
 */
export type CadenceKind =
  | 'daily'
  | 'weekly'
  | 'eod'
  | 'mon_wed_fri'
  | 'mon_thu';

export function parseCadence(frequency: string): CadenceKind {
  const f = frequency.toLowerCase().trim();
  if (/(mon\/?thu|2x\/?week|biw|twice weekly|twice\/week)/.test(f))
    return 'mon_thu';
  if (/(mon\/?wed\/?fri|3x\/?week|tiw|thrice weekly|3\/week)/.test(f))
    return 'mon_wed_fri';
  if (/(eod|every other day|alt(ernating)? days?)/.test(f)) return 'eod';
  if (/once weekly|weekly|once\/week|1x\/?week/.test(f)) return 'weekly';
  if (/daily|every day|each day|2-?3.?\s*(x|×)?\s*daily|twice daily/.test(f))
    return 'daily';
  return 'weekly';
}

/**
 * Generate planned dose dates for a single cycle window.
 *
 * `cycleLength` accepts the same free-text strings the dosing reference
 * uses ("12 weeks", "20 days on", "Open — daily as needed"). Anything
 * not parseable defaults to a 4-week window so a "schedule cycle" tap
 * always produces a usable plan the user can edit.
 */
export function generateCycleDates(
  startISO: string,
  cycleLength: string | undefined,
  frequency: string,
): string[] {
  const cadence = parseCadence(frequency);
  const totalDays = parseCycleDays(cycleLength);
  const start = new Date(startISO);
  const out: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (shouldEmit(d, i, cadence)) out.push(toDateKey(d));
  }
  return out;
}

function parseCycleDays(cycleLength: string | undefined): number {
  if (!cycleLength) return 28;
  const weekMatch = cycleLength.match(/(\d+)\s*weeks?/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  const dayMatch = cycleLength.match(/(\d+)\s*days?/i);
  if (dayMatch) return Number(dayMatch[1]);
  // "Open — daily as needed" / "Weekly, titrate to effect" → default 4 weeks.
  return 28;
}

function shouldEmit(d: Date, dayIndex: number, cadence: CadenceKind): boolean {
  const dow = d.getDay(); // 0 Sun … 6 Sat
  switch (cadence) {
    case 'daily':
      return true;
    case 'eod':
      return dayIndex % 2 === 0;
    case 'weekly':
      // Anchor to the start day.
      return dayIndex % 7 === 0;
    case 'mon_wed_fri':
      return dow === 1 || dow === 3 || dow === 5;
    case 'mon_thu':
      return dow === 1 || dow === 4;
  }
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
