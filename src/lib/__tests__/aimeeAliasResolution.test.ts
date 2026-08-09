/**
 * Does Aimee recognise a compound by the name the user actually types?
 *
 * She builds her own PEPTIDE_ALIASES map (name + id + abbreviation + a
 * hardcoded shorthand list) and never read the catalog's own `aliases` field,
 * which is populated on 19 peptides. So "Ibutamoren" — what MK-677 is called
 * nearly everywhere — resolved to no compound at all.
 *
 * The failure mode is the bad one: she does not say "I don't know that one".
 * `findMentionedPeptides` returns an empty array, `detectIntent` falls through
 * to a generic branch, and the user gets a plausible general answer about
 * peptides. That reads as "this app doesn't cover Ibutamoren" rather than
 * "Aimee didn't recognise the name", which is how a request to ADD something
 * that already exists gets generated.
 *
 * Tested end-to-end through generateLocalBotResponse as well as the resolver,
 * because the resolver returning the right id is only half the claim — the
 * point is that the reply is about the right compound.
 */
import {
  findMentionedPeptides,
  generateLocalBotResponse,
} from '../../services/peptalkBot';
import { PEPTIDES } from '../../data/peptides';

const ctx: any = { userProfile: null, checkIns: [], doseLogs: [], stacks: [] };

describe('Aimee resolves a compound by its catalog aliases', () => {
  it.each([
    ['Ibutamoren', 'mk-677'],
    ['MK-0677', 'mk-677'],
    ['Nutrobal', 'mk-677'],
    ['Victoza', 'liraglutide'],
    ['Saxenda', 'liraglutide'],
    ['GW501516', 'cardarine'],
    ['Endurobol', 'cardarine'],
    ['Ubiquinol', 'coq10'],
    ['Sobetirome', 'gc-1'],
  ])('"tell me about %s" resolves to %s', (alias, expectedId) => {
    const found = findMentionedPeptides(`tell me about ${alias}`);
    expect(found.map((p) => p.id)).toContain(expectedId);
  });

  it('every alias in the catalog resolves to its own peptide', () => {
    // The general claim, not a sample. Aliases shorter than 3 characters are
    // skipped by findMentionedPeptides on purpose — a 2-letter token matches
    // half the dictionary — so they are excluded here rather than asserted.
    for (const p of PEPTIDES as any[]) {
      for (const alias of p.aliases ?? []) {
        if (alias.replace(/[^a-z0-9]/gi, '').length < 3) continue;
        const found = findMentionedPeptides(`what is ${alias}`);
        expect(found.map((x) => x.id)).toContain(p.id);
      }
    }
  });

  it('still resolves the names that already worked', () => {
    // Regression guard: adding aliases must not disturb the existing map.
    for (const [q, id] of [
      ['BPC-157', 'bpc-157'],
      ['bpc157', 'bpc-157'],
      ['semaglutide', 'semaglutide'],
      ['MOTS-c', 'mots-c'],
    ] as const) {
      expect(findMentionedPeptides(`tell me about ${q}`).map((p) => p.id)).toContain(id);
    }
  });

  it('a shared alias returns BOTH compounds, not an arbitrary one', () => {
    // "alpha-MSH (11-13)" is the same tripeptide in two delivery routes, so it
    // legitimately names both. The alias map used to be Map<string, string>,
    // so whichever was written last won and the injectable form was
    // unreachable by that name — a materially wrong answer for a compound
    // whose entire distinction IS the route.
    const found = findMentionedPeptides('what is alpha-MSH (11-13)').map((p) => p.id);
    expect(found).toContain('kpv-inj');
    expect(found).toContain('kpv-oral');
  });

  it('does not resolve a name that is not a compound', () => {
    expect(findMentionedPeptides('tell me about the weather')).toEqual([]);
    expect(findMentionedPeptides('')).toEqual([]);
  });
});

describe('the REPLY is about the right compound, not just the lookup', () => {
  it('answers about MK-677 when asked about Ibutamoren', () => {
    const reply = generateLocalBotResponse('tell me about Ibutamoren', ctx);
    const mk = (PEPTIDES as any[]).find((p) => p.id === 'mk-677');
    // The name of the actual compound has to appear in what she says back.
    // Before the fix this produced a generic peptide answer that never named
    // MK-677 at all.
    expect(reply.content).toContain(mk.name);
  });

  it('answers about liraglutide when asked about Victoza', () => {
    const reply = generateLocalBotResponse('what is Victoza used for', ctx);
    const lira = (PEPTIDES as any[]).find((p) => p.id === 'liraglutide');
    expect(reply.content).toContain(lira.name);
  });

  it('returns a non-empty reply either way', () => {
    // Guards the test itself: a bot that returned '' would pass a `.toContain`
    // check for nothing but fail a real user.
    for (const q of ['tell me about Ibutamoren', 'tell me about the weather']) {
      expect(generateLocalBotResponse(q, ctx).content.length).toBeGreaterThan(20);
    }
  });
});
