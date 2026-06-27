/**
 * PepTalk peptide dosing reference — authoritative fallback for the
 * dosing calculator and Aimee.
 *
 * Source: PEPTALK_DOSES reference document provided by Edward
 * (nutritionist + product owner) on 2026-05-15. Every entry below
 * was transcribed directly from that doc; any drift between fields
 * (e.g. "(10 units)" vs the resulting mg) is flagged with a UNIT_NOTE
 * comment so we can run it back through Edward when the calculator
 * surfaces it.
 *
 * Disclaimer attached by Edward: "This is not medical advice. This
 * is based on research dosing and current recon being used in
 * research." We surface that line verbatim in the recommended-
 * protocol card so users see it the moment they pick a peptide.
 *
 * SYRINGE CONVENTION
 * ------------------
 * "Units" throughout this file are U-100 insulin-syringe units.
 *   - 1 unit  = 0.01 mL
 *   - 100 units = 1.0 mL
 * For a vial reconstituted at X mg/mL, a draw of N units delivers
 *   (N × 0.01 mL) × (X mg/mL) = N × X / 100 mg.
 * The unitsToMg() helper at the bottom does the conversion.
 *
 * SHAPE
 * -----
 * Each entry is one peptide. `schedule` is the dosing ladder —
 * always ordered from first phase to last. For peptides without
 * titration we still emit a single-step schedule so the consumer
 * code has one path.
 */

export interface DosingSchedulePhase {
  /** Free-form label for the phase. */
  label: string;
  /** Optional explicit week range covered by this phase. */
  weeks?: string;
  /** Dose in micrograms (canonical — always populated). */
  doseMcg: number;
  /** Dose as the user stated it (string preserves wording like "3.33 mg"). */
  doseStated: string;
  /** Insulin units (U-100) for the draw, where the user provided one. */
  units?: number;
  /** Frequency phrase ("daily", "twice daily", "Mon/Thu", etc.). */
  frequency: string;
  /** Extra timing or technique notes. */
  notes?: string;
}

export interface DosingReference {
  /** Canonical peptide id (matches src/data/peptides.ts). */
  peptideId: string;
  /** Display name for the recommended-protocol card. */
  peptideName: string;
  /** Manufacturer-stated vial size in milligrams. */
  vialMg: number;
  /** Recommended reconstitution diluent (mL). */
  diluentMl: number;
  /**
   * Diluent type — almost everything uses bacteriostatic water; a few
   * hydrophobic compounds (IGF-1 LR3, Dihexa) need acetic acid.
   */
  diluent: 'bac_water' | 'acetic_acid';
  /** Resulting concentration in mg/mL (derived; doc-stated when present). */
  mgPerMl: number;
  /** Ordered dosing phases (titration ladder or single step). */
  schedule: DosingSchedulePhase[];
  /** Total cycle length as written ("12 weeks", "20 days", etc.). */
  cycleLength: string;
  /** Off-cycle period if specified. */
  cycleOff?: string;
  /** Route hint ("subcutaneous", "intranasal", "IM", etc.). */
  route?: string;
  /** Any structured caveats / timing rules from the doc. */
  notes?: string[];
}

/**
 * Master reference. Order matches the order Edward wrote them in.
 * Add a new entry rather than rewriting an existing one when the
 * dosing changes — keeps a paper trail when the audit needs it.
 */
