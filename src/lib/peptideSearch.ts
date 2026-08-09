/**
 * One place that decides whether a query matches a peptide.
 *
 * THE BUG THIS FIXES
 * 19 of the 79 peptides carry an `aliases` array — the names people actually
 * use. Not one of the seven search implementations in the app read it:
 *
 *   app/(tabs)/my-stacks.tsx      name + abbreviation
 *   app/calculators/quick-dose    name + id + abbreviation
 *   app/doses/library.tsx         name + abbreviation
 *   app/doses/stack-builder.tsx   name + abbreviation + category
 *   src/services/peptalkBot.ts    name + id + abbreviation + a hardcoded list
 *   src/services/doseSafety.ts    name + id + abbreviation
 *
 * So searching MK-677 by "Ibutamoren" — which is what it is called almost
 * everywhere — returned nothing. Same for Victoza and Saxenda (liraglutide),
 * GW501516 (cardarine), Coenzyme Q10, Ubiquinol, Methylthioninium chloride,
 * ALCAR. In an app whose job is teaching people about these compounds, the
 * search failed on exactly the name a newcomer arrives with, and the data to
 * answer it was sitting in the file.
 *
 * Six near-identical matchers is also how they drifted apart: only one of them
 * searched `id`, only one searched categories, and only the bot handled
 * "bpc157" without the dash. Consolidating means the next field added to a
 * peptide is searchable everywhere at once instead of in whichever screen the
 * author happened to be editing.
 *
 * Pure and dependency-free so it is directly testable — same reason
 * routeGuard, streamUrl, doseUnits and alertDispatch were pulled out.
 */

/** Minimal shape this module needs. Keeps it usable from tests and scripts. */
export interface SearchablePeptide {
  id: string;
  name: string;
  abbreviation?: string;
  aliases?: string[];
  categories?: string[];
}

/**
 * Fold a string to its comparable form: lowercase, letters and digits only.
 *
 * Dropping separators is what makes "MOTSC" find "MOTS-c", "BPC157" find
 * "BPC-157" and "GW 501516" find "GW501516" — users do not reproduce
 * hyphenation, and requiring them to is a search that only works if you
 * already know the answer.
 */
export function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Every string this peptide can be found by, normalized.
 * Ordered most-canonical first so callers can rank if they want to.
 */
export function peptideSearchTerms(p: SearchablePeptide): string[] {
  const terms = [p.name, p.id, p.abbreviation, ...(p.aliases ?? [])];
  const out: string[] = [];
  for (const t of terms) {
    if (!t) continue;
    const n = normalizeQuery(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Does this peptide match the query?
 *
 * Substring, not prefix: someone typing "carnitine" should find
 * Acetyl-L-Carnitine, and someone typing "glutathione" should find it inside a
 * longer blend name. An empty query matches everything, which is what a picker
 * with no text typed should show.
 *
 * `includeCategories` is opt-in because it changes what a result MEANS — in
 * the stack builder, typing "recovery" listing every recovery peptide is the
 * point; in a picker where you are looking for one compound by name it is
 * noise.
 */
export function matchesPeptideQuery(
  p: SearchablePeptide,
  query: string,
  opts: { includeCategories?: boolean } = {},
): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  if (peptideSearchTerms(p).some((t) => t.includes(q))) return true;
  if (opts.includeCategories) {
    return (p.categories ?? []).some((c) => normalizeQuery(c).includes(q));
  }
  return false;
}

/** Filter a list. Preserves input order — callers control sorting. */
export function searchPeptides<T extends SearchablePeptide>(
  peptides: readonly T[],
  query: string,
  opts: { includeCategories?: boolean } = {},
): T[] {
  const q = normalizeQuery(query);
  if (!q) return [...peptides];
  return peptides.filter((p) => matchesPeptideQuery(p, q, opts));
}

/**
 * Resolve a query to ONE peptide, for callers that need an answer rather than
 * a list — Aimee working out which compound was asked about, dose-safety
 * looking up guards for a logged substance.
 *
 * Precedence is deliberate and must not be reordered casually: an exact hit on
 * a real identifier always beats a substring. Without that, a query of "gh"
 * could resolve to whichever peptide happens to sit first in the array, and
 * for dose safety that is a wrong-compound guard.
 */
export function findPeptideByQuery<T extends SearchablePeptide>(
  peptides: readonly T[],
  query: string,
): T | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  const exact = peptides.find((p) => peptideSearchTerms(p).includes(q));
  if (exact) return exact;
  const partial = peptides.find((p) => peptideSearchTerms(p).some((t) => t.includes(q)));
  return partial ?? null;
}
