/**
 * Dosing-card coverage tests.
 *
 * `verify:data` warned "No dosing card will render for: …16 ids" on every run,
 * buried under 26 cosmetic warnings, and it went unread for months. Ten of
 * those had a complete protocol already — the card just read from a table with
 * no row for them, so the whole section silently vanished. Jamie hit it on
 * Cerebrolysin and asked for the dosing to be "on the actual dosing".
 *
 * These lock the derivation in, and — more importantly — lock in what it must
 * NOT do: override an explicit row, or invent a field the protocol never had.
 */
import { getDosingTableEntry } from '../../data/peptideDosingTable';

describe('dosing card — explicit rows always win', () => {
  it('uses the curated MOTS-c row, not a derived one', () => {
    // MOTS-c has BOTH an explicit row and protocols. If derivation ever took
    // precedence the card would show the protocol's 1000-2000 mcg instead of
    // the curated "1mg-2mg", and the two would drift apart again.
    expect(getDosingTableEntry('mots-c')?.dosingRange).toBe('1mg-2mg');
  });

  it('keeps curated cycle/frequency for an explicit row', () => {
    const e = getDosingTableEntry('mots-c');
    expect(e?.cycleLength).toBe('6-8 Weeks');
    expect(e?.frequencyWeekly).toBe('3x Weekly (Mon/Wed/Fri)');
  });
});

describe('dosing card — derived from protocol when no row exists', () => {
  it('cerebrolysin renders a card at all (it previously rendered none)', () => {
    const e = getDosingTableEntry('cerebrolysin');
    expect(e).not.toBeNull();
    expect(e?.dosingRange).toBeTruthy();
  });

  it('cerebrolysin shows ML, never micrograms', () => {
    // The whole reason Jamie flagged it: an ml dose was rendering as mcg.
    const e = getDosingTableEntry('cerebrolysin');
    expect(e?.dosingRange).toContain('ml');
    expect(e?.dosingRange).not.toContain('mcg');
  });

  it('carries the protocol frequency label verbatim', () => {
    expect(getDosingTableEntry('cerebrolysin')?.frequencyWeekly)
      .toBe('Daily for 10-20 days, repeated as courses');
  });

  it('IU protocols stay IU', () => {
    expect(getDosingTableEntry('hmg')?.dosingRange).toContain('IU');
    expect(getDosingTableEntry('oxytocin')?.dosingRange).toContain('IU');
  });
});

describe('dosing card — never invents what the protocol lacks', () => {
  it('omits timeOffBetweenCycles and fasted rather than guessing', () => {
    // A protocol carries neither. A wrong "Fasted: No" is worse than a blank —
    // it reads as researched fact.
    const e = getDosingTableEntry('cerebrolysin');
    expect(e?.timeOffBetweenCycles).toBeUndefined();
    expect(e?.fasted).toBeUndefined();
  });

  it('marks a derived row as not-pending with no note reference', () => {
    // titrationNoteRef indexes the master table's Notes [1..63] pages. A derived
    // row has no such page, so 0 — not a number that points at someone else's note.
    const e = getDosingTableEntry('cerebrolysin');
    expect(e?.titrationNoteRef).toBe(0);
    expect(e?.titrationNotePending).toBe(false);
  });

  it('returns null when there is neither a row nor a protocol', () => {
    // These are real content gaps and must stay visible as gaps, not be papered
    // over with an empty card.
    for (const id of ['liraglutide', 'noopept', 'humanin']) {
      expect(getDosingTableEntry(id)).toBeNull();
    }
  });

  it('returns null for an unknown id', () => {
    expect(getDosingTableEntry('not-a-real-peptide')).toBeNull();
    expect(getDosingTableEntry('')).toBeNull();
  });
});
