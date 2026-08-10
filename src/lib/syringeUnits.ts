/**
 * Turning a dose into the number people actually read off a syringe.
 *
 * Edward: "the units were like mcg and weird shit — we just wanted increments
 * people would actually know."
 *
 * He is describing the dosing card on the peptide screen, which shows
 * "Dosing range: 200mcg-400mcg" and nothing else. For an injectable, mcg is not
 * the increment anyone acts on — the syringe is marked in units, and the user
 * has to convert a mass into a volume into a tick count, which is exactly the
 * arithmetic this app exists to do for them.
 *
 * The calculator has done it all along. The education card never did, even for
 * the 33 compounds where the app already knows the concentration.
 *
 * WHAT THIS DOES NOT DO
 * It never guesses a concentration. Units are shown ONLY where a curated
 * reconstitution reference exists, and the card states the reconstitution the
 * number assumes — "at 60mg in 3mL" — because a tick count is meaningless, and
 * dangerous, without the vial it was derived from. Someone reading "10 units"
 * who mixed their vial differently is being told the wrong dose with total
 * confidence, which is the retatrutide failure in a different costume.
 *
 * U-100 convention: 100 units = 1 mL, so 1 unit = 0.01 mL.
 */

/** Units per mL on a standard U-100 insulin syringe. */
export const UNITS_PER_ML = 100;

/**
 * Syringe units for a dose, given the reconstituted concentration.
 * Returns null when either input is unusable rather than an Infinity or a NaN
 * that would render as a number.
 */
export function doseToUnits(doseMcg: number, mgPerMl: number): number | null {
  if (!Number.isFinite(doseMcg) || !Number.isFinite(mgPerMl)) return null;
  if (doseMcg <= 0 || mgPerMl <= 0) return null;
  const doseMg = doseMcg / 1000;
  const ml = doseMg / mgPerMl;
  return ml * UNITS_PER_ML;
}

/**
 * Round for display.
 *
 * Half-unit precision below 10 units, whole units above. A syringe cannot be
 * read finer than about half a tick, and "6.37 units" implies a precision the
 * barrel does not have — while rounding 3.5 to 4 at the low end is a 14% dose
 * error on a small draw.
 */
export function roundUnits(units: number): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  return units < 10 ? Math.round(units * 2) / 2 : Math.round(units);
}

export interface UnitRange {
  min: number;
  max: number;
  /** "10 units" when min and max round the same, else "10-20 units". */
  label: string;
}

/**
 * The unit range for a dose range at a given concentration.
 *
 * Returns null when the dose is not mass-based. IU is an activity unit with no
 * peptide-agnostic mass conversion, and ml is already a volume — deriving ticks
 * from either would be inventing a number.
 */
export function unitRangeForDose(
  minMcg: number,
  maxMcg: number,
  mgPerMl: number,
): UnitRange | null {
  const lo = doseToUnits(minMcg, mgPerMl);
  const hi = doseToUnits(maxMcg, mgPerMl);
  if (lo === null || hi === null) return null;

  const min = roundUnits(Math.min(lo, hi));
  const max = roundUnits(Math.max(lo, hi));
  if (min <= 0 && max <= 0) return null;

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return {
    min,
    max,
    label: min === max ? `${fmt(min)} units` : `${fmt(min)}-${fmt(max)} units`,
  };
}

/**
 * How the concentration was arrived at, so the tick count is never presented
 * as a free-standing fact.
 */
export function reconstitutionNote(vialMg: number, diluentMl: number): string | null {
  if (!Number.isFinite(vialMg) || !Number.isFinite(diluentMl)) return null;
  if (vialMg <= 0 || diluentMl <= 0) return null;
  const trim = (n: number) => Number(n.toFixed(2)).toString();
  return `at ${trim(vialMg)}mg in ${trim(diluentMl)}mL`;
}

/**
 * Does the dosing TABLE's display string agree with the PROTOCOL's numbers?
 *
 * These are two independently authored sources and they disagree for 27 of the
 * 37 mass-dosed compounds — TB-500 is 330-1000mcg in the table and
 * 2000-5000mcg in the protocol, six times apart. Both reach the user, and on
 * the peptide screen both are rendered a few hundred pixels from each other.
 *
 * Nothing here picks a winner. Choosing between two clinical figures is not a
 * code decision, and the wrong choice is a dose error stated with the app's
 * full authority. This only answers "can these two be shown as one number?" —
 * and where the answer is no, the derived row is withheld and
 * verify:dosingconsistency reports the pair.
 *
 * Parsing is deliberately strict: exactly two numbers, one unit family. A range
 * it cannot read confidently returns false, because "unparseable" and
 * "agreeing" must never collapse into the same answer.
 */
export function tableAgreesWithProtocol(
  tableRange: string | undefined,
  protocolMinMcg: number,
  protocolMaxMcg: number,
  tolerancePct = 2,
): boolean {
  if (!tableRange) return false;

  const numbers = (tableRange.match(/[\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
  if (numbers.length !== 2) return false;

  // "250mcg-1mg" mixes units per side, so read each side's own suffix.
  const sides = tableRange.split(/[-–]/);
  if (sides.length !== 2) return false;

  const toMcg = (side: string, value: number): number | null => {
    const hasMcg = /mcg|µg/i.test(side);
    // No \b before "mg": in "0.25mg" the m follows a digit, and both are word
    // characters, so there is no boundary there. \bmg\b silently failed to
    // match every decimal-milligram range in the table — 17 of 37 compounds —
    // and "unparseable" was being counted separately from "disagrees", hiding
    // the largest discrepancies.
    const hasMg = /mg/i.test(side);
    if (hasMcg) return value;
    if (hasMg) return value * 1000;
    return null; // no unit on this side — inherit from the other
  };

  let lo = toMcg(sides[0], numbers[0]);
  let hi = toMcg(sides[1], numbers[1]);
  // A bare leading number ("250-500mcg") takes the trailing side's unit.
  if (lo === null && hi !== null) {
    lo = /mg/i.test(sides[1]) && !/mcg/i.test(sides[1]) ? numbers[0] * 1000 : numbers[0];
  }
  if (lo === null || hi === null) return false;

  const within = (a: number, b: number) => {
    if (a === b) return true;
    const denom = Math.max(Math.abs(a), Math.abs(b));
    return denom > 0 && (Math.abs(a - b) / denom) * 100 <= tolerancePct;
  };
  return within(lo, protocolMinMcg) && within(hi, protocolMaxMcg);
}
