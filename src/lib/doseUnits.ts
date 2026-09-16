/**
 * doseUnits — PURE dose-unit normalisation and formatting.
 *
 * WHY THIS EXISTS
 * `intensityToDoseRangeMcg` converted only 'mg' (×1000) and passed everything
 * else through AS IF IT WERE ALREADY MCG:
 *
 *     const minMcg = unit === 'mg' ? min * 1000 : min;
 *
 * Cerebrolysin's protocol is `{ min: 5, max: 30, unit: 'ml' }`, so the Cycle
 * plan rendered "5 mcg–30 mcg" and a total of "70 mcg–840 mcg" — off by a
 * factor that isn't even definable, because millilitres are a VOLUME and mcg is
 * a MASS. Jamie caught it on Cerebrolysin; three more were wrong and unreported:
 * hcg (250–1500 IU), oxytocin (10–40 IU), hmg (75–300 IU). hCG and hMG are
 * fertility compounds, so a silent unit swap there is not cosmetic.
 *
 * THE RULE
 * mcg and mg are the same physical quantity, so they interconvert freely and
 * mass-based maths (total dose over a cycle, vials needed from a mcg/vial
 * concentration) is meaningful. IU is an ACTIVITY unit and ml is a VOLUME:
 * neither converts to a mass without a compound-specific potency or
 * concentration that this dataset does not carry. So we never invent one —
 * we keep the author's number in the author's unit and mark it non-mass, and
 * callers that need a mass (vial counts) simply decline to answer.
 */

export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'ml';

/** True when a dose in this unit is a mass and can be expressed in mcg. */
export function isMassUnit(unit: DoseUnit): boolean {
  return unit === 'mcg' || unit === 'mg';
}

export interface DoseRange {
  min: number;
  max: number;
  /** The unit `min`/`max` are actually expressed in. */
  unit: DoseUnit;
  /**
   * True when min/max are a mass in MCG. Mass-only maths (vials from a
   * mcg/vial concentration) must check this before running.
   */
  massBased: boolean;
}

/**
 * Put a protocol's dose range into a single canonical form: mass units become
 * mcg; IU and ml are preserved exactly as authored.
 */
export function normalizeDoseRange(min: number, max: number, unit: DoseUnit): DoseRange {
  if (unit === 'mg') {
    return { min: min * 1000, max: max * 1000, unit: 'mcg', massBased: true };
  }
  if (unit === 'mcg') {
    return { min, max, unit: 'mcg', massBased: true };
  }
  // IU / ml — no mass conversion exists. Keep the author's numbers.
  return { min, max, unit, massBased: false };
}

/**
 * DISPLAY PRECISION — the one rule for how finely a dose is shown.
 *
 * Work order 2026-09-15: "handle rounding so no dosing figure ever renders at
 * two decimals". SS-31 read "Beginner 5 mg – 16.55 mg / Advanced 28.1 mg –
 * 40 mg" because the thirds split (min + span × 0.33) produces hundredths no
 * syringe, vial or label is marked in, and this file printed up to 2dp. On the
 * full dataset that was 125 figures across the Quick dose pills, the Cycle
 * plan, the intensity tiles and the dosing table.
 *
 *   mass below 1 mg   whole mcg          333.4 mcg  -> "333 mcg"
 *   mass from 1 mg    mg to at most 1dp  16550 mcg  -> "16.6 mg"
 *   IU                whole units        149.25 IU  -> "149 IU"
 *   ml                at most 1dp        13.25 ml   -> "13.3 ml"
 *
 * Rounding happens here, on the displayed number only. Stored values and the
 * split's inputs are untouched — totals and vial counts are still computed
 * from the unrounded dose.
 *
 * It rounds in whole steps of the smallest shown increment (1 mcg, 100 mcg,
 * 1 IU, 0.1 ml), so 16550 mcg is exactly 165.5 hundreds and rounds to 16.6
 * rather than a float 16.549999… rounding down.
 *
 * NOT for a dose the user is about to draw: see formatDoseAmountExact.
 */
