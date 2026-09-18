/**
 * The approving clinician's rulings, expanded into sentences a person reads
 * without decoding them — and not one digit different.
 *
 * WHY THIS IS A SEPARATE FILE
 * `clinicianRulings.ts` holds what Jamie Esposito actually wrote. That field is
 * the record: `rulingDoseMcg()` parses it into the numbers the overdose guard
 * enforces, and it is the thing to point at if anyone ever asks what the
 * approving clinician approved. Editing it to read more nicely would quietly
 * edit the audit trail and the safety input at the same time.
 *
 * So the record stays verbatim and this module renders it. Her notes are
 * written the way a clinician writes to another clinician — "1 mg – 2 mg 3
 * times weekly, am on empty stomach, prior to workout" — and PepTalk's reader
 * is the person taking it, not the person prescribing it. "am" reads as the
 * verb in a sentence until you already know it means morning.
 *
 * THE ONE RULE
 * Expansion touches words. It never touches a figure, a unit, or the order
 * they appear in. `verifyNoFigureChanged()` below extracts every number-unit
 * pair from the input and the output and requires the two sequences to be
 * identical; `clinicianRulingsDisplay.test.ts` runs it across every ruling and
 * over a table of adversarial inputs. A rule that alters a dose fails the
 * build rather than reaching a user.
 *
 * Scope, from Edward (2026-09-18): "anything of hers thats short hand can be
 * expanded to make conversational sense but not the math but properly expanded
 * upon".
 */

import { getClinicianRuling, type ClinicianRuling } from './clinicianRulings';

/**
 * Word-level expansions, applied in order.
 *
 * Every pattern here is anchored on word boundaries and replaces letters with
 * letters. None of them can match a digit, which is what makes the guard
 * downstream a proof rather than a hope.
 */
const EXPANSIONS: [RegExp, string | ((m: string) => string)][] = [
  // Times of day. "am on empty stomach" is the one that actually misreads.
  [/\bam\b/g, 'in the morning'],
  [/\bAM\b/g, 'in the morning'],
  [/\bpm\b/g, 'in the evening'],
  [/\bPM\b/g, 'in the evening'],

  // Routes.
  [/\bsub-?q\b/gi, 'subcutaneous'],
  [/\bIM\b/g, 'intramuscular'],
  [/\bIV\b/g, 'intravenous'],

  // Clipped nouns.
  [/\bwks\b/gi, 'weeks'],
  [/\bwk\b/gi, 'week'],
  [/\bhrs\b/gi, 'hours'],
  [/\bhr\b/gi, 'hour'],
  [/\bmax\b/gi, 'maximum'],
  // Deliberately NOT 'min' → 'minimum'. In a clinical note "min" is minutes at
  // least as often as minimum, and nothing here can tell which she meant. A
  // guess would read as authoritative, so the abbreviation stays as written.

  // Her phrasing, made into a sentence rather than a column heading.
  [/\bon empty stomach\b/gi, 'on an empty stomach'],
  [/\bprior to workout\b/gi, 'before training'],
  [/\bhalf life\b/gi, 'half-life'],

  // Column headings arrive capitalised mid-sentence: "4-12 Weeks".
  [/\b(Weeks?|Days?|Months?|Hours?)\b/g, (m) => m.toLowerCase()],

  // A semicolon separating a range from its beginner/advanced split reads as
  // two unrelated statements. An em dash reads as the same sentence.
  [/;\s+/g, ' — '],

  // Beginner/advanced split reads as a label pair; make it a clause.
  // Both are guarded against re-firing on their own output: "for advanced use"
  // still contains the whole word "advanced", so an unguarded rule applied
  // twice produces "for for advanced use use". Expansion has to be idempotent —
  // a string can pass through a render path more than once.
  [/(?<!for )\bbeginner\b(?!s)/gi, 'for beginners'],
  [/(?<!for )\badvanced\b(?! use)/gi, 'for advanced use'],
];

/**
 * Normalisations that move characters around figures without changing them:
 * a missing space in "12mg", a hyphen where the rest of the file uses an en
 * dash, an inconsistently capitalised "Weeks". The guard still runs on the
 * result, so a mistake here is caught rather than shipped.
 */
