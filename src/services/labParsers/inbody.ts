/**
 * InBody parser — Master Refactor Plan v3.1 §10.2.
 *
 * Parses the printout from InBody 270 / 570 / 770. Field layout is
 * stable across models — only added metrics differ.
 *
 * Maps to BodyCompositionScan (useBodyCompositionStore). Numeric values
 * are normalised to lb / % per PepTalk's storage convention; kg-input
 * scans are auto-converted.
 */

import type { BodyCompositionScan } from '../../store/useBodyCompositionStore';

const INBODY_DETECT_PATTERNS = [/InBody/i, /S?MM:?\s*\d/i];

const KG_TO_LB = 2.20462;

export interface InBodyParseResult {
  device: 'InBody 270' | 'InBody 570' | 'InBody 770' | 'Other';
  scan: Omit<BodyCompositionScan, 'id' | 'scannedAt' | 'source'>;
  drawDate?: string;
  unmappedLines: string[];
}

function detectDevice(
  rawText: string,
): InBodyParseResult['device'] {
  if (/InBody\s*770/i.test(rawText)) return 'InBody 770';
  if (/InBody\s*570/i.test(rawText)) return 'InBody 570';
  if (/InBody\s*270/i.test(rawText)) return 'InBody 270';
  return 'Other';
}

function extractScanDate(rawText: string): string | undefined {
  const m = rawText.match(
    /(?:Test Date|Date):?\s*(\d{4})[.\-/](\d{2})[.\-/](\d{2})/i,
  );
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function detect(rawText: string): boolean {
  return INBODY_DETECT_PATTERNS.some((p) => p.test(rawText));
}

function readNumberAfter(rawText: string, label: RegExp): number | undefined {
  const m = rawText.match(label);
  if (!m) return undefined;
  const idx = m.index ?? -1;
  const rest = rawText.slice(idx + m[0].length, idx + m[0].length + 40);
  const v = rest.match(/-?\d+(?:\.\d+)?/);
  if (!v) return undefined;
  return parseFloat(v[0]);
}

function isKgPrintout(rawText: string): boolean {
  // InBody emits weights as either kg or lb depending on user pref.
  return /Weight\s*\([kK]g\)|\bkg\b/.test(rawText);
}

function parseText(rawText: string): InBodyParseResult {
  const useKg = isKgPrintout(rawText);
  const toLb = (n: number | undefined) =>
    n == null ? undefined : useKg ? n * KG_TO_LB : n;

  const scan: InBodyParseResult['scan'] = {};

  const weight = readNumberAfter(rawText, /Weight\b/i);
  scan.weightLb = toLb(weight);

  const bf = readNumberAfter(rawText, /(Percent Body Fat|PBF|Body Fat\s*%)/i);
  scan.bodyFatPercent = bf;

  const lean = readNumberAfter(rawText, /(Skeletal Muscle Mass|SMM|Lean Body Mass)/i);
  scan.leanMassLb = toLb(lean);

  const fatMass = readNumberAfter(rawText, /Body Fat Mass/i);
  scan.fatMassLb = toLb(fatMass);

  const ecwTbw = readNumberAfter(rawText, /ECW\/TBW/i);
  scan.ecwTbwRatio = ecwTbw;

  const bmr = readNumberAfter(rawText, /(Basal Metabolic Rate|BMR)/i);
  scan.bmrKcal = bmr;

  const vfat = readNumberAfter(rawText, /Visceral Fat Level/i);
  scan.visceralFatLevel = vfat;

  // Segmental — best-effort, optional. Pulled from the "Right Arm",
  // "Left Arm", etc. block.
  const seg: Record<string, number | undefined> = {
    rightArm: toLb(readNumberAfter(rawText, /Right Arm/i)),
    leftArm: toLb(readNumberAfter(rawText, /Left Arm/i)),
    trunk: toLb(readNumberAfter(rawText, /Trunk/i)),
    rightLeg: toLb(readNumberAfter(rawText, /Right Leg/i)),
    leftLeg: toLb(readNumberAfter(rawText, /Left Leg/i)),
  };
  if (Object.values(seg).some((v) => v != null)) {
    scan.segmental = seg as NonNullable<BodyCompositionScan['segmental']>;
  }

  return {
    device: detectDevice(rawText),
    scan,
    drawDate: extractScanDate(rawText),
    // No unmapped lines for now — InBody printouts are field-positional,
    // not free-text, so any value we miss is a parser gap rather than an
    // unknown analyte.
    unmappedLines: [],
  };
}

export const inbodyParser = {
  vendor: 'inbody' as const,
  label: 'InBody printout',
  detect,
  parseText,
};
