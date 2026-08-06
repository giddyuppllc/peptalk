import { PeptideStack, GoalType } from '../types';

/**
 * Curated peptide stacks designed by the PepTalk Research Team.
 * Each stack targets specific research goals and is composed of
 * peptides with well-characterized complementary mechanisms.
 *
 * The useStackStore imports these and merges with user-created stacks.
 * Add new curated stacks here — no other code changes needed.
 */

const now = new Date().toISOString();

export const CURATED_STACKS: PeptideStack[] = [
  // ─── Gut & Healing ─────────────────────────────────────────────────────
  {
    id: 'curated-gut-health',
    name: 'Gut Health Stack',
    peptideIds: ['bpc-157', 'kpv-inj'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A targeted gut restoration stack. BPC-157 promotes angiogenesis and mucosal tissue repair via VEGF upregulation, while KPV directly inhibits NF-kB to suppress intestinal inflammation and support barrier integrity.',
    targetGoals: ['gut_health', 'recovery'],
    evidenceLevel: 'moderate',
  },
  {
    id: 'curated-healing',
    name: 'Healing Stack',
    peptideIds: ['bpc-157', 'tb-500', 'kpv-inj'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Anti-inflammatory recovery focused. BPC-157 and TB-500 provide the "Wolverine Stack" foundation for multi-pathway tissue repair, with KPV adding potent NF-kB inhibition to control inflammation at the source.',
    targetGoals: ['recovery', 'gut_health'],
    evidenceLevel: 'moderate',
  },

  // ─── Recovery ──────────────────────────────────────────────────────────
  {
    id: 'curated-recovery',
    name: 'Recovery Stack',
    peptideIds: ['bpc-157', 'tb-500', 'ghk-cu'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A comprehensive tissue-repair stack. BPC-157 targets growth factor signaling (VEGF, FGF, EGF), TB-500 promotes stem cell recruitment and anti-fibrotic cell migration, and GHK-Cu supports collagen synthesis and extracellular matrix remodeling.',
    targetGoals: ['recovery', 'skin_hair'],
    evidenceLevel: 'moderate',
  },

  // ─── Growth Hormone ────────────────────────────────────────────────────
  {
    id: 'curated-gh-axis',
    name: 'GH Axis Stack',
    peptideIds: ['cjc-1295', 'ipamorelin', 'nad-plus'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Growth hormone optimization with metabolic support. CJC-1295 (GHRH analog) and Ipamorelin (selective ghrelin mimetic) synergistically amplify GH pulse 3-5x. NAD+ supports sirtuin-mediated cellular repair and energy metabolism to complement the anabolic signaling.',
    targetGoals: ['muscle_gain', 'body_recomp', 'recovery'],
    evidenceLevel: 'established',
  },

  // ─── Metabolic / Weight Loss ───────────────────────────────────────────
  {
    id: 'curated-belly-buster',
    name: 'Belly Buster Stack',
    peptideIds: ['retatrutide', 'tesamorelin', 'bpc-157'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A triple-threat metabolic stack targeting visceral fat. Retatrutide (GLP-1/GIP/glucagon triple agonist) drives appetite suppression and hepatic fat oxidation. Tesamorelin specifically targets visceral adipose tissue via GHRH-mediated GH release. BPC-157 supports GI mucosal integrity during aggressive metabolic protocols.',
    targetGoals: ['weight_loss', 'body_recomp'],
    evidenceLevel: 'moderate',
  },
  {
    id: 'curated-weight-loss',
    name: 'Weight Loss Stack',
    peptideIds: ['retatrutide', 'nad-plus', 'ghk-cu'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Metabolic optimization with cellular energy and skin support. Retatrutide provides triple-receptor appetite and metabolic signaling. NAD+ enhances mitochondrial energy metabolism and sirtuin activity. GHK-Cu supports skin elasticity and tissue remodeling during body composition changes.',
    targetGoals: ['weight_loss', 'skin_hair', 'energy'],
    evidenceLevel: 'moderate',
  },
  {
    id: 'curated-body-recomp',
    name: 'Body Recomp Stack',
    peptideIds: ['retatrutide', 'cjc-1295', 'ipamorelin'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Combines metabolic and growth-hormone pathways for body recomposition research. Retatrutide drives fat metabolism via triple receptor agonism, while CJC-1295 and Ipamorelin synergistically amplify GH output 3-5x to support lean-tissue signaling.',
    targetGoals: ['body_recomp', 'weight_loss', 'muscle_gain'],
    evidenceLevel: 'moderate',
  },

  // ─── Longevity / Anti-Aging ────────────────────────────────────────────
  {
    id: 'curated-anti-aging',
    name: 'Anti-Aging Stack',
    peptideIds: ['epithalon', 'nad-plus', 'ghk-cu'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A multi-target longevity research stack. Epithalon activates telomerase and restores melatonin synthesis. NAD+ supports sirtuin-mediated cellular repair (declines ~50% by age 50). GHK-Cu modulates 4000+ genes for tissue remodeling and antioxidant defense.',
    targetGoals: ['longevity', 'skin_hair'],
    evidenceLevel: 'moderate',
  },
  {
    id: 'curated-longevity',
    name: 'Longevity Research Stack',
    peptideIds: ['epithalon', 'nad-plus', 'ss-31'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Deep longevity research targeting telomeres, mitochondria, and cellular energy. Epithalon for telomerase activation. NAD+ for sirtuin and PARP enzyme support. SS-31 for inner mitochondrial membrane cardiolipin stabilization and electron transport chain optimization.',
    targetGoals: ['longevity', 'energy'],
    evidenceLevel: 'moderate',
  },

  // ─── Cognitive / Mental ────────────────────────────────────────────────
  {
    id: 'curated-cognitive',
    name: 'Cognitive Stack',
    peptideIds: ['semax', 'selank', 'pinealon'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A comprehensive nootropic stack. Semax upregulates BDNF and enhances cerebral blood flow. Selank provides anxiolysis via GABA-A modulation without sedation or tolerance. Pinealon supports neuroprotection through antioxidant enzyme expression and DNA repair signaling.',
    targetGoals: ['cognitive'],
    evidenceLevel: 'moderate',
  },
  {
    id: 'curated-mental-wellness',
    name: 'Mental Wellness Stack',
    peptideIds: ['semax', 'selank', 'dsip'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Cognitive support with sleep optimization. Semax enhances neurotrophic factor expression. Selank provides anxiolytic effects without dependence. DSIP promotes delta-wave deep sleep with HPA axis cortisol normalization — all without next-day drowsiness.',
    targetGoals: ['cognitive', 'sleep'],
    evidenceLevel: 'moderate',
  },

  // ─── Sleep ─────────────────────────────────────────────────────────────
  {
    id: 'curated-sleep',
    name: 'Sleep Stack',
    peptideIds: ['dsip', 'pinealon', 'epithalon'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'A restorative sleep research stack. DSIP promotes delta wave sleep without sedation. Pinealon supports pineal gland neuroprotection. Epithalon restores melatonin synthesis capacity and circadian rhythm regulation.',
    targetGoals: ['sleep', 'longevity'],
    evidenceLevel: 'moderate',
  },

  // ─── Immune ────────────────────────────────────────────────────────────
  {
    id: 'curated-immune',
    name: 'Immune Support Stack',
    peptideIds: ['thymosin-alpha-1', 'thymalin', 'kpv-inj'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Comprehensive immune modulation. Thymosin Alpha-1 (Zadaxin) enhances adaptive immunity via T-cell and NK cell activation. Thymalin reverses age-related thymic involution and optimizes cytokine balance. KPV provides targeted NF-kB inhibition for inflammation control.',
    targetGoals: ['immune', 'general_wellness'],
    evidenceLevel: 'moderate',
  },

  // ─── Cosmetic ──────────────────────────────────────────────────────────
  {
    id: 'curated-skin-radiance',
    name: 'Skin + Hair Radiance Stack',
    peptideIds: ['ghk-cu', 'snap-8', 'kpv-inj'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Cosmetic and anti-inflammatory support for skin research. GHK-Cu promotes collagen/elastin synthesis and recruits mesenchymal stem cells. SNAP-8 modulates SNARE complex formation to reduce neuromuscular contraction. KPV provides anti-inflammatory support.',
    targetGoals: ['skin_hair'],
    evidenceLevel: 'preliminary',
  },

  // ─── Energy / Mitochondrial ────────────────────────────────────────────
  {
    id: 'curated-energy',
    name: 'Energy Stack',
    peptideIds: ['mots-c', 'ss-31', 'nad-plus'],
    createdAt: now,
    updatedAt: now,
    isCurated: true,
    curatedBy: 'PepTalk Research Team',
    description:
      'Mitochondrial energy optimization. MOTS-c directly activates AMPK for exercise-mimetic metabolic effects. SS-31 concentrates 1000-5000x in inner mitochondrial membrane to stabilize cardiolipin and optimize electron transport. NAD+ provides the essential cofactor for sirtuin activity and oxidative phosphorylation.',
    targetGoals: ['energy', 'longevity'],
    evidenceLevel: 'moderate',
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export const getCuratedStackById = (id: string): PeptideStack | undefined =>
  CURATED_STACKS.find((s) => s.id === id);

export const getCuratedStacksByGoal = (goal: GoalType): PeptideStack[] =>
  CURATED_STACKS.filter((s) => s.targetGoals?.includes(goal));

export const getCuratedStacksByPeptideId = (peptideId: string): PeptideStack[] =>
  CURATED_STACKS.filter((s) => s.peptideIds.includes(peptideId));