function normalizeSpacing(s: string): string {
  return s
    // "12mg" → "12 mg". Unit letters only; never merges or splits a number.
    .replace(/(\d)(mcg|mg|ml|iu|g)\b/gi, '$1 $2')
    // "4-12 weeks" → "4–12 weeks". Range dash between two digits only.
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Sentence case for a fragment that started life as a table cell. */
function asSentence(s: string): string {
  if (!s) return s;
  const t = s.trim();
  const first = t[0];
  // Leave a leading digit alone — "2–5 mg daily" must not become "2–5 Mg".
  return /[a-z]/.test(first) ? first.toUpperCase() + t.slice(1) : t;
}

/**
 * Every number-and-unit in a string, in order, normalised for comparison.
 * "250 mcg – 12mg" → ["250mcg", "12mg"]. A bare number keeps its place in the
 * sequence as itself, so dropping "3" from "3 times weekly" is caught too.
 */
export function extractFigures(s: string): string[] {
  const out: string[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(mcg|mg|iu|g|units?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(`${m[1]}${(m[2] ?? '').toLowerCase().replace(/s$/, '')}`);
  }
  return out;
}

/**
 * Throws when an expansion changed the arithmetic. Exported so the test suite
 * can point it at adversarial inputs, not only at the rulings we happen to
 * hold today — a check that only ever sees passing data is not a check.
 */
export function verifyNoFigureChanged(before: string, after: string, label = 'ruling'): void {
  const a = extractFigures(before);
  const b = extractFigures(after);
  if (a.join('|') !== b.join('|')) {
    throw new Error(
      `clinicianRulingsDisplay: expanding ${label} changed the figures.\n` +
        `  before: ${JSON.stringify(before)} → [${a.join(', ')}]\n` +
        `  after : ${JSON.stringify(after)} → [${b.join(', ')}]`,
    );
  }
}

/** Expand one of her strings. Safe to call on anything, including ''. */
export function expandClinicianText(raw: string | undefined | null, label = 'ruling'): string {
  if (!raw) return '';
  let s = String(raw);
  for (const [pattern, replacement] of EXPANSIONS) {
    s = typeof replacement === 'function'
      ? s.replace(pattern, replacement as (m: string) => string)
      : s.replace(pattern, replacement);
  }
  s = asSentence(normalizeSpacing(s));
  verifyNoFigureChanged(String(raw), s, label);
  return s;
}

export interface ExpandedRuling {
  peptideId: string;
  /** Her wording, untouched — for provenance and for the safety layer. */
  verbatim: { dose?: string; frequency?: string; cycle?: string; notes?: string[] };
  /** The same ruling, in sentences. Identical figures, by construction. */
  dose?: string;
  frequency?: string;
  cycle?: string;
  notes: string[];
  /**
   * One line that reads as a sentence. Frequency is folded in only when her
   * dose string does not already carry it — MOTS-c states its own schedule
   * inside the dose, and printing it twice is how a reader starts wondering
   * which one is right.
   */
  summary: string;
}

function doseAlreadyStatesSchedule(dose: string | undefined, frequency: string | undefined): boolean {
  if (!dose || !frequency) return false;
  const d = dose.toLowerCase();
  return /\b(daily|weekly|monthly|times?\s+(a|per)\s+(day|week|month)|every)\b/.test(d);
}

export function getExpandedRuling(peptideId: string): ExpandedRuling | null {
  const r = getClinicianRuling(peptideId);
  return r ? expandRuling(r) : null;
}

export function expandRuling(r: ClinicianRuling): ExpandedRuling {
  const id = r.peptideId;
  const dose = r.dose?.verbatim ? expandClinicianText(r.dose.verbatim, `${id} dose`) : undefined;
  const frequency = r.frequency ? expandClinicianText(r.frequency, `${id} frequency`) : undefined;
  const cycle = r.cycle?.verbatim ? expandClinicianText(r.cycle.verbatim, `${id} cycle`) : undefined;
  const notes = (r.notes ?? []).map((n, i) => expandClinicianText(n, `${id} note ${i}`));

  const parts: string[] = [];
  if (dose) parts.push(dose);
  if (frequency && !doseAlreadyStatesSchedule(r.dose?.verbatim, r.frequency)) {
    // Mid-sentence in the summary, so it loses the sentence case it carries
    // when shown on its own line: "1 mg – 2 mg, Every 4–6 days" reads wrong.
    parts.push(parts.length ? frequency.charAt(0).toLowerCase() + frequency.slice(1) : frequency);
  }
  if (cycle) parts.push(cycle === 'As long as needed' ? 'run as long as needed' : `over ${cycle}`);

  return {
    peptideId: id,
    verbatim: {
      dose: r.dose?.verbatim,
      frequency: r.frequency,
      cycle: r.cycle?.verbatim,
      notes: r.notes,
    },
    dose,
    frequency,
    cycle,
    notes,
    summary: parts.join(', '),
  };
}

/**
 * Expand a set of rulings the caller has already chosen.
 *
 * This module used to enumerate CLINICIAN_RULINGS itself, and verify:safetyonly
 * was right to fail on it: an unfiltered list of rulings is precisely what the
 * safety-information-only list exists to stop reaching a screen. 5-Amino-1MQ and
 * hCG are both ruled AND withdrawn, so a caller that asked this module for
 * "everything" would have rendered figures Edward pulled.
 *
 * Choosing WHICH compounds a surface may speak about is a decision for the
 * caller, which knows its audience. This module only renders what it is handed.
 */
export function expandRulings(rulings: ClinicianRuling[]): ExpandedRuling[] {
  return rulings.map(expandRuling);
}
