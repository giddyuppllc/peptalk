/**
 * LabCorp parser — Master Refactor Plan v3.1 §10.2.
 *
 * Parses raw text from a LabCorp printout (OCR output or PDF text
 * extraction). LabCorp's standard line format is:
 *
 *   <Marker Name>     <Value>     <Unit>     <Reference range>
 *
 * with the analyte name in a fixed-width left column and numeric value
 * separated from the unit by whitespace. We detect via the standard
 * LabCorp header strings and walk lines looking for known analyte
 * synonyms.
 *
 * Add a new analyte → add an entry to LABCORP_SYNONYMS.
 */

import type {
  LabParser,
  LabParseResult,
  LabParsedValue,
} from './types';

const LABCORP_DETECT_PATTERNS = [/LabCorp/i, /Laboratory Corporation of America/i];

/**
 * Vendor-specific analyte names → canonical PepTalk markerId.
 * LabCorp's wording is fairly stable across panels but occasionally
 * varies (e.g. "Total Cholesterol" vs "Cholesterol, Total"); add both
 * spellings here when discovered.
 */
const LABCORP_SYNONYMS: Record<string, string> = {
  // Lipid
  'hdl cholesterol': 'hdl',
  'hdl': 'hdl',
  'ldl cholesterol calc': 'ldl',
  'ldl': 'ldl',
  'cholesterol, total': 'total_chol',
  'total cholesterol': 'total_chol',
  'triglycerides': 'tg',
  'apolipoprotein b': 'apo_b',
  'lipoprotein (a)': 'lp_a',
  // Metabolic
  'glucose': 'glucose',
  'fasting glucose': 'glucose',
  'hemoglobin a1c': 'hba1c',
  'a1c': 'hba1c',
  'insulin': 'insulin',
  // Hormone
  'testosterone, total': 't_total',
  'testosterone total': 't_total',
  'testosterone, free': 't_free',
  'testosterone free': 't_free',
  'shbg': 'shbg',
  'estradiol': 'estradiol',
  'dhea-sulfate': 'dhea_s',
  'dhea sulfate': 'dhea_s',
  'cortisol': 'cortisol',
  'tsh': 'tsh',
  't4, free': 'free_t4',
  'free t4': 'free_t4',
  't3, free': 'free_t3',
  'free t3': 'free_t3',
  'igf-1': 'igf_1',
  // Inflammation
  'hs-crp': 'hs_crp',
  'high sensitivity crp': 'hs_crp',
  'homocysteine': 'homocyst',
  // Liver
  'alt (sgpt)': 'alt',
  'alt': 'alt',
  'ast (sgot)': 'ast',
  'ast': 'ast',
  'alkaline phosphatase': 'alk_phos',
  // Vitamin
  'vitamin d, 25-hydroxy': 'vit_d',
  '25-hydroxy vitamin d': 'vit_d',
  'vitamin b12': 'b12',
  'b12': 'b12',
  'ferritin': 'ferritin',
};

function detect(rawText: string): boolean {
  return LABCORP_DETECT_PATTERNS.some((p) => p.test(rawText));
}

function extractDrawDate(rawText: string): string | undefined {
  // LabCorp typically prints "Collected: MM/DD/YYYY".
  const m = rawText.match(/Collected:?\s*(\d{2})[\/-](\d{2})[\/-](\d{4})/i);
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
    // Skip likely headers/footers.
    if (/^(patient|specimen|account|physician|page|reported)/i.test(line)) {
      continue;
    }
    // Try to match: <name> <value> <unit> <ref-range>
    // Numeric value is the first decimal-looking token in the line.
    const numMatch = line.match(
      /^(.+?)\s+(-?\d+(?:\.\d+)?)\s+([%a-zA-Zµ\/]+)/,
    );
    if (!numMatch) continue;
    const namePart = numMatch[1].toLowerCase().trim();
    const value = parseFloat(numMatch[2]);
    const unit = numMatch[3];
    // Find synonym match — exact, then prefix.
    let markerId = LABCORP_SYNONYMS[namePart];
    if (!markerId) {
      for (const [syn, id] of Object.entries(LABCORP_SYNONYMS)) {
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
    vendor: 'labcorp',
    values,
    unmappedLines: unmapped,
    drawDate,
  };
}

export const labcorpParser: LabParser = {
  vendor: 'labcorp',
  label: 'LabCorp',
  detect,
  parseText,
};
