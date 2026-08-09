/**
 * Vial strengths these compounds are commonly found in.
 *
 * ⚠️ READ THIS BEFORE ADDING ANYTHING
 * Edward, 2026-08-08: **"if this is peptalk — there is zero suppliers and sales,
 * this is all education."**
 *
 * PepTalk sells nothing and sources nothing. It teaches. This file was first
 * written as a "supplier catalog" — product names, who stocks what, where the
 * numbers were transcribed from — and that framing was wrong twice over: it
 * described a commercial relationship this app does not have, and it leaked
 * into behaviour by narrowing the calculator's options to what one source
 * stocked. Both are gone.
 *
 * What is left is reference data of one kind: **what strengths a compound
 * turns up in**, so the calculator has a sensible number to start from and the
 * reader has realistic options to explore. Nothing here decides what the app
 * will compute — the mg field is free-text and every compound gets the same
 * ladder. See getVialSizeOptions.
 *
 * Do NOT record where material comes from, who stocks it, or what anything
 * costs. None of that is education, and none of it belongs in this app.
 *
 * ── The GLP-* codes are resolved by CAS, not by guessing ──
 * "GLP-2TZ is probably tirzepatide" is not a basis for writing a vial strength
 * into a dosing app. It did not need a judgement call: each carries an explicit
 * chemical name AND a CAS registry number, which uniquely identifies a
 * substance.
 *
 *   GLP-1SG  Semaglutide    CAS 910463-68-2
 *   GLP-2TZ  Tirzepatide    CAS 2023788-19-2
 *   GLP-3RT  Retatrutide    CAS 2381089-83-2
 *   GLP-1SV  Survodutide    CAS 2805997-46-8
 *   GLP-1MZ  Mazdutide      CAS 2259884-03-0
 *   GLP-1CG  Cagrilintide   CAS 1415456-99-3
 *
 * The CAS is recorded on each entry so the identification stays auditable — a
 * name can be written down wrong; a CAS number identifies the molecule.
 *
 * ⚠️ DO NOT infer a diluent volume or a dose schedule from these numbers. A
 * vial strength is a physical fact about a vial. A dose is a clinical claim.
 * Every entry in peptideDosingReference.ts traces to a source document, and
 * where one was ambiguous it was confirmed with Edward — see BPC-157, where a
 * doc reading "add 3mg" was resolved to 3 mL only after asking.
 */

export interface KnownVial {
  /** Vial strengths this compound is commonly found in, mg, smallest first. */
  vialMg: number[];
  /** Physical form — powder vs solution changes how it is dosed. */
  form: string;
  /**
   * CAS registry number where the compound has one. Recorded for the GLP-*
   * codes especially: it is what makes "GLP-2TZ is tirzepatide" a verifiable
   * fact rather than a plausible reading of a name.
   */
  cas?: string;
}

/** Keyed by the peptide id used in src/data/peptides.ts. */
export const KNOWN_VIAL_SIZES: Record<string, KnownVial> = {
  'cerebrolysin': {
    vialMg: [60],
    form: 'Lyophilized Powder',
  },
  'thymalin': { vialMg: [10], form: 'Lyophilized Powder' },
  'ss-31': { vialMg: [10], form: 'Lyophilized Powder' },
  'snap-8': { vialMg: [10], form: 'Lyophilized Powder' },
  'ghrp-2': { vialMg: [5, 10], form: 'Lyophilized Powder' },
  'ghrp-6': { vialMg: [5, 10], form: 'Lyophilized Powder' },
  'hgh-fragment-176-191': {
    vialMg: [5],
    form: 'Lyophilized Powder',
  },
  'kisspeptin-10': { vialMg: [5, 10], form: 'Lyophilized Powder' },
  'humanin': { vialMg: [5, 10], form: 'Lyophilized Powder' },
  'ara-290': { vialMg: [10], form: 'Lyophilized Powder' },
  'foxo4-dri': { vialMg: [10], form: 'Lyophilized Powder' },
  'follistatin-344': {
    vialMg: [1],
    form: 'Lyophilized Powder',
  },
  'aod-9604': { vialMg: [5, 10], form: 'Lyophilized peptide powder' },

  // ── GLP-* codes, resolved by CAS ──────────────────────────────────────────
  // Supplied as a liquid and lyophilised, so the vial holds powder dosed by
  // mass — same as everything else here.
  'tirzepatide': {
    vialMg: [5, 10, 15, 30, 60],
    form: 'Lyophilized Powder',
    cas: '2023788-19-2',
  },
  'survodutide': {
    vialMg: [10],
    form: 'Lyophilized Powder',
    cas: '2805997-46-8',
  },
  'mazdutide': {
    vialMg: [10],
    form: 'Lyophilized Powder',
    cas: '2259884-03-0',
  },
  // These three already have a reconstitution reference; recorded here too so
  // every known strength sits in one place.
  'semaglutide': {
    vialMg: [5, 10, 30],
    form: 'Lyophilized Powder',
    cas: '910463-68-2',
  },
  'retatrutide': {
    vialMg: [5, 10, 30, 60],
    form: 'Lyophilized Powder',
    cas: '2381089-83-2',
  },
  'cagrilintide': {
    vialMg: [5, 10],
    form: 'Lyophilized Powder',
    cas: '1415456-99-3',
  },
};

