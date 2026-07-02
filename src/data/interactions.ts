import { PeptideInteraction } from '../types';

/**
 * Curated peptide interaction data extracted from analysisEngine.
 * Each entry describes a well-characterized interaction between two peptides
 * based on published research and established pharmacology.
 *
 * The analysisEngine imports this data and falls back to heuristic scoring
 * for pairs not found here.
 */

// ---------------------------------------------------------------------------
// Interaction key helper — ensures consistent lookup regardless of pair order
// ---------------------------------------------------------------------------

export function makeInteractionKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('::');
}

// ---------------------------------------------------------------------------
// KNOWN_INTERACTIONS — curated from published research & well-studied combos
// ---------------------------------------------------------------------------

export const KNOWN_INTERACTIONS: Map<string, PeptideInteraction> = new Map([
  // CJC-1295 + Ipamorelin
  [
    makeInteractionKey('cjc-1295', 'ipamorelin'),
    {
      peptideA: 'cjc-1295',
      peptideB: 'ipamorelin',
      interactionType: 'synergistic',
      synergyScore: 9,
      mechanismAnalysis:
        'Complementary GH axis stimulation via different mechanisms. CJC-1295 acts as a GHRH analog stimulating somatotroph cells, while Ipamorelin is a ghrelin mimetic that triggers GH release via the GHS-R1a receptor. Research suggests their combined activity produces a more robust and sustained GH pulse profile than either compound alone.',
      stabilityConsiderations:
        'Both peptides are generally stable in aqueous solution at refrigerated temperatures. When reconstituted separately, each maintains structural integrity. Co-storage in the same vial is not well-characterized in published literature.',
      chemicalCompatibility:
        'No known chemical incompatibility. Both are soluble in bacteriostatic water at standard research concentrations.',
      researchPrecedent:
        'This combination is one of the most widely studied GH secretagogue stacks in peptide research. Multiple in-vitro and animal model studies have demonstrated amplified GH output when both pathways are activated simultaneously.',
      pubmedLinks: ['https://pubmed.ncbi.nlm.nih.gov/16352683/'],
    },
  ],

  // CJC-1295 (No DAC) + Ipamorelin — the classic "CJC/Ipa" pulsatile stack
  [
    makeInteractionKey('cjc-1295-no-dac', 'ipamorelin'),
    {
      peptideA: 'cjc-1295-no-dac',
      peptideB: 'ipamorelin',
      interactionType: 'synergistic',
      synergyScore: 9,
      mechanismAnalysis:
        'The canonical GH secretagogue pairing. CJC-1295 without DAC (Mod GRF 1-29) is a short-acting GHRH analog that amplifies the natural GH pulse, while Ipamorelin is a selective ghrelin mimetic acting on the GHS-R1a receptor. Because the no-DAC form clears quickly (~30 min), the two are typically injected together to stack a GHRH pulse on top of a ghrelin-receptor pulse — research on GHRH + GHRP co-administration reports markedly larger GH pulse amplitude than either pathway alone, while preserving physiologic pulsatility rather than the continuous elevation of the DAC variant.',
      stabilityConsiderations:
        'Both are stable in bacteriostatic water at refrigerated temperatures when reconstituted separately. Some users co-reconstitute a CJC/Ipamorelin blend for a single injection; single-vial long-term co-storage is not well-characterized in published literature.',
      chemicalCompatibility:
        'No known chemical incompatibility. Both are soluble in bacteriostatic water at standard research concentrations.',
      researchPrecedent:
        'GHRH-analog + GHRP synergy is well established in the literature, and the CJC-1295 (no DAC) + Ipamorelin combination is one of the most widely used GH peptide stacks. It is generally dosed 1-3x daily, most importantly pre-bed on an empty stomach, to ride the nocturnal GH pulse.',
      pubmedLinks: ['https://pubmed.ncbi.nlm.nih.gov/16352683/'],
    },
  ],

  // BPC-157 + TB-500
  [
    makeInteractionKey('bpc-157', 'tb-500'),
    {
      peptideA: 'bpc-157',
      peptideB: 'tb-500',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Complementary tissue repair pathways. BPC-157 (Body Protection Compound) upregulates growth factor expression including VEGF, FGF, and EGF, while TB-500 (Thymosin Beta-4 fragment) promotes actin polymerization and cellular migration. Together, they address both the signaling environment and the structural repair machinery.',
      stabilityConsiderations:
        'BPC-157 is notably stable across a wide pH range. TB-500 is a relatively stable peptide fragment. Both reconstitute well in sterile water or bacteriostatic water.',
      chemicalCompatibility:
        'No reported chemical antagonism. Both peptides are commonly reconstituted in similar aqueous vehicles.',
      researchPrecedent:
        'Individually, both peptides have extensive research profiles in wound healing and tissue repair models. Their combined use is widely discussed in peptide research communities, though controlled head-to-head combination studies remain limited.',
    },
  ],

  // Retatrutide + 5-Amino-1MQ
  [
    makeInteractionKey('retatrutide', '5-amino-1mq'),
    {
      peptideA: 'retatrutide',
      peptideB: '5-amino-1mq',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Multi-receptor metabolic approach. Retatrutide is a triple agonist (GLP-1R, GIPR, GCGR) influencing appetite signaling, insulin sensitivity, and energy expenditure. 5-Amino-1MQ inhibits NNMT (nicotinamide N-methyltransferase), which has been linked to adipocyte energy regulation. These distinct mechanisms target metabolism from both receptor-level signaling and intracellular enzymatic pathways.',
      stabilityConsiderations:
        'Retatrutide is a large peptide requiring cold-chain storage. 5-Amino-1MQ is a small molecule with good ambient stability. No shared degradation concerns when stored separately.',
      chemicalCompatibility:
        'Different molecular classes (peptide vs. small molecule) with no known direct chemical interaction.',
      researchPrecedent:
        'Both compounds are individually under active investigation for metabolic research. Combination data is limited to observational reports in research settings.',
    },
  ],

  // Epithalon + MOTS-c
  [
    makeInteractionKey('epithalon', 'mots-c'),
    {
      peptideA: 'epithalon',
      peptideB: 'mots-c',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Telomere and mitochondrial longevity pathways. Epithalon (Epitalon) is a tetrapeptide studied for its ability to stimulate telomerase activity, potentially influencing cellular replicative capacity. MOTS-c is a mitochondrial-derived peptide associated with metabolic homeostasis and AMPK activation. Together, they address aging research from both nuclear (telomere) and mitochondrial perspectives.',
      stabilityConsiderations:
        'Epithalon is a short, stable tetrapeptide. MOTS-c requires careful handling as a mitochondrial peptide — cold storage is recommended. Both reconstitute in standard aqueous vehicles.',
      chemicalCompatibility:
        'No reported incompatibility. Distinct molecular targets reduce any risk of direct chemical interference.',
      researchPrecedent:
        'Both are prominent in longevity-focused research. Epithalon has been studied by Khavinson and colleagues; MOTS-c was characterized by the Lee lab at USC. Combination studies are nascent but conceptually supported.',
    },
  ],

  // MOTS-c + NAD+
  [
    makeInteractionKey('mots-c', 'nad-plus'),
    {
      peptideA: 'mots-c',
      peptideB: 'nad-plus',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Complementary mitochondrial support. MOTS-c activates AMPK and improves metabolic homeostasis at the mitochondrial level, while NAD+ (or its precursors) is a critical coenzyme for mitochondrial electron transport and sirtuin activity. Research suggests that enhanced NAD+ availability may amplify the cellular energy pathways that MOTS-c modulates.',
      stabilityConsiderations:
        'MOTS-c should be stored cold in lyophilized form. NAD+ precursor molecules vary in stability — NMN and NR have different shelf-life profiles. Reconstituted MOTS-c should not be mixed directly with NAD+ solutions without characterization.',
      chemicalCompatibility:
        'NAD+ is a dinucleotide with distinct chemistry from peptides. No direct chemical interaction is expected at research concentrations, but co-formulation has not been formally validated.',
      researchPrecedent:
        'Both are central to mitochondrial aging research. The AMPK-NAD+-sirtuin axis is well-characterized, and MOTS-c feeds into this network. Formal combination studies are an active area of investigation.',
    },
  ],

  // Semaglutide + Tirzepatide
  [
    makeInteractionKey('semaglutide', 'tirzepatide'),
    {
      peptideA: 'semaglutide',
      peptideB: 'tirzepatide',
      interactionType: 'competitive',
      synergyScore: 3,
      mechanismAnalysis:
        'Overlapping GLP-1 receptor binding. Both Semaglutide (selective GLP-1R agonist) and Tirzepatide (dual GLP-1R/GIPR agonist) compete for the same GLP-1 receptor binding site. Co-administration may lead to receptor saturation without additional benefit, and the competitive binding could reduce the effective signaling of either compound.',
      stabilityConsiderations:
        'Both are stable acylated peptides designed for extended circulation. No unique stability concern from co-presence, but the pharmacological redundancy at GLP-1R is the primary issue.',
      chemicalCompatibility:
        'No direct chemical incompatibility, but the pharmacological overlap makes this combination suboptimal from a research design perspective.',
      researchPrecedent:
        'No published research supports combining these two GLP-1R agonists. Standard research protocols use one or the other, not both simultaneously.',
    },
  ],

  // Retatrutide + CJC-1295
  [
    makeInteractionKey('retatrutide', 'cjc-1295'),
    {
      peptideA: 'retatrutide',
      peptideB: 'cjc-1295',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Metabolic and GH axis modulation. Retatrutide operates on incretin and glucagon receptors (GLP-1R, GIPR, GCGR) to influence metabolic signaling, while CJC-1295 stimulates growth hormone release through the GHRH receptor. These non-overlapping receptor systems suggest complementary activity across metabolic and somatotropic pathways.',
      stabilityConsiderations:
        'Both require cold-chain storage. Retatrutide is a larger peptide with acylation for extended stability; CJC-1295 (especially the DAC variant) is designed for prolonged half-life. Separate reconstitution is recommended.',
      chemicalCompatibility:
        'No known chemical conflicts. Both are peptide-based with compatible aqueous reconstitution profiles.',
      researchPrecedent:
        'Individually well-studied. Combination research is primarily observational and discussed in peptide research forums rather than formal publications.',
    },
  ],

  // Retatrutide + Ipamorelin
  [
    makeInteractionKey('retatrutide', 'ipamorelin'),
    {
      peptideA: 'retatrutide',
      peptideB: 'ipamorelin',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Metabolic modulation combined with GH secretagogue activity. Retatrutide engages GLP-1R, GIPR, and GCGR for metabolic signaling, while Ipamorelin selectively activates GHS-R1a to promote pulsatile GH release. The distinct receptor targets allow for parallel pathway activation without direct competition.',
      stabilityConsiderations:
        'Retatrutide requires cold storage due to its size and acylation. Ipamorelin is a relatively stable pentapeptide. Both reconstitute in bacteriostatic water. Separate vials recommended for storage.',
      chemicalCompatibility:
        'Compatible aqueous chemistry. No direct molecular interaction expected at standard research concentrations.',
      researchPrecedent:
        'The rationale is supported by the independent literature on incretin agonists and GH secretagogues, though direct combination studies have not been published.',
    },
  ],

  // Semax + Selank
  [
    makeInteractionKey('semax', 'selank'),
    {
      peptideA: 'semax',
      peptideB: 'selank',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Complementary nootropic pathways. Semax is a synthetic ACTH(4-10) analog that upregulates BDNF and modulates dopaminergic/serotonergic activity, promoting neurotrophic support. Selank is a tuftsin analog with anxiolytic properties that modulates GABA-ergic transmission and enkephalin expression. Together, they address both the neurotrophic growth and the anxiolytic/calming dimensions of cognitive research.',
      stabilityConsiderations:
        'Both are relatively short, stable peptides commonly used in intranasal formulations. Semax and Selank have established stability profiles in aqueous solution. Both degrade faster at room temperature — cold storage is advised.',
      chemicalCompatibility:
        'Compatible in similar aqueous vehicles. Both have been formulated for nasal administration and share similar pH requirements.',
      researchPrecedent:
        'Both peptides were developed at the Institute of Molecular Genetics (Russian Academy of Sciences) and have extensive individual research profiles. Their combined use is well-documented in Russian peptide research literature.',
      pubmedLinks: [
        'https://pubmed.ncbi.nlm.nih.gov/19549494/',
        'https://pubmed.ncbi.nlm.nih.gov/18577768/',
      ],
    },
  ],

  // Thymosin Alpha-1 + LL-37
  [
    makeInteractionKey('thymosin-alpha-1', 'll-37'),
    {
      peptideA: 'thymosin-alpha-1',
      peptideB: 'll-37',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Immune modulation via different mechanisms. Thymosin Alpha-1 enhances dendritic cell maturation and T-cell differentiation, acting as an immune system modulator at the adaptive immunity level. LL-37 (cathelicidin) is an innate immune effector with direct antimicrobial activity and immunomodulatory signaling. Their combination addresses both innate and adaptive immune research pathways.',
      stabilityConsiderations:
        'Thymosin Alpha-1 is a well-characterized, stable peptide (approved as Zadaxin in several countries for research use). LL-37 is an amphipathic peptide that can aggregate at higher concentrations — careful reconstitution is important.',
      chemicalCompatibility:
        'Both are cationic peptides at physiological pH. At high concentrations, aggregation potential should be considered, but at standard research concentrations, no direct incompatibility is expected.',
      researchPrecedent:
        'Both have extensive individual research backgrounds in immunology. Thymosin Alpha-1 has decades of published research. LL-37 is one of the most-studied human antimicrobial peptides. Combination research is conceptually supported but limited in direct published studies.',
    },
  ],

  // GHK-Cu + BPC-157
  [
    makeInteractionKey('ghk-cu', 'bpc-157'),
    {
      peptideA: 'ghk-cu',
      peptideB: 'bpc-157',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Tissue repair combined with copper peptide extracellular matrix support. BPC-157 upregulates growth factor cascades (VEGF, FGF, EGF) and modulates the NO system for tissue repair signaling. GHK-Cu (copper tripeptide) promotes collagen synthesis, glycosaminoglycan production, and extracellular matrix remodeling. Together, they address both the signaling initiation and the structural rebuilding phases of tissue repair research.',
      stabilityConsiderations:
        'GHK-Cu contains a copper ion that can catalyze oxidation of other peptides. BPC-157 is unusually stable for a peptide. Separate storage is recommended to avoid copper-mediated oxidation of co-stored compounds.',
      chemicalCompatibility:
        'The copper ion in GHK-Cu can potentially interact with other peptides in solution. Separate reconstitution and storage is strongly recommended. Co-administration timing should account for this consideration.',
      researchPrecedent:
        'Both are extensively studied individually in wound healing and tissue regeneration research. GHK-Cu has been characterized by Dr. Loren Pickart; BPC-157 by Dr. Predrag Sikiric. Direct combination data is limited to anecdotal research reports.',
    },
  ],

  // Melanotan-1 + Melanotan-2
  [
    makeInteractionKey('melanotan-1', 'melanotan-2'),
    {
      peptideA: 'melanotan-1',
      peptideB: 'melanotan-2',
      interactionType: 'competitive',
      synergyScore: 3,
      mechanismAnalysis:
        'Overlapping MC1R binding. Both Melanotan-1 (afamelanotide) and Melanotan-2 are alpha-MSH analogs that bind the melanocortin-1 receptor to stimulate melanogenesis. Melanotan-1 is more selective for MC1R, while Melanotan-2 has broader melanocortin receptor affinity (MC1R, MC3R, MC4R, MC5R). Co-administration results in direct receptor competition at MC1R without additive benefit.',
      stabilityConsiderations:
        'Both are cyclic peptides with reasonable stability in aqueous solution. No unique co-storage concerns beyond the pharmacological redundancy.',
      chemicalCompatibility:
        'Structurally similar analogs with compatible chemistry. The issue is pharmacological, not chemical.',
      researchPrecedent:
        'No published research supports using both simultaneously. Research protocols typically employ one or the other based on the desired receptor selectivity profile.',
    },
  ],

  // PT-141 + Melanotan-2
  [
    makeInteractionKey('pt-141', 'melanotan-2'),
    {
      peptideA: 'pt-141',
      peptideB: 'melanotan-2',
      interactionType: 'competitive',
      synergyScore: 4,
      mechanismAnalysis:
        'Both target melanocortin receptors. PT-141 (bremelanotide) is a metabolite of Melanotan-2, and both activate MC3R and MC4R pathways. While PT-141 was developed for its MC4R selectivity related to sexual function research, Melanotan-2 broadly activates the same receptor family. Combining them saturates overlapping receptor targets with diminishing additional signaling.',
      stabilityConsiderations:
        'PT-141 is a cyclic heptapeptide with moderate stability. Melanotan-2 is a related cyclic peptide. Both reconstitute similarly. No co-storage stability concerns beyond redundancy.',
      chemicalCompatibility:
        'Closely related molecular structures with fully compatible chemistry. Competition is at the receptor level, not the chemical level.',
      researchPrecedent:
        'PT-141 was literally derived from Melanotan-2 research. Using both simultaneously is pharmacologically redundant and not supported by any published research protocol.',
    },
  ],

  // Semaglutide + Cagrilintide
  [
    makeInteractionKey('semaglutide', 'cagrilintide'),
    {
      peptideA: 'semaglutide',
      peptideB: 'cagrilintide',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'GLP-1 receptor and amylin receptor combination — the research basis behind CagriSema. Semaglutide activates GLP-1R to modulate appetite signaling and insulin secretion. Cagrilintide is a long-acting amylin analog that activates amylin receptors (AMY1, AMY2, AMY3) to promote satiety via distinct CNS pathways. These non-overlapping receptor systems produce complementary metabolic signaling.',
      stabilityConsiderations:
        'Both are acylated peptides engineered for extended half-life. Novo Nordisk has developed a co-formulation (CagriSema), demonstrating that these molecules can coexist in a stable formulation under appropriate conditions.',
      chemicalCompatibility:
        'Demonstrated compatibility — Novo Nordisk has produced a stable co-formulation for research and clinical investigation.',
      researchPrecedent:
        'This is one of the most well-supported combinations in current metabolic peptide research. The CagriSema program (Novo Nordisk) has produced extensive Phase 2 and Phase 3 data demonstrating the combined activity of these two compounds.',
      pubmedLinks: ['https://pubmed.ncbi.nlm.nih.gov/36567380/'],
    },
  ],

  // DSIP + Selank
  [
    makeInteractionKey('dsip', 'selank'),
    {
      peptideA: 'dsip',
      peptideB: 'selank',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Sleep regulation combined with anxiolytic activity for complementary rest support. DSIP (Delta Sleep-Inducing Peptide) modulates sleep architecture, particularly delta-wave sleep patterns, through mechanisms involving serotonin and GABA systems. Selank provides anxiolytic activity via enkephalin modulation and GABA-ergic enhancement. Research suggests that reducing anxiety-related arousal may complement sleep-promoting peptide activity.',
      stabilityConsiderations:
        'DSIP is a nonapeptide with moderate stability — it is susceptible to enzymatic degradation and should be stored cold. Selank is more stable, especially in modified forms. Both reconstitute in standard aqueous vehicles.',
      chemicalCompatibility:
        'No known chemical incompatibility. Both are short peptides with straightforward aqueous chemistry.',
      researchPrecedent:
        'Both peptides originate from Soviet/Russian peptide research programs and have individual research histories spanning decades. Combined use is discussed in nootropic and sleep research contexts, though formal combination studies are limited.',
    },
  ],

  // BPC-157 + KPV (Gut Health Stack)
  [
    makeInteractionKey('bpc-157', 'kpv'),
    {
      peptideA: 'bpc-157',
      peptideB: 'kpv',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Complementary gut healing and anti-inflammatory pathways. BPC-157 promotes angiogenesis (VEGF upregulation) and tissue repair in gastrointestinal mucosa, while KPV directly inhibits NF-kB activation to suppress inflammatory gene transcription. Together, they address both the structural repair (BPC-157) and the inflammatory signaling (KPV) components of intestinal barrier integrity research.',
      stabilityConsiderations:
        'BPC-157 is remarkably stable across a wide pH range, including gastric acid conditions. KPV is a short tripeptide with moderate aqueous stability. Both reconstitute well in standard vehicles.',
      chemicalCompatibility:
        'No reported chemical incompatibility. Separate reconstitution recommended as a general best practice.',
      researchPrecedent:
        "Both have independent research profiles in gastrointestinal inflammation models. This combination is featured in the PepTalk Gut Health Stack.",
    },
  ],

  // Retatrutide + AOD-9604
  [
    makeInteractionKey('retatrutide', 'aod-9604'),
    {
      peptideA: 'retatrutide',
      peptideB: 'aod-9604',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Multi-pathway metabolic approach targeting both central appetite regulation and peripheral fat mobilization. Retatrutide engages GLP-1R, GIPR, and GCGR for central appetite suppression and hepatic fat oxidation. AOD-9604 activates hormone-sensitive lipase (HSL) in adipocytes for targeted lipolysis without affecting IGF-1 or appetite. These non-overlapping mechanisms complement each other for comprehensive metabolic research.',
      stabilityConsiderations:
        'Retatrutide requires cold-chain storage as an acylated peptide. AOD-9604 is a shorter peptide fragment susceptible to proteolytic degradation at room temperature. Both store well lyophilized at -20°C.',
      chemicalCompatibility:
        'No known chemical interaction. Both reconstitute in standard aqueous vehicles.',
      researchPrecedent:
        'Individually well-studied in metabolic research. AOD-9604 has GRAS designation; retatrutide is in Phase 3 trials. Combination is discussed in metabolic optimization research.',
    },
  ],

  // Semax + Cerebrolysin
  [
    makeInteractionKey('semax', 'cerebrolysin'),
    {
      peptideA: 'semax',
      peptideB: 'cerebrolysin',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Multi-pathway neurotrophic support. Semax increases BDNF expression in hippocampus and prefrontal cortex while enhancing dopaminergic and serotonergic neurotransmission. Cerebrolysin provides a broad neurotrophic peptide complex that mimics BDNF, NGF, GDNF, and other growth factor signaling. Together, they provide both targeted (Semax) and broad-spectrum (Cerebrolysin) neurotrophic support for cognitive research.',
      stabilityConsiderations:
        'Semax is a short, stable peptide suitable for intranasal delivery. Cerebrolysin is an aqueous peptide complex stored at 2-8°C. Different routes of administration (intranasal vs IV/IM) simplify co-administration.',
      chemicalCompatibility:
        'No direct chemical interaction expected given different administration routes and molecular profiles.',
      researchPrecedent:
        "Both have extensive individual research profiles in neurocognitive models. Combined use is studied in Alzheimer's and cognitive decline research formulations.",
    },
  ],

  // Epithalon + Thymalin (Russian Longevity Protocol)
  [
    makeInteractionKey('epithalon', 'thymalin'),
    {
      peptideA: 'epithalon',
      peptideB: 'thymalin',
      interactionType: 'synergistic',
      synergyScore: 9,
      mechanismAnalysis:
        "The classic Russian Longevity Protocol targeting telomere maintenance and immune reconstitution. Epithalon activates telomerase (hTERT) for telomere elongation and restores melatonin synthesis in the pineal gland. Thymalin reverses age-related thymic involution, increasing CD3+/CD4+/CD8+ T-cell maturation and optimizing cytokine balance. Together, they address aging from both cellular replication and immune senescence perspectives — the two pillars of Khavinson bioregulation research.",
      stabilityConsiderations:
        'Both are short, stable peptides (tetrapeptide and dipeptide respectively). Both store well lyophilized at -20°C. Standard reconstitution with sterile water or saline.',
      chemicalCompatibility:
        'Compatible chemistry. Both are small, hydrophilic peptides. No known interactions.',
      researchPrecedent:
        "This is the foundational combination in Professor Khavinson's longevity research program, with over 30 years of clinical observation data. The protocol calls for biannual administration cycles (Epithalon 10mg x 10-20 days + Thymalin 10mg x 10 days).",
    },
  ],

  // GHK-Cu + TB-500 (Recovery/Cosmetic Stack)
  [
    makeInteractionKey('ghk-cu', 'tb-500'),
    {
      peptideA: 'ghk-cu',
      peptideB: 'tb-500',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Multi-level tissue repair combining extracellular matrix support with cellular migration and anti-fibrotic activity. GHK-Cu upregulates collagen/elastin synthesis, activates SOD for antioxidant protection, and recruits mesenchymal stem cells. TB-500 sequesters G-actin to promote cytoskeletal reorganization, cell migration, and reduces excessive scarring. Together, they build the structural matrix (GHK-Cu) while mobilizing the cellular repair machinery (TB-500).',
      stabilityConsiderations:
        'GHK-Cu copper ions can catalyze oxidation of other peptides. Separate storage is strongly recommended. TB-500 is a stable peptide fragment. Both reconstitute in standard vehicles.',
      chemicalCompatibility:
        'Copper ion interaction potential — separate reconstitution and storage required. Stagger administration timing.',
      researchPrecedent:
        "Both have extensive individual research profiles in wound healing and tissue regeneration. Featured in the PepTalk GLOW and Recovery Stacks.",
    },
  ],

  // MOTS-c + SS-31 (Mitochondrial Stack)
  [
    makeInteractionKey('mots-c', 'ss-31'),
    {
      peptideA: 'mots-c',
      peptideB: 'ss-31',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Comprehensive mitochondrial support from complementary angles. MOTS-c is a mitochondrial-derived peptide that directly activates AMPK, promoting glucose uptake, fat oxidation, and mitochondrial biogenesis via PGC-1alpha upregulation. SS-31 (Elamipretide) concentrates 1000-5000x in the inner mitochondrial membrane where it stabilizes cardiolipin, optimizes electron transport chain flow, and reduces ROS at their source. Together, they enhance both mitochondrial function (SS-31) and metabolic signaling (MOTS-c).',
      stabilityConsiderations:
        'MOTS-c requires cold storage. SS-31 contains D-amino acids conferring enhanced stability. Both reconstitute in sterile water.',
      chemicalCompatibility:
        'No known chemical incompatibility. Distinct molecular targets and mechanisms.',
      researchPrecedent:
        "Both are prominent in mitochondrial aging research. Featured in the PepTalk Energy Stack.",
    },
  ],

  // Thymosin Alpha-1 + KPV (Immune Support)
  [
    makeInteractionKey('thymosin-alpha-1', 'kpv'),
    {
      peptideA: 'thymosin-alpha-1',
      peptideB: 'kpv',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Immune modulation combined with targeted anti-inflammatory signaling. Thymosin Alpha-1 enhances adaptive immunity by promoting CD4+/CD8+ T-cell maturation, NK cell function, and Th1/Th2 balance optimization. KPV directly inhibits NF-kB to suppress excessive inflammatory cascades. Together, they support immune competence while controlling inflammation — addressing both sides of the immune regulation equation.',
      stabilityConsiderations:
        'Both are stable peptides. Thymosin Alpha-1 is acetylated at the N-terminus providing aminopeptidase resistance. KPV is a short tripeptide with moderate stability.',
      chemicalCompatibility:
        'Compatible chemistry with no known interactions.',
      researchPrecedent:
        "Both have extensive individual immunology research profiles. Featured in the PepTalk Immune Support Stack.",
    },
  ],

  // Semax + Pinealon (Cognitive Stack)
  [
    makeInteractionKey('semax', 'pinealon'),
    {
      peptideA: 'semax',
      peptideB: 'pinealon',
      interactionType: 'synergistic',
      synergyScore: 7,
      mechanismAnalysis:
        'Complementary nootropic pathways addressing neurotrophic support and neuroprotection. Semax increases BDNF and modulates dopaminergic/serotonergic neurotransmission. Pinealon modulates gene expression related to neural cell differentiation and antioxidant enzyme expression (SOD, catalase). Together, they provide both growth factor support and oxidative stress protection for neural tissue research.',
      stabilityConsiderations:
        'Semax is a stable heptapeptide. Pinealon is a short tripeptide with moderate stability. Both reconstitute in standard aqueous vehicles.',
      chemicalCompatibility:
        'No known chemical incompatibility between these nootropic peptides.',
      researchPrecedent:
        "Both developed within the Russian bioregulator peptide research paradigm. Featured in the PepTalk Cognitive Stack.",
    },
  ],

  // Humanin + SS-31 (Mitochondrial-Derived Stack)
  [
    makeInteractionKey('humanin', 'ss-31'),
    {
      peptideA: 'humanin',
      peptideB: 'ss-31',
      interactionType: 'synergistic',
      synergyScore: 8,
      mechanismAnalysis:
        'Two mitochondrial-targeted peptides with complementary mechanisms. Humanin is a mitochondrial-derived peptide that inhibits pro-apoptotic proteins (Bax, tBid), improves respiratory chain efficiency, and activates PI3K/Akt for insulin sensitization. SS-31 binds cardiolipin in the inner mitochondrial membrane to optimize electron transport chain flow. Together, they protect mitochondria from both apoptotic signals (Humanin) and oxidative damage (SS-31).',
      stabilityConsiderations:
        'Both are peptides with moderate stability. SS-31 contains D-amino acids for enhanced stability. Separate reconstitution recommended.',
      chemicalCompatibility:
        'No known chemical incompatibility. Complementary intracellular targets.',
      researchPrecedent:
        'Both are central to mitochondrial aging and neuroprotection research. Combination is supported by the conceptual framework of mitochondrial-derived peptide biology.',
    },
  ],
]);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get a known interaction between two peptide IDs.
 * Returns undefined if the pair is not in the curated database.
 */
export const getInteraction = (
  idA: string,
  idB: string
): PeptideInteraction | undefined => {
  const key = makeInteractionKey(idA, idB);
  return KNOWN_INTERACTIONS.get(key);
};

/**
 * Get all known interactions for a given peptide ID.
 */
export const getInteractionsByPeptideId = (
  peptideId: string
): PeptideInteraction[] => {
  const results: PeptideInteraction[] = [];
  for (const interaction of KNOWN_INTERACTIONS.values()) {
    if (
      interaction.peptideA === peptideId ||
      interaction.peptideB === peptideId
    ) {
      results.push(interaction);
    }
  }
  return results;
};

/**
 * Get all known interactions as a flat array.
 */
export const getAllInteractions = (): PeptideInteraction[] =>
  Array.from(KNOWN_INTERACTIONS.values());
