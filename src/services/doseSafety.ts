/**
 * Dose safety checks — lightweight guardrails run before a dose is persisted.
 *
 * These are informational warnings, not hard blocks: users may have a valid
 * reason to log an unusual amount. The UI surfaces a confirm-dialog with the
 * message so users don't silently log a decimal-point error.
 */

import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { getCanonicalDose } from '../data/canonicalDosing';
import { PEPTIDES } from '../data/peptides';
import { findPeptideByQuery } from '../lib/peptideSearch';
import { isSafetyOnly } from '../data/safetyOnlyCompounds';

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
): { minMcg: number; maxMcg: number; display: string | null } | null {
  const q = peptideIdOrName.trim().toLowerCase();
  if (!q) return null;

  // Try exact peptide id / name / abbreviation match first
  // Exact identifier first, then substring — precedence matters here more than
  // anywhere else in the app: resolving the wrong compound means applying the
  // wrong dose guard. `findPeptideByQuery` encodes that order, and adds the
  // catalog's `aliases`, so a dose logged as "Ibutamoren" now resolves to
  // MK-677 and gets its guards instead of falling through unguarded.
  const peptide =
    findPeptideByQuery(PEPTIDES, q) ??
    PEPTIDES.find((p) => p.name.toLowerCase().includes(q));

  // Canonical dosing first. The guard used to compute its ceiling from
  // protocols.ts — the ONLY one of the three dosing sources that cites
  // nothing — while the self-verifying reconstitution ladder was ignored.
  // getCanonicalDose applies the documented precedence (ladder > master
  // table > protocols) so the guard is derived from the best-attributed
  // figure available for that compound.
  if (peptide) {
    const canonical = getCanonicalDose(peptide.id);
    if (canonical) {
      const fmt = (mcg: number) =>
        mcg >= 1000 ? `${+(mcg / 1000).toFixed(2)} mg` : `${+mcg.toFixed(0)} mcg`;
      return {
        minMcg: canonical.minMcg,
        maxMcg: canonical.maxMcg,
        // `display` is the only part of this result that reaches a user's eyes.
        // For a safety-information-only compound (Edward, 2026-09-16) it is
        // withheld — see the note on `checkDoseSafety` below. The NUMBERS are
        // still returned, so the guard itself is unchanged.
        display: isSafetyOnly(peptide.id)
          ? null
          : `${fmt(canonical.minMcg)}–${fmt(canonical.maxMcg)}`,
      };
    }
  }

  // Fallback: no canonical entry (compound absent from all three stores under
  // this id). Keep the original protocol-substring behaviour so an unknown
  // query still resolves rather than silently going unguarded.
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
  const display = peptide && isSafetyOnly(peptide.id)
    ? null
    : `${protocolMin}–${protocolMax} ${unit}`;

  return { minMcg, maxMcg, display };
}

/**
 * The ceiling applied when the compound cannot be resolved: above 10 mg the
 * likeliest explanation is a mg/mcg slip, whatever the substance is.
 *
 * It is also a FLOOR on how protective the known-compound path may be — see
 * checkDoseSafety.
 */
const UNKNOWN_COMPOUND_CEILING_MCG = 10000;

