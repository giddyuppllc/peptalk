/**
 * Safety profiles transcribed from the Peptide Protocol Portal guides.
 *
 * Edward: "if the information exists in the peptide protocol portal we can use
 * it as our own data." It does — 69 of 70 guides carry contraindications,
 * adverse effects and monitoring parameters — and it is his own doctor-reviewed
 * clinical content, which is what makes this transcription rather than the
 * invention this app cannot afford.
 *
 *   peptides with a safety profile   15 → 54
 *   peptides with no safety info     48 → 10
 *
 * These tests guard the things that would be dangerous or embarrassing rather
 * than merely wrong, because this is clinical text rendered with the app's full
 * authority.
 */
import { PEPTIDES } from '../../data/peptides';
import {
  SAFETY_PROFILES,
  ALL_SAFETY_PROFILES,
  getSafetyProfileByPeptideId,
} from '../../data/safetyProfiles';
import { GUIDE_SAFETY_PROFILES } from '../../data/safetyProfilesFromGuides';

const peptideIds = new Set((PEPTIDES as any[]).map((p) => p.id));

describe('curated profiles stay authoritative', () => {
  it('a hand-written profile is never shadowed by a generated one', () => {
    // The whole safety of this import rests on lookup order. If a generated
    // entry ever won, reviewed clinical text would be silently replaced by
    // scraped text.
    for (const curated of SAFETY_PROFILES) {
      expect(getSafetyProfileByPeptideId(curated.peptideId)).toBe(curated);
    }
  });

  it('semaglutide keeps its black-box warning', () => {
    // A concrete instance of the above: the curated entry carries the FDA
    // thyroid C-cell black box; the guide-derived one has no such field.
    const p = getSafetyProfileByPeptideId('semaglutide');
    expect(p?.blackBoxWarnings?.length).toBeGreaterThan(0);
  });

  it('generated data never duplicates a curated peptide', () => {
    const curatedIds = new Set(SAFETY_PROFILES.map((p) => p.peptideId));
    for (const g of GUIDE_SAFETY_PROFILES) expect(curatedIds.has(g.peptideId)).toBe(false);
  });

  it('the combined list has one entry per peptide', () => {
    const ids = ALL_SAFETY_PROFILES.map((p) => p.peptideId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('every generated profile belongs to a real peptide', () => {
  it('no orphan peptideIds', () => {
    // Attaching one peptide's contraindications to a nonexistent id is how the
    // body-map and goal-matrix bugs worked; here it would also mean clinical
    // text going nowhere.
    for (const g of GUIDE_SAFETY_PROFILES) expect(peptideIds.has(g.peptideId)).toBe(true);
  });

  it('materially improves coverage', () => {
    const withProfile = (PEPTIDES as any[]).filter((p) => getSafetyProfileByPeptideId(p.id));
    expect(withProfile.length).toBeGreaterThanOrEqual(50);
    expect(SAFETY_PROFILES.length).toBe(15);
  });
});

describe('the text is clean enough to render', () => {
  const allLines = GUIDE_SAFETY_PROFILES.flatMap((p) => [
    ...p.contraindications,
    ...p.commonSideEffects,
    ...(p.monitoringRequired ?? []),
  ]);

  it('there is a meaningful amount of it', () => {
    expect(allLines.length).toBeGreaterThan(300);
  });

  it('no line is a dangling fragment', () => {
    // The first extraction split "<li>Personal or family history of
    // <strong>medullary thyroid carcinoma</strong></li>" into two bullets. A
    // bullet reading "Personal or family history of" on a safety screen is
    // worse than no bullet — it is a clause presented as a contraindication.
    for (const line of allLines) {
      expect(line.trim()).not.toMatch(/\b(of|or|and|with|the|a|an|in|to|for|from|by)$/i);
    }
  });

  it('no legal boilerplate leaked in', () => {
    // Absorbing child sections picks up whatever trails the safety block, and
    // in these guides that is a disclaimer. "Use at your own risk" is not a
    // monitoring parameter.
    for (const line of allLines) {
      expect(line).not.toMatch(/disclaimer|at your own risk|no representations|liabilit/i);
    }
  });

  it('no PPP branding leaked into PepTalk data', () => {
    // Separate products. Shipping one brand inside the other's data is the
    // same class of leak as the supplier note removed earlier this session.
    for (const line of allLines) {
      expect(line).not.toMatch(/Peptide Protocol Portal/i);
    }
  });

  it('no HTML survived the extraction', () => {
    for (const line of allLines) {
      expect(line).not.toMatch(/<[a-z/][^>]*>/i);
      expect(line).not.toMatch(/&(amp|lt|gt|nbsp|quot|#\d+);/i);
    }
  });

  it('no line is empty or absurdly long', () => {
    for (const line of allLines) {
      expect(line.trim().length).toBeGreaterThan(1);
      expect(line.length).toBeLessThanOrEqual(300);
    }
  });
});

describe('severity survives the flattening', () => {
  it('absolute and relative contraindications stay distinguishable', () => {
    // They land in a flat string[]. Without the prefix, "Pregnancy" and
    // "Gastroparesis" render identically and one of them is an absolute bar.
    const withPrefix = GUIDE_SAFETY_PROFILES.filter((p) =>
      p.contraindications.some((c) => /^Absolute:/.test(c)),
    );
    expect(withPrefix.length).toBeGreaterThan(20);
    for (const p of withPrefix) {
      // If any line is prefixed, every line in that profile is — a mix would
      // read as though unprefixed items were a third, unnamed category.
      for (const c of p.contraindications) {
        expect(c).toMatch(/^(Absolute|Relative):/);
      }
    }
  });

  it('a bare "Absolute" or "Relative" is never left as its own bullet', () => {
    for (const p of GUIDE_SAFETY_PROFILES) {
      for (const c of p.contraindications) {
        expect(c.trim()).not.toMatch(/^(Absolute|Relative)\s*:?\s*$/i);
      }
    }
  });
});
