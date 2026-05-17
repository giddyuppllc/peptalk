/**
 * Vendor adapter contract — Master Refactor Plan v3.1 §10.2.
 *
 * Each lab vendor is a single file under src/services/labParsers/
 * exporting a `LabParser` with the same shape. Adding a new vendor is
 * one PR and one entry in the vendors registry — no refactor.
 *
 * Two ingest pathways:
 *   - `parseText(rawText)`  → invoked on photo OCR output (the user
 *     snaps a printout, an OCR pass produces raw text, this parser
 *     extracts structured values).
 *   - `parsePdf(buffer)`    → invoked when the user uploads a PDF
 *     directly (a Quest e-portal download, for example).
 *
 * Parsers map vendor-specific marker names to PepTalk's canonical
 * `markerId` (matches LAB_MARKERS in useLabResultsStore). Anything
 * unrecognized is returned in `unmappedLines` so the user can review.
 */

import type { LabValue } from '../../store/useLabResultsStore';

export type LabParsedValue = Pick<
  LabValue,
  'markerId' | 'value' | 'unit'
> & {
  /** YYYY-MM-DD draw date if the report specified one. */
  date?: string;
  /** Optional reference range pulled from the source. */
  refLow?: number;
  refHigh?: number;
};

export interface LabParseResult {
  vendor: string;
  /** Successfully mapped values. */
  values: LabParsedValue[];
  /** Lines the parser saw but couldn't classify. UI surfaces these for
   *  manual review so we never silently lose a marker. */
  unmappedLines: string[];
  /** Optional draw date pulled from the document header. */
  drawDate?: string;
  /** Optional patient name pulled from the document — useful as a sanity
   *  check before saving (mismatch → don't save). */
  patientName?: string;
}

export interface LabParser {
  /** Stable id used in the vendors registry. */
  vendor: 'labcorp' | 'quest' | 'inbody' | 'generic';
  /** Human-readable label for the upload picker. */
  label: string;
  /** Fast probe — does this text look like our vendor's report? */
  detect: (rawText: string) => boolean;
  /** Parse OCR-style raw text into structured values. */
  parseText: (rawText: string) => LabParseResult;
}
