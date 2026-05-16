/**
 * Source catalog — initial 15 entries spanning GLP-1, GH secretagogues,
 * and BPC-157 / TB-500. Every entry includes a lastReviewed date so the
 * freshness helper can flag entries that haven't been verified in 18+
 * months.
 *
 * Editorial standard: prefer peer-reviewed primary sources. Review articles
 * acceptable for older drugs with a deep evidence base. Lab technical data
 * sheets are a last resort and tagged as such so users know the strength
 * of the evidence.
 *
 * IMPORTANT: when adding a new entry, also update peptideIds with every
 * peptide whose claims this source substantiates — that's how the Resources
 * page filters by peptide.
 */

import { Source } from '../types/sources';

/** Returns every catalogued source where the given peptide id appears in
 *  the source's peptideIds list. Empty array if none — callers should
 *  treat that as "no curated sources yet" and hide the section, not as
 *  an error. */
export function getSourcesByPeptide(peptideId: string): Source[] {
  return SOURCES.filter((s) => s.peptideIds?.includes(peptideId) ?? false);
}

export const SOURCES: Source[] = [
  // ─── GLP-1 family ──────────────────────────────────────────────────────────
  {
    id: 'wilding-2021-step1',
    type: 'clinical_trial',
    title:
      'Once-Weekly Semaglutide in Adults with Overweight or Obesity (STEP 1)',
    authors: ['Wilding JPH', 'Batterham RL', 'Calanna S', 'et al.'],
    year: 2021,
    journal: 'New England Journal of Medicine',
    pubmedId: 'PMID: 33567185',
    doi: '10.1056/NEJMoa2032183',
    url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2032183',
    trialId: 'NCT03548935',
    lastReviewed: '2026-04-29',
    quote:
      '2.4 mg semaglutide produced mean weight loss of -14.9% at 68 weeks vs -2.4% placebo.',
    peptideIds: ['semaglutide'],
    topics: ['efficacy', 'dosing', 'long_term_outcomes'],
  },
  {
    id: 'jastreboff-2022-surmount1',
    type: 'clinical_trial',
    title:
      'Tirzepatide Once Weekly for the Treatment of Obesity (SURMOUNT-1)',
    authors: ['Jastreboff AM', 'Aronne LJ', 'Ahmad NN', 'et al.'],
    year: 2022,
    journal: 'New England Journal of Medicine',
    pubmedId: 'PMID: 35658024',
    doi: '10.1056/NEJMoa2206038',
    url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2206038',
    trialId: 'NCT04184622',
    lastReviewed: '2026-04-29',
    quote:
      '15 mg tirzepatide produced -22.5% mean weight loss at 72 weeks; 91% of participants achieved ≥5% weight loss.',
    peptideIds: ['tirzepatide'],
    topics: ['efficacy', 'dosing', 'long_term_outcomes'],
  },
  {
    id: 'jastreboff-2023-retatrutide',
    type: 'clinical_trial',
    title:
      'Triple-Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial',
    authors: ['Jastreboff AM', 'Kaplan LM', 'Frias JP', 'et al.'],
    year: 2023,
    journal: 'New England Journal of Medicine',
    pubmedId: 'PMID: 37356779',
    doi: '10.1056/NEJMoa2301972',
    url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2301972',
    trialId: 'NCT04881760',
    lastReviewed: '2026-04-29',
    quote:
      'Retatrutide 12 mg weekly produced -24.2% mean weight loss at 48 weeks; GIP/GLP-1/glucagon triple agonism.',
    peptideIds: ['retatrutide'],
    topics: ['efficacy', 'mechanism', 'dosing'],
  },
  {
    id: 'fda-ozempic-label',
    type: 'regulatory',
    title: 'Ozempic (semaglutide) Prescribing Information — FDA',
    year: 2024,
    url: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/209637s029lbl.pdf',
    lastReviewed: '2026-04-29',
    quote:
      'Boxed warning: risk of thyroid C-cell tumors. Contraindicated in patients with personal or family history of MTC or MEN 2.',
    peptideIds: ['semaglutide'],
    topics: ['safety', 'dosing'],
  },
  {
    id: 'fda-mounjaro-label',
    type: 'regulatory',
    title: 'Mounjaro (tirzepatide) Prescribing Information — FDA',
    year: 2024,
    url: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/215866s019lbl.pdf',
    lastReviewed: '2026-04-29',
    quote:
      'Recommended titration: 2.5 mg weekly for 4 weeks, then escalate by 2.5 mg every 4 weeks based on tolerability and response (max 15 mg weekly).',
    peptideIds: ['tirzepatide'],
    topics: ['safety', 'dosing', 'timing'],
  },
  {
    id: 'wadden-2024-semaglutide-protein',
    type: 'peer_reviewed',
    title:
      'Lean mass preservation during weight loss with GLP-1 receptor agonists: implications for protein intake',
    year: 2024,
    journal: 'Obesity Reviews',
    doi: '10.1111/obr.13705',
    lastReviewed: '2026-04-29',
    quote:
      'Higher protein intake (≥1.6 g/kg/day) and resistance training attenuate lean mass loss during semaglutide-mediated weight loss.',
    peptideIds: ['semaglutide', 'tirzepatide', 'retatrutide'],
    topics: ['nutrition', 'safety'],
  },

  // ─── GH secretagogues ──────────────────────────────────────────────────────
  {
    id: 'sigalos-2018-secretagogues-review',
    type: 'review_article',
    title:
      'The Safety and Efficacy of Growth Hormone Secretagogues',
    authors: ['Sigalos JT', 'Pastuszak AW'],
    year: 2018,
    journal: 'Sexual Medicine Reviews',
    pubmedId: 'PMID: 28526632',
    doi: '10.1016/j.sxmr.2017.02.004',
    lastReviewed: '2026-04-29',
    quote:
      'Ipamorelin and CJC-1295 produce dose-dependent increases in pulsatile GH release without significant prolactin or cortisol elevation seen with GHRP-6.',
    peptideIds: ['ipamorelin', 'cjc-1295', 'ghrp-2', 'ghrp-6', 'hexarelin'],
    topics: ['mechanism', 'safety', 'efficacy'],
  },
  {
    id: 'falutz-2007-tesamorelin',
    type: 'clinical_trial',
    title:
      'Effects of Tesamorelin (TH9507) on Visceral Fat in HIV-Associated Lipodystrophy',
    authors: ['Falutz J', 'Allas S', 'Blot K', 'et al.'],
    year: 2007,
    journal: 'New England Journal of Medicine',
    pubmedId: 'PMID: 17898100',
    doi: '10.1056/NEJMoa072375',
    lastReviewed: '2026-04-29',
    quote:
      'Tesamorelin 2 mg daily produced -15.2% visceral adipose tissue reduction at 26 weeks vs +5.0% placebo.',
    peptideIds: ['tesamorelin'],
    topics: ['efficacy', 'dosing'],
  },
  {
    id: 'walker-2006-sermorelin',
    type: 'review_article',
    title:
      'Sermorelin: a better approach to management of adult-onset growth hormone insufficiency?',
    authors: ['Walker RF'],
    year: 2006,
    journal: 'Clinical Interventions in Aging',
    pubmedId: 'PMID: 18044156',
    lastReviewed: '2026-04-29',
    quote:
      'Sermorelin restores physiologic pulsatile GH secretion via GHRH agonism, with negative-feedback safety not present in exogenous rhGH dosing.',
    peptideIds: ['sermorelin', 'cjc-1295'],
    topics: ['mechanism', 'safety'],
  },

  // ─── BPC-157 / TB-500 (animal + early-phase human) ────────────────────────
  {
    id: 'sikiric-2018-bpc157-review',
    type: 'review_article',
    title:
      'Brain-gut Axis and Pentadecapeptide BPC 157: Theoretical and Practical Implications',
    authors: ['Sikiric P', 'Seiwerth S', 'Rucman R', 'et al.'],
    year: 2018,
    journal: 'Current Neuropharmacology',
    pubmedId: 'PMID: 28799481',
    doi: '10.2174/1570159X15666170917114716',
    lastReviewed: '2026-04-29',
    quote:
      'Animal studies show accelerated tendon, ligament, and gut healing with BPC-157; human evidence remains limited to early-phase work.',
    peptideIds: ['bpc-157'],
    topics: ['mechanism', 'efficacy'],
  },
  {
    id: 'goldstein-2012-tb500-thymosin',
    type: 'review_article',
    title:
      'Thymosin β4: a multi-functional regenerative peptide',
    authors: ['Goldstein AL', 'Hannappel E', 'Sosne G', 'Kleinman HK'],
    year: 2012,
    journal: 'Expert Opinion on Biological Therapy',
    pubmedId: 'PMID: 22506974',
    doi: '10.1517/14712598.2012.684672',
    lastReviewed: '2026-04-29',
    quote:
      'Tβ4 (the active fragment of TB-500) promotes G-actin sequestration, cell migration, and angiogenesis in repair models.',
    peptideIds: ['tb-500'],
    topics: ['mechanism'],
  },
  {
    id: 'wada-prohibited',
    type: 'regulatory',
    title: 'WADA Prohibited List 2025',
    year: 2025,
    url: 'https://www.wada-ama.org/sites/default/files/2024-09/2025list_en_final_clean_22_august_2024.pdf',
    lastReviewed: '2026-04-29',
    quote:
      'GH secretagogues (ipamorelin, CJC-1295, sermorelin, hexarelin, etc.), GHRPs, and IGF-1 are prohibited at all times under S2.2.',
    peptideIds: [
      'ipamorelin',
      'cjc-1295',
      'sermorelin',
      'tesamorelin',
      'ghrp-2',
      'ghrp-6',
      'hexarelin',
      'igf-1-lr3',
    ],
    topics: ['safety', 'interactions'],
  },

  // ─── Metabolic / longevity ─────────────────────────────────────────────────
  {
    id: 'lee-2015-motsc-mtdna',
    type: 'peer_reviewed',
    title:
      'The mitochondrial-derived peptide MOTS-c promotes metabolic homeostasis',
    authors: ['Lee C', 'Zeng J', 'Drew BG', 'et al.'],
    year: 2015,
    journal: 'Cell Metabolism',
    pubmedId: 'PMID: 25738459',
    doi: '10.1016/j.cmet.2015.02.009',
    lastReviewed: '2026-04-29',
    quote:
      'MOTS-c improves insulin sensitivity and glucose homeostasis in mice; AMPK-mediated mechanism affects skeletal muscle metabolism.',
    peptideIds: ['mots-c'],
    topics: ['mechanism', 'efficacy'],
  },
  {
    id: 'khavinson-2012-epitalon',
    type: 'review_article',
    title:
      'Peptide regulation of aging: 35-year experimental and clinical studies',
    authors: ['Khavinson VK', 'Anisimov VN'],
    year: 2012,
    journal: 'Advances in Gerontology',
    pubmedId: 'PMID: 23289301',
    lastReviewed: '2026-04-29',
    quote:
      'Tetrapeptide epitalon (Ala-Glu-Asp-Gly) shown to extend mean lifespan in rodent models; human data remains preliminary.',
    peptideIds: ['epithalon'],
    topics: ['efficacy', 'mechanism', 'long_term_outcomes'],
  },
  {
    id: 'heffernan-2010-aod9604',
    type: 'review_article',
    title:
      'AOD9604: A novel anti-obesity therapeutic without growth hormone side-effects',
    year: 2010,
    journal: 'Diabetes & Metabolism',
    lastReviewed: '2026-04-29',
    quote:
      'AOD9604 (hGH 177-191 fragment) showed lipolytic effects in early-phase studies but failed phase 2b efficacy endpoint vs placebo.',
    peptideIds: ['aod-9604'],
    topics: ['efficacy', 'mechanism'],
  },
];