/**
 * Check whether a dose amount falls in a safe/typical range for the named
 * peptide. Returns `{ safe: true }` when the peptide isn't in our database
 * (we don't want to block logging unknown substances).
 *
 * Heuristics:
 *   - at or above 3× the protocol max in a known peptide → unusually high
 *   - above the mg/mcg-confusion ceiling → unusually high
 *   - <1/10 of the protocol min → unusually low (probably a unit-mismatch typo)
 *   - Amount >10000 mcg with no matching peptide → likely mg/mcg confusion
 *
 * SAFETY-INFORMATION-ONLY COMPOUNDS (Edward, 2026-09-16)
 * The guard is NOT switched off for them, and that is a deliberate choice.
 * Suppressing it would be the worst of both worlds: the user can still log a
 * dose of anything — logging is how the app records what actually happened, and
 * refusing to guard that protects nobody — so a decimal-point error on hCG or
 * MK-677 would go through silently, precisely on the compounds where PepTalk
 * has decided it does not want to be casual.
 *
 * What changes is the MESSAGE. The stored range is still used to decide
 * whether to warn; it is no longer printed back. A line reading "more than 3×
 * the typical maximum (500–1000 IU)" hands the reader the recommended window
 * inside a warning — it is a dose recommendation with a warning's framing, and
 * it would put a number on screen for a compound Edward withdrew every number
 * from. The remaining message names the amount the USER typed, which is their
 * own input, not our suggestion.
 *
 * WHY THE FLAT CEILING APPLIES TO KNOWN COMPOUNDS TOO (2026-09-16)
 * `amountMcg > range.maxMcg * 3` was the ONLY high-dose rule once a compound
 * resolved, so the guard got LOOSER the more the app knew. Clinician rulings
 * now sit first in precedence, and a ruling that spans a whole titration —
 * semaglutide 250 mcg to 12 mg — makes `maxMcg * 3` a 36 mg ceiling. So
 * 25 mg, 30 mg and 35 mg of semaglutide logged with no warning at all, while
 * typing "Ozempic" (which does not resolve) still warned at the same dose.
 * Twenty compounds regressed that way, including retatrutide at 35 mg and
 * glutathione at 1 g.
 *
 * A titration SPAN is not a per-dose window, so 3× the top of one is not a
 * per-dose ceiling. Until there is a per-compound "max per dose" figure to
 * derive one from — a question for Edward and Jamie, not an inference to make
 * here — knowing the compound must never be LESS protective than not knowing
 * it. So the flat 10 mg unit-confusion ceiling applies to a resolved compound
 * as well, and the stricter of the two rules wins.
 *
 * The one thing that lifts it is the compound's OWN documented maximum. A
 * documented 400 mg of glutathione or 600 mg of alpha-GPC is positive evidence
 * that milligrams are normal there, which is exactly the evidence the unknown
 * path lacks; without that exception the guard would warn on 21 compounds'
 * own reference doses and train people to dismiss it. So the ceiling is
 * `max(documented max, 10 mg)` — never lower than the unknown-compound
 * ceiling, never lower than what the data says is normal.
 *
 * The 3× comparison became inclusive at the same time: exactly 3× the
 * clinician's maximum (ipamorelin and melanotan-2 at 1500 mcg) warned before
 * the rulings and must warn now.
 *
 * NO CLINICAL NUMBER CHANGED. The ranges, the 3× multiplier and the 10 mg
 * ceiling are all exactly as they were, and both messages are existing wording.
 */
export function checkDoseSafety(
  peptideIdOrName: string,
  amount: number,
  unit: string,
): DoseSafetyResult {
  if (amount <= 0) return { safe: true };
  const amountMcg = toMcg(amount, unit);

  const unitConfusionWarning: DoseSafetyResult = {
    safe: false,
    code: 'unusually_high',
    message: `${amount} ${unit} is a large dose for most peptides. Double-check the unit (mg vs mcg) before saving.`,
  };

  const range = getTypicalRangeMcg(peptideIdOrName);
  if (!range) {
    // Unknown peptide — only catch the obvious mg/mcg confusion
    if (amountMcg > UNKNOWN_COMPOUND_CEILING_MCG) return unitConfusionWarning;
    return { safe: true };
  }

  if (amountMcg >= range.maxMcg * 3) {
    return {
      safe: false,
      code: 'unusually_high',
      // Same sentence, with the recommended window omitted when it is
      // withheld. Nothing else about the warning changes.
      message: range.display
        ? `${amount} ${unit} is more than 3× the typical maximum for ${peptideIdOrName} (${range.display}). Verify the dose and unit before saving.`
        : `${amount} ${unit} is more than 3× the typical maximum for ${peptideIdOrName}. Verify the dose and unit before saving.`,
    };
  }

  // Inside 3× its own range, but past the ceiling that would have warned had
  // the compound been unrecognised — and past what the compound's own data
  // says is normal. The range-naming message above would be untrue here (the
  // dose is NOT more than 3× the maximum), so this returns the
  // unknown-compound wording, unchanged.
  if (amountMcg > Math.max(range.maxMcg, UNKNOWN_COMPOUND_CEILING_MCG)) {
    return unitConfusionWarning;
  }

  if (amountMcg < range.minMcg / 10) {
    return {
      safe: false,
      code: 'unusually_low',
      message: range.display
        ? `${amount} ${unit} is far below the typical range for ${peptideIdOrName} (${range.display}). This often means the unit is wrong (mg vs mcg). Save anyway?`
        : `${amount} ${unit} is far below the typical range for ${peptideIdOrName}. This often means the unit is wrong (mg vs mcg). Save anyway?`,
    };
  }

  return { safe: true };
}

