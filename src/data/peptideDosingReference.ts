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

  // ───────────────────── MOTS-C 40 MG ─────────────────────
  {
    peptideId: 'mots-c',
    peptideName: 'MOTS-c (40 mg vial)',
    vialMg: 40,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 13.33,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 200, doseStated: '1.5 units (≈200 mcg)', units: 1.5, frequency: 'daily' },
      { label: 'Weeks 3-4', weeks: '3-4', doseMcg: 400, doseStated: '3 units (≈400 mcg)', units: 3, frequency: 'daily' },
      { label: 'Weeks 5-6', weeks: '5-6', doseMcg: 600, doseStated: '4.5 units (≈600 mcg)', units: 4.5, frequency: 'daily' },
      { label: 'Weeks 7-8', weeks: '7-8', doseMcg: 800, doseStated: '6 units (≈800 mcg)', units: 6, frequency: 'daily' },
      { label: 'Weeks 9-10', weeks: '9-10', doseMcg: 1000, doseStated: '7.5 units (≈1 mg)', units: 7.5, frequency: 'daily' },
    ],
    cycleLength: '10 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── MOTS-C 10 MG ─────────────────────
  // Separate reference because the reconstitution differs.
  {
    peptideId: 'mots-c-10mg',
    peptideName: 'MOTS-c (10 mg vial)',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Start', weeks: '1-2', doseMcg: 200, doseStated: '200 mcg (6 units)', units: 6, frequency: 'daily' },
      { label: '+2 wk', weeks: '3-4', doseMcg: 400, doseStated: '400 mcg (12 units)', units: 12, frequency: 'daily' },
      { label: '+2 wk', weeks: '5-6', doseMcg: 600, doseStated: '600 mcg (18 units)', units: 18, frequency: 'daily' },
      { label: '+2 wk', weeks: '7-8', doseMcg: 800, doseStated: '800 mcg (24 units)', units: 24, frequency: 'daily' },
    ],
    cycleLength: '6-8 weeks',
    route: 'subcutaneous',
  },

  // ───────────────────── NAD+ ─────────────────────
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
        doseMcg: 20_000, // 20 mg low end; high end 100 mg
        doseStated: '20-100 units (20-100 mg)',
        units: 60, // midpoint
        frequency: 'twice weekly',
        notes: 'Start low and work up.',
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
  {
    peptideId: 'tesamorelin',
    peptideName: 'Tesamorelin',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      { label: 'Weeks 1-2', weeks: '1-2', doseMcg: 1000, doseStated: '1 mg (15 units)', units: 15, frequency: 'AM/PM fasted' },
      { label: 'Weeks 3+', weeks: '3+', doseMcg: 2000, doseStated: '2 mg/day (30 units twice daily)', units: 30, frequency: 'twice daily' },
    ],
    cycleLength: 'Open — titrate at 2 wk',
    route: 'subcutaneous',
    notes: ['Fasted: no food 2 h before or after.'],
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
  {
    peptideId: 'semaglutide',
    peptideName: 'Semaglutide',
    vialMg: 10,
    diluentMl: 3,
    diluent: 'bac_water',
    mgPerMl: 3.33,
    schedule: [
      {
        label: 'Microdosing',
        doseMcg: 1250, // mid of 1-1.5 mg
        doseStated: '1-1.5 mg (microdosing)',
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
        doseMcg: 3165, // mid of 3-3.33 mg
        doseStated: '3-3.33 mg (6-10 units)',
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
];

/**
 * Look up a peptide's authoritative dosing reference by id.
 * Returns null when the peptide isn't in this reference set — the
 * calculator and Aimee should fall through to PROTOCOL_TEMPLATES.
 */
export function getDosingReference(peptideId: string): DosingReference | null {
  return PEPTIDE_DOSING_REFERENCE.find((r) => r.peptideId === peptideId) ?? null;
}

/** Standard PepTalk safety disclaimer attached to every reference reply. */
export const PEPTALK_DOSING_DISCLAIMER =
  'This is not medical advice. Based on research dosing and current reconstitution practices used in research.';

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
