/**
 * Safety-information-only compounds — Deno-side mirror.
 *
 * The decision, the reasoning and the authoritative list live in
 * `src/data/safetyOnlyCompounds.ts` (Edward, 2026-09-16). Edge functions run
 * on Deno and cannot import from `src/`, so the ids are repeated here.
 *
 * THE TWO COPIES ARE HELD EQUAL BY A TEST.
 * `src/lib/__tests__/safetyOnlyCompounds.test.ts` reads both files and fails if
 * they drift. A mirror nobody checks is the failure mode this repo has already
 * paid for — the app and the edge function disagreeing while both look right.
 *
 * Adding or removing a compound means editing BOTH arrays; the test names the
 * one you missed.
 */

export const SAFETY_ONLY_COMPOUND_IDS = [
  'cardarine',
  'yk-11',
  'mk-677',
  'dermorphin',
  'follistatin-344',
  'hcg',
  'hmg',
  'somatropin',
  'testosterone',
  'gonadorelin',
  'enclomiphene',
  'peg-mgf',
  'bam15',
  'foxo4-dri',
  'slu-pp-332',
  'aod-9604',
  '5-amino-1mq-inj',
] as const;

const SAFETY_ONLY_SET: ReadonlySet<string> = new Set<string>(SAFETY_ONLY_COMPOUND_IDS);

/**
 * True when this peptide id renders safety information only — no dose number
 * from any surface, including Aimee's tools.
 *
 * Tolerant of casing and whitespace: ids arrive here from model-authored tool
 * arguments, which are far less disciplined than catalog lookups.
 */
export function isSafetyOnly(peptideId: unknown): boolean {
  if (typeof peptideId !== 'string') return false;
  return SAFETY_ONLY_SET.has(peptideId.trim().toLowerCase());
}
