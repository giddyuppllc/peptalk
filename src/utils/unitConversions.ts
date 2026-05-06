/**
 * Unit conversions — pair every "non-standard for the user's region" unit
 * with its everyday equivalent.
 *
 * The app's primitives are metric (mL, mg, mcg, g, °C) because that's what
 * peptide vials, syringes, and food databases use. But most US users think
 * in teaspoons, ounces, and pounds. Rather than make them convert in their
 * head, we always show both — metric is authoritative, imperial in
 * parentheses behind it.
 *
 * Usage:
 *   formatVolumeBoth(4.0)        → "4.0 mL (≈0.81 tsp)"
 *   formatWeightBoth(170)        → "170 g (≈6.0 oz)"
 *   formatTempBoth(2)            → "2 °C (≈36 °F)"
 *   formatBodyWeightBoth(82, 'kg') → "82 kg (≈181 lb)"
 *
 * The leading value is always the source unit so existing UI doesn't
 * shift; the parenthetical is the conversion the "for-morons" reader
 * needs.
 */

// ── Volume ────────────────────────────────────────────────────────────────

export const ML_PER_TSP = 4.92892;
export const ML_PER_TBSP = 14.7868;
export const ML_PER_FL_OZ = 29.5735;
export const ML_PER_CUP = 240;

export function mlToTsp(ml: number): number {
  return ml / ML_PER_TSP;
}
export function mlToFlOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

/**
 * Pick the cleanest household measure for a given mL volume:
 *   < 5 mL    → drops (skip — confusing in app context, fall back to tsp)
 *   < 30 mL   → tsp
 *   < 240 mL  → tbsp / fl oz (whichever is closer to a whole number)
 *   ≥ 240 mL  → cups
 */
export function formatVolumeBoth(ml: number): string {
  if (!isFinite(ml) || ml <= 0) return '0 mL';
  if (ml < 30) {
    const tsp = mlToTsp(ml);
    const display = tsp < 1 ? tsp.toFixed(2) : tsp.toFixed(1);
    return `${ml.toFixed(1)} mL (≈${display} tsp)`;
  }
  if (ml < 240) {
    const flOz = mlToFlOz(ml);
    return `${ml.toFixed(0)} mL (≈${flOz.toFixed(1)} fl oz)`;
  }
  const cups = ml / ML_PER_CUP;
  return `${ml.toFixed(0)} mL (≈${cups.toFixed(2)} cups)`;
}

// ── Weight (grams ↔ ounces ↔ pounds) ─────────────────────────────────────

export const G_PER_OZ = 28.3495;
export const G_PER_LB = 453.592;
export const KG_PER_LB = 0.453592;

export function gToOz(g: number): number {
  return g / G_PER_OZ;
}
export function ozToG(oz: number): number {
  return oz * G_PER_OZ;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/**
 * Food-portion weights — switch to lb at threshold so plates of meat
 * (>16 oz) read naturally.
 */
export function formatWeightBoth(g: number): string {
  if (!isFinite(g) || g <= 0) return '0 g';
  if (g < 28) {
    return `${g.toFixed(1)} g (≈${gToOz(g).toFixed(2)} oz)`;
  }
  if (g < G_PER_LB) {
    return `${g.toFixed(0)} g (≈${gToOz(g).toFixed(1)} oz)`;
  }
  const lb = g / G_PER_LB;
  return `${g.toFixed(0)} g (≈${lb.toFixed(2)} lb)`;
}

/** Body weight conversion — primary unit is the user's choice. */
export function formatBodyWeightBoth(value: number, primary: 'kg' | 'lbs'): string {
  if (!isFinite(value) || value <= 0) return '0';
  if (primary === 'kg') {
    return `${value.toFixed(1)} kg (≈${kgToLb(value).toFixed(0)} lb)`;
  }
  return `${value.toFixed(0)} lb (≈${lbToKg(value).toFixed(1)} kg)`;
}

// ── Temperature ───────────────────────────────────────────────────────────

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}
export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function formatTempBoth(c: number): string {
  if (!isFinite(c)) return '';
  return `${c.toFixed(0)} °C (≈${cToF(c).toFixed(0)} °F)`;
}

// ── Length ────────────────────────────────────────────────────────────────

export const CM_PER_IN = 2.54;
export const CM_PER_FT = 30.48;

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}
export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}
export function cmToFtIn(cm: number): { ft: number; inRemainder: number } {
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  const inRemainder = totalIn - ft * 12;
  return { ft, inRemainder };
}

export function formatHeightBoth(cm: number, primary: 'cm' | 'in'): string {
  if (!isFinite(cm) || cm <= 0) return '';
  if (primary === 'cm') {
    const { ft, inRemainder } = cmToFtIn(cm);
    return `${cm.toFixed(0)} cm (≈${ft}'${inRemainder.toFixed(0)}")`;
  }
  return `${cmToIn(cm).toFixed(1)} in (≈${cm.toFixed(0)} cm)`;
}

// ── Energy ────────────────────────────────────────────────────────────────

export const KJ_PER_KCAL = 4.184;

export function kcalToKj(kcal: number): number {
  return kcal * KJ_PER_KCAL;
}

/**
 * Calories are universal in nutrition apps so we don't typically dual-show.
 * Provided for completeness.
 */
export function formatEnergyBoth(kcal: number): string {
  if (!isFinite(kcal)) return '0 kcal';
  return `${kcal.toFixed(0)} kcal (≈${kcalToKj(kcal).toFixed(0)} kJ)`;
}
