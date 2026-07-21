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
const RAW_DOSING_TABLE: DosingTableEntry[] = [
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
  // 5-Amino-1MQ (both forms): cycleLength and fasted below supersede the
  // original master-table values ('8-16 Weeks', fasted No) per Edward's
  // "5-Amino-1MQ Cheat Sheet", supplied 2026-07-21. Notes [15] and [16]
  // transcribed from that same sheet.
  {
    peptideId: '5-amino-1mq',
    compound: '5-Amino-1MQ (oral)',
    inCatalog: true,
    dosingRange: '50mg-150mg',
    cycleLength: '4-16 Weeks',
    frequencyDaily: '2-3x Daily AM/Mid PM',
    titrationNoteRef: 15,
    titrationNote:
      'Oral: 50-150 mg per day, split into 1-3 doses of 50 mg each. When dosing more than once daily, space doses roughly 4 hours apart. Take in a fasted state for maximum effect — best in the morning fasted, ideally before fasted cardio or training. Swallow capsules or tablets with water. Cycle 4-16 weeks, then take a break of 4+ weeks to reset metabolic pathways.',
    titrationNotePending: false,
    timeOffBetweenCycles: '4 Weeks',
    fasted: true,
  },
  {
    peptideId: '5-amino-1mq-inj',
    compound: '5-Amino-1MQ (inj)',
    inCatalog: false,
    dosingRange: '0.5mg-2mg',
    cycleLength: '4-16 Weeks',
    frequencyDaily: '1-2x Daily AM/PM',
    titrationNoteRef: 16,
    titrationNote:
      'Injectable: 0.5-2 mg subcutaneously, 1-2 times daily. When dosing twice daily, space injections roughly 7-9 hours apart. Take in a fasted state for maximum effect — best in the morning fasted, ideally before fasted cardio or training. Administer subcutaneously with a 29-31g insulin syringe. Cycle 4-16 weeks, then take a break of 4+ weeks to reset metabolic pathways.',
    titrationNotePending: false,
    timeOffBetweenCycles: '4 Weeks',
    fasted: true,
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
 * Titration notes [1]–[63] — the "Click For Notes [n]" pages that were missing
 * from the original table ingest (2026-06-30). Transcribed verbatim. Each entry
 * in the table above references its note via `titrationNoteRef`; the transform
 * below fills `titrationNote` + clears `titrationNotePending`.
 */
export const TITRATION_NOTES: Record<number, string> = {
  1: 'Start at .5mg and titrate up every 1–2 weeks if tolerated, to a max dose of 2mg.',
  2: 'No real titration strategy — 1–2mg is the dosing range.',
  3: 'Start at 100mcg and increase the dose every 1–2 weeks (as needed) up to a max dose of 300mcg.',
  4: 'Start at 100mcg and increase the dose every 1–2 weeks (as needed) up to a max dose of 500mcg.',
  5: 'Start at 200mcg and increase the dose every 1–2 weeks (as needed) up to a max dose of 600mcg.',
  6: 'No real titration strategy on this one.',
  7: 'You can start low to assess effects on fasting blood glucose and increase to a max dose of 25mg.',
  8: 'Start at 100mcg and increase the dose every 1–2 weeks (as needed) up to a max dose of 500mcg.',
  9: 'Start low at 25mcg and work up to a max dose of 100mcg per administration. Increase by 25mcg weekly if needed.',
  10: 'Start low at 200mcg and work up to a max dose of 400mcg per administration. Increase by increments of 50mcg each week.',
  11: 'Start at 100mcg for the first 3–4 days, then increase if tolerated.',
  12: 'Start at the low end for 1–2 weeks, increasing gradually.',
  13: 'No titration strategy. However, you can work your dose higher beyond 1–2mg if desired.',
  14: 'No real titration strategy.',
  15: 'No real titration strategy.',
  16: 'Start low to assess tolerance and work up to a max dose of 25mg.',
  17: 'Start at 50mg and work up as needed. This compound can be overwhelming at first.',
  18: 'Start low to assess tolerance and work up to a max dose of 25mg.',
  19: 'Start low to assess tolerance and work up to a max dose of 25mg.',
  20: 'No real titration strategy. Assess a low dose, see how it combats fatigue, then work up as needed.',
  21: 'Start low and work up as needed. If fatigue symptoms present, drop the dose or the compound altogether.',
  22: 'No real titration strategy — you can increase as you see fit.',
  23: 'Start at 50mg, assess, and increase as needed — maybe after 1–2 week increments.',
  24: 'No titration strategy — just increase if desired. 600–1200mg a week is great.',
  25: 'Start low at 100mcg and assess, then increase as needed based off fat-loss and thermogenesis effects.',
  26: 'Start low at 50mg and work up as needed.',
  27: 'Start low at 500mg and work up as needed.',
  28: 'No titration needed.',
  29: 'Start very low at 100mcg to assess.',
  30: 'Start low to assess and work up to a max of 2mg. Don’t use 2x within 24 hours. Used pre-activity.',
  31: 'Start low and work up as needed, increasing each week if needed.',
  32: 'Start low and work up as needed, increasing each week if needed.',
  33: 'No titration strategy.',
  34: 'No titration strategy.',
  35: 'No titration strategy.',
  36: 'No titration strategy. If you need more, you can work up to the 5mg total weekly dose.',
  37: 'No titration strategy.',
  38: 'No titration strategy.',
  39: 'No titration strategy.',
  40: 'Start low at 250mcg for 7–10 days, then increase to 500–1000mcg daily until color is achieved. Then drop frequency to 2–3x a week to maintain color.',
  41: 'Start low at 250mcg for 7–10 days, then increase to 500–1000mcg daily until color is achieved. Then drop frequency to 2–3x a week to maintain color.',
  42: 'Start 0.5mg 2x/week; increase to 1–2mg 3x/week as needed.',
  43: 'No titration strategy needed.',
  44: 'No titration strategy needed.',
  45: 'Start low in the clinical starting range (.5–2mg) and work up every 4 weeks or as results plateau. Maybe increase by .5–2mg at a time.',
  46: 'Start low in the clinical starting range (.5–2.5mg) and work up every 4 weeks or as results plateau. Maybe increase by .5–2mg at a time.',
  47: 'Start low in the clinical starting range (.25–.5mg) and work up every 4 weeks or as results plateau. Maybe increase by .25–.5mg at a time.',
  48: 'Start low in the clinical starting range (3mg) and work up every 4 weeks or as results plateau. Maybe increase by .5mg–1mg at a time.',
  49: 'Start low in the clinical starting range (.25–.5mg) and work up every 4 weeks or as results plateau. Maybe increase by .25–.5mg at a time.',
  50: 'Start low in the clinical starting range (.25–.5mg) and work up every 4 weeks or as results plateau. Maybe increase by .25–.5mg at a time.',
  51: 'Start 0.25mg qAM → 0.5mg if tolerated; 1.0mg only for advanced users due to side-effects.',
  52: 'No titration — use for 3 days, then come off for months to allow new cells to repopulate.',
  53: 'Higher doses don’t really yield better benefits, but stay tuned in with your bloodwork.',
  54: 'Titrate up based off the need for it in bloodwork — testing Testosterone, LH, FSH, and Estrogen.',
  55: 'Titrate up based off the need for it in bloodwork — testing Testosterone, LH, FSH, and Estrogen.',
  56: 'No titration needed.',
  57: 'No titration needed.',
  58: 'No titration needed.',
  59: 'Start low at 100mcg, assess how it impacts sleep, and work up as needed.',
  60: 'Start low at 5mg, assess tolerance, and work up over the course of your cycle.',
  61: 'No titration strategy.',
  62: 'No titration strategy.',
  63: 'Only titrate up if effects are mild.',
};

/**
 * Master table with titration prose filled in from TITRATION_NOTES. Any entry
 * whose ref isn't in the map keeps titrationNotePending:true (none pending now).
 */
export const PEPTIDE_DOSING_TABLE: DosingTableEntry[] = RAW_DOSING_TABLE.map((e) => {
  const note = TITRATION_NOTES[e.titrationNoteRef];
  return note ? { ...e, titrationNote: note, titrationNotePending: false } : e;
});

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
