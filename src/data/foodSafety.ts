/**
 * Food safety windows — based on USDA FoodSafety.gov guidelines.
 *
 * These are defaults. Users can override per category via the Food Safety
 * settings screen; overrides live in useMealStore.foodSafetyOverrides.
 *
 * Reference: https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts
 */

export type ProteinCategory =
  | 'chicken'
  | 'beef'
  | 'pork'
  | 'fish'
  | 'eggs'
  | 'vegetarian'
  | 'other';

export type StorageMethod = 'fridge' | 'freezer' | 'pantry';

export interface SafetyWindow {
  /** Max safe days stored in the fridge after cooking/prep */
  fridgeDays: number;
  /** Max safe months stored in the freezer (approximate, quality-based) */
  freezerMonths: number;
  /**
   * "High-risk" categories (poultry, seafood, eggs) get a proactive
   * "consider freezing" nudge 1 day earlier than lower-risk proteins.
   */
  highRisk: boolean;
}

export const DEFAULT_SAFETY_WINDOWS: Record<ProteinCategory, SafetyWindow> = {
  chicken:    { fridgeDays: 3, freezerMonths: 4, highRisk: true },
  fish:       { fridgeDays: 3, freezerMonths: 3, highRisk: true },
  eggs:       { fridgeDays: 3, freezerMonths: 0, highRisk: true }, // cooked eggs don't freeze well
  pork:       { fridgeDays: 4, freezerMonths: 3, highRisk: false },
  beef:       { fridgeDays: 4, freezerMonths: 4, highRisk: false },
  vegetarian: { fridgeDays: 5, freezerMonths: 3, highRisk: false },
  other:      { fridgeDays: 4, freezerMonths: 3, highRisk: false },
};

export const PROTEIN_CATEGORY_LABELS: Record<ProteinCategory, string> = {
  chicken:    'Chicken / poultry',
  fish:       'Fish / seafood',
  eggs:       'Eggs',
  pork:       'Pork',
  beef:       'Beef',
  vegetarian: 'Vegetarian',
  other:      'Other',
};

export type SafetyStatus = 'fresh' | 'freeze_soon' | 'expiring' | 'expired';

export interface SafetyStatusInfo {
  status: SafetyStatus;
  daysUntilExpiry: number; // negative = already expired
  safeUntil: string;       // ISO date
  freezeBy?: string;       // ISO date, only set if highRisk + still in safe window
  shouldNotify: boolean;   // fire a local notification on next daily tick
  message: string;         // one-line user-facing summary
}

/**
 * Compute the safety status of a meal made on `dateMade`, given the
 * protein category, how it's stored, and the current date.
 *
 * Behavior:
 *   - `storageMethod === 'freezer'`: months-scale, returns `fresh` within
 *     the freezer window and `expiring` near the end.
 *   - `storageMethod === 'pantry'`: delegates to the category's fridge
 *     window for simplicity (shelf-stable items should be tracked via
 *     the pantry store, not meal preps).
 *   - Otherwise fridge rules apply.
 */
export function computeSafetyStatus(
  dateMade: string,
  protein: ProteinCategory,
  storage: StorageMethod,
  window: SafetyWindow = DEFAULT_SAFETY_WINDOWS[protein],
  now: Date = new Date(),
): SafetyStatusInfo {
  const made = new Date(dateMade);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSince = Math.floor((now.getTime() - made.getTime()) / msPerDay);

  if (storage === 'freezer') {
    const freezerDays = window.freezerMonths * 30;
    const daysLeft = freezerDays - daysSince;
    const safeUntil = new Date(made.getTime() + freezerDays * msPerDay).toISOString().slice(0, 10);
    if (daysLeft < 0) {
      return {
        status: 'expired',
        daysUntilExpiry: daysLeft,
        safeUntil,
        shouldNotify: true,
        message: `Frozen ${Math.abs(daysLeft)} days past the quality window. Safe to eat if kept frozen, but quality has declined.`,
      };
    }
    if (daysLeft <= 14) {
      return {
        status: 'expiring',
        daysUntilExpiry: daysLeft,
        safeUntil,
        shouldNotify: true,
        message: `In freezer ~${Math.round(daysSince / 7)} weeks — use within the next ${daysLeft} days for best quality.`,
      };
    }
    return {
      status: 'fresh',
      daysUntilExpiry: daysLeft,
      safeUntil,
      shouldNotify: false,
      message: `Frozen ${daysSince} days ago. Good for ~${Math.round(daysLeft / 30)} more months.`,
    };
  }

  const safeDays = window.fridgeDays;
  const daysLeft = safeDays - daysSince;
  const safeUntil = new Date(made.getTime() + safeDays * msPerDay).toISOString().slice(0, 10);
  const freezeBy =
    window.highRisk && daysLeft >= 1
      ? new Date(made.getTime() + (safeDays - 1) * msPerDay).toISOString().slice(0, 10)
      : undefined;

  if (daysLeft < 0) {
    return {
      status: 'expired',
      daysUntilExpiry: daysLeft,
      safeUntil,
      shouldNotify: true,
      message: `Past safe window by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}. Throw it out.`,
    };
  }
  if (daysLeft === 0) {
    return {
      status: 'expiring',
      daysUntilExpiry: 0,
      safeUntil,
      freezeBy,
      shouldNotify: true,
      message: 'Eat or freeze today — this is the last safe day.',
    };
  }
  if (daysLeft === 1) {
    return {
      status: 'expiring',
      daysUntilExpiry: 1,
      safeUntil,
      freezeBy,
      shouldNotify: true,
      message: 'Expires tomorrow. Eat today or freeze the leftover.',
    };
  }
  if (window.highRisk && daysLeft === 2) {
    return {
      status: 'freeze_soon',
      daysUntilExpiry: 2,
      safeUntil,
      freezeBy,
      shouldNotify: true,
      message: 'Consider freezing the portion you won\'t eat in the next day or two.',
    };
  }
  return {
    status: 'fresh',
    daysUntilExpiry: daysLeft,
    safeUntil,
    freezeBy,
    shouldNotify: false,
    message: `Good for ${daysLeft} more day${daysLeft === 1 ? '' : 's'} in the fridge.`,
  };
}

/**
 * Status color + label for UI badges.
 */
export function statusBadge(status: SafetyStatus): { color: string; label: string } {
  switch (status) {
    case 'fresh':       return { color: '#15803D', label: 'Fresh' };
    case 'freeze_soon': return { color: '#B45309', label: 'Freeze soon' };
    case 'expiring':    return { color: '#B45309', label: 'Expiring' };
    case 'expired':     return { color: '#B91C1C', label: 'Expired' };
  }
}
