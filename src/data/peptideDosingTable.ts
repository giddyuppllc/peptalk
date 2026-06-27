/**
 * PepTalk MASTER DOSING-REFERENCE TABLE
 * ======================================
 *
 * Transcribed verbatim from Edward's master peptide dosing table
 * (IMG_4146.jpeg, "page 2 of 11"), ingested 2026-06-16. ~63 compounds.
 *
 * This is a *research dosing reference* — it is NOT medical advice and is
 * consistent with PepTalk's locked calculator clinical rules. It captures
 * the at-a-glance columns from the source table:
 *
 *   Compound | Dosing Range | Cycle Length | Frequency (Daily) |
 *   Frequency (Weekly) | Titration Strategy ("Click For Notes [n]") |
 *   Time Off Between Cycles | Fasted (Yes/No)
 *
 * RELATIONSHIP TO peptideDosingReference.ts
 * -----------------------------------------
 * `peptideDosingReference.ts` holds the *reconstitution + syringe-unit*
 * ladder (vial mg, diluent mL, units, doseMcg) the calculator uses for
 * the math. THIS file holds the broader at-a-glance protocol envelope
 * (range/cycle/frequency/time-off/fasted) for ~63 compounds — a superset
 * by count. The two are complementary and looked up by the same
 * peptideId; nothing here duplicates the reconstitution math.
 *
 * TITRATION NOTES ("Click For Notes [1..63]")
 * -------------------------------------------
 * The source table's "Titration Strategy" column is a reference link
 * ("Click For Notes [n]") whose actual prose lives on SEPARATE pages that
 * were NOT part of the ingested image. Each entry below records the note
 * INDEX in `titrationNoteRef` and flags it `titrationNotePending: true`.
 * When the Notes [1-63] pages are supplied, fill `titrationNote` with the
 * transcribed prose; the UI already renders it when present and shows a
 * "details pending" hint when absent.
 */

export interface DosingTableEntry {
  /**
   * Canonical peptide id from src/data/peptides.ts when a match exists,
   * otherwise a slugified id for compounds not yet in the catalog.
   */
  peptideId: string;
  /** Compound label exactly as written in the source table. */
  compound: string;
  /** True when peptideId matches an entry in src/data/peptides.ts. */
  inCatalog: boolean;
  /** Dosing Range column (verbatim). */
  dosingRange: string;
  /** Cycle Length column (verbatim). "-" in the source becomes undefined. */
  cycleLength?: string;
  /** Frequency — Daily column (verbatim). "-" becomes undefined. */
  frequencyDaily?: string;
  /** Frequency — Weekly column (verbatim). "-" becomes undefined. */
  frequencyWeekly?: string;
  /**
   * Titration Strategy reference index from the "Click For Notes [n]"
   * column. The prose lives on separate pages not yet ingested.
   */
  titrationNoteRef: number;
  /** Transcribed titration prose — populated once Notes [n] pages arrive. */
  titrationNote?: string;
  /** True until the separate Notes [n] page is transcribed into titrationNote. */
  titrationNotePending: boolean;
  /** Time Off Between Cycles column (verbatim). "-" becomes undefined. */
  timeOffBetweenCycles?: string;
  /** Fasted column — true = "Yes", false = "No", undefined = blank. */
  fasted?: boolean;
}

/**
 * Master table — order matches the source document top-to-bottom.
 *
 * `inCatalog` peptideIds were matched against src/data/peptides.ts
 * (55 catalogued compounds). Compounds with no catalog entry keep a
 * slug id and inCatalog:false so they're complete here without
 * fabricating a catalog peptide.
 */
