/**
 * The "Today's planned dose" card: what it shows, and what one tap logs.
 *
 * WHY THIS FILE EXISTS
 * The card overrode the user's own protocol dose with the first step of the
 * reconstitution ladder, hardcoded to 'mcg', and printed it raw. Two defects
 * in three lines:
 *
 *   1. Raw `{amount} {unit}` — glutathione read "300000 mcg", NAD+
 *      "60000 mcg", MOTS-c "1000 mcg". That is the complaint doseUnits.ts's
 *      own header was written to answer, still on screen.
 *   2. Several of those ladder values are MIDPOINTS of a range. The reference
 *      file says so in its own comments ("60 mg midpoint of 20-100 mg", "mid
 *      of 200-400 mg"). A midpoint is not a prescription, and this card writes
 *      it to the dose log on a single tap.
 */
import fs from 'node:fs';
import path from 'node:path';

import { plannedDoseForProtocol } from '../plannedDose';
import { formatDoseAmount } from '../doseUnits';
import {
  PEPTIDE_DOSING_REFERENCE,
  getDosingReference,
  phaseStatesRange,
} from '../../data/peptideDosingReference';

describe('phaseStatesRange', () => {
  it('reads the stated wording, not the derived number', () => {
    // doseMcg is always a single number; only doseStated can tell a
    // prescription from a midpoint.
    expect(phaseStatesRange({ doseStated: '200-400 mg (1 unit ≈ 3 mg)' })).toBe(true);
    expect(phaseStatesRange({ doseStated: '20-100 mg (20-100 units)' })).toBe(true);
    expect(phaseStatesRange({ doseStated: '250–500 mcg daily' })).toBe(true);
    expect(phaseStatesRange({ doseStated: '0.5-1.5 mg, 30 min before desired time' })).toBe(true);
    expect(phaseStatesRange({ doseStated: '1 mg (30 units)' })).toBe(false);
    expect(phaseStatesRange({ doseStated: '333 mcg (10 units)' })).toBe(false);
    expect(phaseStatesRange({ doseStated: '5 mg' })).toBe(false);
    expect(phaseStatesRange({ doseStated: '' })).toBe(false);
  });

  it('finds the ranges that are actually in the reference (not vacuous)', () => {
    const firsts = PEPTIDE_DOSING_REFERENCE.map((e) => e.schedule?.[0]).filter(Boolean);
    expect(firsts.length).toBeGreaterThan(30);
    const ranges = firsts.filter((p) => phaseStatesRange(p!));
    expect(ranges.length).toBeGreaterThanOrEqual(10);
    expect(ranges.length).toBeLessThan(firsts.length); // and it is not matching everything
    const ids = PEPTIDE_DOSING_REFERENCE.filter((e) => e.schedule?.[0] && phaseStatesRange(e.schedule[0]))
      .map((e) => e.peptideId);
    for (const id of ['glutathione', 'nad-plus', 'melanotan-2', 'pt-141', 'semaglutide']) {
      expect(ids).toContain(id);
    }
    for (const id of ['mots-c', 'epithalon', 'bpc-157', 'ipamorelin']) {
      expect(ids).not.toContain(id);
    }
  });
});

describe('plannedDoseForProtocol', () => {
  it('keeps the user\'s own dose when the ladder step is a range midpoint', () => {
    // 300000 mcg is "mid of 200-400 mg" in the reference's own comment. The
    // user set 250 mg; that is the number they chose and the number logged.
    const p = plannedDoseForProtocol({ peptideId: 'glutathione', dose: 250, unit: 'mg' });
    expect(p).toEqual({ amount: 250, unit: 'mg', source: 'protocol' });

    const nad = plannedDoseForProtocol({ peptideId: 'nad-plus', dose: 50, unit: 'mg' });
    expect(nad).toEqual({ amount: 50, unit: 'mg', source: 'protocol' });
  });

  it('uses the ladder step when the source stated one dose', () => {
    const mots = plannedDoseForProtocol({ peptideId: 'mots-c', dose: 5, unit: 'mg' });
    expect(mots).toEqual({ amount: 1000, unit: 'mcg', source: 'ladder' });
  });

  it('falls back to the protocol when there is no reference at all', () => {
    expect(getDosingReference('zzz-not-a-peptide')).toBeNull();
    const p = plannedDoseForProtocol({ peptideId: 'zzz-not-a-peptide', dose: 400, unit: 'mcg' });
    expect(p).toEqual({ amount: 400, unit: 'mcg', source: 'protocol' });
  });

  it('never relabels a number: the unit always travels with its own figure', () => {
    // The old code hardcoded 'mcg' on the ladder branch AND took the
    // protocol's amount on the other, so a mg protocol dose could be shown in
    // mcg. Sweep every reference compound and assert the pairing holds.
    for (const entry of PEPTIDE_DOSING_REFERENCE) {
      const p = plannedDoseForProtocol({ peptideId: entry.peptideId, dose: 7, unit: 'mg' });
      if (p.source === 'ladder') {
        expect(p.unit).toBe('mcg');
        expect(p.amount).toBe(entry.schedule[0].doseMcg);
      } else {
        expect(p.unit).toBe('mg');
        expect(p.amount).toBe(7);
      }
    }
  });
});

describe('what the card renders', () => {
  it('rolls up to milligrams instead of printing five-digit microgram counts', () => {
    // The three live examples, before -> after.
    expect(formatDoseAmount(300000, 'mcg')).toBe('300 mg'); // was "300000 mcg"
    expect(formatDoseAmount(60000, 'mcg')).toBe('60 mg'); // was "60000 mcg"
    expect(formatDoseAmount(1000, 'mcg')).toBe('1 mg'); // was "1000 mcg"
    // ...and still shows micrograms where micrograms are the increment.
    expect(formatDoseAmount(333, 'mcg')).toBe('333 mcg');
    expect(formatDoseAmount(250, 'mg')).toBe('250 mg');
  });

  it('the screen renders through the formatter and reads the dose from the helper', () => {
    // A behavioural test of the helper cannot see a screen that stopped
    // calling it. This is the wiring, asserted on the real file.
    const file = path.join(__dirname, '..', '..', '..', 'app', '(tabs)', 'my-stacks.tsx');
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toContain('plannedDoseForProtocol(active.protocol)');
    expect(src).toContain('formatDoseAmount(slot.amount, slot.unit)');
    // No raw pair anywhere in the file — verify:doseformat enforces the same
    // rule across every screen; this pins the one that was wrong.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/\{\s*\w+\.(amount|dose)\s*\}\s*\{\s*\w+\.unit\s*\}/);
    expect(code).not.toMatch(/\$\{\s*\w+\.(amount|dose)\s*\}\s*\$\{\s*\w+\.unit\s*\}/);
  });
});