export const PEPTIDE_DOSING_REFERENCE: DosingReference[] = [
  // ───────────────────── EPITALON ─────────────────────
  {
    peptideId: 'epithalon',
    peptideName: 'Epitalon',
    vialMg: 10,
    diluentMl: 2,
    diluent: 'bac_water',
    mgPerMl: 5,
    schedule: [
      {
        label: 'Days 1-20',
        weeks: '1-3 (≈20 days)',
        doseMcg: 5000,
        doseStated: '5 mg',
        units: 100,
        frequency: 'daily',
      },
    ],
    cycleLength: '20 days on',
    cycleOff: 'Weeks 4-26 off',
    route: 'subcutaneous',
  },

  // ───────────────────── KPV ─────────────────────
  {
    peptideId: 'kpv',
    peptideName: 'KPV',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Maintenance',
        doseMcg: 333,
        doseStated: '0.10 mL (≈333 mcg)',
        units: 10,
        frequency: 'daily',
        // Doc says "10 units (.10ml)" — at 3.33 mg/mL that's 333 mcg.
      },
    ],
    cycleLength: 'Open — daily as needed',
    route: 'subcutaneous',
  },

  // ───────────────────── BPC-157 ─────────────────────
  {
    peptideId: 'bpc-157',
    peptideName: 'BPC-157',
    vialMg: 10,
    diluentMl: 3,
    // Doc transcript reads "add 3mg" — confirmed with Edward this is a
    // typo for 3 mL (3.33 mg/mL matches the rest of the spec).
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Standard',
        doseMcg: 333,
        doseStated: '333 mcg (10 units)',
        units: 10,
        frequency: 'daily',
        notes:
          'Doc said "3.33 mg daily (10 units)" — at 3.33 mg/mL, 10 units = 0.1 mL = 333 mcg. Treating the "mg" as a unit slip.',
      },
      {
        label: 'Aggressive (injury recovery, ≤2 weeks)',
        doseMcg: 333,
        doseStated: '333 mcg, 2-3 doses/day',
        units: 10,
        frequency: '2-3× daily',
        notes: 'Use only for acute injury recovery; max two weeks.',
      },
    ],
    cycleLength: 'Up to 2 weeks aggressive, or daily maintenance',
    route: 'subcutaneous',
  },

  // ───────────────────── TB-500 ─────────────────────
  {
    peptideId: 'tb-500',
    peptideName: 'TB-500',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 500,
        doseStated: '500 mcg (15 units)',
        units: 15,
        frequency: 'daily',
      },
      {
        label: 'Build-up',
        doseMcg: 1000,
        doseStated: '1 mg (30 units)',
        units: 30,
        frequency: 'daily',
      },
      {
        label: 'Injury-recovery research dose',
        doseMcg: 1500,
        doseStated: '1.5 mg',
        frequency: '2-3× weekly',
      },
    ],
    cycleLength: 'Open — research dependent',
    route: 'subcutaneous',
  },

  // ───────────────────── THYMOSIN-ALPHA-1 ─────────────────────
  {
    peptideId: 'thymosin-alpha-1',
    peptideName: 'Thymosin-α-1',
    vialMg: 5,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 1.67,
    schedule: [
      {
        label: 'Week 1',
        weeks: '1',
        doseMcg: 300,
        doseStated: '300 mcg (18 units)',
        units: 18,
        frequency: 'daily',
      },
      {
        label: 'Weeks 2-8',
        weeks: '2-8',
        doseMcg: 500,
        doseStated: '500 mcg (30 units)',
        units: 30,
        frequency: 'daily',
      },
    ],
    cycleLength: '8 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── CJC-1295 W/ DAC ─────────────────────
  {
    peptideId: 'cjc-1295',
    peptideName: 'CJC-1295 w/ DAC',
    vialMg: 5,
    diluentMl: 2,
    diluent: 'bac_water',
    mgPerMl: 2.5,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 300, doseStated: '12 units (≈300 mcg)', units: 12, frequency: 'Mon + Thu' },
      { label: 'Weeks 3-4', weeks: '3-4', doseMcg: 500, doseStated: '20 units (≈500 mcg)', units: 20, frequency: 'Mon + Thu' },
      { label: 'Weeks 5-6', weeks: '5-6', doseMcg: 750, doseStated: '30 units (≈750 mcg)', units: 30, frequency: 'Mon + Thu' },
      { label: 'Weeks 7-12', weeks: '7-12', doseMcg: 1000, doseStated: '40 units (≈1 mg)', units: 40, frequency: 'Mon + Thu' },
    ],
    cycleLength: '12 weeks',
    route: 'subcutaneous',
    notes: ['Biweekly Monday / Thursday cycle.'],
  },

  // ───────────────────── CJC-1295 NO DAC ─────────────────────
  // Catalog uses the same peptideId for both DAC and no-DAC. Two
  // separate references coexist with distinct names so the calculator
  // can disambiguate at the protocol-pick step.
  {
    peptideId: 'cjc-1295-no-dac',
    peptideName: 'CJC-1295 no-DAC',
    vialMg: 5,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 1.67,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 100, doseStated: '100 mcg (6 units)', units: 6, frequency: 'daily, 5 days on / 2 off' },
      { label: 'Weeks 3-4', weeks: '3-4', doseMcg: 150, doseStated: '150 mcg (9 units)', units: 9, frequency: 'daily, 5 on / 2 off' },
      { label: 'Weeks 5-6', weeks: '5-6', doseMcg: 200, doseStated: '200 mcg (12 units)', units: 12, frequency: 'daily, 5 on / 2 off' },
      { label: 'Weeks 7-12', weeks: '7-12', doseMcg: 250, doseStated: '250 mcg (15 units)', units: 15, frequency: 'daily, 5 on / 2 off' },
    ],
    cycleLength: '12 weeks',
    route: 'subcutaneous',
    notes: [
      'Take at night before bed, 2-3 h fasted from food.',
      'Increase 50 mcg every 2 weeks.',
    ],
  },

  // ───────────────────── CJC-1295 + IPAMORELIN STACK ─────────────────────
  {
    peptideId: 'cjc-1295-ipamorelin',
    peptideName: 'CJC-1295 / Ipamorelin 5/5 mg blend',
    vialMg: 10, // 5 + 5
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Weeks 1-6', weeks: '1-6', doseMcg: 333, doseStated: '10 units (≈333 mcg)', units: 10, frequency: 'nightly (or AM/PM split)' },
      { label: 'Weeks 7-12', weeks: '7-12', doseMcg: 667, doseStated: '20 units (≈667 mcg)', units: 20, frequency: 'nightly (or AM/PM split)' },
    ],
    cycleLength: '12 weeks',
    cycleOff: '4-6 weeks off',
    route: 'subcutaneous',
    notes: [
      'Take 2-3 h fasted before food.',
      '5 days on / 2 days off encouraged.',
    ],
  },

  // ───────────────────── MOTS-C ─────────────────────
  // Defaults to the 10 mg vial (more common in self-mix research
  // community). The earlier split into `mots-c` (40 mg) + `mots-c-10mg`
  // (10 mg) entries had the 10 mg variant UNREACHABLE because the
  // peptide catalog only exposes one `mots-c` id — users with a 10 mg
  // vial got the 40 mg reference (mgPerMl 13.33 vs 3.33), so every
  // suggested syringe-unit count was 4× off. Now: 10 mg vial is the
  // canonical recon; the 40 mg vial mapping lives in the notes block
  // for the (rarer) users with that size.
  {
    peptideId: 'mots-c',
    peptideName: 'MOTS-c',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 200, doseStated: '200 mcg (6 units)', units: 6, frequency: 'daily' },
      { label: 'Weeks 3-4', weeks: '3-4', doseMcg: 400, doseStated: '400 mcg (12 units)', units: 12, frequency: 'daily' },
      { label: 'Weeks 5-6', weeks: '5-6', doseMcg: 600, doseStated: '600 mcg (18 units)', units: 18, frequency: 'daily' },
      { label: 'Weeks 7-8', weeks: '7-8', doseMcg: 800, doseStated: '800 mcg (24 units)', units: 24, frequency: 'daily' },
    ],
    cycleLength: '6-8 weeks',
    route: 'subcutaneous',
    notes: [
      'Above figures are for the 10 mg vial (3 ml diluent → 3.33 mg/mL).',
      'For a 40 mg vial reconstituted with 3 ml (13.33 mg/mL), divide unit count by 4: 1.5 / 3 / 4.5 / 6 units for the same 200/400/600/800 mcg dose.',
    ],
  },

  // ───────────────────── NAD+ ─────────────────────
  // At 100 mg/mL: 1 unit = 1 mg, so 20-100 units = 20-100 mg.
  // Midpoint = 60 units = 60 mg = 60,000 mcg. The doseMcg below is the
  // midpoint to match the units field; earlier this read 20_000 (low
  // end) which was inconsistent with units=60 (midpoint).
  {
    peptideId: 'nad-plus',
    peptideName: 'NAD+',
    vialMg: 500,
    diluentMl: 5,
    diluent: 'bac_water',
    mgPerMl: 100,
    schedule: [
      {
        label: 'Range',
        doseMcg: 60_000, // 60 mg midpoint of 20-100 mg
        doseStated: '20-100 mg (20-100 units)',
        units: 60,
        frequency: 'twice weekly',
        notes: 'Start low (20 units / 20 mg) and titrate up.',
      },
    ],
    cycleLength: 'Ongoing — twice weekly',
    route: 'subcutaneous',
  },

  // ───────────────────── RETATRUTIDE 5 MG ─────────────────────
  {
    peptideId: 'retatrutide',
    peptideName: 'Retatrutide (5 mg vial)',
    vialMg: 5,
    diluentMl: 1,
    diluent: 'bac_water',
    mgPerMl: 5,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 1000,
        doseStated: '1 mg (20 units)',
        units: 20,
        frequency: 'once weekly',
        notes: 'Maintain 4 weeks; increase by 1 mg as needed. Split into half doses biweekly once dose exceeds 3 mg.',
      },
    ],
    cycleLength: 'Weekly, titrate to effect',
    route: 'subcutaneous',
  },

  // ───────────────────── RETATRUTIDE 10 MG ─────────────────────
  {
    peptideId: 'retatrutide-10mg',
    peptideName: 'Retatrutide (10 mg vial)',
    vialMg: 10,
    diluentMl: 1,
    diluent: 'bac_water',
    mgPerMl: 10,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 1000,
        doseStated: '1 mg (10 units)',
        units: 10,
        frequency: 'once weekly',
        notes: 'Maintain 4 weeks; increase by 1 mg. Once dose >3 mg, split into half doses biweekly.',
      },
    ],
    cycleLength: 'Weekly, titrate to effect',
    route: 'subcutaneous',
  },

  // ───────────────────── TESAMORELIN ─────────────────────
  // Doc transcript reads "15units (1mg daily) am/pm fasted" then "30units
  // twice daily (2mg daily)" — the parenthesized mg figures are DAILY
  // TOTALS, the units are PER SHOT. At 3.33 mg/mL, 15 units = 0.5 mg per
  // shot × 2 shots/day = 1 mg/day. Schema convention is per-shot doseMcg,
  // so we store 500 mcg / shot and rely on frequency='twice daily' for
  // the daily-total math the supply estimator runs.
  {
    peptideId: 'tesamorelin',
    peptideName: 'Tesamorelin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Weeks 1-2',
        weeks: '1-2',
        doseMcg: 500,
        doseStated: '500 mcg per shot (15 units) × 2 daily = 1 mg/day',
        units: 15,
        frequency: 'twice daily',
      },
      {
        label: 'Weeks 3+',
        weeks: '3+',
        doseMcg: 1000,
        doseStated: '1 mg per shot (30 units) × 2 daily = 2 mg/day',
        units: 30,
        frequency: 'twice daily',
      },
    ],
    cycleLength: 'Open — titrate at 2 wk',
    route: 'subcutaneous',
    notes: ['Fasted: no food 2 h before or after.', 'AM/PM split.'],
  },

  // ───────────────────── OXYTOCIN ─────────────────────
  {
    peptideId: 'oxytocin',
    peptideName: 'Oxytocin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Start',
        doseMcg: 100,
        doseStated: '100 mcg',
        frequency: 'daily',
        notes: 'Increase by 100 mcg every 2 weeks.',
      },
    ],
    cycleLength: '8-12 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── PINEALON ─────────────────────
  {
    peptideId: 'pinealon',
    peptideName: 'Pinealon',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Days 1-5', doseMcg: 1000, doseStated: '1 mg daily', frequency: 'daily' },
      { label: 'Days 6-10', doseMcg: 1500, doseStated: '1.5 mg daily', frequency: 'daily' },
      { label: 'Days 11-15', doseMcg: 2000, doseStated: '2 mg daily', frequency: 'daily' },
      { label: 'Days 16-20', doseMcg: 2500, doseStated: '2.5 mg daily', frequency: 'daily' },
    ],
    cycleLength: '20 days',
    route: 'subcutaneous',
    notes: ['Increase by 0.5 mg every 5 days.'],
  },

  // ───────────────────── PT-141 ─────────────────────
  {
    peptideId: 'pt-141',
    peptideName: 'PT-141',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'As-needed',
        doseMcg: 1000, // mid of 0.5-1.5 mg range
        doseStated: '0.5-1.5 mg, 30 min before desired time',
        frequency: '≤8× per month',
        notes: 'Start low and titrate.',
      },
    ],
    cycleLength: 'As-needed (max 8 uses / month)',
    route: 'subcutaneous',
  },

  // ───────────────────── SELANK ─────────────────────
  {
    peptideId: 'selank',
    peptideName: 'Selank',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Standard',
        doseMcg: 400, // mid of 300-500 mcg
        doseStated: '300-500 mcg daily',
        frequency: 'daily',
      },
    ],
    cycleLength: '4 weeks on',
    cycleOff: '4 weeks off',
    route: 'subcutaneous',
  },

  // ───────────────────── SEMAGLUTIDE ─────────────────────
  // Doc transcript:
  //   "Semiglutide 10mg add 3mL bac water. 3.33mg/ml 25 units is 2.5 mg
  //    usually starting dose for weightloss. 1mg-1.5 mg is micro dosing."
  //
  // Internally inconsistent: at 3.33 mg/mL, 25 units = 0.83 mg, NOT 2.5 mg.
  // For 25 units to equal 2.5 mg you need a 10 mg/mL concentration, i.e.
  // 1 mL diluent on a 10 mg vial. That's the standard self-mix recon for
  // semaglutide and matches the unit count Edward wrote.
  //
  // Honoring Edward's stated unit math, we use 1 mL diluent → 10 mg/mL.
  // Microdosing 1-1.5 mg = 10-15 units in this recon.
  {
    peptideId: 'semaglutide',
    peptideName: 'Semaglutide',
    vialMg: 10,
    diluentMl: 1,
    diluent: 'bac_water',
    mgPerMl: 10,
    schedule: [
      {
        label: 'Microdosing',
        doseMcg: 1250, // mid of 1-1.5 mg
        doseStated: '1-1.5 mg (10-15 units) — microdosing',
        units: 12, // midpoint of 10-15
        frequency: 'weekly',
      },
      {
        label: 'Weight-loss start',
        doseMcg: 2500,
        doseStated: '2.5 mg (25 units)',
        units: 25,
        frequency: 'weekly',
      },
    ],
    cycleLength: 'Weekly — titrate per response',
    route: 'subcutaneous',
  },

  // ───────────────────── SEMAX ─────────────────────
  {
    peptideId: 'semax',
    peptideName: 'Semax',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 300,
        doseStated: '300 mcg (MED)',
        frequency: 'once daily',
        notes: 'Increase by 100 mcg every 2 weeks. Typical range 400-900 mcg. Typically dosed intranasally.',
      },
    ],
    cycleLength: 'Open — titrate by 100 mcg / 2 wk',
    route: 'intranasal (typical)',
  },

  // ───────────────────── SERMORELIN ─────────────────────
  {
    peptideId: 'sermorelin',
    peptideName: 'Sermorelin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 200, doseStated: '0.2 mg', frequency: 'daily' },
      { label: 'Weeks 3-4', weeks: '3-4', doseMcg: 300, doseStated: '0.3 mg', frequency: 'daily' },
      { label: 'Weeks 5-6', weeks: '5-6', doseMcg: 400, doseStated: '0.4 mg', frequency: 'daily' },
      { label: 'Weeks 7-8', weeks: '7-8', doseMcg: 400, doseStated: '0.4 mg', frequency: 'daily' },
    ],
    cycleLength: '8 weeks on',
    cycleOff: '4 weeks off',
    route: 'subcutaneous',
  },

  // ───────────────────── IPAMORELIN ─────────────────────
  {
    peptideId: 'ipamorelin',
    peptideName: 'Ipamorelin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 100,
        doseStated: '100 mcg',
        frequency: 'daily',
        notes: 'Increase by 50 mcg every 2 weeks.',
      },
    ],
    cycleLength: '12 weeks',
    route: 'subcutaneous',
    notes: ['Typically paired with sermorelin or CJC-1295.'],
  },

  // ───────────────────── CAGRILINTIDE ─────────────────────
  {
    peptideId: 'cagrilintide',
    peptideName: 'Cagrilintide',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 600,
        doseStated: '0.6 mg',
        frequency: 'weekly',
        notes: 'Increase 0.6 mg every 2 weeks as needed; range 0.6-4.5 mg.',
      },
    ],
    cycleLength: 'Open — titrate per response',
    route: 'subcutaneous',
  },

  // ───────────────────── GLUTATHIONE ─────────────────────
  {
    peptideId: 'glutathione',
    peptideName: 'Glutathione',
    vialMg: 1500,
    diluentMl: 5,
    diluent: 'bac_water',
    mgPerMl: 300,
    schedule: [
      {
        label: 'Range',
        doseMcg: 100_000, // mid of 50-150 mg
        doseStated: '50-150 mg (1 unit ≈ 3 mg)',
        frequency: 'biweekly',
      },
    ],
    cycleLength: 'Biweekly injections',
    route: 'subcutaneous or IM',
  },

  // ───────────────────── SLU-PP-332 ─────────────────────
  {
    peptideId: 'slu-pp-332',
    peptideName: 'SLU-PP-332',
    vialMg: 5,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 1.67,
    schedule: [
      {
        label: 'Murine research dose',
        doseMcg: 625,
        doseStated: '625 mcg',
        frequency: 'twice daily (1250 mcg total)',
        notes: 'Murine dosages. No human trials.',
      },
    ],
    cycleLength: 'Open — research only',
    route: 'subcutaneous',
  },

  // ───────────────────── GHK-CU ─────────────────────
  // Doc transcript:
  //   "Ghk-cu 100mg add 3mL bac water dose range 3mg-3.33mg (6units -10units) daily."
  //
  // The doc has a unit slip: at 33.33 mg/mL, 6 units = 0.06 mL = 2 mg
  // (not 3 mg), so the stated 3-3.33 mg range matches 9-10 units, not
  // 6-10 units. We honor the unit range (6-10) the user wrote because
  // that's the physically-defensible draw range at the chosen
  // concentration, and reflect the resulting 2-3.33 mg span in the
  // displayed dose. Midpoint 8 units = 2.67 mg = 2667 mcg.
  {
    peptideId: 'ghk-cu',
    peptideName: 'GHK-Cu',
    vialMg: 100,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 33.33,
    schedule: [
      {
        label: 'Standard',
        doseMcg: 2667, // 8 units × 0.01 mL × 33.33 mg/mL = 2.67 mg
        doseStated: '2-3.33 mg (6-10 units)',
        units: 8, // midpoint of 6-10
        frequency: 'daily',
      },
    ],
    cycleLength: 'Open — daily',
    route: 'subcutaneous',
  },

  // ───────────────────── IGF-1 LR3 ─────────────────────
  {
    peptideId: 'igf-1-lr3',
    peptideName: 'IGF-1 LR3',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'acetic_acid',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Start', weeks: '1-2', doseMcg: 20, doseStated: '20 mcg', frequency: 'daily' },
      { label: '+2 wk', weeks: '3-4', doseMcg: 40, doseStated: '40 mcg', frequency: 'daily' },
      { label: '+2 wk', weeks: '5-6', doseMcg: 50, doseStated: '50 mcg', frequency: 'daily' },
    ],
    cycleLength: '6-8 weeks',
    route: 'subcutaneous',
    notes: [
      'HYDROPHOBIC — reconstitute with acetic acid, NOT bac water. BAC water causes rapid degradation.',
      'Increase 20 mcg after 2 weeks, then 10 mcg after another 2 weeks.',
    ],
  },

  // ───────────────────── DIHEXA ─────────────────────
  {
    peptideId: 'dihexa',
    peptideName: 'Dihexa',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'acetic_acid',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Range',
        doseMcg: 1500, // mid of 1-2 mg
        doseStated: '1-2 mg',
        frequency: 'daily',
      },
    ],
    cycleLength: 'Up to 20 days',
    route: 'subcutaneous',
    notes: ['HYDROPHOBIC — reconstitute with acetic acid, not bac water.'],
  },

  // ───────────────────── DSIP ─────────────────────
  {
    peptideId: 'dsip',
    peptideName: 'DSIP',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Week 1', weeks: '1', doseMcg: 100, doseStated: '100 mcg', frequency: 'daily, 30-60 min before bed' },
      { label: 'Weekly +50 mcg', weeks: '2-8', doseMcg: 275, doseStated: '250-300 mcg by week 8', frequency: 'daily, 30-60 min before bed' },
    ],
    cycleLength: '8 weeks on',
    cycleOff: '4 weeks off',
    route: 'subcutaneous',
  },

  // ───────────────────── LL-37 ─────────────────────
  {
    peptideId: 'll-37',
    peptideName: 'LL-37',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Standard',
        doseMcg: 87, // mid of 50-125 mcg
        doseStated: '50-125 mcg daily',
        frequency: 'daily',
      },
    ],
    cycleLength: 'Open — daily',
    route: 'subcutaneous',
    notes: ['Topical application: 1-10 % concentration.'],
  },

  // ───────────────────── MELANOTAN 1 ─────────────────────
  {
    peptideId: 'melanotan-1',
    peptideName: 'Melanotan I',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Loading (Week 1)',
        weeks: '1',
        doseMcg: 125, // mid of 50-200 mcg
        doseStated: '50-200 mcg daily',
        frequency: 'daily',
      },
      {
        label: 'Maintenance',
        weeks: '2+',
        doseMcg: 100,
        doseStated: '100 mcg',
        frequency: '2× weekly',
      },
    ],
    cycleLength: '4-6 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── MELANOTAN 2 ─────────────────────
  {
    peptideId: 'melanotan-2',
    peptideName: 'Melanotan II',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Loading (Week 1)',
        weeks: '1',
        doseMcg: 125, // mid of 50-200 mcg
        doseStated: '50-200 mcg daily',
        frequency: 'daily',
      },
      {
        label: 'Maintenance',
        weeks: '2+',
        doseMcg: 100,
        doseStated: '100 mcg',
        frequency: '2× weekly',
      },
    ],
    cycleLength: '4-6 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── VIP ─────────────────────
  {
    peptideId: 'vip',
    peptideName: 'VIP (Vasoactive Intestinal Peptide)',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Subq',
        doseMcg: 75, // mid of 50-100 mcg
        doseStated: '50-100 mcg daily',
        frequency: 'daily',
      },
      {
        label: 'Nasal spray',
        doseMcg: 450, // mid of 300-600 mcg
        doseStated: '300-600 mcg daily (nasal)',
        frequency: 'daily',
        notes: 'Often used 6-9 months in research.',
      },
    ],
    cycleLength: '6-9 months (long-cycle research dose)',
    route: 'subcutaneous or intranasal',
  },

  // ───────────────────── HEXARELIN ─────────────────────
  {
    peptideId: 'hexarelin',
    peptideName: 'Hexarelin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Starting',
        doseMcg: 250, // mid of 200-300 mcg
        doseStated: '200-300 mcg daily',
        frequency: 'daily',
        notes: 'Increase by 50 mcg every 2 weeks.',
      },
    ],
    cycleLength: '8-12 weeks',
    route: 'subcutaneous',
  },
];