/** Known vial strengths for a peptide, or null if we have none on file. */
export function getKnownVialSizes(peptideId: string): KnownVial | null {
  return KNOWN_VIAL_SIZES[peptideId] ?? null;
}

/**
 * Common vial strengths, offered as quick-picks in the calculator.
 *
 * Vial size is a property of the VIAL, not the compound — the same peptide
 * turns up as 5 mg from one source and 10 or 30 from another. Pinning one
 * number per compound hands a confidently wrong concentration to everyone
 * holding a different vial: that is the retatrutide case, where a 10 mg vial
 * silently got 5 mg maths and the wrong unit count on every draw.
 *
 * So the user picks and the maths follows. These are the strengths that
 * actually turn up in practice rather than invented round numbers, but they
 * are a CONVENIENCE, not a constraint — the mg field is free-text, so any vial
 * works, including the long tail these skip: 0.1 mg IGF-1 LR3, 500 mg NAD+,
 * 1500 mg glutathione.
 */
export const STANDARD_VIAL_MG: number[] = [2, 5, 10, 15, 20, 30, 50, 60, 100];

/**
 * Vial strengths to offer as quick-picks. The SAME ladder for every compound.
 *
 * An earlier version narrowed this to the per-compound list where we had one,
 * so Cerebrolysin offered 60 mg and nothing else. That is wrong for what this
 * app is. PepTalk teaches: someone reading about a compound should be able to
 * put in whatever vial they are curious about — one they hold, one they saw
 * elsewhere, one they are comparing against — and have the maths follow.
 * Restricting the options turns an exploration tool into a catalogue and
 * quietly tells the reader their vial does not exist.
 *
 * KNOWN_VIAL_SIZES stays as reference data — it is where the ladder's values
 * came from, and it carries the CAS mapping — but it does not gate what the
 * calculator will compute.
 */
export function getVialSizeOptions(_peptideId?: string): number[] {
  return STANDARD_VIAL_MG;
}

/**
 * The most common vial strength — the starting point when we have nothing
 * better. 10 mg is the strength that turns up most often.
 */
export const DEFAULT_VIAL_MG = 10;

/**
 * A vial strength to PREFILL the calculator with, so the maths runs the moment
 * a compound is opened instead of sitting on a dead form.
 *
 * WHY THIS EXISTS
 * The calculator only primed its inputs when the compound had a curated
 * reconstitution reference. 33 of 79 compounds have one, so the other 46 — 58%
 * of the library — opened to an empty mg field, which made `result` null and
 * rendered no concentration, no syringe draw, no vial-duration, nothing. The
 * calculator was silently unavailable for most of the app while looking
 * perfectly normal.
 *
 * Preference order, best evidence first:
 *   1. the curated reference's vialMg  (caller passes it — real, verified)
 *   2. a known strength for that compound (observed, not invented)
 *   3. DEFAULT_VIAL_MG                 (a starting point, nothing more)
 *
 * ⚠️ This is a PREFILL FOR AN INPUT, not a claim about the compound, and the
 * distinction is the whole point. Inventing a dose or a schedule would be
 * asserting clinical fact we do not have — that is the line this app must not
 * cross. Choosing which number to put in a user-editable box, sitting directly
 * above a row of one-tap alternatives with the current one highlighted, asserts
 * nothing: the vial in play is always visible on screen and always one tap from
 * being changed. That visibility is what stops the retatrutide failure, where
 * the assumed strength was buried in a text field nobody re-read.
 */
export function getDefaultVialMg(peptideId?: string, referenceVialMg?: number): number {
  if (referenceVialMg && referenceVialMg > 0) return referenceVialMg;
  const known = peptideId ? KNOWN_VIAL_SIZES[peptideId] : undefined;
  return known?.vialMg[0] ?? DEFAULT_VIAL_MG;
}
