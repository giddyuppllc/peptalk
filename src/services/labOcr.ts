/**
 * Lab OCR client — Master Refactor Plan v3.1 §10.1.
 *
 * Sends a photo (or PDF rendered to image) to the Supabase `lab-scan`
 * edge function, which routes the image through a vision model and
 * returns structured lab values that match PepTalk's `LabValue` shape.
 *
 * Mirrors the working `food-scan` pattern in app/nutrition/meal-scan.tsx
 * (image → base64 → edge fn → structured items).
 *
 * Server-side `lab-scan` edge function ships separately. Until it's
 * deployed, this adapter resolves to `{ ok: false, reason: 'unavailable' }`
 * and the caller falls back to manual entry — same fail-soft behaviour
 * as the side-effect store sync.
 */

import type { LabParsedValue } from './labParsers/types';

export interface LabOcrResult {
  ok: boolean;
  /** Structured values ready to merge into useLabResultsStore. */
  values: LabParsedValue[];
  /** Optional draw date pulled from the report header. */
  drawDate?: string;
  /** Vendor the model identified, if any. */
  vendor?: string;
  /** Lines the model surfaced for manual review. */
  unmappedLines: string[];
  reason?: 'unavailable' | 'failed' | 'no_match';
  error?: string;
}

export async function recognizeLabPhoto(uri: string): Promise<LabOcrResult> {
  // App Review 5.1.2: explicit consent before sending the lab photo to the vision model.
  const { ensureAiConsent } = await import('../utils/ensureAiConsent');
  if (!(await ensureAiConsent())) {
    return { ok: false, values: [], unmappedLines: [], reason: 'unavailable' };
  }
  try {
    const { supabase } = await import('./supabase');
    // Match the food-scan pattern: read the image as base64 client-side
    // and POST it to the edge function. PDFs require a render-to-image
    // step first which is out of scope here — manual paste-text is the
    // fall-through for PDF inputs.
    // Wave 76.51: import from /legacy — see app/pantry/scan.tsx for context.
    const FileSystem: any = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    const { data, error } = await (supabase as any).functions.invoke(
      'lab-scan',
      { body: { imageBase64: base64 } },
    );

    if (error) {
      // Edge fn missing or 4xx → manual entry stays the path.
      return {
        ok: false,
        values: [],
        unmappedLines: [],
        reason:
          (error?.status ?? 0) >= 500
            ? 'failed'
            : 'unavailable',
        error: error.message ?? 'Edge function unavailable',
      };
    }

    if (!data || !Array.isArray(data.values) || data.values.length === 0) {
      return {
        ok: false,
        values: [],
        unmappedLines: data?.unmappedLines ?? [],
        reason: 'no_match',
      };
    }

    return {
      ok: true,
      values: data.values as LabParsedValue[],
      drawDate: data.drawDate,
      vendor: data.vendor,
      unmappedLines: data.unmappedLines ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      values: [],
      unmappedLines: [],
      reason: 'unavailable',
      error: err instanceof Error ? err.message : 'OCR pipeline error',
    };
  }
}
