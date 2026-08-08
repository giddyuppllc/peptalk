/**
 * Supplier vial sizes — transcribed from the AgeReCode product catalog
 * (`AgeREcodeb2bweb/src/data/catalog.json`, "Unit Size" attribute, read
 * 2026-08-08). These are the vials the compounds are actually sold in.
 *
 * WHY THIS FILE EXISTS
 * `verify:data` reports 26 injectables with no reconstitution reference, so the
 * calculator cannot compute vial/diluent maths for them. A reference needs FOUR
 * things:
 *
 *   vialMg      ← this file. Real supplier data.
 *   diluentMl   ← NOT in the catalog. A protocol decision.
 *   diluent     ← NOT in the catalog (bac water vs acetic acid).
 *   schedule[]  ← NOT in the catalog. Jamie's dosing protocol.
 *
 * The catalog carries only the first: 2 of its 68 products mention anything
 * dosing-related at all, and one of those is the bacteriostatic water listing.
 * So this closes a quarter of the gap with authoritative data and leaves the
 * rest as an explicit, precise ask rather than a vague backlog.
 *
 * ⚠️ DO NOT infer the missing three from these numbers. Every entry in
 * peptideDosingReference.ts is traceable to a source document and, where it was
 * ambiguous, confirmed with Edward — see the BPC-157 entry, where a doc reading
 * "add 3mg" was resolved to 3 mL only after checking. Guessing a diluent volume
 * or a dose schedule for an injectable is precisely the class of invention this
 * app cannot afford.
 *
 * THE GLP-* WHITE-LABEL CODES ARE RESOLVED — by CAS number, not by guessing.
 * They were held back at first because "GLP-2TZ is probably tirzepatide" is not
 * a basis for writing a vial strength into a dosing app. It turned out not to
 * need a judgement call: every one of them carries an explicit Chemical Name
 * AND a CAS registry number, which is a unique identifier for a substance.
 *
 *   GLP-1SG  Semaglutide    CAS 910463-68-2
 *   GLP-2TZ  Tirzepatide    CAS 2023788-19-2
 *   GLP-3RT  Retatrutide    CAS 2381089-83-2
 *   GLP-1SV  Survodutide    CAS 2805997-46-8
 *   GLP-1MZ  Mazdutide      CAS 2259884-03-0
 *   GLP-1CG  Cagrilintide   CAS 1415456-99-3
 *
 * The CAS numbers are recorded on each entry so this is auditable later — a
 * chemical name can be edited in a product listing; a CAS number identifies the
 * molecule.
 *
 * Sourcing note (Edward, 2026-08-08): these arrive as a liquid product from
 * Eli Lilly and are lyophilised in-house. So the shipped form is powder, dosed
 * by mass, consistent with every other vial here — and the same reason
 * Cerebrolysin's protocol was corrected off 'ml'.
 */

export interface SupplierVial {
  /** Catalog product name, verbatim. */
  productName: string;
  /** Vial strengths offered, in mg, smallest first. */
  vialMg: number[];
  /** Form as the catalog states it. */
  form: string;
  /**
   * CAS registry number, where the catalog gives one. Recorded for the
   * white-label codes especially: it is what makes "GLP-2TZ is tirzepatide" a
   * verifiable fact rather than a plausible reading of a product name.
   */
  cas?: string;
}

/**
 * Keyed by the peptide id used in src/data/peptides.ts. Only unambiguous
 * name matches are recorded.
 */