/**
 * Every guard that must run before a dose is written, in the order they should
 * be shown.
 *
 * WHY THIS EXISTS (2026-08-06): `checkDoseSafety` plus the pregnancy
 * contraindication check were both implemented inline in the Tracker's
 * log-dose modal, and NOWHERE else. The dose calculator writes to the same log
 * via `logDose` and `scheduleCycle` — the latter writing an entire cycle at
 * once — and ran neither guard. So the same dose that would prompt a
 * confirmation in Tracker was written silently from Calculator, and a user
 * flagged pregnant/nursing could schedule a whole cycle of a contraindicated
 * peptide without ever seeing the warning.
 *
 * Pure on purpose: `pregnantOrNursing` is passed in rather than read from the
 * health-profile store, so this stays testable and free of UI/store imports.
 *
 * Returns warnings ONLY — these are informational, never hard blocks, matching
 * the existing behaviour. The caller chains a confirm per warning.
 */
export interface DoseGuardWarning {
  title: string;
  message: string;
  code: 'pregnancy_contraindication' | NonNullable<DoseSafetyResult['code']>;
}

export function checkDoseGuards(args: {
  peptideIdOrName: string;
  amount: number;
  unit: string;
  /** From the health profile. Omitted/undefined = do not run the check. */
  pregnantOrNursing?: boolean;
}): DoseGuardWarning[] {
  const { peptideIdOrName, amount, unit, pregnantOrNursing } = args;
  const warnings: DoseGuardWarning[] = [];

  // Contraindication first — it is the more serious of the two.
  if (pregnantOrNursing) {
    const needle = peptideIdOrName.trim().toLowerCase();
    const matched = PROTOCOL_TEMPLATES.filter(
      (p) =>
        p.peptideId.toLowerCase() === needle ||
        p.name.toLowerCase().includes(needle) ||
        needle.includes(p.peptideId.toLowerCase()),
    );
    const contra = matched.some((p) =>
      (p.contraindications ?? []).some((c) => /pregnan|nursing|breastfeed/i.test(c)),
    );
    if (contra) {
      /* Copy is Tracker's existing wording, verbatim. Tracker was migrated onto
         this function on 2026-08-06 and its user-facing text must not change;
         Calculator inherits the same established phrasing. */
      warnings.push({
        code: 'pregnancy_contraindication',
        title: 'Not recommended during pregnancy / nursing',
        message:
          `Your profile indicates you're pregnant or nursing, and this substance is contraindicated in that scenario per research protocols. Please consult a licensed provider before continuing.`,
      });
    }
  }

  const safety = checkDoseSafety(peptideIdOrName, amount, unit);
  if (!safety.safe && safety.code) {
    warnings.push({
      code: safety.code,
      title: 'Double-check this dose',
      message: safety.message ?? 'This dose looks unusual.',
    });
  }

  return warnings;
}
