/**
 * Dose safety checks — lightweight guardrails run before a dose is persisted.
 *
 * These are informational warnings, not hard blocks: users may have a valid
 * reason to log an unusual amount. The UI surfaces a confirm-dialog with the
 * message so users don't silently log a decimal-point error.
 */

import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { PEPTIDES } from '../data/peptides';

export interface DoseSafetyResult {
  /** true = no issue, false = show confirmation to the user */
  safe: boolean;
  /** human-readable reason if !safe; undefined if safe */
  message?: string;
  /** "unusually_high" | "unusually_low" | "unit_mismatch" for logging/telemetry */
  code?: 'unusually_high' | 'unusually_low' | 'unit_mismatch';
}

/**
 * Normalize a dose amount to micrograms for comparison.
 */
function toMcg(amount: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'mg') return amount * 1000;
  if (u === 'iu') return amount; // IU is peptide-specific; treat as mcg for heuristic
  return amount; // default mcg
}

/**
 * Find the typical-dose range for a given peptide identifier or name.
 * Returns min/max in micrograms, or null if not found.
 */
function getTypicalRangeMcg(
  peptideIdOrName: string,
): { minMcg: number; maxMcg: number; display: string } | null {
  const q = peptideIdOrName.trim().toLowerCase();
  if (!q) return null;

  // Try exact peptide id / name / abbreviation match first
  const peptide = PEPTIDES.find(
    (p) =>
      p.id.toLowerCase() === q ||
      p.name.toLowerCase() === q ||
      p.abbreviation?.toLowerCase() === q ||
      p.name.toLowerCase().includes(q),
  );

  const matchingProtocols = peptide
    ? PROTOCOL_TEMPLATES.filter((t) => t.peptideId === peptide.id)
    : PROTOCOL_TEMPLATES.filter(
        (t) => t.peptideId.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
      );

  if (matchingProtocols.length === 0) return null;

  // Use the widest range across all matching protocols so we don't false-positive
  // on users who selected the template with the lowest cap.
  let minMcg = Infinity;
  let maxMcg = -Infinity;
  let unit = matchingProtocols[0].typicalDose.unit;
  for (const p of matchingProtocols) {
    const pMin = toMcg(p.typicalDose.min, p.typicalDose.unit);
    const pMax = toMcg(p.typicalDose.max, p.typicalDose.unit);
    if (pMin < minMcg) minMcg = pMin;
    if (pMax > maxMcg) maxMcg = pMax;
  }

  const protocolMin = matchingProtocols[0].typicalDose.min;
  const protocolMax = matchingProtocols[matchingProtocols.length - 1].typicalDose.max;
  const display = `${protocolMin}–${protocolMax} ${unit}`;

  return { minMcg, maxMcg, display };
}

/**
 * Check whether a dose amount falls in a safe/typical range for the named
 * peptide. Returns `{ safe: true }` when the peptide isn't in our database
 * (we don't want to block logging unknown substances).
 *
 * Heuristics:
 *   - >3× the protocol max in a known peptide → unusually high
 *   - <1/10 of the protocol min → unusually low (probably a unit-mismatch typo)
 *   - Amount >10000 mcg with no matching peptide → likely mg/mcg confusion
 */
export function checkDoseSafety(
  peptideIdOrName: string,
  amount: number,
  unit: string,
): DoseSafetyResult {
  if (amount <= 0) return { safe: true };
  const amountMcg = toMcg(amount, unit);

  const range = getTypicalRangeMcg(peptideIdOrName);
  if (!range) {
    // Unknown peptide — only catch the obvious mg/mcg confusion
    if (amountMcg > 10000) {
      return {
        safe: false,
        code: 'unusually_high',
        message: `${amount} ${unit} is a large dose for most peptides. Double-check the unit (mg vs mcg) before saving.`,
      };
    }
    return { safe: true };
  }

  if (amountMcg > range.maxMcg * 3) {
    return {
      safe: false,
      code: 'unusually_high',
      message: `${amount} ${unit} is more than 3× the typical maximum for ${peptideIdOrName} (${range.display}). Verify the dose and unit before saving.`,
    };
  }

  if (amountMcg < range.minMcg / 10) {
    return {
      safe: false,
      code: 'unusually_low',
      message: `${amount} ${unit} is far below the typical range for ${peptideIdOrName} (${range.display}). This often means the unit is wrong (mg vs mcg). Save anyway?`,
    };
  }

  return { safe: true };
}