export const PEPTIDE_DOSING_TABLE: DosingTableEntry[] = [
  // ───────────── GH SECRETAGOGUES / GROWTH ─────────────
  {
    peptideId: 'tesamorelin',
    compound: 'Tesamorelin',
    inCatalog: true,
    dosingRange: '0.5mg-2mg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1x Daily AM/PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 1,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: true,
  },
  {
    peptideId: 'cjc-1295',
    compound: 'CJC-1295 W/ Dac',
    inCatalog: true,
    dosingRange: '1mg-2mg',
    cycleLength: '3-6 Months',
    frequencyWeekly: '1-2x Week',
    titrationNoteRef: 2,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'cjc-1295-no-dac',
    compound: 'CJC-1295 No Dac',
    inCatalog: false,
    dosingRange: '100mcg-300mcg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1-3x Daily AM/Workout/PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 3,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'ipamorelin',
    compound: 'Ipamorelin',
    inCatalog: true,
    dosingRange: '100mcg-500mcg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1-3x Daily AM/Workout/PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 4,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'cjc-1295-ipamorelin',
    compound: 'CJC No Dac/Ipamorelin',
    inCatalog: false,
    dosingRange: '200mcg-600mcg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1-3x Daily AM/Workout/PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 5,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'aod-9604',
    compound: 'Aod-9604',
    inCatalog: true,
    dosingRange: '250mcg-500mcg',
    cycleLength: '8-12 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 6,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: true,
  },
  {
    peptideId: 'mk-677',
    compound: 'MK-677',
    inCatalog: false,
    dosingRange: '10mg-25mg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1x Daily Anytime',
    titrationNoteRef: 7,
    titrationNotePending: true,
    timeOffBetweenCycles: '3-6 Months (Reflect Cycle)',
    fasted: false,
  },
  {
    peptideId: 'sermorelin',
    compound: 'Sermorelin',
    inCatalog: true,
    dosingRange: '100mcg-500mcg',
    cycleLength: '3-6 Months',
    frequencyDaily: '1-2x Daily AM/PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 8,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'igf-1-lr3',
    compound: 'IGF-LR3',
    inCatalog: true,
    dosingRange: '25mcg-100mcg',
    cycleLength: '4-8 Week',
    frequencyDaily: '1x Daily Post Workout',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 9,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: true,
  },
  {
    peptideId: 'peg-mgf',
    compound: 'PEG-MGF',
    inCatalog: false,
    dosingRange: '200mcg-400mcg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1x Daily Post Workout',
    frequencyWeekly: '3-5x Wk Training Days Only',
    titrationNoteRef: 10,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'follistatin-344',
    compound: 'Follistatin 344',
    inCatalog: true,
    dosingRange: '0.5mg',
    cycleLength: '10-30 Days',
    frequencyDaily: '1x Daily Pre/Post Workout',
    titrationNoteRef: 11,
    titrationNotePending: true,
    timeOffBetweenCycles: '8-12 Weeks',
    fasted: false,
  },
  {
    peptideId: 'yk-11',
    compound: 'YK-11',
    inCatalog: false,
    dosingRange: '5-20mg Oral or 10-20mg Inj',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1x Daily Oral Or 2x Daily Inj',
    titrationNoteRef: 12,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  // ───────────── MITOCHONDRIAL / METABOLIC RESEARCH ─────────────
  {
    peptideId: 'mots-c',
    compound: 'Mots-c',
    inCatalog: true,
    dosingRange: '200mcg-400mcg',
    cycleLength: '4-16 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 13,
    titrationNotePending: true,
    timeOffBetweenCycles: '4 Weeks',
    fasted: true,
  },
  {
    peptideId: 'slu-pp-332',
    compound: 'SLU-PP-332',
    inCatalog: true,
    dosingRange: '500mcg-1500mcg',
    cycleLength: '8-16 Weeks',
    frequencyDaily: '1x Daily AM/Mid PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 14,
    titrationNotePending: true,
    timeOffBetweenCycles: '4 Weeks',
    fasted: false,
  },
  {
    peptideId: '5-amino-1mq',
    compound: '5-Amino-1MQ (oral)',
    inCatalog: true,
    dosingRange: '50mg-150mg',
    cycleLength: '8-16 Weeks',
    frequencyDaily: '2-3x Daily AM/Mid PM',
    titrationNoteRef: 15,
    titrationNotePending: true,
    timeOffBetweenCycles: '4 Weeks',
    fasted: false,
  },
  {
    peptideId: '5-amino-1mq-inj',
    compound: '5-Amino-1MQ (inj)',
    inCatalog: false,
    dosingRange: '0.5mg-2mg',
    cycleLength: '8-16 Weeks',
    frequencyDaily: '1-2x Daily AM/PM',
    titrationNoteRef: 16,
    titrationNotePending: true,
    timeOffBetweenCycles: '4 Weeks',
    fasted: false,
  },
  {
    peptideId: 'nad-plus',
    compound: 'Nad+',
    inCatalog: true,
    dosingRange: '200mcg-600mcg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '2-4x Week or Daily',
    titrationNoteRef: 17,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'methylene-blue',
    compound: 'Methylene Blue',
    inCatalog: false,
    dosingRange: '5mg-25mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 18,
    titrationNotePending: true,
    timeOffBetweenCycles: '4 Week Break Periodically',
    fasted: false,
  },
  {
    peptideId: 'coq10',
    compound: 'CoQ10 (inj)',
    inCatalog: false,
    dosingRange: '50mg-200mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: 'Every Other Day or Daily',
    titrationNoteRef: 19,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'ss-31',
    compound: 'SS-31',
    inCatalog: true,
    dosingRange: '2mg-5mg sometimes 10mg',
    cycleLength: '4-8 Weeks Max of 12 weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 20,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'aicar',
    compound: 'AICAR',
    inCatalog: true,
    dosingRange: '5mg-25mg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 21,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: true,
  },
  {
    peptideId: 'cardarine',
    compound: 'Cardarine (oral/inj) Gw-501516',
    inCatalog: false,
    dosingRange: '10mg-20mg',
    cycleLength: '4-16 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 22,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'bam15',
    compound: 'Bam15',
    inCatalog: false,
    dosingRange: '50mg-150mg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1-2x Daily AM/ Mid Day',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 23,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'glutathione',
    compound: 'Glutathione',
    inCatalog: true,
    dosingRange: '200mg-400mg',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '3 Days A Week',
    titrationNoteRef: 24,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'gc-1',
    compound: 'GC-1',
    inCatalog: false,
    dosingRange: '100mcg-500mcg',
    cycleLength: '4-16 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 25,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'dada',
    compound: 'DADA',
    inCatalog: false,
    dosingRange: '50mg-200mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 26,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'itpp',
    compound: 'ITPP',
    inCatalog: false,
    dosingRange: '500mg-2000mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 27,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: true,
  },
  {
    peptideId: 'glow',
    compound: 'GLOW',
    inCatalog: false,
    dosingRange: '10 Units (Diluted with 300 units)',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 28,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'll-37',
    compound: 'LL-37',
    inCatalog: true,
    dosingRange: '100mcg-500mcg',
    cycleLength: '3-6 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '3-5x A Week',
    titrationNoteRef: 29,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-6 Weeks',
    fasted: false,
  },
  // ───────────── NEURO / SEXUAL / GENERAL ─────────────
  {
    peptideId: 'pt-141',
    compound: 'PT-141',
    inCatalog: true,
    dosingRange: '0.5mg-2mg',
    cycleLength: '2-8 Weeks',
    frequencyDaily: 'As Needed',
    frequencyWeekly: 'As Needed',
    titrationNoteRef: 30,
    titrationNotePending: true,
    timeOffBetweenCycles: '1-2 Weeks',
    fasted: false,
  },
  {
    peptideId: 'semax',
    compound: 'Semax',
    inCatalog: true,
    dosingRange: '200mcg-600mcg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1-2x Daily Am/Mid Day',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 31,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: false,
  },
  {
    peptideId: 'selank',
    compound: 'Selank',
    inCatalog: true,
    dosingRange: '200mcg-600mcg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1-2x Daily Am/Mid Day',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 32,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: false,
  },
  {
    peptideId: 'kpv-inj',
    compound: 'KPV (inj)',
    inCatalog: false,
    dosingRange: '250mcg-600mcg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 33,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'kpv-oral',
    compound: 'KPV (oral)',
    inCatalog: false,
    dosingRange: '500mcg-1000mcg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1-2x Daily Am and PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 34,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'bpc-157',
    compound: 'Bpc-157 (inj/oral)',
    inCatalog: true,
    dosingRange: '250mcg-1mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1-2x Daily Am and PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 35,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  // ───────────── RECOVERY / REGENERATIVE ─────────────
  {
    peptideId: 'tb-500',
    compound: 'TB-500',
    inCatalog: true,
    dosingRange: '2mg-5mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x a Week',
    titrationNoteRef: 36,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'ghk-cu',
    compound: 'GHK-Cu (inj/oral)',
    inCatalog: true,
    dosingRange: '1mg-5mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1-2x Daily Am and PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 37,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'vip',
    compound: 'VIP',
    inCatalog: true,
    dosingRange: '50mcg-100mcg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1-3x Daily Am am PM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 38,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'ara-290',
    compound: 'ARA-290',
    inCatalog: true,
    dosingRange: '2mg-4mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 39,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'melanotan-1',
    compound: 'Melanotan 1',
    inCatalog: true,
    dosingRange: '250mcg-1000mcg',
    cycleLength: '4-12 Weeks (then maintenance)',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 40,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'melanotan-2',
    compound: 'Melanotan 2',
    inCatalog: true,
    dosingRange: '250mcg-1000mcg',
    cycleLength: '4-12 Weeks (then maintenance)',
    frequencyDaily: '1x Daily',
    titrationNoteRef: 41,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'thymosin-alpha-1',
    compound: 'Thymosin Alpha 1',
    inCatalog: true,
    dosingRange: '0.5mg-2mg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '2x Weekly',
    titrationNoteRef: 42,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: false,
  },
  // ───────────── LONGEVITY / PINEAL ─────────────
  {
    peptideId: 'pinealon',
    compound: 'Pinealon',
    inCatalog: true,
    dosingRange: '2mg-5mg',
    cycleLength: '10-20 Days',
    frequencyDaily: '1x Daily PM',
    titrationNoteRef: 43,
    titrationNotePending: true,
    timeOffBetweenCycles: '3-6 Months',
    fasted: false,
  },
  {
    peptideId: 'epithalon',
    compound: 'Epitalon',
    inCatalog: true,
    dosingRange: '2mg-5mg',
    cycleLength: '10-20 Days',
    frequencyDaily: '1x Daily PM',
    titrationNoteRef: 44,
    titrationNotePending: true,
    timeOffBetweenCycles: '3-6 Months',
    fasted: false,
  },
  // ───────────── GLP-1 / INCRETIN / WEIGHT ─────────────
  {
    peptideId: 'retatrutide',
    compound: 'Retatrutide',
    inCatalog: true,
    dosingRange: '0.5mg-12mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 45,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'tirzepatide',
    compound: 'Tirzepatide',
    inCatalog: true,
    dosingRange: '0.5mg-15mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 46,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'semaglutide',
    compound: 'Semaglutide',
    inCatalog: true,
    dosingRange: '0.25mg-2.4mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 47,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'mazdutide',
    compound: 'Mazdutide',
    inCatalog: true,
    dosingRange: '3mg-6mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 48,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'survodutide',
    compound: 'Survodutide',
    inCatalog: true,
    dosingRange: '0.5mg-2.7mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 49,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'cagrilintide',
    compound: 'Cagrilintide',
    inCatalog: true,
    dosingRange: '0.3mg-4.5mg',
    cycleLength: 'As Long As Needed',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '1-2x Weekly (Split Dose)',
    titrationNoteRef: 50,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed',
    fasted: false,
  },
  {
    peptideId: 'tesofensine',
    compound: 'Tesofensine',
    inCatalog: false,
    dosingRange: '250mcg-1000mcg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 51,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-6 Weeks',
    fasted: true,
  },
  // ───────────── SENOLYTIC / FERTILITY / MISC ─────────────
  {
    peptideId: 'foxo4-dri',
    compound: 'Foxo4-DRI',
    inCatalog: true,
    dosingRange: '5mg',
    cycleLength: '3 Days',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '3 Days',
    titrationNoteRef: 52,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-6 Months',
    fasted: false,
  },
  {
    peptideId: 'kisspeptin-10',
    compound: 'Kisspeptin',
    inCatalog: true,
    dosingRange: '50mcg-200mcg',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1-2x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 53,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'enclomiphene',
    compound: 'Enclomiphene',
    inCatalog: false,
    dosingRange: '12.5mg-25mg',
    cycleLength: '4-12 Weeks or longer if needed',
    frequencyDaily: 'Daily',
    titrationNoteRef: 54,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'hcg',
    compound: 'HCG',
    inCatalog: true,
    dosingRange: '500iu-1000iu',
    cycleLength: '4-12 Weeks',
    frequencyWeekly: '2-3x Weekly',
    titrationNoteRef: 55,
    titrationNotePending: true,
    timeOffBetweenCycles: 'As Needed Based Off Use',
    fasted: false,
  },
  {
    peptideId: 'l-carnitine',
    compound: 'L-Carnitine',
    inCatalog: false,
    dosingRange: '300mg-1000mg',
    frequencyDaily: '1-2x Daily Pre Exercise',
    frequencyWeekly: 'Daily or On Workout Days',
    titrationNoteRef: 56,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'klow',
    compound: 'KLOW',
    inCatalog: false,
    dosingRange: '10 Units (Diluted with 300 units)',
    cycleLength: '4-12 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 57,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'nad-carnitine-blend',
    compound: 'Nad+/Carnitine Amino Blend',
    inCatalog: false,
    dosingRange: '50-100 units',
    frequencyDaily: '1x Daily Pre Exercise',
    frequencyWeekly: 'Daily or On Workout Days',
    titrationNoteRef: 58,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'dsip',
    compound: 'DSIP',
    inCatalog: true,
    dosingRange: '100mcg-500mcg',
    cycleLength: '2-4 Weeks',
    frequencyDaily: '1x Daily Pre Bed',
    frequencyWeekly: 'Daily or As Needed',
    titrationNoteRef: 59,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: false,
  },
  // ───────────── NOOTROPIC / COGNITIVE ─────────────
  {
    peptideId: 'dihexa',
    compound: 'Dihexa',
    inCatalog: true,
    dosingRange: '5mg-20mg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 60,
    titrationNotePending: true,
    timeOffBetweenCycles: '4-8 Weeks',
    fasted: false,
  },
  {
    peptideId: 'alpha-gpc',
    compound: 'Alpha GPC',
    inCatalog: false,
    dosingRange: '300mg-600mg',
    frequencyDaily: '1-2x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 61,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: 'cdp-choline',
    compound: 'CDP-Choline',
    inCatalog: false,
    dosingRange: '200mg-600mg',
    frequencyDaily: '1-2x Daily',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 62,
    titrationNotePending: true,
    fasted: false,
  },
  {
    peptideId: '9-me-bc',
    compound: '9-ME-BC',
    inCatalog: false,
    dosingRange: '15mg-30mg',
    cycleLength: '4-8 Weeks',
    frequencyDaily: '1x Daily AM',
    frequencyWeekly: '5 On 2 Off or Daily',
    titrationNoteRef: 63,
    titrationNotePending: true,
    timeOffBetweenCycles: '2-4 Weeks',
    fasted: false,
  },
];

/**
 * Aliases — the master table sometimes uses a route-specific or
 * variant id (e.g. `bpc-157` covers `bpc-157 (inj/oral)`) while the
 * peptide catalog and other reference data use a slightly different id.
 * Map catalog/lookup ids → table ids so getDosingTableEntry resolves.
 */
const TABLE_ALIASES: Record<string, string> = {
  // catalog id : table id
  'kpv': 'kpv-inj', // catalog has a single `kpv`; table splits inj/oral. Default to inj entry.
  'kisspeptin-10': 'kisspeptin-10',
  // GH-secretagogue variants that share a catalog parent.
  'cjc-1295-no-dac': 'cjc-1295-no-dac',
  'cjc-1295-ipamorelin': 'cjc-1295-ipamorelin',
  'retatrutide-10mg': 'retatrutide',
  '5-amino-1mq-inj': '5-amino-1mq-inj',
};

/**
 * Look up the master dosing-table entry for a peptide id. Falls back to
 * alias resolution. Returns null when the compound isn't in the table.
 */
export function getDosingTableEntry(peptideId: string): DosingTableEntry | null {
  if (!peptideId) return null;
  const direct = PEPTIDE_DOSING_TABLE.find((e) => e.peptideId === peptideId);
  if (direct) return direct;
  const aliasTarget = TABLE_ALIASES[peptideId];
  if (aliasTarget) {
    const aliased = PEPTIDE_DOSING_TABLE.find((e) => e.peptideId === aliasTarget);
    if (aliased) return aliased;
  }
  return null;
}

/** All entries (e.g. for an at-a-glance reference screen). */
export function getAllDosingTableEntries(): DosingTableEntry[] {
  return PEPTIDE_DOSING_TABLE;
}

/**
 * Compact one-line summary used by Aimee and compact cards.
 * Example: "Range 0.5mg-2mg · Cycle 3-6 Months · 1x Daily AM/PM · Fasted".
 */
export function summarizeDosingTableEntry(e: DosingTableEntry): string {
  const segs: string[] = [`Range ${e.dosingRange}`];
  if (e.cycleLength) segs.push(`Cycle ${e.cycleLength}`);
  const freq = e.frequencyDaily ?? e.frequencyWeekly;
  if (freq) segs.push(freq);
  if (e.timeOffBetweenCycles) segs.push(`${e.timeOffBetweenCycles} off`);
  if (e.fasted === true) segs.push('Fasted');
  return segs.join(' · ');
}

/**
 * Research-use framing line attached wherever the master table data is
 * surfaced. Consistent with PEPTALK_DOSING_DISCLAIMER in
 * peptideDosingReference.ts.
 */
export const PEPTIDE_DOSING_TABLE_DISCLAIMER =
  'Research dosing reference — not medical advice. Ranges reflect research practice, not a prescription.';
