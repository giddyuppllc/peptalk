/**
 * Canonical dosing — ONE place every consumer asks "what dose is right for
 * this compound, and how much do we trust it?"
 *
 * WHY THIS EXISTS
 * PepTalk stored a dose for the same compound in three files, all of which
 * reached users and none of which agreed:
 *
 *   1. peptideDosingReference.ts  PEPTIDE_DOSING_REFERENCE — the reconstitution
 *      ladder. THE ONLY SELF-VERIFYING SOURCE: it stores vial mg, diluent mL,
 *      syringe units AND the resulting mcg, so the arithmetic can be checked
 *      from inside the app.
 *   2. peptideDosingTable.ts      PEPTIDE_DOSING_TABLE — verbatim transcription
 *      of one page of an eleven-page photographed reference. Real provenance,
 *      but a transcription: NAD+ is recorded 100x off.
 *   3. protocols.ts               PROTOCOL_TEMPLATES — uncited. Its `source`
 *      field is one of two placeholder strings; zero PMIDs or DOIs in the file.
 *
 * The least attributable of the three drove the most behaviour — including the
 * overdose guard. This module inverts that: consumers ask HERE, and get the
 * best-attributed number plus the provenance behind it.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not invent a clinical winner. Where sources disagree it says so
 * (`conflict: true`) and reports every value it saw, so a human can adjudicate.
 * Choosing between two clinical figures is a clinician's call and the wrong
 * choice is a dose error carrying the app's full authority.
 */

import { PEPTIDE_DOSING_REFERENCE } from './peptideDosingReference';
import { PEPTIDE_DOSING_TABLE } from './peptideDosingTable';
import { PROTOCOL_TEMPLATES } from './protocols';

export type DoseSourceId = 'reconstitution_ladder' | 'master_table' | 'protocols';

/**
 * Precedence. Ladder first because it is the only source whose numbers can be
 * checked without trusting the author: concentration x volume must equal the
 * stated dose. Table second — a real document, but transcribed by hand.
 * protocols.ts last because it cites nothing.
 *
 * This ordering is the one rule in this file. Change it here and every
 * consumer follows.
 */
export const SOURCE_PRECEDENCE: DoseSourceId[] = [
  'reconstitution_ladder',
  'master_table',
  'protocols',
];

/** Human-facing provenance, safe to show in the UI. */
export const SOURCE_LABEL: Record<DoseSourceId, string> = {
  reconstitution_ladder: 'Reconstitution reference',
  master_table: 'Master dosing table',
  protocols: 'Protocol template',
};

export interface SourceRange {
  source: DoseSourceId;
  minMcg: number;
  maxMcg: number;
  /** True only for the ladder, whose arithmetic is checkable in-app. */
  selfVerifying: boolean;
}

export interface CanonicalDose {
  peptideId: string;
  /** The winning range, in micrograms. */
  minMcg: number;
  maxMcg: number;
  /** Which source won, and its human label. */
  source: DoseSourceId;
  sourceLabel: string;
  /** True when the winning source is the self-verifying ladder. */
  verified: boolean;
  /** Every source that had an opinion, in precedence order. */
  sources: SourceRange[];
  /**
   * True when the sources materially disagree — i.e. the ranges do not
   * overlap. An overlap is normal (different clinical windows); a disjoint
   * pair means at least one source is wrong about this compound.
   */
  conflict: boolean;
}

// ── unit handling ─────────────────────────────────────────────────────────
export function toMcg(amount: number, unit: string): number {
  const u = String(unit).trim().toLowerCase();
  if (u === 'mg') return amount * 1000;
  if (u === 'g') return amount * 1_000_000;
  if (u === 'iu') return amount; // IU is peptide-specific — treated as mcg
  return amount; // mcg
}

/**
 * Parse a verbatim range string from the master table, e.g. "200-600 mcg",
 * "1-2 mg", "250mcg – 1mg", "5 mg". Returns null when it isn't a range we can
 * read — deliberately, rather than guessing a number into a dose field.
 */