export function roundDoseForDisplay(value: number, unit: DoseUnit): number {
  if (!Number.isFinite(value)) return value;
  if (unit === 'mg') return roundDoseForDisplay(value * 1000, 'mcg') / 1000;
  if (unit === 'mcg') {
    const mcg = Math.round(value);
    // Decide the unit AFTER rounding, so 999.6 mcg reads "1 mg", not "1000 mcg".
    return Math.abs(mcg) >= 1000 ? Math.round(value / 100) * 100 : mcg;
  }
  if (unit === 'IU') return Math.round(value);
  return Math.round(value * 10) / 10;
}

/** Trim a float to 2dp — exact-dose rendering only; see formatDoseAmountExact. */
function trimExact(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/**
 * THE canonical mass rendering. Every dose the app shows should come through
 * here.
 *
 * Edward: "the units were like mcg and weird shit — we just wanted increments
 * people would actually know", and separately: "instead of working them out, a
 * weird rule is made that fixes the minor issue once."
 *
 * Both complaints have the same cause. Four functions rendered a dose and no
 * two agreed — 1000 mcg came out as "1.00 mg" here, "1 mg" in doseCalculator
 * and "1000 mcg" in calculatorV2, and 60 mg of NAD+ rendered as "60000 mcg" on
 * the calculator. Each was locally reasonable and there was no one place to fix
 * it, so every complaint produced another local rule.
 *
 * TWO DECISIONS, stated rather than buried:
 *
 *  1. Roll up to mg at 1000 mcg. Nobody reads "60000 mcg". This is what
 *     TitrationScheduleCard already did, with a comment saying exactly that,
 *     and it is the behaviour Edward has asked for twice.
 *  2. Trim trailing zeros. "1.00 mg" claims a hundredth-of-a-milligram
 *     precision the source data does not have; "1 mg" is the increment people
 *     actually use. Precision is roundDoseForDisplay's: at most 1dp in mg
 *     (2026-09-15 — this was 2dp, which is how "16.55 mg" reached the screen).
 */
export function formatMassMcg(mcg: number): string {
  if (!Number.isFinite(mcg)) return '';
  const shown = roundDoseForDisplay(mcg, 'mcg');
  // At >= 1000 `shown` is a whole number of hundreds of mcg, so this has at
  // most one decimal and no float tail (16.600000000000001).
  if (Math.abs(shown) >= 1000) return `${Math.round(shown / 100) / 10} mg`;
  return `${shown} mcg`;
}

/**
 * Format one amount. Mass amounts roll up to mg past 1000 mcg. IU and ml render
 * in their own unit — neither converts to a mass without a compound-specific
 * potency or concentration this dataset does not carry.
 */
export function formatDoseAmount(value: number, unit: DoseUnit): string {
  if (unit === 'mcg') return formatMassMcg(value);
  if (unit === 'mg') return formatMassMcg(value * 1000);
  if (!Number.isFinite(value)) return '';
  return `${roundDoseForDisplay(value, unit)} ${unit}`;
}

/**
 * The same mass, relabelled into the unit it will be DISPLAYED in.
 *
 * `planStarterDose` returned tesamorelin's starter as `{ 0.75, 'mg' }`. The
 * "Start cycle" prompt runs that through formatDoseAmount and prints
 * "750 mcg" — but the PAIR is what gets stored on the protocol, and five
 * screens render the stored pair. So the prompt said 750 mcg and the protocol
 * then read "0.75 mg" everywhere else: two decimals on a dosing figure, which
 * the 2026-09-15 work order rules out, and a second number for the same dose.
 *
 * This changes the LABEL ONLY. No rounding happens here: 0.75 mg becomes
 * 750 mcg and 1.25 mg stays 1.25 mg, because a starter dose is a figure
 * someone draws — display-rounding it would move 1.25 mg to 1.3 mg, a 4%
 * change to a stored dose. Use roundDoseForDisplay for the rounding, this for
 * the unit.
 *
 * IU and ml are returned untouched: neither converts to a mass.
 */
export function toDisplayUnitPair(value: number, unit: DoseUnit): { value: number; unit: DoseUnit } {
  if (!isMassUnit(unit) || !Number.isFinite(value)) return { value, unit };
  // ×1000 on a decimal can leave a float tail (0.029 * 1000 = 28.999…); this
  // is a unit change, so the mass must come back exactly.
  const mcg = unit === 'mg' ? Math.round(value * 1_000 * 1e6) / 1e6 : value;
  if (Math.abs(mcg) >= 1000) return { value: Math.round(mcg / 1000 * 1e6) / 1e6, unit: 'mg' };
  return { value: mcg, unit: 'mcg' };
}

/**
 * A dose at the precision it is drawn at (up to 2dp), for the dosing
 * calculator only. There the label sits beside a syringe volume computed from
 * the same number: semaglutide's 1250 mcg microdose is drawn as 1.25 mg, and
 * "1.3 mg" printed next to that draw would state a dose 4% away from the one in
 * the syringe — and would be written into the dose log's notes. Reference
 * surfaces (pills, cycle plan, titration, dosing table) use formatDoseAmount.
 */
export function formatDoseAmountExact(value: number, unit: DoseUnit): string {
  if (!Number.isFinite(value)) return '';
  return `${trimExact(value)} ${unit}`;
}

/**
 * Round the dose figures inside an authored range string, leaving the rest of
 * the string exactly as written.
 *
 * The master dosing table stores ranges as transcribed text ("0.25mg-12mg"),
 * rendered verbatim by DosingReferenceTableCard. Only a figure that
 * roundDoseForDisplay would change is rewritten, in the string's own spacing,
 * so "2mg-5mg" and "1.5mg" come back byte-identical and "0.25mg" reads
 * "250mcg". The stored string is not modified.
 */
export function roundDoseFiguresInText(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?)(\s?)(mcg|mg|IU|ml|mL)\b/g, (whole, num: string, space: string, u: string) => {
    const value = Number(num);
    const unit: DoseUnit = u === 'mL' ? 'ml' : (u as DoseUnit);
    const decimals = num.split('.')[1]?.length ?? 0;
    // Rewrite only a figure written at 2dp+ or one the display rule changes;
    // "0.5mg" and "1.5 mg" stay exactly as authored.
    if (!Number.isFinite(value) || (decimals < 2 && roundDoseForDisplay(value, unit) === value)) return whole;
    if (unit === 'mg' || unit === 'mcg') {
      const [n, shownUnit] = formatMassMcg(unit === 'mg' ? value * 1000 : value).split(' ');
      return `${n}${space}${shownUnit}`;
    }
    return `${roundDoseForDisplay(value, unit)}${space}${u}`;
  });
}

/**
 * The Quick dose reference pill text for one band: "min<sep>max", or a single
 * amount when the band is one dose.
 *
 * An authored band can be a single dose (SS-31: beginner 2 mg, advanced 5 mg),
 * which would otherwise print "2 mg – 2 mg". A derived thirds-split band always
 * has width unless the protocol's own min equals its max, and no protocol that
 * reaches the card has that (checked 2026-09-15 across all 41). Ends are
 * compared after display rounding; doseDisplayPrecision.test.ts fails if
 * rounding ever makes a derived band collapse or touch the other band.
 * Differs from formatDoseRange only in taking the separator, because the pill
 * prints " – " and its accessibility label " to ".
 */
export function formatDoseBand(range: DoseRange, sep: string): string {
  const lo = formatDoseAmount(range.min, range.unit);
  const hi = formatDoseAmount(range.max, range.unit);
  // Compared after rounding, so two ends that DISPLAY the same print once.
  return lo === hi ? lo : `${lo}${sep}${hi}`;
}

/** Format a range, collapsing to a single amount when both ends display the same. */
export function formatDoseRange(range: DoseRange): string {
  return formatDoseBand(range, '–');
}
