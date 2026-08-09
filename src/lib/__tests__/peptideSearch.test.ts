/**
 * Peptide search must find a compound by the name the user actually knows.
 *
 * 19 peptides carry an `aliases` array and not one of the app's seven search
 * implementations read it. MK-677 is called Ibutamoren almost everywhere;
 * searching that returned nothing. Same for Victoza/Saxenda (liraglutide),
 * GW501516 (cardarine), Coenzyme Q10, Ubiquinol, ALCAR. The answer was in the
 * data file the whole time.
 *
 * These run against the REAL catalog rather than fixtures, because the bug was
 * never in the matching logic — it was that the logic ignored a field the data
 * had populated. A fixture-only test would have passed throughout.
 */
import {
  normalizeQuery,
  peptideSearchTerms,
  matchesPeptideQuery,
  searchPeptides,
  findPeptideByQuery,
} from '../peptideSearch';
import { PEPTIDES } from '../../data/peptides';

const all = PEPTIDES as any[];
const byId = (id: string) => all.find((p) => p.id === id);

describe('the names people actually search', () => {
  it.each([
    ['Ibutamoren', 'mk-677'],
    ['MK-0677', 'mk-677'],
    ['Nutrobal', 'mk-677'],
    ['Victoza', 'liraglutide'],
    ['Saxenda', 'liraglutide'],
    ['GW501516', 'cardarine'],
    ['Endurobol', 'cardarine'],
    ['Coenzyme Q10', 'coq10'],
    ['Ubiquinol', 'coq10'],
    ['ALCAR', 'l-carnitine'],
    ['Methylthioninium chloride', 'methylene-blue'],
    ['Sobetirome', 'gc-1'],
  ])('%s finds %s', (query, expectedId) => {
    const hits = searchPeptides(all, query);
    expect(hits.map((p) => p.id)).toContain(expectedId);
  });

  it('every alias in the catalog is findable', () => {
    // The general form of the above. If someone adds an alias, it works.
    for (const p of all) {
      for (const alias of p.aliases ?? []) {
        expect(searchPeptides(all, alias).map((x) => x.id)).toContain(p.id);
      }
    }
  });

  it('at least a quarter of the library has aliases worth searching', () => {
    // Guards against the test passing vacuously if aliases were ever dropped.
    expect(all.filter((p) => p.aliases?.length).length).toBeGreaterThanOrEqual(15);
  });
});

describe('separator tolerance', () => {
  it.each([
    ['MOTSC', 'mots-c'],
    ['mots c', 'mots-c'],
    ['BPC157', 'bpc-157'],
    ['bpc 157', 'bpc-157'],
    ['TB500', 'tb-500'],
    ['GW 501516', 'cardarine'],
  ])('%s finds %s', (query, expectedId) => {
    expect(searchPeptides(all, query).map((p) => p.id)).toContain(expectedId);
  });

  it('normalizes to letters and digits only', () => {
    expect(normalizeQuery('MOTS-c')).toBe('motsc');
    expect(normalizeQuery('  CJC-1295 / Ipamorelin ')).toBe('cjc1295ipamorelin');
    expect(normalizeQuery('!!!')).toBe('');
  });
});

describe('still finds things the old matchers found', () => {
  // Regression guard: consolidating six implementations must not lose a
  // capability that one of them had.
  it('by full name', () => {
    expect(searchPeptides(all, 'Semaglutide').map((p) => p.id)).toContain('semaglutide');
  });
  it('by id, which only one screen supported', () => {
    expect(searchPeptides(all, 'ghk-cu').map((p) => p.id)).toContain('ghk-cu');
  });
  it('by abbreviation', () => {
    const withAbbrev = all.find((p) => p.abbreviation);
    expect(searchPeptides(all, withAbbrev.abbreviation).map((p) => p.id)).toContain(withAbbrev.id);
  });
  it('by partial word', () => {
    expect(searchPeptides(all, 'carnitine').length).toBeGreaterThan(0);
  });
  it('by category, only when asked', () => {
    const withCats = searchPeptides(all, 'Metabolic', { includeCategories: true });
    expect(withCats.length).toBeGreaterThan(5);
    // Off by default — in a name picker, category hits are noise.
    expect(searchPeptides(all, 'Metabolic').length).toBeLessThan(withCats.length);
  });
});

describe('empty and non-matching queries', () => {
  it('an empty query returns the whole library', () => {
    // Pickers render this state before anyone types. Returning [] would blank
    // the list; returning a truncated slice is how three screens hid 2/3 of
    // the catalog.
    expect(searchPeptides(all, '').length).toBe(all.length);
    expect(searchPeptides(all, '   ').length).toBe(all.length);
    expect(matchesPeptideQuery(byId('bpc-157'), '')).toBe(true);
  });

  it('a query matching nothing returns nothing', () => {
    expect(searchPeptides(all, 'zzzzz-not-a-peptide')).toEqual([]);
  });

  it('does not mutate or reorder the input', () => {
    const before = all.map((p) => p.id);
    const out = searchPeptides(all, '');
    expect(out.map((p) => p.id)).toEqual(before);
    expect(out).not.toBe(all);
  });
});

describe('single-answer resolution', () => {
  it('prefers an exact identifier over a substring', () => {
    // The precedence that matters for dose safety: resolving to whichever
    // peptide happens to sit first in the array would be a wrong-compound
    // guard.
    expect(findPeptideByQuery(all, 'mots-c')?.id).toBe('mots-c');
    expect(findPeptideByQuery(all, 'semaglutide')?.id).toBe('semaglutide');
  });

  it('resolves an alias to its peptide', () => {
    expect(findPeptideByQuery(all, 'Ibutamoren')?.id).toBe('mk-677');
    expect(findPeptideByQuery(all, 'Victoza')?.id).toBe('liraglutide');
  });

  it('returns null rather than guessing', () => {
    expect(findPeptideByQuery(all, 'zzzzz')).toBeNull();
    expect(findPeptideByQuery(all, '')).toBeNull();
    expect(findPeptideByQuery([], 'bpc-157')).toBeNull();
  });
});

describe('search terms', () => {
  it('include every identifier the peptide has', () => {
    const mk = byId('mk-677');
    const terms = peptideSearchTerms(mk);
    expect(terms).toContain('mk677');
    expect(terms).toContain('ibutamoren');
    expect(terms).toContain('nutrobal');
  });

  it('are deduplicated', () => {
    for (const p of all) {
      const terms = peptideSearchTerms(p);
      expect(new Set(terms).size).toBe(terms.length);
    }
  });

  it('are never empty for a real peptide', () => {
    for (const p of all) expect(peptideSearchTerms(p).length).toBeGreaterThan(0);
  });
});
