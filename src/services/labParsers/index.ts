/**
 * Lab parser registry — Master Refactor Plan v3.1 §10.2.
 *
 * One entry per vendor. `detectParser(rawText)` returns the best match
 * by running each vendor's `detect()` predicate; UI falls back to the
 * generic-pass path when none matches and surfaces the user with manual
 * entry pre-filled by whatever numeric tokens were extractable.
 */

import { labcorpParser } from './labcorp';
import { questParser } from './quest';
import { inbodyParser } from './inbody';
import type { LabParser } from './types';

export const LAB_PARSERS: LabParser[] = [labcorpParser, questParser];

/** Detect which vendor's parser should handle this raw text. */
export function detectLabParser(rawText: string): LabParser | null {
  for (const p of LAB_PARSERS) {
    if (p.detect(rawText)) return p;
  }
  return null;
}

export { labcorpParser, questParser, inbodyParser };
export type { LabParser, LabParseResult, LabParsedValue } from './types';
