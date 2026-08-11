/**
 * Parse a number a human typed into a dose field.
 *
 * WHY THIS EXISTS
 * The calculators call `parseFloat()` directly on TextInput values, and those
 * inputs use `keyboardType="decimal-pad"` / `"numeric"` — which render the
 * LOCALE's decimal separator. Across most of Europe and Latin America that is a
 * comma, and `parseFloat` stops dead at it:
 *
 *     "1,5"   -> 1     a 33% underdose
 *     "2,5"   -> 2     a 20% underdose
 *     "0,25"  -> 0     the dose collapses to zero
 *
 * No comma handling existed anywhere in the app. In a price box that is
 * embarrassing; in a peptide dosing calculator it is a wrong dose delivered
 * with total confidence — the same failure shape as the retatrutide unit bug.
 *
 * AMBIGUITY IS REFUSED, NOT GUESSED
 * "1,200" is 1200 to an American and 1.2 to a German, and nothing in the string
 * says which. Guessing means a 1000x dose error in one direction or the other,
 * so that input returns null and the caller must ask. Everything unambiguous is
 * accepted, including "$"-free grouping like "1,200.50" and "1.200,50".
 */

export interface DecimalParse {
  value: number | null
  /** Set when the input cannot be read safely — show it, do not silently zero. */
  problem?: 'empty' | 'ambiguous-separator' | 'not-a-number' | 'negative'
}

export function parseDecimalInput(raw: string | number | null | undefined): DecimalParse {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw } : { value: null, problem: 'not-a-number' }
  }

  const trimmed = String(raw ?? '').trim().replace(/\s+/g, '');
  if (trimmed === '') return { value: null, problem: 'empty' }

  // Keep only digits and separators; a stray unit ("5mg") is not a reason to
  // refuse a dose the user clearly meant.
  const cleaned = trimmed.replace(/[^0-9.,-]/g, '')
  if (cleaned === '' || cleaned === '-') return { value: null, problem: 'not-a-number' }

  const dots = (cleaned.match(/\./g) ?? []).length
  const commas = (cleaned.match(/,/g) ?? []).length

  let normalised: string
  if (dots > 0 && commas > 0) {
    // Both present: whichever comes LAST is the decimal separator, the other is
    // grouping. Handles "1.200,50" and "1,200.50" alike.
    const decimalIsComma = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    normalised = decimalIsComma
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else if (commas > 1) {
    // "1,200,000" — only grouping makes sense with repeated commas.
    normalised = cleaned.replace(/,/g, '')
  } else if (commas === 1) {
    const after = cleaned.length - cleaned.indexOf(',') - 1
    const before = cleaned.indexOf(',')
    // Exactly three digits after a single comma, with digits before it, is the
    // genuinely ambiguous case: 1,200 = 1200 (en) or 1.2 (de). Refuse it.
    if (after === 3 && before > 0) return { value: null, problem: 'ambiguous-separator' }
    normalised = cleaned.replace(',', '.')
  } else {
    normalised = cleaned
  }

  const n = Number(normalised)
  if (!Number.isFinite(n)) return { value: null, problem: 'not-a-number' }
  if (n < 0) return { value: null, problem: 'negative' }
  return { value: n }
}

/**
 * Convenience for the many call sites that only need a number and already
 * treat 0/blank as "not entered yet". Ambiguous input still yields null so it
 * can never silently become a plausible-but-wrong dose.
 */
export function parseDecimalOrNull(raw: string | number | null | undefined): number | null {
  return parseDecimalInput(raw).value
}

/** Human-readable reason, for showing next to the field. */
export function decimalProblemMessage(problem: DecimalParse['problem']): string | null {
  switch (problem) {
    case 'ambiguous-separator':
      return 'Is that a decimal point or a thousands separator? Write it as 1200 or 1.2.'
    case 'negative':
      return 'Enter a positive number.'
    case 'not-a-number':
      return 'Enter a number, e.g. 2.5';
    default:
      return null
  }
}
