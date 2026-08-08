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
 * NOT INCLUDED: the catalog's white-label codes (GLP-1SG, GLP-2TZ, GLP-3RT,
 * GLP-1SV, GLP-1MZ, GLP-1CG). They almost certainly map to semaglutide,
 * tirzepatide, retatrutide and so on, but "almost certainly" is not a basis for
 * writing a vial strength into a dosing app. Confirm the mapping with Edward
 * and add them then.
 */

export interface SupplierVial {
  /** Catalog product name, verbatim. */
  productName: string;
  /** Vial strengths offered, in mg, smallest first. */
  vialMg: number[];
  /** Form as the catalog states it. */
  form: string;
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
};

/** Vial strengths the supplier lists for a peptide, or null if unknown. */
export function getSupplierVialSizes(peptideId: string): SupplierVial | null {
  return SUPPLIER_VIAL_SIZES[peptideId] ?? null;
}