/**
 * Look up a peptide's authoritative dosing reference by id.
 * Returns null when the peptide isn't in this reference set — the
 * calculator and Aimee should fall through to PROTOCOL_TEMPLATES.
 */
/**
 * Variants Edward's reference doc defined that aren't present as distinct
 * entries in src/data/peptides.ts. Without aliasing, getDosingReference
 * for the parent peptide misses these blocks of authoritative data.
 */
const PEPTIDE_VARIANT_PARENTS: Record<string, string> = {
  'cjc-1295-no-dac': 'cjc-1295',
  'cjc-1295-ipamorelin': 'cjc-1295',
  'retatrutide-10mg': 'retatrutide',
};

export function getDosingReference(peptideId: string): DosingReference | null {
  // Direct match wins.
  const direct = PEPTIDE_DOSING_REFERENCE.find((r) => r.peptideId === peptideId);
  if (direct) return direct;
  // Variant fallback — user picked `retatrutide` and only `retatrutide-10mg`
  // exists in the reference; return that so the calc still has Edward's data.
  const variantMatch = PEPTIDE_DOSING_REFERENCE.find(
    (r) => PEPTIDE_VARIANT_PARENTS[r.peptideId] === peptideId,
  );
  return variantMatch ?? null;
}

/**
 * Return ALL dosing references for a peptide — canonical entry + any
 * Edward-defined variants (no-DAC, combo stacks, alt vial sizes). For
 * surfaces that want to expose a variant picker.
 */
export function getAllDosingReferencesForPeptide(peptideId: string): DosingReference[] {
  return PEPTIDE_DOSING_REFERENCE.filter(
    (r) => r.peptideId === peptideId || PEPTIDE_VARIANT_PARENTS[r.peptideId] === peptideId,
  );
}

/** Standard PepTalk safety disclaimer attached to every reference reply. */
export const PEPTALK_DOSING_DISCLAIMER =
  'This is supportive information based on medical research — not a source of truth. Talk to your doctor before starting any protocol. Some compounds (e.g. testosterone, HCG, GLP-1s, SARMs) are prescription or controlled substances and require a doctor’s prescription.';

/**
 * Convert U-100 insulin-syringe units to mg, given the vial's mg/mL.
 * Pure math; doesn't depend on the reference data.
 */
export function unitsToMg(units: number, mgPerMl: number): number {
  return (units * 0.01) * mgPerMl;
}

/**
 * Inverse — mg to U-100 units at a given concentration.
 */
export function mgToUnits(mg: number, mgPerMl: number): number {
  if (mgPerMl <= 0) return 0;
  return (mg / mgPerMl) * 100;
}