export const SUPPLIER_VIAL_SIZES: Record<string, SupplierVial> = {
  'cerebrolysin': {
    productName: 'Cerebrolysin (60mg)',
    vialMg: [60],
    form: 'Lyophilized Powder',
  },
  'thymalin': { productName: 'Thymalin (10mg)', vialMg: [10], form: 'Lyophilized Powder' },
  'ss-31': { productName: 'SS-31 (10mg)', vialMg: [10], form: 'Lyophilized Powder' },
  'snap-8': { productName: 'SNAP-8 (10mg)', vialMg: [10], form: 'Lyophilized Powder' },
  'ghrp-2': { productName: 'GHRP-2', vialMg: [5, 10], form: 'Lyophilized Powder' },
  'ghrp-6': { productName: 'GHRP-6', vialMg: [5, 10], form: 'Lyophilized Powder' },
  'hgh-fragment-176-191': {
    productName: 'HGH 176-191 (5mg)',
    vialMg: [5],
    form: 'Lyophilized Powder',
  },
  'kisspeptin-10': { productName: 'Kisspeptin-10', vialMg: [5, 10], form: 'Lyophilized Powder' },
  'humanin': { productName: 'Humanin', vialMg: [5, 10], form: 'Lyophilized Powder' },
  'ara-290': { productName: 'ARA-290 (10mg)', vialMg: [10], form: 'Lyophilized Powder' },
  'foxo4-dri': { productName: 'FOX04-DRI (10mg)', vialMg: [10], form: 'Lyophilized Powder' },
  'follistatin-344': {
    productName: 'Follistatin-344 (1mg)',
    vialMg: [1],
    form: 'Lyophilized Powder',
  },
  'aod-9604': { productName: 'AOD-9604', vialMg: [5, 10], form: 'Lyophilized peptide powder' },

  // ── White-label GLP codes, resolved by CAS ────────────────────────────────
  // Liquid from Eli Lilly, lyophilised in-house — shipped as powder.
  'tirzepatide': {
    productName: 'GLP-2TZ',
    vialMg: [5, 10, 15, 30, 60],
    form: 'Lyophilized Powder',
    cas: '2023788-19-2',
  },
  'survodutide': {
    productName: 'GLP-1SV (10mg)',
    vialMg: [10],
    form: 'Lyophilized Powder',
    cas: '2805997-46-8',
  },
  'mazdutide': {
    productName: 'GLP-1MZ (10mg)',
    vialMg: [10],
    form: 'Lyophilized Powder',
    cas: '2259884-03-0',
  },
  // These three already have a reconstitution reference; recorded so the
  // supplier vial strengths are on file in one place and a future entry does
  // not have to re-derive them from a product page.
  'semaglutide': {
    productName: 'GLP-1SG',
    vialMg: [5, 10, 30],
    form: 'Lyophilized Powder',
    cas: '910463-68-2',
  },
  'retatrutide': {
    productName: 'GLP-3RT',
    vialMg: [5, 10, 30, 60],
    form: 'Lyophilized Powder',
    cas: '2381089-83-2',
  },
  'cagrilintide': {
    productName: 'GLP-1CG',
    vialMg: [5, 10],
    form: 'Lyophilized Powder',
    cas: '1415456-99-3',
  },
};

/** Vial strengths the supplier lists for a peptide, or null if unknown. */
export function getSupplierVialSizes(peptideId: string): SupplierVial | null {
  return SUPPLIER_VIAL_SIZES[peptideId] ?? null;
}

/**
 * The vial strengths that actually exist across the catalog, smallest first.
 *
 * WHY A LADDER RATHER THAN A PER-COMPOUND NUMBER
 * Vial size is a property of the SUPPLIER, not of the compound. The same
 * peptide ships as 5 mg from one source and 10 or 30 from another, and pinning
 * one number per compound would hand a confidently wrong concentration to
 * everyone holding a different vial — which is exactly what happened to
 * retatrutide, where a 10 mg vial silently got 5 mg maths and therefore the
 * wrong unit count on every single draw.
 *
 * So the calculator offers these and the user picks what they are holding.
 * Every value is observed in the AgeReCode catalog; none is invented. The
 * long tail (0.1 mg IGF-1 LR3, 500 mg NAD+, 1500 mg glutathione) is left out
 * of the quick-pick — the field stays free-text for anything unusual.
 */
export const STANDARD_VIAL_MG: number[] = [2, 5, 10, 15, 20, 30, 50, 60, 100];

/**
 * Vial strengths to offer for a peptide: the supplier's own list where we have
 * it, otherwise the standard ladder. Either way the user chooses — this only
 * decides which chips are worth showing first.
 */
export function getVialSizeOptions(peptideId: string): number[] {
  const supplier = SUPPLIER_VIAL_SIZES[peptideId];
  if (supplier && supplier.vialMg.length > 0) return supplier.vialMg;
  return STANDARD_VIAL_MG;
}
