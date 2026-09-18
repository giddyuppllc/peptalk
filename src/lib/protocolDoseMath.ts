/**
 * protocolDoseMath — the PURE arithmetic behind the peptide detail screen's
 * "Quick dose reference" pills, the "Cycle plan" card, the calculator's
 * intensity picker and the Supplies estimator.
 *
 * WHY THIS IS ITS OWN FILE
 * These functions used to live inside two React Native component files, so no
 * test and no script could call the numbers a user actually sees without
 * dragging in the RN runtime. When Jamie reported SS-31 rendering
 * "Beginner 5 mg – 16.55 mg / Advanced 28.1 mg – 40 mg" and a cycle total of
 * "140 mg–3360 mg", there was no way to prove a fix other than reading the
 * formula. Moving the maths here — unchanged — lets the dose-sanity test call
 * exactly what the screens call.
 *
 * THE SPLIT, stated rather than buried
 * Without authored bands, Beginner/Mild is the lower third of the protocol's
 * typicalDose span and Advanced/Aggressive the upper third:
 *
 *     beginner = [min, min + span × 0.33]
 *     advanced = [min + span × 0.66, max]
 *
 * For SS-31's old 5–40 mg that is 5 + 35 × 0.33 = 16.55 and
 * 5 + 35 × 0.66 = 28.1 — the exact figures Jamie screenshotted.
 *
 * AUTHORED BANDS
 * A split is a formula, not a clinical statement. Where a clinician has named
 * the beginner and advanced doses outright, the protocol carries them in
 * `doseBands` and they are used verbatim instead of the split. Protocols
 * without `doseBands` behave exactly as before.
 */
import type { ProtocolTemplate, ProtocolFrequency } from '../types';
import {
  formatDoseRange,
  normalizeDoseRange,
  roundDoseForDisplay,
  toDisplayUnitPair,
  type DoseRange,
  type DoseUnit,
} from './doseUnits';

export type ProtocolIntensity = 'mild' | 'standard' | 'aggressive';

/** Injections per week for each protocol frequency enum. */
export const FREQUENCY_PER_WEEK: Record<ProtocolFrequency, number> = {
  daily:        7,
  twice_daily:  14,
  eod:          3.5,
  // 5 consecutive days then 2 off. Modelled as 5/week rather than folded into
  // `daily`, which would overstate every supply count by 40%.
  five_on_two_off: 5,
  tiw:          3,
  biw:          2,
  weekly:       1,
  biweekly:     0.5,
  monthly:      0.25,
  custom:       1,
};

/**
 * Derive a single dose for the chosen intensity from the protocol's typical
 * range. Mild = min, Standard = midpoint, Aggressive = max.
 *
 * The returned `unit` is authoritative — it is NOT always mcg. See
 * src/lib/doseUnits.ts: mg normalises to mcg, but IU and ml are activity and
 * volume units with no mass equivalent, so they come back untouched. Callers
 * must format with the unit rather than assuming mcg.
 */
export function intensityToDose(
  protocol: ProtocolTemplate,
  intensity: ProtocolIntensity,
): DoseRange & { value: number } {
  const { typicalDose } = protocol;
  const r = normalizeDoseRange(typicalDose.min, typicalDose.max, typicalDose.unit);
  const value =
    intensity === 'mild'       ? r.min :
    intensity === 'aggressive' ? r.max :
    (r.min + r.max) / 2;
  return { ...r, value };
}

/**
 * Build a (min, max) dose range pair shifted by intensity. Used by the
 * Quick dose reference, Cycle plan + Supplies estimator so range-based math
 * (total dose over cycle, vials needed) reflects the chosen intensity.
 *
 *   - Mild:       authored beginner band, else lower-third of typical range
 *   - Standard:   full typical range (default behavior)
 *   - Aggressive: authored advanced band, else upper-third of typical range
 *
 * Carries `unit` + `massBased` through, so a caller doing mass-only maths
 * (vials from a mcg/vial concentration) can decline rather than silently
 * treat millilitres as micrograms.
 */
export function intensityToDoseRange(
  protocol: ProtocolTemplate,
  intensity: ProtocolIntensity,
): DoseRange {
  const { typicalDose, doseBands } = protocol;
  if (doseBands && intensity !== 'standard') {
    const band = intensity === 'mild' ? doseBands.beginner : doseBands.advanced;
    return normalizeDoseRange(band.min, band.max, typicalDose.unit);
  }
  const r = normalizeDoseRange(typicalDose.min, typicalDose.max, typicalDose.unit);
  const span = r.max - r.min;
  if (intensity === 'mild') {
    return { ...r, min: r.min, max: r.min + span * 0.33 };
  }
  if (intensity === 'aggressive') {
    return { ...r, min: r.min + span * 0.66, max: r.max };
  }
  return r;
}

