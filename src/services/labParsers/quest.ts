/**
 * Quest Diagnostics parser — Master Refactor Plan v3.1 §10.2.
 *
 * Same shape as labcorp.ts. Quest's printout layout differs slightly
 * (analyte name comes before a tab-separated value column) but the
 * synonym map handles the wording differences.
 */

import type { LabParser, LabParseResult, LabParsedValue } from './types';

const QUEST_DETECT_PATTERNS = [/Quest Diagnostics/i];

const QUEST_SYNONYMS: Record<string, string> = {
  'cholesterol, hdl': 'hdl',
  'hdl cholesterol': 'hdl',
  'cholesterol, ldl': 'ldl',
  'cholesterol, ldl direct': 'ldl',
  'cholesterol, total': 'total_chol',
  triglyceride: 'tg',
  triglycerides: 'tg',
  'apolipoprotein b': 'apo_b',
  'lp(a)': 'lp_a',
  glucose: 'glucose',
  'hemoglobin a1c': 'hba1c',
  insulin: 'insulin',
  'testosterone, total': 't_total',
  'testosterone, free, direct': 't_free',
  shbg: 'shbg',
  estradiol: 'estradiol',
  'dhea sulfate': 'dhea_s',
  cortisol: 'cortisol',
  'thyroid stimulating hormone': 'tsh',
  tsh: 'tsh',
  't4, free, direct': 'free_t4',
  't3, free': 'free_t3',
  'igf-i': 'igf_1',
  'hs-crp, cardio': 'hs_crp',
  homocysteine: 'homocyst',
  'alanine aminotransferase': 'alt',
  alt: 'alt',
  'aspartate aminotransferase': 'ast',
  ast: 'ast',
  'alkaline phosphatase': 'alk_phos',
  'vitamin d, 25-oh': 'vit_d',
  'vitamin b12': 'b12',
  ferritin: 'ferritin',
};

function detect(rawText: string): boolean {
  return QUEST_DETECT_PATTERNS.some((p) => p.test(rawText));
}

function extractDrawDate(rawText: string): string | undefined {
  // Quest typically prints "Collection Date: MM/DD/YYYY".
  const m = rawText.match(
    /Collection Date:?\s*(\d{2})[\/-](\d{2})[\/-](\d{4})/i,
  );
  if (!m) return undefined;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseText(rawText: string): LabParseResult {
  const drawDate = extractDrawDate(rawText);
  const values: LabParsedValue[] = [];
  const unmapped: string[] = [];

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(patient|specimen|account|physician|page|reported)/i.test(line)) {
      continue;
    }
    const numMatch = line.match(
      /^(.+?)\s+(-?\d+(?:\.\d+)?)\s+([%a-zA-Zµ\/]+)/,
    );
    if (!numMatch) continue;
    const namePart = numMatch[1].toLowerCase().trim();
    const value = parseFloat(numMatch[2]);
    const unit = numMatch[3];
    let markerId = QUEST_SYNONYMS[namePart];
    if (!markerId) {
      for (const [syn, id] of Object.entries(QUEST_SYNONYMS)) {
        if (namePart.startsWith(syn)) {
          markerId = id;
          break;
        }
      }
    }
    if (markerId) {
      values.push({ markerId, value, unit, date: drawDate });
    } else {
      unmapped.push(line);
    }
  }

  return {
    vendor: 'quest',
    values,
    unmappedLines: unmapped,
    drawDate,
  };
}

export const questParser: LabParser = {
  vendor: 'quest',
  label: 'Quest Diagnostics',
  detect,
  parseText,
};
