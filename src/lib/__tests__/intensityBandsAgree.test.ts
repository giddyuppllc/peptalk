/**
 * The two functions that answer "what dose does this intensity mean" must agree.
 *
 * `intensityToDoseRange` honoured a clinician's authored `doseBands`;
 * `intensityToDose` did not, and always split the typical range into thirds.
 * Found by review of PR #19.
 *
 * It renders consistently today only by luck: the one protocol with bands,
 * proto-ss31, authors {2,2} and {5,5}, which happen to be `typicalDose`'s own
 * extremes. The next protocol whose beginner band sits INSIDE a wider range
 * would put two different doses on one screen — the ActivationCard's TARGET
 * DOSE and the intensity picker reading the thirds split, the
 * Beginner/Advanced pill reading the authored figure — and the starter dose
 * handed to ActivateProtocolButton would be the wrong one of the two.
 *
 * `doseSanity`'s band-outside-range rule stays green through all of that,
 * because neither value is outside the range. They simply disagree.
 *
 * This is the same defect as Aimee's three private dosing copies, one level
 * down: a clinician authored a number and only some of the surfaces read it.
 */

import { intensityToDose, intensityToDoseRange } from '../protocolDoseMath';
import { PROTOCOL_TEMPLATES } from '../../data/protocols';
import type { ProtocolTemplate } from '../../types';

/**
 * A protocol whose authored bands sit strictly INSIDE the typical range, and
 * whose bands are WIDE.
 *
 * The width matters. proto-ss31 authors {2,2} and {5,5}, and the first draft of
 * this fixture copied that shape — so "mild takes the top of its band instead
 * of the bottom" changed nothing and survived the mutation run. A band with
 * min === max cannot tell the two ends apart, which is exactly why the original
 * defect hid behind the only protocol that has bands today.
 */
const banded = {
  id: 'test-banded',
  peptideId: 'test',
  name: 'Banded',
  typicalDose: { min: 1, max: 10, unit: 'mg' },
  doseBands: {
    beginner: { min: 2, max: 4 },
    advanced: { min: 6, max: 8 },
  },
  route: 'subcutaneous',
  frequency: 'daily',
  durationWeeks: { min: 4, max: 8 },
} as unknown as ProtocolTemplate;

/** The same protocol with no bands — the thirds split applies. */
const unbanded = {
  ...banded,
  id: 'test-unbanded',
  doseBands: undefined,
} as unknown as ProtocolTemplate;

describe('an authored band wins in both functions', () => {
  it('mild takes the BOTTOM of the authored beginner band, not the range minimum', () => {
    expect(intensityToDose(banded, 'mild').value).toBe(2000); // 2 mg in mcg
    // …and NOT 1 mg, which is what the thirds split would give.
    expect(intensityToDose(banded, 'mild').value).not.toBe(1000);
    // …and NOT the top of its own band, which is the aggressive end of a
    // gentle setting.
    expect(intensityToDose(banded, 'mild').value).not.toBe(4000);
  });

  it('aggressive takes the TOP of the authored advanced band, not the range maximum', () => {
    expect(intensityToDose(banded, 'aggressive').value).toBe(8000);
    expect(intensityToDose(banded, 'aggressive').value).not.toBe(10000);
    expect(intensityToDose(banded, 'aggressive').value).not.toBe(6000);
  });

  it('the single figure sits inside the range its sibling reports', () => {
    // This is the whole contract: one screen shows the pill range, another
    // shows the figure, and they must not contradict each other.
    for (const intensity of ['mild', 'aggressive'] as const) {
      const one = intensityToDose(banded, intensity);
      const range = intensityToDoseRange(banded, intensity);
      expect(one.value).toBeGreaterThanOrEqual(range.min);
      expect(one.value).toBeLessThanOrEqual(range.max);
    }
  });

  it('standard still uses the midpoint of the typical range, bands or not', () => {
    // Bands describe the ends. Standard is deliberately the middle of the
    // authored typical range and is not a band.
    expect(intensityToDose(banded, 'standard').value).toBe(
      intensityToDose(unbanded, 'standard').value,
    );
  });
});

describe('a protocol with no bands is unchanged', () => {
  it('still splits the typical range', () => {
    expect(intensityToDose(unbanded, 'mild').value).toBe(1000);
    expect(intensityToDose(unbanded, 'aggressive').value).toBe(10000);
    expect(intensityToDose(unbanded, 'standard').value).toBe(5500);
  });
});

describe('every real protocol agrees with itself', () => {
  it('the figure is inside the range for every protocol and every intensity', () => {
    // The regression this locks: a future protocol authoring bands inside a
    // wider typicalDose would previously make these disagree, silently.
    for (const p of PROTOCOL_TEMPLATES) {
      for (const intensity of ['mild', 'standard', 'aggressive'] as const) {
        const one = intensityToDose(p, intensity);
        const range = intensityToDoseRange(p, intensity);
        if (!Number.isFinite(one.value) || !Number.isFinite(range.min)) continue;
        expect({
          protocol: p.id,
          intensity,
          inRange: one.value >= range.min && one.value <= range.max,
        }).toEqual({ protocol: p.id, intensity, inRange: true });
      }
    }
  });

  it('proto-ss31 is the only protocol authoring bands today — and it is why this hid', () => {
    // Its bands equal typicalDose's extremes, so the old code and the new code
    // return the same figures for it. Recorded so nobody reads the passing
    // suite as evidence the old behaviour was fine.
    const withBands = PROTOCOL_TEMPLATES.filter((p) => (p as { doseBands?: unknown }).doseBands);
    expect(withBands.map((p) => p.id)).toEqual(['proto-ss31']);
  });
});