export interface CyclePlanSummary {
  /** Per-dose range for the intensity (Standard = full typical range). */
  range: DoseRange;
  perWeek: number;
  totalInjMin: number;
  totalInjMax: number;
  /** range.min × totalInjMin … range.max × totalInjMax, same unit as range. */
  totalRange: DoseRange;
  vialsMin: number | null;
  vialsMax: number | null;
  perDoseLabel: string;
  totalDoseLabel: string;
  vialsLabel: string | null;
  injectionCountLabel: string;
  weeksLabel: string;
}

/**
 * Everything the Cycle plan card prints, computed without React. The card
 * renders these labels verbatim.
 */
export function computeCyclePlan(
  protocol: ProtocolTemplate,
  intensity?: ProtocolIntensity,
  vialMcg?: number,
): CyclePlanSummary {
  const { durationWeeks, frequency } = protocol;
  // Intensity shifts the dose range — Mild = lower 1/3, Standard = full,
  // Aggressive = upper 1/3 of the published typical range. Standard is
  // the default when no intensity is set so existing call sites are
  // unchanged.
  const range = intensityToDoseRange(protocol, intensity ?? 'standard');
  const perWeek = FREQUENCY_PER_WEEK[frequency] ?? 1;
  const totalInjMin = perWeek * durationWeeks.min;
  const totalInjMax = perWeek * durationWeeks.max;
  // Total-over-cycle is just dose x injections, so it stays valid in whatever
  // unit the protocol uses — including IU and ml.
  const totalRange: DoseRange = {
    ...range,
    min: range.min * totalInjMin,
    max: range.max * totalInjMax,
  };
  // Vials come from a mcg/vial concentration, so they are meaningful ONLY for
  // a mass dose. For an IU or ml protocol there is no conversion, and
  // inventing one is exactly how Cerebrolysin ended up reading "5 mcg-30 mcg".
  const canCountVials = range.massBased && !!vialMcg && vialMcg > 0;
  const vialsMin = canCountVials ? Math.ceil(totalRange.min / vialMcg!) : null;
  const vialsMax = canCountVials ? Math.ceil(totalRange.max / vialMcg!) : null;
  return {
    range,
    perWeek,
    totalInjMin,
    totalInjMax,
    totalRange,
    vialsMin,
    vialsMax,
    perDoseLabel: formatDoseRange(range),
    totalDoseLabel: formatDoseRange(totalRange),
    vialsLabel:
      vialsMin != null && vialsMax != null
        ? vialsMin === vialsMax ? `${vialsMin} vial${vialsMin === 1 ? '' : 's'}` : `${vialsMin}–${vialsMax} vials`
        : null,
    injectionCountLabel:
      totalInjMin === totalInjMax
        ? `${Math.round(totalInjMin)} injections`
        : `${Math.round(totalInjMin)}–${Math.round(totalInjMax)} injections`,
    weeksLabel:
      durationWeeks.min === durationWeeks.max
        ? `${durationWeeks.min} weeks`
        : `${durationWeeks.min}–${durationWeeks.max} weeks`,
  };
}

export interface SupplyPeriod {
  label: string;
  weeks: number;
  doses: number;
  /** [fewest, most] vials; null when no vial size is known or the dose is not a mass. */
  vialsRange: [number, number] | null;
  syringes: number;
  bacWaterMl: number | null;
  swabs: number;
  vialsLabel: string;
  syringesLabel: string;
  bacWaterLabel: string;
  swabsLabel: string;
}

export interface SuppliesEstimate {
  periods: SupplyPeriod[];
  /** Whether a vial count is possible at all (mass dose). */
  doseIsMassBased: boolean;
  hasVialMath: boolean;
}

