/**
 * Goal → peptide recommendation matrix.
 *
 * Curated mapping from each GoalType to the peptide IDs most commonly
 * researched / discussed for that goal. Order within each list is the
 * recommendation rank (most-popular / best-evidence first).
 *
 * Rationale: the existing peptide data (`primaryUses`, `commonGoals`)
 * is free-text and not reliable for fuzzy matching. This file is the
 * structured source of truth for the cycle planner's recommender.
 *
 * NOT a clinical recommendation. The list reflects which peptides users
 * commonly research for each goal — final dose / cycle decisions belong
 * with a qualified provider. The plan UI surfaces this clearly.
 */

import type { GoalType } from '../types';

export interface GoalPeptideMatch {
  /** Peptide id (matches `Peptide.id`). */
  id: string;
  /** Tier of evidence / popularity for this goal — drives the UI badge. */
  tier: 'primary' | 'secondary' | 'experimental';
  /** One-line "why this peptide for this goal" explanation. */
  reason: string;
}

export const GOAL_PEPTIDE_MATRIX: Record<GoalType, GoalPeptideMatch[]> = {
  weight_loss: [
    { id: 'tirzepatide', tier: 'primary', reason: 'Dual GIP/GLP-1 agonist, ~20-25% body weight loss in trials.' },
    { id: 'semaglutide', tier: 'primary', reason: 'GLP-1 agonist, FDA-approved for weight management.' },
    { id: 'retatrutide', tier: 'primary', reason: 'Triple agonist (GLP-1/GIP/glucagon), ~24% weight loss in Phase 2.' },
    { id: 'cagrilintide', tier: 'secondary', reason: 'Amylin analog, synergistic with GLP-1s for satiety.' },
    { id: 'aod-9604', tier: 'secondary', reason: 'HGH-derived fragment for targeted lipolysis without HGH side-effects.' },
    { id: 'mots-c', tier: 'secondary', reason: 'Mitochondrial peptide, improves metabolic flexibility.' },
  ],

  muscle_gain: [
    { id: 'igf-1-lr3', tier: 'primary', reason: 'Long-acting IGF-1, drives muscle hypertrophy and recovery.' },
    { id: 'cjc-1295', tier: 'primary', reason: 'GHRH analog, sustained GH/IGF-1 elevation.' },
    { id: 'ipamorelin', tier: 'primary', reason: 'Selective GH secretagogue, paired with CJC-1295 for synergy.' },
    { id: 'tesamorelin', tier: 'secondary', reason: 'GHRH analog, FDA-approved; lean mass gains.' },
    { id: 'ghrp-6', tier: 'secondary', reason: 'GH releaser + appetite stimulation for bulking phases.' },
    { id: 'hexarelin', tier: 'experimental', reason: 'Potent GH secretagogue, short cycles only.' },
  ],

  body_recomp: [
    { id: 'tirzepatide', tier: 'primary', reason: 'Drops fat while a paired GH peptide preserves lean mass.' },
    { id: 'cjc-1295', tier: 'primary', reason: 'GH elevation supports muscle while in caloric deficit.' },
    { id: 'ipamorelin', tier: 'primary', reason: 'Gentle GH pulse, often stacked with CJC-1295.' },
    { id: 'aod-9604', tier: 'secondary', reason: 'Targeted lipolysis without affecting blood sugar.' },
    { id: 'mots-c', tier: 'secondary', reason: 'Improves insulin sensitivity and metabolic flexibility.' },
    { id: '5-amino-1mq', tier: 'experimental', reason: 'NNMT inhibitor, redirects energy from fat storage to lean tissue.' },
  ],

  recovery: [
    { id: 'bpc-157', tier: 'primary', reason: 'Body protection compound, broad tissue/tendon/gut healing.' },
    { id: 'tb-500', tier: 'primary', reason: 'Thymosin beta-4 fragment, accelerates soft-tissue repair.' },
    { id: 'ghk-cu', tier: 'secondary', reason: 'Copper peptide, collagen synthesis and inflammation modulation.' },
    { id: 'thymosin-alpha-1', tier: 'secondary', reason: 'Immune modulation, supports recovery from over-training.' },
    { id: 'kpv', tier: 'experimental', reason: 'Anti-inflammatory tripeptide, gut and joint applications.' },
  ],

  longevity: [
    { id: 'epitalon', tier: 'primary', reason: 'Telomerase activator, well-researched longevity peptide.' },
    { id: 'mots-c', tier: 'primary', reason: 'Mitochondrial-derived peptide, age-related metabolic decline.' },
    { id: 'thymalin', tier: 'secondary', reason: 'Thymic peptide, immune resilience with age.' },
    { id: 'thymosin-alpha-1', tier: 'secondary', reason: 'Immune modulation; prophylactic longevity stack staple.' },
    { id: 'humanin', tier: 'experimental', reason: 'Mitochondrial peptide, neuroprotection and metabolic health.' },
  ],

  cognitive: [
    { id: 'semax', tier: 'primary', reason: 'Russian nootropic, BDNF upregulation, focus and memory.' },
    { id: 'selank', tier: 'primary', reason: 'Anxiolytic nootropic, working memory and mood.' },
    { id: 'cerebrolysin', tier: 'secondary', reason: 'Neurotrophic peptide mixture, Russia/EU clinical use for cognitive decline.' },
    { id: 'dihexa', tier: 'secondary', reason: 'Angiotensin-IV analog, synaptogenesis (highly potent).' },
    { id: 'pinealon', tier: 'experimental', reason: 'Pineal-derived tripeptide, neuroprotection.' },
  ],

  sleep: [
    { id: 'dsip', tier: 'primary', reason: 'Delta-sleep-inducing peptide, deeper slow-wave sleep.' },
    { id: 'cjc-1295', tier: 'secondary', reason: 'GH pulse improves sleep architecture; pre-bed dose.' },
    { id: 'ipamorelin', tier: 'secondary', reason: 'Pairs with CJC for nocturnal GH; minimal cortisol bump.' },
    { id: 'epitalon', tier: 'experimental', reason: 'Melatonin/circadian effects via pineal peptides.' },
  ],

  energy: [
    { id: 'mots-c', tier: 'primary', reason: 'Mitochondrial efficiency, sustained energy output.' },
    { id: 'nad-plus', tier: 'primary', reason: 'NAD+ precursor, cellular energy production.' },
    { id: 'cjc-1295', tier: 'secondary', reason: 'GH elevation, recovery and daytime energy.' },
    { id: 'humanin', tier: 'experimental', reason: 'Metabolic resilience, age-related energy decline.' },
  ],

  immune: [
    { id: 'thymosin-alpha-1', tier: 'primary', reason: 'Thymic peptide, T-cell maturation and immune balance.' },
    { id: 'thymalin', tier: 'primary', reason: 'Thymic-derived, immune restoration in aging/illness.' },
    { id: 'll-37', tier: 'secondary', reason: 'Antimicrobial peptide, broad-spectrum innate immunity.' },
    { id: 'bpc-157', tier: 'secondary', reason: 'Modulates inflammation and supports gut barrier (gut = 70% of immune system).' },
  ],

  gut_health: [
    { id: 'bpc-157', tier: 'primary', reason: 'Body protection compound, gold standard for gut healing.' },
    { id: 'kpv', tier: 'primary', reason: 'Anti-inflammatory tripeptide, IBD/colitis applications.' },
    { id: 'larazotide', tier: 'secondary', reason: 'Tight-junction modulator, leaky gut and gluten sensitivity.' },
    { id: 'thymosin-alpha-1', tier: 'secondary', reason: 'Immune modulation supports gut microbiome balance.' },
  ],

  skin_hair: [
    { id: 'ghk-cu', tier: 'primary', reason: 'Copper peptide, collagen + hair follicle stimulation.' },
    { id: 'tb-500', tier: 'primary', reason: 'Tissue repair, skin elasticity and wound healing.' },
    { id: 'bpc-157', tier: 'secondary', reason: 'Collagen synthesis support; topical and systemic applications.' },
    { id: 'melanotan-ii', tier: 'experimental', reason: 'Melanocortin agonist, tanning and skin pigmentation.' },
  ],

  hormonal: [
    { id: 'kisspeptin', tier: 'primary', reason: 'GnRH stimulation, fertility and endogenous hormone support.' },
    { id: 'pt-141', tier: 'primary', reason: 'Melanocortin agonist, sexual desire pathway.' },
    { id: 'gonadorelin', tier: 'secondary', reason: 'GnRH analog, HPG axis maintenance during TRT.' },
    { id: 'cjc-1295', tier: 'secondary', reason: 'GHRH analog supports natural GH/IGF-1 axis.' },
  ],

  general_wellness: [
    { id: 'bpc-157', tier: 'primary', reason: 'Versatile recovery peptide, broad applications.' },
    { id: 'mots-c', tier: 'primary', reason: 'Metabolic and mitochondrial support.' },
    { id: 'thymosin-alpha-1', tier: 'secondary', reason: 'Immune resilience and stress recovery.' },
    { id: 'epitalon', tier: 'secondary', reason: 'Longevity and circadian support.' },
  ],
};

/**
 * Recommend peptides for a goal. Returns matches in rank order.
 * Caller can filter by tier, intersect with user's experience level, or
 * exclude allergens/contraindications.
 */
export function recommendPeptidesForGoal(
  goal: GoalType,
  options?: {
    /** Exclude experimental peptides (default false — show all). */
    primaryOnly?: boolean;
    /** Exclude these peptide IDs from results. */
    exclude?: string[];
    /** Cap how many to return. */
    limit?: number;
  },
): GoalPeptideMatch[] {
  const matches = GOAL_PEPTIDE_MATRIX[goal] ?? [];
  let filtered = matches;
  if (options?.primaryOnly) {
    filtered = filtered.filter((m) => m.tier === 'primary');
  }
  if (options?.exclude?.length) {
    const set = new Set(options.exclude);
    filtered = filtered.filter((m) => !set.has(m.id));
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  return filtered;
}
