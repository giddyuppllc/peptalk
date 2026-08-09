import { SafetyProfile } from '../types';
import { GUIDE_SAFETY_PROFILES } from './safetyProfilesFromGuides';

/**
 * Safety profiles for peptides. Data sourced from FDA prescribing information
 * (approved agents) and peer-reviewed literature (research compounds).
 *
 * Sources:
 * - FDA prescribing info via accessdata.fda.gov (2023-2025 labels)
 * - PubMed systematic reviews for research compounds (2023-2025)
 */
export const SAFETY_PROFILES: SafetyProfile[] = [
  // ── FDA-APPROVED / LATE-STAGE ─────────────────────────────────────────────

  {
    peptideId: 'semaglutide',
    contraindications: [
      'Personal or family history of medullary thyroid carcinoma (MTC)',
      'Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)',
      'Known hypersensitivity to semaglutide or any excipients',
    ],
    seriousAdverseEffects: [
      'Pancreatitis (acute)',
      'Gallbladder disease (cholelithiasis, cholecystitis)',
      'Thyroid C-cell tumors (rodent data)',
      'Anaphylaxis and angioedema',
    ],
    commonSideEffects: [
      'Nausea',
      'Vomiting',
      'Diarrhea',
      'Constipation',
      'Abdominal pain',
    ],
    drugInteractions: [
      { drug: 'Insulin', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Sulfonylureas', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Oral medications', severity: 'moderate', mechanism: 'Delayed gastric emptying may alter absorption' },
    ],
    pregnancyCategory: 'Potential fetal risk (animal data) — avoid in pregnancy',
    monitoringRequired: [
      'Blood glucose and A1C',
      'Thyroid function',
      'Pancreatic enzymes',
      'Gallbladder symptoms',
    ],
    blackBoxWarnings: [
      'Thyroid C-cell tumors: In rodents, semaglutide causes thyroid C-cell tumors. It is unknown whether semaglutide causes thyroid C-cell tumors in humans.',
    ],
  },

  {
    peptideId: 'tirzepatide',
    contraindications: [
      'Personal or family history of medullary thyroid carcinoma (MTC)',
      'Multiple Endocrine Neoplasia syndrome type 2 (MEN 2)',
      'Known hypersensitivity to tirzepatide',
      'History of pancreatitis',
    ],
    seriousAdverseEffects: [
      'Pancreatitis (acute)',
      'Severe hypersensitivity reactions',
      'Thyroid C-cell tumors (rodent data)',
    ],
    commonSideEffects: [
      'Nausea',
      'Diarrhea',
      'Vomiting',
      'Decreased appetite',
      'Abdominal pain',
    ],
    drugInteractions: [
      { drug: 'Insulin', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Sulfonylureas', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Oral contraceptives', severity: 'moderate', mechanism: 'Delayed absorption due to gastric emptying' },
    ],
    pregnancyCategory: 'Potential fetal risk — avoid in pregnancy',
    monitoringRequired: [
      'Blood glucose and A1C',
      'Thyroid function',
      'GI symptoms',
    ],
    blackBoxWarnings: [
      'Thyroid C-cell tumors: In rodents, tirzepatide causes thyroid C-cell tumors. It is unknown whether tirzepatide causes thyroid C-cell tumors in humans.',
    ],
  },

  {
    peptideId: 'retatrutide',
    contraindications: [
      'MEN 2 or personal/family history of MTC',
      'Active pancreatitis',
      'Pregnancy (investigational agent)',
    ],
    seriousAdverseEffects: [
      'Pancreatitis',
      'Gallbladder events (Phase 2 data)',
    ],
    commonSideEffects: [
      'Nausea (dose-dependent)',
      'Diarrhea',
      'Vomiting',
      'Constipation',
    ],
    drugInteractions: [
      { drug: 'Insulin', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Sulfonylureas', severity: 'severe', mechanism: 'Additive hypoglycemia risk' },
      { drug: 'Oral medications', severity: 'moderate', mechanism: 'Delayed gastric emptying may alter absorption' },
    ],
    pregnancyCategory: 'Not classified (investigational) — avoid in pregnancy',
    monitoringRequired: [
      'Blood glucose',
      'Lipid panel',
      'Thyroid function',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'tesamorelin',
    contraindications: [
      'Pregnancy (Category X)',
      'Active malignancy',
      'Disruption of the hypothalamic-pituitary axis',
      'Hypersensitivity to GHRH or any component',
    ],
    seriousAdverseEffects: [
      'Edema',
      'Arthralgia',
      'Glucose intolerance',
      'Injection site reactions (severe)',
    ],
    commonSideEffects: [
      'Injection site erythema and pruritus',
      'Joint pain',
      'Extremity pain',
    ],
    drugInteractions: [
      { drug: 'Insulin', severity: 'moderate', mechanism: 'May affect glucose metabolism' },
      { drug: 'Cortisone', severity: 'moderate', mechanism: 'May affect glucose metabolism' },
      { drug: 'Cyclosporine', severity: 'moderate', mechanism: 'Potential glucose interaction' },
    ],
    pregnancyCategory: 'Category X — contraindicated in pregnancy',
    monitoringRequired: [
      'IGF-1 levels',
      'Fasting glucose',
      'Lipid panel',
    ],
    blackBoxWarnings: [],
  },

  // ── RESEARCH COMPOUNDS ────────────────────────────────────────────────────

  {
    peptideId: 'bpc-157',
    contraindications: [
      'Pregnancy and nursing',
      'Active cancer (theoretical growth-factor concern)',
    ],
    seriousAdverseEffects: [
      'None well-documented in humans (limited clinical data)',
    ],
    commonSideEffects: [
      'Injection site reactions',
      'Mild nausea',
      'Dizziness',
    ],
    drugInteractions: [
      { drug: 'Anticoagulants', severity: 'moderate', mechanism: 'Theoretical potentiation of bleeding risk' },
      { drug: 'Growth factors', severity: 'mild', mechanism: 'Theoretical additive growth signaling' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Injection site',
      'General wellness',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'tb-500',
    contraindications: [
      'Pregnancy and nursing',
      'Active or recent malignancy',
    ],
    seriousAdverseEffects: [
      'Limited human data — theoretical tumor promotion concern',
    ],
    commonSideEffects: [
      'Injection site redness',
      'Head rush',
      'Temporary lethargy',
    ],
    drugInteractions: [
      { drug: 'Anticoagulants', severity: 'moderate', mechanism: 'Theoretical increased bleeding risk' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Injection site',
      'Inflammatory markers',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'ghk-cu',
    contraindications: [
      'Pregnancy and nursing',
      'Copper sensitivity',
      "Wilson's disease",
    ],
    seriousAdverseEffects: [
      'Copper toxicity at excessive systemic doses (theoretical)',
    ],
    commonSideEffects: [
      'Mild skin irritation at application site',
      'Redness',
    ],
    drugInteractions: [
      { drug: 'Penicillamine', severity: 'moderate', mechanism: 'Copper chelation competition' },
      { drug: 'High-dose zinc supplements', severity: 'mild', mechanism: 'Copper absorption competition' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Copper levels (if systemic use)',
      'Skin reaction at application site',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'cjc-1295',
    contraindications: [
      'Pregnancy and nursing',
      'Active cancer',
      'Pituitary tumors',
      'Uncontrolled diabetes',
    ],
    seriousAdverseEffects: [
      'Water retention',
      'Carpal tunnel syndrome',
      'Glucose disruption at high doses',
    ],
    commonSideEffects: [
      'Flushing',
      'Headache',
      'Injection site reaction',
      'Numbness or tingling',
    ],
    drugInteractions: [
      { drug: 'Insulin', severity: 'moderate', mechanism: 'May alter glucose metabolism' },
      { drug: 'Corticosteroids', severity: 'moderate', mechanism: 'May affect GH axis' },
      { drug: 'Diabetes medications', severity: 'moderate', mechanism: 'Additive glucose effects' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'IGF-1 levels',
      'Fasting glucose',
      'Blood pressure',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'ipamorelin',
    contraindications: [
      'Pregnancy and nursing',
      'Active cancer',
      'Pituitary disorders',
    ],
    seriousAdverseEffects: [
      'Rare water retention',
      'Elevated cortisol at high doses',
    ],
    commonSideEffects: [
      'Headache',
      'Lightheadedness',
      'Injection site irritation',
    ],
    drugInteractions: [
      { drug: 'Corticosteroids', severity: 'moderate', mechanism: 'May affect HPA axis' },
      { drug: 'Insulin', severity: 'moderate', mechanism: 'Potential glucose interaction' },
      { drug: 'Other GH secretagogues', severity: 'mild', mechanism: 'Additive GH stimulation' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'IGF-1 levels',
      'Fasting glucose',
      'Cortisol',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'semax',
    contraindications: [
      'Pregnancy and nursing',
      'Acute psychosis',
      'Seizure disorders',
    ],
    seriousAdverseEffects: [
      'Rare overstimulation and anxiety at high doses',
    ],
    commonSideEffects: [
      'Nasal irritation',
      'Mild headache',
      'Dizziness',
    ],
    drugInteractions: [
      { drug: 'MAO inhibitors', severity: 'moderate', mechanism: 'Theoretical potentiation of CNS effects' },
      { drug: 'CNS stimulants', severity: 'mild', mechanism: 'Theoretical additive stimulation' },
    ],
    pregnancyCategory: 'Not classified — research compound (approved in Russia)',
    monitoringRequired: [
      'Mood and cognitive function',
      'Blood pressure',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'selank',
    contraindications: [
      'Pregnancy and nursing',
      'Severe anxiety disorders without medical supervision',
    ],
    seriousAdverseEffects: [
      'Rare paradoxical anxiety',
    ],
    commonSideEffects: [
      'Nasal irritation',
      'Mild sedation',
      'Fatigue',
    ],
    drugInteractions: [
      { drug: 'Benzodiazepines', severity: 'moderate', mechanism: 'Additive sedation effect' },
      { drug: 'SSRIs', severity: 'mild', mechanism: 'Theoretical serotonergic interaction' },
    ],
    pregnancyCategory: 'Not classified — research compound (approved in Russia)',
    monitoringRequired: [
      'Mood and anxiety levels',
      'Sedation',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'epithalon',
    contraindications: [
      'Pregnancy and nursing',
      'Active cancer',
      'Autoimmune conditions',
    ],
    seriousAdverseEffects: [
      'Limited data — theoretical immune modulation risk',
    ],
    commonSideEffects: [
      'Injection site irritation',
      'Mild fatigue',
      'Headache',
    ],
    drugInteractions: [
      { drug: 'Immunosuppressants', severity: 'moderate', mechanism: 'May counteract immunosuppressive effect' },
      { drug: 'Chemotherapy agents', severity: 'mild', mechanism: 'Theoretical interaction' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Telomere markers (if available)',
      'Immune panels',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'thymosin-alpha-1',
    contraindications: [
      'Pregnancy and nursing',
      'Organ transplant recipients on immunosuppression',
    ],
    seriousAdverseEffects: [
      'Rare autoimmune flare in predisposed individuals',
      'Injection site reactions',
    ],
    commonSideEffects: [
      'Injection site discomfort',
      'Mild fever',
      'Fatigue',
    ],
    drugInteractions: [
      { drug: 'Immunosuppressants', severity: 'severe', mechanism: 'Directly opposes immunosuppressive effect' },
      { drug: 'Checkpoint inhibitors', severity: 'moderate', mechanism: 'May potentiate immune activation' },
    ],
    pregnancyCategory: 'Not classified — approved in some countries, not US',
    monitoringRequired: [
      'Immune panels',
      'T-cell counts',
      'Inflammatory markers',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'll-37',
    contraindications: [
      'Pregnancy and nursing',
      'Autoimmune conditions',
      'Sepsis',
    ],
    seriousAdverseEffects: [
      'Potential cytotoxicity at high doses',
      'Immune overactivation',
    ],
    commonSideEffects: [
      'Injection site pain and redness',
      'Mild fever',
      'Fatigue',
    ],
    drugInteractions: [
      { drug: 'Immunosuppressants', severity: 'moderate', mechanism: 'May counteract immunosuppression' },
      { drug: 'Antibiotics', severity: 'mild', mechanism: 'Potential additive antimicrobial effect' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Injection site',
      'Inflammatory markers',
      'White blood cell count',
    ],
    blackBoxWarnings: [],
  },

  {
    peptideId: 'mots-c',
    contraindications: [
      'Pregnancy and nursing',
      'Severe hypoglycemia',
      'Mitochondrial disease',
    ],
    seriousAdverseEffects: [
      'Limited human data — theoretical metabolic disruption',
    ],
    commonSideEffects: [
      'Injection site reaction',
      'Mild GI discomfort',
    ],
    drugInteractions: [
      { drug: 'Metformin', severity: 'moderate', mechanism: 'Additive AMPK activation' },
      { drug: 'Insulin', severity: 'moderate', mechanism: 'May potentiate glucose-lowering effect' },
    ],
    pregnancyCategory: 'Not classified — research compound',
    monitoringRequired: [
      'Blood glucose',
      'Lactate levels',
      'Metabolic panels',
    ],
    blackBoxWarnings: [],
  },
];

/**
 * Curated first, guide-derived second.
 *
 * The 15 profiles above are hand-written and stay AUTHORITATIVE — a generated
 * entry never shadows a reviewed one. GUIDE_SAFETY_PROFILES only fills
 * peptides that had nothing at all, which before this was 64 of 79: the whole
 * safety card simply did not render for them, so the screen showed the
 * literature's side-effect list for a handful of compounds and silence for the
 * rest.
 *
 * Order matters and is the only thing keeping that promise, so it is asserted
 * in the tests rather than left to the reading.
 */
export const getSafetyProfileByPeptideId = (
  peptideId: string
): SafetyProfile | undefined =>
  SAFETY_PROFILES.find((p) => p.peptideId === peptideId) ??
  GUIDE_SAFETY_PROFILES.find((p) => p.peptideId === peptideId);

/** Every profile the app can show, curated taking precedence. */
export const ALL_SAFETY_PROFILES: SafetyProfile[] = [
  ...SAFETY_PROFILES,
  ...GUIDE_SAFETY_PROFILES.filter(
    (g) => !SAFETY_PROFILES.some((c) => c.peptideId === g.peptideId),
  ),
];