export function parseRangeToMcg(raw: string | undefined | null): { minMcg: number; maxMcg: number } | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().replace(/,/g, '');

  // Two numbers with any dash between them, each optionally carrying a unit.
  const pair = s.match(
    /(\d+(?:\.\d+)?)\s*(mcg|ug|mg|g|iu)?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(mcg|ug|mg|g|iu)?/,
  );
  if (pair) {
    const [, lo, loU, hi, hiU] = pair;
    // A bare first number inherits the second's unit: "250-1000 mcg".
    const unitHi = hiU || loU || 'mcg';
    const unitLo = loU || unitHi;
    const minMcg = toMcg(parseFloat(lo), unitLo === 'ug' ? 'mcg' : unitLo);
    const maxMcg = toMcg(parseFloat(hi), unitHi === 'ug' ? 'mcg' : unitHi);
    if (!Number.isFinite(minMcg) || !Number.isFinite(maxMcg)) return null;
    return minMcg <= maxMcg ? { minMcg, maxMcg } : { minMcg: maxMcg, maxMcg: minMcg };
  }

  // Single value: "5 mg" — a point, not a range.
  const one = s.match(/(\d+(?:\.\d+)?)\s*(mcg|ug|mg|g|iu)/);
  if (one) {
    const v = toMcg(parseFloat(one[1]), one[2] === 'ug' ? 'mcg' : one[2]);
    return Number.isFinite(v) ? { minMcg: v, maxMcg: v } : null;
  }
  return null;
}

// ── per-source readers ────────────────────────────────────────────────────

function fromLadder(peptideId: string): SourceRange | null {
  const entry = PEPTIDE_DOSING_REFERENCE.find((e) => e.peptideId === peptideId);
  if (!entry || !entry.schedule?.length) return null;
  const doses = entry.schedule
    .map((p) => p.doseMcg)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0);
  if (!doses.length) return null;
  return {
    source: 'reconstitution_ladder',
    minMcg: Math.min(...doses),
    maxMcg: Math.max(...doses),
    selfVerifying: true,
  };
}

function fromTable(peptideId: string): SourceRange | null {
  const entry = PEPTIDE_DOSING_TABLE.find((e) => e.peptideId === peptideId);
  const parsed = parseRangeToMcg(entry?.dosingRange);
  if (!parsed) return null;
  return { source: 'master_table', ...parsed, selfVerifying: false };
}

function fromProtocols(peptideId: string): SourceRange | null {
  const matches = PROTOCOL_TEMPLATES.filter((p) => p.peptideId === peptideId);
  if (!matches.length) return null;
  const mins = matches.map((p) => toMcg(p.typicalDose.min, p.typicalDose.unit));
  const maxs = matches.map((p) => toMcg(p.typicalDose.max, p.typicalDose.unit));
  return {
    source: 'protocols',
    minMcg: Math.min(...mins),
    maxMcg: Math.max(...maxs),
    selfVerifying: false,
  };
}

const READERS: Record<DoseSourceId, (id: string) => SourceRange | null> = {
  reconstitution_ladder: fromLadder,
  master_table: fromTable,
  protocols: fromProtocols,
};

// ── the one entry point ───────────────────────────────────────────────────

/**
 * Resolve the canonical dose range for a peptide id.
 *
 * Returns null when NO source has an opinion — callers must treat that as
 * "unknown", never as "safe".
 */
export function getCanonicalDose(peptideId: string): CanonicalDose | null {
  const sources = SOURCE_PRECEDENCE
    .map((s) => READERS[s](peptideId))
    .filter((r): r is SourceRange => r !== null);

  if (!sources.length) return null;

  const winner = sources[0];

  // Disagreement that matters = ranges that do not overlap at all. Two sources
  // describing overlapping windows are compatible; disjoint ones cannot both
  // be right.
  const conflict = sources.some(
    (a) => sources.some((b) => a.maxMcg < b.minMcg || b.maxMcg < a.minMcg),
  );

  return {
    peptideId,
    minMcg: winner.minMcg,
    maxMcg: winner.maxMcg,
    source: winner.source,
    sourceLabel: SOURCE_LABEL[winner.source],
    verified: winner.selfVerifying,
    sources,
    conflict,
  };
}

/**
 * Every compound where the sources disagree irreconcilably. This is the
 * adjudication queue — it should shrink to empty, and nothing should silently
 * pick a winner for these.
 */
export function getDoseConflicts(): CanonicalDose[] {
  const ids = new Set<string>([
    ...PEPTIDE_DOSING_REFERENCE.map((e) => e.peptideId),
    ...PEPTIDE_DOSING_TABLE.map((e) => e.peptideId),
    ...PROTOCOL_TEMPLATES.map((p) => p.peptideId),
  ]);
  return [...ids]
    .map((id) => getCanonicalDose(id))
    .filter((d): d is CanonicalDose => d !== null && d.conflict);
}
