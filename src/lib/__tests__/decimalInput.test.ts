/**
 * Anchored on the real failure: decimal-pad keyboards render the LOCALE's
 * decimal separator, and parseFloat stops at a comma. Every case below was a
 * silently wrong dose before this parser existed.
 */
import { parseDecimalInput, parseDecimalOrNull } from '../decimalInput'

describe('comma decimal separator — the actual bug', () => {
  it('reads a comma as a decimal point', () => {
    // parseFloat('1,5') === 1 — a 33% underdose.
    expect(parseDecimalOrNull('1,5')).toBe(1.5)
    expect(parseDecimalOrNull('2,5')).toBe(2.5)
  })

  it('does not collapse a sub-1 dose to zero', () => {
    // parseFloat('0,25') === 0 — the dose disappears.
    expect(parseDecimalOrNull('0,25')).toBe(0.25)
  })

  it('still reads a normal decimal point', () => {
    expect(parseDecimalOrNull('1.5')).toBe(1.5)
    expect(parseDecimalOrNull('0.25')).toBe(0.25)
    expect(parseDecimalOrNull('250')).toBe(250)
  })
})

describe('ambiguity is refused, never guessed', () => {
  it('refuses "1,200" — 1200 or 1.2 depending on locale', () => {
    const r = parseDecimalInput('1,200')
    expect(r.value).toBeNull()
    expect(r.problem).toBe('ambiguous-separator')
  })

  it('accepts unambiguous grouping in either convention', () => {
    expect(parseDecimalOrNull('1,200.50')).toBe(1200.5)
    expect(parseDecimalOrNull('1.200,50')).toBe(1200.5)
    expect(parseDecimalOrNull('1,200,000')).toBe(1200000)
  })

  it('a leading comma is a decimal, not ambiguous', () => {
    expect(parseDecimalOrNull(',5')).toBe(0.5)
  })
})

describe('rubbish is reported, not silently zeroed', () => {
  it.each([
    ['', 'empty'],
    ['abc', 'not-a-number'],
    ['-5', 'negative'],
  ])('%s -> %s', (input, problem) => {
    const r = parseDecimalInput(input)
    expect(r.value).toBeNull()
    expect(r.problem).toBe(problem)
  })

  it('tolerates a unit typed alongside the number', () => {
    expect(parseDecimalOrNull('5mg')).toBe(5)
    expect(parseDecimalOrNull('2,5 mg')).toBe(2.5)
  })

  it('passes finite numbers through unchanged', () => {
    expect(parseDecimalOrNull(2.5)).toBe(2.5)
    expect(parseDecimalOrNull(0)).toBe(0)
  })
})