/**
 * Everything the Supplies estimator card prints, computed without React.
 * Moved out of SuppliesEstimatorCard unchanged in its arithmetic so a test can
 * pin the vial count a user is told to buy. One edge fix: BAC water is rounded
 * to 0.1 mL for display, so a 1.1 mL reconstitution over 3 vials reads "3.3 mL"
 * rather than "3.3000000000000003 mL" (the card printed the raw product).
 *
 * Horizons: 1 week, 2 weeks, and the protocol's longest cycle
 * (durationWeeks.max). Doses per horizon = ceil(injections/week × weeks). The
 * vial range is [dose range min, max] × doses ÷ vial size, for the chosen
 * intensity's dose range (Standard = the full typicalDose).
 */
export function estimateSupplies(
  protocol: ProtocolTemplate,
  opts: { vialMcg?: number; bacWaterMl?: number; intensity?: ProtocolIntensity } = {},
): SuppliesEstimate {
  const { vialMcg, bacWaterMl, intensity } = opts;
  const range = intensityToDoseRange(protocol, intensity ?? 'standard');
  const perWeek = FREQUENCY_PER_WEEK[protocol.frequency] ?? 1;
  const cycleWeeks = protocol.durationWeeks.max;
  const horizons = [
    { label: '1 week', weeks: 1 },
    { label: '2 weeks', weeks: 2 },
    { label: `Full cycle (${cycleWeeks} wks)`, weeks: cycleWeeks },
  ];
  const bacPerVialMl = bacWaterMl && bacWaterMl > 0 ? bacWaterMl : 2;

  const periods = horizons.map(({ label, weeks }): SupplyPeriod => {
    const doses = Math.ceil(perWeek * weeks);
    const vialsRange: [number, number] | null =
      range.massBased && vialMcg && vialMcg > 0
        ? [Math.ceil((range.min * doses) / vialMcg), Math.ceil((range.max * doses) / vialMcg)]
        : null;
    const bac = vialsRange ? Math.round(vialsRange[1] * bacPerVialMl * 10) / 10 : null;
    const [lo, hi] = vialsRange ?? [0, 0];
    const vialWord = hi === 1 ? 'vial' : 'vials';
    return {
      label,
      weeks,
      doses,
      vialsRange,
      syringes: doses,
      bacWaterMl: bac,
      swabs: doses * 2,
      vialsLabel: vialsRange ? (lo === hi ? `${lo} ${vialWord}` : `${lo}–${hi} ${vialWord}`) : '—',
      syringesLabel: `${doses}`,
      bacWaterLabel: bac != null ? `${bac} mL` : '—',
      swabsLabel: `${doses * 2}`,
    };
  });

  return {
    periods,
    doseIsMassBased: range.massBased,
    hasVialMath: periods[0]?.vialsRange != null,
  };
}

/**
 * The dose "Start cycle" on the Plan Your Cycle screen seeds an active protocol
 * with — the same number its confirmation prompt shows.
 *
 * A titration ladder's first step when there is one; otherwise the midpoint of
 * typicalDose, "so the user isn't started at the max". That midpoint used to be
 * Math.round'ed in the protocol's own unit, which for a milligram range rounds
 * to whole milligrams and landed three compounds ON the max it was meant to
 * avoid: CJC-1295 1–2 mg → 2 mg, tesamorelin 0.5–1 mg → 1 mg, somatropin
 * 0.2–1 mg → 1 mg. It now rounds to the display precision
 * (roundDoseForDisplay), clamped inside the range, so what is stored is
 * exactly what the prompt printed.
 *
 * The pair comes back in the unit it will be DISPLAYED in (mcg below 1 mg).
 * It used to come back in the protocol's own unit, so tesamorelin returned
 * `{ 0.75, 'mg' }`: the prompt printed "750 mcg" through formatDoseAmount,
 * while the PAIR — which is what gets stored on the protocol — rendered as
 * "0.75 mg" on the five screens that show a stored dose. Two numbers for one
 * dose, one of them at two decimals, which the 2026-09-15 work order rules
 * out. toDisplayUnitPair relabels only; the mass is unchanged and nothing is
 * re-rounded (1.25 mg stays 1.25 mg).
 */
export function planStarterDose(protocol: ProtocolTemplate): { dose: number; unit: DoseUnit } {
  const first = protocol.titrationSchedule?.[0];
  if (first) {
    const d = toDisplayUnitPair(first.dose, first.unit as DoseUnit);
    return { dose: d.value, unit: d.unit };
  }
  const { min, max, unit } = protocol.typicalDose;
  const mid = roundDoseForDisplay((min + max) / 2, unit);
  const d = toDisplayUnitPair(Math.min(max, Math.max(min, mid)), unit);
  return { dose: d.value, unit: d.unit };
}
