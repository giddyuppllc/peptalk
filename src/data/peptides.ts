import { Peptide, PeptideCategory } from '../types';

export const PEPTIDES: Peptide[] = [
  // ─── METABOLIC ────────────────────────────────────────────────────────────────
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    abbreviation: 'Semaglutide',
    categories: ['Metabolic'],
    researchSummary:
      'Semaglutide is a glucagon-like peptide-1 (GLP-1) receptor agonist investigated for its role in glycemic regulation and appetite modulation in preclinical and clinical research models. FDA-approved as Ozempic (diabetes), Wegovy (weight management), and Rybelsus (oral formulation). SUSTAIN-6 and SELECT trials demonstrated cardiovascular risk reduction. Hypothalamic signaling reduces hunger and increases satiety. Studies indicate significant reductions in body mass and improvements in metabolic biomarkers in research subjects. Ongoing investigations explore its cardiovascular and neuroprotective research applications.',
    mechanismOfAction:
      'Binds to and activates the GLP-1 receptor, stimulating insulin secretion in a glucose-dependent manner while suppressing glucagon release. Delays gastric emptying and modulates hypothalamic appetite-regulating centers via central GLP-1R activation.',
    receptorTargets: ['GLP-1R'],
    signalingPathways: ['cAMP/PKA', 'PI3K/Akt', 'MAPK/ERK'],
    stabilityNotes:
      'Store reconstituted solution at 2-8°C. Acylated fatty acid side chain extends plasma half-life by promoting albumin binding. Avoid repeated freeze-thaw cycles.',
    molecularWeight: '4113.58 Da',
    sequenceLength: 31,
    halfLife: '~7 days',
    storageTemp: '2-8°C',
    uses: {
      primaryUses: ['Weight loss', 'Appetite suppression', 'Blood sugar management', 'Type 2 diabetes support'],
      commonGoals: ['Fat loss', 'Metabolic health', 'Cardiovascular risk reduction', 'Portion control'],
      whatPeopleReport: 'Users commonly report significant appetite reduction within the first few weeks, often describing a feeling of fullness after small meals. Many report steady, sustained weight loss of 1-2 lbs per week. Improved blood sugar control and reduced cravings for sugary or high-calorie foods are frequently mentioned. Some users note improved energy levels as weight decreases. Nausea during the initial titration period is a commonly reported side effect that typically diminishes over time.',
      popularWith: ['Weight management', 'Metabolic health', 'Type 2 diabetes community', 'Body recomposition'],
      pairsWith: ['bpc-157', 'aod-9604', 'mots-c', 'nad-plus'],
    },
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    abbreviation: 'Tirzepatide',
    categories: ['Metabolic'],
    researchSummary:
      'Tirzepatide is a dual GIP/GLP-1 receptor agonist under extensive research for metabolic regulation. FDA-approved as Mounjaro (diabetes) and Zepbound (weight management). SURMOUNT/SURPASS trials showed 20-25% total body weight loss at maximum doses, with approximately 5% greater weight loss than semaglutide in head-to-head trials. Preclinical and clinical studies demonstrate robust effects on glycemic control and body composition changes. Research also explores its potential in non-alcoholic steatohepatitis (NASH) models.',
    mechanismOfAction:
      'Simultaneously activates both the glucose-dependent insulinotropic polypeptide (GIP) receptor and the GLP-1 receptor, producing additive effects on insulin secretion, glucagon suppression, and centrally-mediated appetite regulation.',
    receptorTargets: ['GLP-1R', 'GIPR'],
    signalingPathways: ['cAMP/PKA', 'PI3K/Akt', 'beta-arrestin'],
    stabilityNotes:
      'Refrigerate at 2-8°C. C20 fatty diacid moiety promotes albumin binding and extended circulating half-life. Protect from light.',
    molecularWeight: '4813.45 Da',
    sequenceLength: 39,
    halfLife: '~5 days',
    storageTemp: '2-8°C',
    uses: {
      primaryUses: ['Weight loss', 'Dual-action appetite control', 'Blood sugar regulation', 'Body composition improvement'],
      commonGoals: ['Aggressive fat loss', 'Metabolic health', 'Insulin sensitivity', 'Cardiovascular improvement'],
      whatPeopleReport: 'Users often report more pronounced weight loss compared to single-action GLP-1 agonists, with many describing a dual effect on both appetite and metabolic rate. Reduced food noise and diminished cravings are commonly mentioned. Some users report improvements in energy and mood as metabolic markers improve. The dual GIP/GLP-1 action is frequently cited as providing a more comprehensive approach to weight management. GI side effects during dose escalation are commonly reported but typically manageable.',
      popularWith: ['Weight management', 'Metabolic syndrome', 'Body recomposition', 'Athletes cutting weight'],
      pairsWith: ['bpc-157', 'aod-9604', 'mots-c', 'nad-plus'],
    },
  },
  {
    id: 'retatrutide',
    name: 'Retatrutide',
    abbreviation: 'Retatrutide',
    categories: ['Metabolic'],
    researchSummary:
      'Retatrutide is a triple-agonist peptide targeting GLP-1, GIP, and glucagon receptors concurrently, now in Phase 3 trials. Phase 2 showed approximately 24% weight loss at 48 weeks. GLP-1 provides appetite suppression, GIP provides insulin sensitivity, and Glucagon provides thermogenesis and hepatic fat oxidation. Anticipated FDA approval 2025-2026. Research data indicate pronounced effects on body weight reduction and metabolic parameter improvements exceeding those of dual agonists. Investigations continue into its effects on hepatic lipid metabolism.',
    mechanismOfAction:
      'Engages GLP-1R, GIPR, and glucagon receptor (GCGR) simultaneously. GLP-1R and GIPR activation promotes insulin secretion and appetite suppression, while GCGR agonism enhances energy expenditure and hepatic lipid oxidation.',
    receptorTargets: ['GLP-1R', 'GIPR', 'GCGR'],
    signalingPathways: ['cAMP/PKA', 'PI3K/Akt', 'AMPK'],
    stabilityNotes:
      'Store lyophilized form at -20°C. Reconstituted solution stable at 2-8°C for limited duration. Fatty acid acylation extends half-life.',
    molecularWeight: '~4800 Da',
    sequenceLength: 39,
    halfLife: '~6 days',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Significant weight loss', 'Body recomposition', 'Metabolic syndrome', 'Hepatic fat reduction'],
      commonGoals: ['Substantial weight reduction', 'Visceral fat loss', 'Diabetes prevention', 'NASH management'],
      whatPeopleReport: 'Users in research contexts commonly report rapid early appetite suppression with a stronger satiety response than dual GLP-1/GIP agonists, plus noticeable thermogenic effects from glucagon receptor activation (warmth, modest heart-rate elevation). Weight loss often outpaces tirzepatide on a week-by-week basis. GI side effects (nausea, transient constipation) are most common during titration weeks.',
      popularWith: ['High-BMI weight management', 'Metabolic disease research', 'Body recomposition', 'Type 2 diabetes adjacency'],
      pairsWith: ['cagrilintide', 'aod-9604', 'mots-c', '5-amino-1mq'],
    },
  },
  {
    id: 'cagrilintide',
    name: 'Cagrilintide',
    categories: ['Metabolic'],
    researchSummary:
      'Cagrilintide is a long-acting amylin receptor agonist analog explored in metabolic research for its effects on appetite regulation and glycemic control. Research models show synergistic effects when studied in combination with GLP-1 receptor agonists. Preclinical studies highlight its role in satiety signaling and gastric motility modulation.',
    mechanismOfAction:
      'Activates amylin receptors (AMY1, AMY2, AMY3), which are heterodimers of the calcitonin receptor (CTR) and receptor activity-modifying proteins (RAMPs). Modulates area postrema signaling to promote satiety and slows gastric emptying.',
    receptorTargets: ['AMY1R', 'AMY2R', 'AMY3R', 'CTR'],
    signalingPathways: ['cAMP/PKA', 'ERK1/2'],
    stabilityNotes:
      'Store at 2-8°C. Acylation with a C18 fatty diacid extends half-life. Sensitive to extreme pH conditions.',
    molecularWeight: '~3950 Da',
    sequenceLength: 37,
    halfLife: '~7 days',
    storageTemp: '2-8°C',
    uses: {
      primaryUses: ['Weight loss', 'Appetite regulation', 'Combined GLP-1 stacking', 'Glycemic control'],
      commonGoals: ['Sustained satiety', 'Body recomposition', 'GLP-1 plateau breakthrough'],
      whatPeopleReport: 'Users typically pair cagrilintide with semaglutide (CagriSema combo) and report stronger satiety and slower meal-to-meal hunger return than semaglutide alone. As an amylin agonist it works on a different pathway than GLP-1s, so users often describe a "smoother" appetite curve when combined. Weekly dosing keeps logistics simple.',
      popularWith: ['GLP-1 stack users', 'Plateau breakers', 'Long-term weight management'],
      pairsWith: ['semaglutide', 'tirzepatide', 'aod-9604'],
    },
  },
  {
    id: 'mazdutide',
    name: 'Mazdutide',
    categories: ['Metabolic'],
    researchSummary:
      'Mazdutide is a dual GLP-1/glucagon receptor agonist peptide investigated in metabolic and obesity-related research. Phase 2 research data suggest meaningful effects on body weight and HbA1c markers. Research interest also extends to its hepatoprotective potential in fatty liver models.',
    mechanismOfAction:
      'Co-activates the GLP-1 receptor to improve insulin sensitivity and suppress appetite, and the glucagon receptor to enhance hepatic fatty acid oxidation and thermogenesis.',
    receptorTargets: ['GLP-1R', 'GCGR'],
    signalingPathways: ['cAMP/PKA', 'AMPK', 'FGF21 axis'],
    stabilityNotes:
      'Lyophilized powder should be stored at -20°C. Reconstituted peptide is stable at 2-8°C. Avoid exposure to room temperature for extended periods.',
    molecularWeight: '~4200 Da',
    halfLife: '~5-7 days',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Weight loss', 'Glycemic control', 'Hepatic fat reduction', 'Metabolic syndrome'],
      commonGoals: ['Body weight reduction', 'HbA1c improvement', 'NAFLD / NASH support'],
      whatPeopleReport: 'Users report appetite suppression similar to semaglutide with an added thermogenic kick from glucagon receptor activation (warmth, slight resting energy bump). Liver-fat improvements are commonly cited in users with elevated ALT or fatty liver markers. GI side effects taper after the titration period.',
      popularWith: ['Metabolic syndrome research', 'Body recomposition', 'Liver health'],
      pairsWith: ['cagrilintide', 'aod-9604', 'mots-c'],
    },
  },
  {
    id: 'survodutide',
    name: 'Survodutide',
    categories: ['Metabolic'],
    researchSummary:
      'Survodutide is a dual GLP-1/glucagon receptor agonist under active investigation in metabolic disorder research and NASH models. Research findings demonstrate significant reductions in liver fat content and body weight in study populations. Its dual mechanism is hypothesized to provide additive metabolic benefits beyond single-receptor agonism.',
    mechanismOfAction:
      'Activates GLP-1R to drive incretin-mediated insulin release and central appetite suppression, while glucagon receptor activation promotes hepatic glycogenolysis, lipolysis, and energy expenditure.',
    receptorTargets: ['GLP-1R', 'GCGR'],
    signalingPathways: ['cAMP/PKA', 'AMPK', 'PI3K/Akt'],
    stabilityNotes:
      'Store lyophilized form at -20°C. Reconstitute with bacteriostatic water and store at 2-8°C. Fatty acid acylation confers extended duration of action.',
    molecularWeight: '~4300 Da',
    halfLife: '~5-6 days',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Weight loss', 'NASH / liver fat reduction', 'Metabolic disease research', 'Appetite suppression'],
      commonGoals: ['Substantial weight reduction', 'Liver health', 'Visceral fat loss'],
      whatPeopleReport: 'Users describe survodutide\'s effect profile as similar to mazdutide — strong appetite suppression with thermogenic effects from glucagon receptor activity. Reductions in fasted glucose and improvements in liver enzyme panels are commonly mentioned. Boehringer Ingelheim\'s Phase 3 NASH program is the headline research context.',
      popularWith: ['NASH research', 'High-BMI weight management', 'Liver health-focused users'],
      pairsWith: ['cagrilintide', 'aod-9604'],
    },
  },
  {
    id: 'aod-9604',
    name: 'AOD-9604',
    abbreviation: 'AOD-9604',
    categories: ['Metabolic'],
    researchSummary:
      'AOD-9604 is a modified fragment of human growth hormone (hGH 176-191) engineered to selectively stimulate lipolysis without triggering the systemic effects of full-length hGH. Research models demonstrate enhanced fat oxidation and reduced lipogenesis without affecting appetite, glucose levels, or IGF-1. AOD-9604 has achieved U.S. FDA GRAS (Generally Recognized as Safe) designation, highlighting a favorable safety profile. Additional research examines its chondroprotective properties in cartilage repair models. Australian TGA-approved for knee osteoarthritis (intra-articular use) with chondroprotective/anti-catabolic effects on cartilage. Best administered fasted AM for optimal results. Combinable with GLP-1 agonists.',
    mechanismOfAction:
      'Selectively stimulates lipolysis by activating hormone-sensitive lipase (HSL) in adipocytes, promoting adipose tissue mobilization. Does not interact with the growth hormone receptor and therefore does not affect IGF-1 levels, reducing systemic concerns associated with traditional GH research. Activates beta-3 adrenergic receptor-mediated lipolytic cascades through cAMP/PKA signaling.',
    receptorTargets: ['Beta-3 adrenergic receptor', 'Hormone-sensitive lipase (HSL)'],
    signalingPathways: ['cAMP/PKA', 'HSL activation', 'Lipolytic cascade'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted peptide should be refrigerated at 2-8°C and used within 30 days. Susceptible to proteolytic degradation at room temperature.',
    molecularWeight: '1817.12 Da',
    sequenceLength: 16,
    halfLife: '~30 minutes',
    storageTemp: '-20°C',
    pubmedLinks: [
      'https://pubmed.ncbi.nlm.nih.gov/11146367/',
      'https://pubmed.ncbi.nlm.nih.gov/11713213/',
    ],
    uses: {
      primaryUses: ['Targeted fat loss', 'Lipolysis enhancement', 'Body composition', 'Cartilage support'],
      commonGoals: ['Stubborn fat reduction', 'Body recomposition', 'Joint health', 'Lean physique'],
      whatPeopleReport: 'Users commonly report targeted fat reduction, particularly in stubborn areas like the abdomen and love handles, when administered fasted in the morning. Many appreciate that it does not affect appetite, blood sugar, or IGF-1 levels the way full growth hormone does. Users frequently pair it with GLP-1 agonists for complementary fat loss mechanisms. Some report improved joint comfort, referencing its Australian TGA approval for knee osteoarthritis. Results are often described as gradual but consistent over 8-12 week cycles.',
      popularWith: ['Body recomposition', 'Athletes', 'Anti-aging enthusiasts', 'Joint health'],
      pairsWith: ['semaglutide', 'tirzepatide', 'cjc-1295', 'ipamorelin', 'bpc-157'],
    },
  },
  {
    id: '5-amino-1mq',
    name: '5-Amino-1MQ',
    abbreviation: '5-Amino-1MQ',
    categories: ['Metabolic'],
    researchSummary:
      '5-Amino-1MQ is a small molecule inhibitor of nicotinamide N-methyltransferase (NNMT) explored in metabolic research. Preclinical studies indicate it may increase intracellular NAD+ levels and promote lipolysis in adipose tissue. Research also suggests potential effects on cellular energy metabolism and stem cell differentiation.',
    mechanismOfAction:
      'Selectively inhibits NNMT, an enzyme that methylates nicotinamide and consumes SAM (S-adenosylmethionine). NNMT inhibition leads to increased intracellular NAD+ availability, enhanced sirtuin activity, and altered methylation dynamics.',
    receptorTargets: ['NNMT (enzyme inhibitor)'],
    signalingPathways: ['NAD+/SIRT1', 'SAM/SAH methylation cycle', 'AMPK'],
    stabilityNotes:
      'Store at -20°C in dry conditions. Small molecule with good oral bioavailability in preclinical models. Protect from moisture and light.',
    molecularWeight: '173.21 Da',
    halfLife: 'Under investigation',
    storageTemp: '-20°C',
  },
  {
    id: 'adipotide',
    name: 'Adipotide',
    categories: ['Metabolic'],
    researchSummary:
      'Adipotide (CKGGRAKDC-GG-D(KLAKLAK)2) is a peptidomimetic studied in preclinical obesity research models, particularly in non-human primates. It is designed to selectively target and disrupt blood supply to white adipose tissue vasculature. Research has demonstrated reductions in adiposity and improvements in insulin sensitivity markers in animal models.',
    mechanismOfAction:
      'Contains a homing domain (CKGGRAKDC) that binds prohibitin on the surface of adipose tissue endothelial cells, coupled to a pro-apoptotic D-amino acid peptide sequence (KLAKLAK)2 that disrupts mitochondrial membranes upon internalization, inducing apoptosis in targeted vascular endothelium.',
    receptorTargets: ['Prohibitin (PHB)', 'ANXA2 (Annexin A2)'],
    signalingPathways: ['Mitochondrial apoptotic pathway', 'Caspase cascade'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute in sterile water. D-amino acid sequence confers resistance to proteolytic degradation.',
    molecularWeight: '~2500 Da',
    halfLife: '~1-2 hours',
    storageTemp: '-20°C',
  },

  // ─── RECOVERY ─────────────────────────────────────────────────────────────────
  {
    id: 'bpc-157',
    name: 'BPC-157',
    abbreviation: 'BPC-157',
    categories: ['Recovery'],
    researchSummary:
      'BPC-157 (Body Protection Compound-157) is a synthetic pentadecapeptide derived from a partial sequence of a naturally occurring peptide found in human gastric juice, first described in the early 1990s. It has been extensively investigated in preclinical research for cytoprotective, anti-inflammatory, angiogenic, and tissue-repair properties across musculoskeletal, gastrointestinal, neurologic, and cardiovascular injury models. A recent pilot human study evaluating intravenous administration reported no adverse effects in healthy volunteers, though robust human efficacy data remain limited.',
    mechanismOfAction:
      'Exerts effects through multiple overlapping biologic pathways: angiogenesis via VEGF upregulation; cell survival and migration through activation of ERK, FAK, and AKT pathways; nitric oxide modulation supporting vasodilation and endothelial integrity; inflammation downregulation including reductions in COX-2, IL-6, TNF-alpha, and myeloperoxidase activity; and neurotransmitter pathway modulation involving dopaminergic, serotonergic, GABAergic, and opioid systems. Primarily metabolized in the liver via cytochrome P450 pathways with renal excretion.',
    receptorTargets: ['VEGFR2', 'PDGFR', 'Dopamine receptors', 'Serotonin receptors', 'GABA receptors', 'Opioid receptors'],
    signalingPathways: ['NO/NOS', 'VEGF/VEGFR2', 'ERK/MAPK', 'FAK-paxillin', 'AKT/PI3K', 'JAK-STAT3', 'EGF/EGFR', 'COX-2 modulation'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted solution stable at 2-8°C for approximately 10 days. Notably stable across a wide pH range including gastric acid conditions. Avoid repeated freeze-thaw. Short plasma half-life (<30 min) following IM or IV administration; metabolites detectable in urine for up to four days.',
    molecularWeight: '1419.53 Da',
    sequenceLength: 15,
    halfLife: '<30 minutes (plasma); metabolites detectable ~4 days',
    storageTemp: '-20°C',
    pubmedLinks: [
      'https://pubmed.ncbi.nlm.nih.gov/11146367/',
      'https://pubmed.ncbi.nlm.nih.gov/11713213/',
      'https://pubmed.ncbi.nlm.nih.gov/40131143/',
      'https://pubmed.ncbi.nlm.nih.gov/40789979/',
      'https://pubmed.ncbi.nlm.nih.gov/40756949/',
      'https://pubmed.ncbi.nlm.nih.gov/40005999/',
    ],
    uses: {
      primaryUses: ['Injury recovery', 'Gut healing', 'Tendon and ligament repair', 'Inflammation reduction'],
      commonGoals: ['Faster recovery', 'Gut health', 'Joint repair', 'Tissue healing', 'Post-surgical recovery'],
      whatPeopleReport: 'Users commonly report accelerated healing of muscle tears, tendon injuries, and ligament sprains, often noticing improvement within days to weeks. Gut health improvements are frequently cited, including reduced symptoms of leaky gut, IBS, and gastric discomfort. Many users describe it as a foundational recovery peptide they include in almost every stack. Athletes report faster return-to-training timelines after injuries. Some users report improvements in mood and cognitive clarity, which researchers attribute to its effects on dopaminergic and serotonergic systems. Often called the "Wolverine peptide" when stacked with TB-500.',
      popularWith: ['Athletes', 'Injury recovery', 'Gut health', 'Anti-aging enthusiasts', 'Post-surgical healing'],
      pairsWith: ['tb-500', 'ghk-cu', 'kpv', 'ipamorelin', 'cjc-1295'],
    },
  },
  {
    id: 'tb-500',
    name: 'TB-500',
    abbreviation: 'TB-500',
    categories: ['Recovery'],
    researchSummary:
      'TB-500 is a synthetic analog of thymosin beta-4, a 43-amino acid peptide naturally occurring in virtually all human and animal cells. Research in animal models demonstrates its role in promoting cell migration, angiogenesis, and tissue repair processes. Studies also investigate its effects on cardiac tissue repair, dermal wound healing, and reduction of fibrosis. WADA S0 Prohibited substance. Recruits stem cells/progenitor cells to injury sites. Anti-fibrotic effects reducing excessive scarring. Research in cardiac protection, corneal repair, hair restoration, nerve regeneration. "Wolverine Stack": BPC-157 + TB-500 provides multi-pathway synergistic recovery.',
    mechanismOfAction:
      'Sequesters G-actin monomers to regulate actin polymerization, promoting cell migration and reducing inflammation. Upregulates expression of anti-inflammatory cytokines while downregulating pro-inflammatory mediators. Promotes angiogenesis through VEGF-dependent and independent pathways. Stem cell recruitment attracts progenitor cells to injury sites. Anti-fibrotic properties reduce excessive scar formation.',
    receptorTargets: ['G-actin', 'VEGFR'],
    signalingPathways: ['Actin polymerization', 'NF-kB modulation', 'Akt/mTOR', 'HIF-1 alpha'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute with sterile water. Stable at 2-8°C once reconstituted for up to 8 days. Inherently stable peptide with high solubility.',
    molecularWeight: '4963.44 Da',
    sequenceLength: 43,
    halfLife: '~2-3 hours',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Tissue repair', 'Flexibility improvement', 'Wound healing', 'Cardiac protection'],
      commonGoals: ['Recovery from injury', 'Reduced scarring', 'Improved mobility', 'Hair regrowth', 'Systemic healing'],
      whatPeopleReport: 'Users frequently report improved flexibility and range of motion, especially in chronically tight or injured areas. Many describe systemic healing effects that seem to work throughout the body rather than just at the injection site. Reduced scar tissue formation is commonly mentioned by those recovering from surgeries. Some users report noticeable hair regrowth or thickening. The "Wolverine Stack" combination with BPC-157 is one of the most popular peptide pairings in the community, with users reporting synergistic recovery benefits across multiple tissue types including muscle, tendon, ligament, and even nerve tissue.',
      popularWith: ['Athletes', 'Injury recovery', 'Anti-aging enthusiasts', 'Hair restoration', 'Flexibility seekers'],
      pairsWith: ['bpc-157', 'ghk-cu', 'cjc-1295', 'ipamorelin', 'kpv'],
    },
  },

  // ─── GROWTH HORMONE ───────────────────────────────────────────────────────────
  {
    id: 'cjc-1295',
    name: 'CJC-1295',
    abbreviation: 'CJC-1295',
    categories: ['Growth Hormone'],
    researchSummary:
      'CJC-1295 is a synthetic growth hormone-releasing hormone (GHRH) analog with a Drug Affinity Complex (DAC) that extends its half-life significantly. Research demonstrates sustained elevation of growth hormone and IGF-1 levels in study models. It is widely used in research exploring the GH/IGF-1 axis and its downstream effects on body composition and metabolism.',
    mechanismOfAction:
      'Binds to the GHRH receptor (GHRHR) on anterior pituitary somatotrophs, stimulating cAMP production and subsequent growth hormone synthesis and release. The DAC (maleimidopropionic acid) moiety enables covalent binding to serum albumin, extending plasma half-life.',
    receptorTargets: ['GHRHR'],
    signalingPathways: ['cAMP/PKA', 'GH/IGF-1 axis', 'MAPK/ERK'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted with bacteriostatic water, store at 2-8°C. DAC variant has significantly longer half-life than non-DAC form. Sensitive to peptidases at room temperature.',
    molecularWeight: '3367.97 Da (without DAC)',
    sequenceLength: 30,
    halfLife: '~6-8 days (with DAC)',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Growth hormone optimization', 'Body composition improvement', 'Sleep enhancement', 'Anti-aging'],
      commonGoals: ['Lean muscle gain', 'Fat loss', 'Deeper sleep', 'Recovery', 'Skin quality improvement'],
      whatPeopleReport: 'Users commonly report noticeably deeper and more restorative sleep within the first week, often describing vivid dreams. Improvements in body composition are frequently cited, with gradual fat loss and lean muscle preservation over 3-6 month cycles. Many users describe improved skin quality, including better elasticity and reduced wrinkles. Recovery from workouts is often reported as faster and more complete. The CJC-1295/Ipamorelin combination is one of the most widely used GH peptide stacks, with users reporting synergistic benefits that mimic a more natural GH pulsatile release pattern.',
      popularWith: ['Anti-aging enthusiasts', 'Athletes', 'Body recomposition', 'Sleep optimization', 'Longevity seekers'],
      pairsWith: ['ipamorelin', 'bpc-157', 'tb-500', 'sermorelin', 'tesamorelin'],
    },
  },
  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    categories: ['Growth Hormone'],
    researchSummary:
      'Ipamorelin is a selective growth hormone secretagogue (GHS) peptide that stimulates pulsatile GH release without significantly affecting cortisol or prolactin levels. Research indicates it is one of the most selective ghrelin receptor agonists available for GH research. Studies investigate its effects on bone mineral density, body composition, and GI motility.',
    mechanismOfAction:
      'Selectively binds the growth hormone secretagogue receptor (GHSR-1a/ghrelin receptor) on anterior pituitary somatotrophs, triggering GH release. Unlike GHRP-6 or hexarelin, it demonstrates high selectivity for GH release with minimal effect on ACTH, cortisol, or prolactin secretion.',
    receptorTargets: ['GHSR-1a (Ghrelin receptor)'],
    signalingPathways: ['cAMP/PKA', 'IP3/DAG', 'GH/IGF-1 axis'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted solution stable at 2-8°C. Relatively stable peptide compared to other GHSs. Use within 4 weeks of reconstitution.',
    molecularWeight: '711.85 Da',
    sequenceLength: 5,
    halfLife: '~2 hours',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Growth hormone release', 'Anti-aging', 'Recovery enhancement', 'Sleep improvement'],
      commonGoals: ['Lean muscle gain', 'Fat loss', 'Better sleep', 'Injury recovery', 'Youthful vitality'],
      whatPeopleReport: 'Users frequently report Ipamorelin as one of the gentlest and most well-tolerated GH secretagogues, with minimal hunger stimulation compared to GHRP-6 or GHRP-2. Improved sleep quality is one of the earliest reported benefits, often within the first few days. Gradual improvements in body composition are commonly described over 8-12 week protocols. Many users appreciate that it does not significantly elevate cortisol or prolactin, reducing unwanted hormonal side effects. Often described as an ideal starting point for those new to GH peptides.',
      popularWith: ['Anti-aging enthusiasts', 'GH peptide beginners', 'Athletes', 'Sleep optimization', 'Recovery focused'],
      pairsWith: ['cjc-1295', 'sermorelin', 'bpc-157', 'tb-500', 'tesamorelin'],
    },
  },
  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    categories: ['Growth Hormone'],
    researchSummary:
      'Tesamorelin is a synthetic GHRH analog with a trans-3-hexenoic acid modification at the N-terminus. It has been extensively studied for its ability to reduce visceral adipose tissue while stimulating GH secretion. Research models also examine its potential neuroprotective properties and effects on cognitive function biomarkers.',
    mechanismOfAction:
      'Binds the GHRH receptor on pituitary somatotrophs to stimulate endogenous GH synthesis and secretion. The trans-3-hexenoic acid modification improves receptor binding affinity and resistance to enzymatic degradation by dipeptidyl peptidase-IV (DPP-IV).',
    receptorTargets: ['GHRHR'],
    signalingPathways: ['cAMP/PKA', 'GH/IGF-1 axis', 'STAT5'],
    stabilityNotes:
      'Store lyophilized at room temperature (up to 25°C) or refrigerate for longer stability. Reconstitute with sterile water. Reconstituted solution should be used promptly.',
    molecularWeight: '5135.89 Da',
    sequenceLength: 44,
    halfLife: '~26-38 minutes',
    storageTemp: '2-8°C',
    uses: {
      primaryUses: ['Visceral fat reduction', 'Body fat redistribution', 'Lipodystrophy management', 'Cognitive support'],
      commonGoals: ['Belly fat reduction', 'Body composition', 'Metabolic health', 'Neuroprotection'],
      whatPeopleReport: 'Users commonly report targeted reduction of visceral (belly) fat, often describing noticeable changes in waist measurement within 8-12 weeks. It is frequently chosen by those who want GH benefits with a focus specifically on reducing abdominal adiposity. Some users report improvements in cognitive function and mental clarity, which researchers are actively investigating. Studies suggest it may have neuroprotective properties beyond its metabolic effects. Users appreciate that it is one of the few peptides with FDA approval (for HIV-associated lipodystrophy), lending confidence in its safety profile.',
      popularWith: ['Visceral fat reduction', 'Anti-aging enthusiasts', 'Metabolic health', 'HIV community'],
      pairsWith: ['cjc-1295', 'ipamorelin', 'aod-9604', 'sermorelin', 'mots-c'],
    },
  },
  {
    id: 'sermorelin',
    name: 'Sermorelin',
    categories: ['Growth Hormone'],
    researchSummary:
      'Sermorelin is a synthetic peptide analog corresponding to the first 29 amino acids of endogenous GHRH(1-44). It has been studied extensively as a diagnostic and research tool for evaluating pituitary GH-secretory capacity. Research explores its effects on age-related GH decline, sleep architecture, and body composition changes.',
    mechanismOfAction:
      'Binds to the GHRH receptor on somatotroph cells in the anterior pituitary, stimulating cAMP-mediated GH gene transcription and pulsatile GH release. Preserves the physiological negative feedback loop through somatostatin and IGF-1.',
    receptorTargets: ['GHRHR'],
    signalingPathways: ['cAMP/PKA', 'GH/IGF-1 axis', 'CREB transcription'],
    stabilityNotes:
      'Store lyophilized at -20°C. Highly susceptible to degradation by DPP-IV at the N-terminal. Reconstituted solution should be stored at 2-8°C and used within 14 days.',
    molecularWeight: '3357.88 Da',
    sequenceLength: 29,
    halfLife: '~10-20 minutes',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Growth hormone stimulation', 'Anti-aging', 'Sleep improvement', 'Body composition'],
      commonGoals: ['Age-related GH decline', 'Better sleep quality', 'Lean muscle maintenance', 'Skin rejuvenation', 'Overall vitality'],
      whatPeopleReport: 'Users commonly report improved sleep architecture as one of the first noticeable benefits, often describing feeling more rested upon waking. Many describe gradual improvements in skin elasticity and hair quality over several months. Sermorelin is often considered a more natural approach to GH optimization because it works through the body\'s own GHRH receptor, preserving normal feedback mechanisms. Users appreciate its long history of clinical use and established safety profile. Some report improved workout recovery and body composition changes over 3-6 month protocols.',
      popularWith: ['Anti-aging enthusiasts', 'GH optimization', 'Sleep improvement', 'Longevity seekers', 'Wellness clinics'],
      pairsWith: ['ipamorelin', 'cjc-1295', 'bpc-157', 'epithalon', 'ghk-cu'],
    },
  },
  {
    id: 'ghrp-2',
    name: 'GHRP-2',
    abbreviation: 'GHRP-2',
    categories: ['Growth Hormone'],
    researchSummary:
      'GHRP-2 (Growth Hormone Releasing Peptide-2) is a synthetic hexapeptide that potently stimulates GH release through the ghrelin receptor. It is considered one of the most potent GHRPs in terms of GH release magnitude. Research also explores its effects on appetite regulation, cortisol modulation, and cytoprotective mechanisms.',
    mechanismOfAction:
      'Agonizes the GHSR-1a (ghrelin receptor) on pituitary somatotrophs, synergizing with endogenous GHRH to amplify GH pulse amplitude. Also stimulates modest ACTH and cortisol release, and activates appetite via hypothalamic NPY/AgRP pathways.',
    receptorTargets: ['GHSR-1a (Ghrelin receptor)'],
    signalingPathways: ['cAMP/PKA', 'IP3/DAG', 'GH/IGF-1 axis', 'NPY/AgRP'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted solution stable at 2-8°C for approximately 3-4 weeks. Relatively stable synthetic hexapeptide.',
    molecularWeight: '817.97 Da',
    sequenceLength: 6,
    halfLife: '~25-30 minutes',
    storageTemp: '-20°C',
  },
  {
    id: 'ghrp-6',
    name: 'GHRP-6',
    abbreviation: 'GHRP-6',
    categories: ['Growth Hormone'],
    researchSummary:
      'GHRP-6 (Growth Hormone Releasing Peptide-6) is a synthetic hexapeptide GH secretagogue and one of the earliest ghrelin receptor agonists studied. Research demonstrates robust GH release and notable appetite-stimulating effects. It is widely used in research exploring GH axis physiology and ghrelin receptor signaling.',
    mechanismOfAction:
      'Activates GHSR-1a to stimulate GH release from the pituitary. Also significantly stimulates ghrelin-like appetite signaling via hypothalamic circuits. Triggers cortisol and prolactin release to a greater degree than more selective GHRPs.',
    receptorTargets: ['GHSR-1a (Ghrelin receptor)'],
    signalingPathways: ['cAMP/PKA', 'IP3/DAG', 'GH/IGF-1 axis', 'NPY/AgRP', 'PLC'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted solution should be refrigerated at 2-8°C. Generally stable in solution for 3-4 weeks. His-D-Trp sequence contributes to stability.',
    molecularWeight: '873.01 Da',
    sequenceLength: 6,
    halfLife: '~15-30 minutes',
    storageTemp: '-20°C',
  },
  {
    id: 'hexarelin',
    name: 'Hexarelin',
    categories: ['Growth Hormone'],
    researchSummary:
      'Hexarelin is a synthetic hexapeptide growth hormone secretagogue with potent GH-releasing activity. Research indicates it is among the most potent GHRPs but is subject to rapid desensitization of GH response with repeated exposure. Studies also investigate its cardioprotective properties, including effects on cardiac fibrosis and ventricular remodeling.',
    mechanismOfAction:
      'Potently activates GHSR-1a on pituitary somatotrophs and cardiac tissue. Cardioprotective effects may be mediated through CD36 scavenger receptor binding independently of GH release. Stimulates both GH release and ACTH/cortisol secretion.',
    receptorTargets: ['GHSR-1a (Ghrelin receptor)', 'CD36 (scavenger receptor)'],
    signalingPathways: ['cAMP/PKA', 'IP3/DAG', 'GH/IGF-1 axis', 'ERK1/2', 'Akt'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstituted solution stable at 2-8°C for 2-3 weeks. Susceptible to tachyphylaxis in research protocols requiring extended exposure.',
    molecularWeight: '887.04 Da',
    sequenceLength: 6,
    halfLife: '~60 minutes',
    storageTemp: '-20°C',
  },
  {
    id: 'hgh-fragment-176-191',
    name: 'HGH Fragment 176-191',
    abbreviation: 'HGH Frag 176-191',
    categories: ['Growth Hormone', 'Metabolic'],
    researchSummary:
      'HGH Fragment 176-191 is a stabilized peptide corresponding to the C-terminal portion (amino acids 176-191) of human growth hormone. Research focuses on its lipolytic activity, which mimics the fat-metabolizing properties of GH without affecting glycemic control or promoting growth. Studies in obese animal models demonstrate selective reduction of adipose tissue.',
    mechanismOfAction:
      'Stimulates lipolysis and inhibits lipogenesis in adipocytes through beta-3 adrenergic receptor signaling, similar to AOD-9604. Does not bind the GH receptor and does not influence IGF-1 levels or promote cellular proliferation.',
    receptorTargets: ['Beta-3 adrenergic receptor'],
    signalingPathways: ['cAMP/PKA', 'HSL activation', 'lipolytic cascade'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute with bacteriostatic water and store at 2-8°C. Relatively fragile peptide; avoid repeated freeze-thaw cycles.',
    molecularWeight: '1817.12 Da',
    sequenceLength: 16,
    halfLife: '~15-20 minutes',
    storageTemp: '-20°C',
  },
  {
    id: 'igf-1-lr3',
    name: 'IGF-1 LR3',
    abbreviation: 'IGF-1 LR3',
    categories: ['Growth Hormone'],
    researchSummary:
      'IGF-1 LR3 is a modified analog of insulin-like growth factor 1 with an arginine substitution at position 3 and a 13-amino acid N-terminal extension, reducing its affinity for IGF binding proteins. This modification results in significantly enhanced bioavailability and potency compared to native IGF-1 in research settings. Studies investigate its roles in skeletal muscle hypertrophy, cell proliferation, and anti-apoptotic signaling.',
    mechanismOfAction:
      'Binds and activates the IGF-1 receptor (IGF-1R) tyrosine kinase, triggering downstream PI3K/Akt and MAPK/ERK cascades. The LR3 modification drastically reduces binding to IGFBPs (1-6), allowing greater free IGF-1 bioactivity. Promotes protein synthesis, cell survival, and proliferation.',
    receptorTargets: ['IGF-1R', 'Insulin receptor (low affinity)'],
    signalingPathways: ['PI3K/Akt/mTOR', 'MAPK/ERK', 'JAK/STAT', 'Ras/Raf'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute with acidified water or dilute acetic acid (0.1M). Very sensitive to degradation; reconstituted solution should be stored at 2-8°C and used within days.',
    molecularWeight: '9117.5 Da',
    sequenceLength: 83,
    halfLife: '~20-30 hours',
    storageTemp: '-20°C',
  },

  // ─── NOOTROPIC ────────────────────────────────────────────────────────────────
  {
    id: 'semax',
    name: 'Semax',
    categories: ['Nootropic', 'Neuropeptide'],
    researchSummary:
      'Semax is a synthetic heptapeptide analog of the ACTH(4-10) fragment, developed in Russia for neuroscience research. Extensive research explores its nootropic, neuroprotective, and neurotrophic properties. Studies demonstrate upregulation of BDNF and modulation of serotonergic and dopaminergic systems in brain tissue models. Increases BDNF in hippocampus and prefrontal cortex. Improves cerebral blood flow and microcirculation. Clinical applications include cognitive decline, post-stroke/TBI recovery, ADHD adjunct, treatment-resistant depression, and optic nerve atrophy. N-Acetyl Semax variant provides 2-3x potency with longer half-life. Well tolerated; rare nasal irritation.',
    mechanismOfAction:
      'Stimulates expression of brain-derived neurotrophic factor (BDNF), nerve growth factor (NGF), and TrkB receptor signaling. Modulates melanocortin receptors (MC3R/MC4R) and enhances monoaminergic neurotransmission. May influence gene expression related to immune function and neuroplasticity.',
    receptorTargets: ['MC3R', 'MC4R', 'TrkB', 'Dopamine receptors', 'Serotonin receptors', 'Cholinergic receptors'],
    signalingPathways: ['BDNF/TrkB', 'cAMP/PKA', 'MAPK/ERK', 'PI3K/Akt'],
    stabilityNotes:
      'Store lyophilized at -20°C. Nasal formulation stable at 2-8°C. Pro-Gly-Pro C-terminal modification confers resistance to proteolytic degradation. Short plasma half-life but prolonged central effects.',
    molecularWeight: '813.93 Da',
    sequenceLength: 7,
    halfLife: '~2-3 minutes (plasma); prolonged CNS activity',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Cognitive enhancement', 'Neuroprotection', 'Focus and mental clarity', 'Stroke recovery support'],
      commonGoals: ['Sharper focus', 'Memory improvement', 'Brain health', 'ADHD support', 'Post-TBI recovery'],
      whatPeopleReport: 'Users commonly report noticeably improved focus and mental clarity within minutes of nasal administration. Enhanced ability to concentrate for extended periods and improved working memory are frequently described. Some users report a subtle mood lift and increased motivation, attributed to its dopaminergic and serotonergic modulation. The N-Acetyl Semax variant is popular for its reported 2-3x greater potency and longer duration. Many users in the nootropic community consider it one of the most effective and well-tolerated cognitive enhancers available. Studies suggest neuroprotective benefits including increased BDNF in the hippocampus and prefrontal cortex.',
      popularWith: ['Nootropic enthusiasts', 'Students and professionals', 'ADHD community', 'Stroke recovery', 'Cognitive optimization'],
      pairsWith: ['selank', 'noopept', 'nad-plus', 'dihexa', 'cerebrolysin'],
    },
  },
  {
    id: 'selank',
    name: 'Selank',
    categories: ['Nootropic', 'Neuropeptide', 'Immune'],
    researchSummary:
      'Selank is a synthetic heptapeptide analog of the endogenous immunomodulatory peptide tuftsin, with an added Pro-Gly-Pro sequence for metabolic stability. Research investigates its anxiolytic and nootropic properties alongside immunomodulatory effects. Studies report modulation of IL-6 expression and GABAergic neurotransmission. Produces anxiolysis WITHOUT sedation, cognitive impairment, tolerance, or dependence (key advantage over benzodiazepines). Extends endogenous enkephalin half-life via enkephalin stabilization. Tuftsin-derived immune regulatory effects (IL-6, TNF-alpha modulation). Clinical applications: GAD, stress-related disorders, ADHD with anxiety, benzodiazepine taper support, post-viral syndromes. N-Acetyl Selank provides 2-3x potency.',
    mechanismOfAction:
      'Modulates GABAergic neurotransmission by allosterically influencing GABA-A receptor function. Affects serotonin metabolism by inhibiting enkephalin-degrading enzymes. Stimulates IL-6 and influences expression of 36+ genes related to immune and inflammatory responses. Enhances BDNF expression to support neuroplasticity and neuroprotection.',
    receptorTargets: ['GABA-A receptor (allosteric)', 'Tuftsin receptors'],
    signalingPathways: ['GABAergic', 'Serotonergic', 'Enkephalinase inhibition', 'IL-6/JAK-STAT'],
    stabilityNotes:
      'Store lyophilized at -20°C. Pro-Gly-Pro modification extends biological half-life. Intranasal formulations stored at 2-8°C. Highly soluble in aqueous solutions.',
    molecularWeight: '751.87 Da',
    sequenceLength: 7,
    halfLife: '~several minutes (plasma); prolonged CNS effects',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Anxiety reduction', 'Cognitive enhancement', 'Immune modulation', 'Stress resilience'],
      commonGoals: ['Anxiety relief without sedation', 'Mental clarity', 'Immune support', 'Mood stabilization', 'Benzodiazepine alternative'],
      whatPeopleReport: 'Users commonly report a calm, focused state without the sedation or cognitive impairment associated with benzodiazepines. Many describe it as providing anxiolysis while maintaining or even enhancing mental sharpness. The absence of tolerance, dependence, or withdrawal is frequently cited as a major advantage over conventional anxiolytics. Some users report improvements in immune function, particularly during periods of high stress or illness. The N-Acetyl Selank variant is popular for reportedly enhanced potency. Users in the nootropic community often stack it with Semax for a combined anxiolytic-cognitive enhancement protocol.',
      popularWith: ['Anxiety management', 'Nootropic enthusiasts', 'Stress management', 'Immune support', 'Benzodiazepine tapering'],
      pairsWith: ['semax', 'dsip', 'noopept', 'thymosin-alpha-1', 'kpv'],
    },
  },
  {
    id: 'dihexa',
    name: 'Dihexa',
    categories: ['Nootropic', 'Neuropeptide'],
    researchSummary:
      'Dihexa (N-hexanoic-Tyr-Ile-(6) aminohexanoic amide) is a synthetic angiotensin IV analog with extraordinarily potent procognitive properties reported in animal research. 10 million times more potent than BDNF at promoting synaptogenesis via HGF potentiation. CAUTION: Limited human clinical data; theoretical oncogenic concern with HGF pathway; avoid in active malignancy. Clinical applications: Significant cognitive impairment, MCI, early dementia, TBI recovery. Research focuses on synaptogenesis, memory consolidation, and potential applications in neurodegenerative disease models.',
    mechanismOfAction:
      'Activates the hepatocyte growth factor (HGF)/c-Met receptor system, promoting dendritic spine formation and synaptogenesis. Functions as an allosteric potentiator of HGF by inhibiting HGF inactivation. Does not bind AT4 receptor directly like angiotensin IV but acts through distinct HGF-dependent mechanisms.',
    receptorTargets: ['c-Met (HGF receptor)'],
    signalingPathways: ['HGF/c-Met', 'PI3K/Akt', 'MAPK/ERK', 'Ras/Raf'],
    stabilityNotes:
      'Store at -20°C in dry conditions. Small molecule-like peptide with enhanced oral bioavailability. Protect from moisture. Stable in DMSO stock solutions.',
    molecularWeight: '507.66 Da',
    halfLife: 'Under investigation; extended compared to angiotensin IV',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Cognitive enhancement', 'Memory consolidation', 'Synaptogenesis', 'Neuroprotection'],
      commonGoals: ['Memory improvement', 'Cognitive decline support', 'Brain repair', 'Learning enhancement'],
      whatPeopleReport: 'Users exploring this research compound report improvements in memory recall and learning capacity. It is commonly researched for its extraordinary potency in promoting synaptogenesis, reported to be 10 million times more potent than BDNF in certain assays. The nootropic community considers it among the most powerful cognitive-enhancing compounds studied, though human clinical data remain limited. Users generally approach it with caution due to its potent HGF pathway activation, which carries theoretical oncogenic concerns. It is typically reserved for significant cognitive impairment situations rather than casual nootropic use.',
      popularWith: ['Cognitive decline support', 'Neuroscience research', 'Advanced nootropic users', 'TBI recovery'],
      pairsWith: ['semax', 'cerebrolysin', 'noopept', 'nad-plus', 'humanin'],
    },
  },
  {
    id: 'pinealon',
    name: 'Pinealon',
    categories: ['Nootropic', 'Neuropeptide'],
    researchSummary:
      'Pinealon (Glu-Asp-Arg) is a short bioregulatory tripeptide derived from the pineal gland, developed as part of Khavinson peptide bioregulation research. Studies explore its neuroprotective and geroprotective properties, particularly in models of oxidative stress and neurodegeneration. Research indicates it may modulate gene expression related to cell differentiation and apoptosis in neural tissue.',
    mechanismOfAction:
      'Proposed to penetrate cell membranes and interact directly with DNA, modulating gene expression related to neural cell differentiation and survival. May regulate epigenetic mechanisms and influence antioxidant enzyme expression. Exact receptor targets remain under investigation.',
    receptorTargets: ['Direct DNA interaction (proposed)'],
    signalingPathways: ['Epigenetic regulation', 'Antioxidant defense (SOD, catalase)', 'Apoptosis regulation'],
    stabilityNotes:
      'Store at -20°C. Tripeptide with moderate stability. Short peptides may have limited plasma half-life but can penetrate biological barriers. Lyophilized form preferred.',
    molecularWeight: '418.40 Da',
    sequenceLength: 3,
    halfLife: '~minutes (estimated for tripeptide)',
    storageTemp: '-20°C',
  },
  {
    id: 'cerebrolysin',
    name: 'Cerebrolysin',
    categories: ['Nootropic', 'Neuropeptide'],
    researchSummary:
      'Cerebrolysin is a porcine-derived neurotrophic peptide complex composed of approximately 14,635 low-molecular-weight amino acid chains, specifically designed to cross the blood-brain barrier. Developed by neurologist Gerhart Harrer, it has been studied internationally in cognitive decline, traumatic brain injury, ischemic stroke rehabilitation, and neurodegenerative disorder models. It acts as a multi-pathway biological signal modulator rather than targeting a single receptor.',
    mechanismOfAction:
      'Contains neurotrophic factor-like peptides that mimic and modulate hundreds of endogenous signaling pathways: BDNF, NGF, GDNF for neuronal survival and synaptic plasticity; IGF-1-like signaling for neuronal growth; VEGF modulation for cerebral microcirculation; GSK-3beta inhibition for anti-apoptotic signaling; TrkB and CREB phosphorylation for learning and memory consolidation; VIP, Galanin, and Orexin for neuroimmune balance and cognition; SOD and antioxidant peptides for oxidative stress reduction; and Histatins and Defensins for immune and neuroprotective modulation.',
    receptorTargets: ['TrkA', 'TrkB', 'p75NTR', 'NMDA receptor (modulatory)', 'VIP receptors', 'Orexin receptors', 'Galanin receptors'],
    signalingPathways: ['BDNF/TrkB', 'NGF/TrkA', 'GDNF', 'IGF-1-like', 'VEGF', 'PI3K/Akt', 'GSK-3 beta', 'MAPK/ERK', 'CREB', 'SOD/antioxidant'],
    stabilityNotes:
      'Store at 2-8°C protected from light. Amber-colored aqueous solution. Do not freeze. Contains a complex mixture so batch variability is a research consideration.',
    molecularWeight: 'Mixture (~14,635 peptide chains, <10,000 Da fragments)',
    halfLife: '~minutes for individual peptides; cumulative effects persist',
    storageTemp: '2-8°C',
    pubmedLinks: [
      'https://pubmed.ncbi.nlm.nih.gov/11561424/',
      'https://pubmed.ncbi.nlm.nih.gov/19683614/',
      'https://pubmed.ncbi.nlm.nih.gov/21659748/',
      'https://pubmed.ncbi.nlm.nih.gov/29054302/',
    ],
  },

  // ─── IMMUNE ───────────────────────────────────────────────────────────────────
  {
    id: 'thymosin-alpha-1',
    name: 'Thymosin Alpha-1',
    abbreviation: 'Ta1',
    categories: ['Immune'],
    researchSummary:
      'Thymosin Alpha-1 is a 28-amino acid peptide originally isolated from thymic tissue, now produced synthetically. Approved as Zadaxin in multiple countries. It is one of the most extensively researched immunomodulatory peptides with studies spanning decades. Enhances CD4+ and CD8+ T-cell maturation, differentiation, and function. Improves dendritic cell antigen presentation. Increases NK cell number and cytotoxicity. Optimizes Th1/Th2 balance. Research investigates its ability to modulate dendritic cell maturation, enhance T-cell function, and balance Th1/Th2 immune responses. Excellent long-term safety profile. Contraindicated in organ transplant patients on immunosuppression.',
    mechanismOfAction:
      'Activates Toll-like receptors TLR2 and TLR9 on dendritic cells, promoting maturation and cross-presentation of antigens. Enhances NK cell cytotoxicity, stimulates T-cell differentiation, and modulates the balance between pro-inflammatory and anti-inflammatory cytokine production.',
    receptorTargets: ['TLR2', 'TLR9'],
    signalingPathways: ['TLR/MyD88', 'NF-kB', 'IRF7', 'p38 MAPK', 'T-cell receptor signaling'],
    stabilityNotes:
      'Store lyophilized at 2-8°C. Reconstituted solution stable at 2-8°C for several days. Acetylated N-terminus provides resistance to aminopeptidases. Highly soluble in aqueous buffers.',
    molecularWeight: '3108.3 Da',
    sequenceLength: 28,
    halfLife: '~2 hours',
    storageTemp: '2-8°C',
  },
  {
    id: 'thymalin',
    name: 'Thymalin',
    categories: ['Immune', 'Longevity'],
    researchSummary:
      'Thymalin is a dipeptide (Glu-Trp) derived from thymic extract research, developed as part of the Khavinson peptide bioregulator paradigm. 30+ years of clinical use with documented safety. Geroprotective research examines its effects on immune reconstitution and longevity markers. Increases CD3+, CD4+, CD8+ maturation. Decreases IL-6, IL-1beta, TNF-alpha; increases IL-2. Reverses age-related thymic involution. Long-term observational studies in elderly populations have investigated correlations with improved immune function biomarkers and reduced morbidity. Classic Russian Longevity Protocol: Epitalon + Thymalin biannually.',
    mechanismOfAction:
      'Proposed to modulate thymic function by influencing thymocyte differentiation and T-cell maturation. May interact directly with DNA regulatory regions to modulate gene expression related to immune cell development. Influences the neuroendocrine-immune axis.',
    receptorTargets: ['Thymic epithelial cell receptors (proposed)'],
    signalingPathways: ['T-cell maturation pathways', 'Epigenetic regulation', 'Neuroendocrine-immune axis'],
    stabilityNotes:
      'Store lyophilized at -20°C. Short dipeptide with rapid clearance. Reconstitute in sterile saline. Stable in lyophilized form for extended periods.',
    molecularWeight: '333.34 Da',
    sequenceLength: 2,
    halfLife: '~minutes',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Immune reconstitution', 'Thymic function restoration', 'Longevity support', 'Age-related immune decline'],
      commonGoals: ['Immune system rejuvenation', 'Longevity', 'T-cell function', 'Reduced illness frequency'],
      whatPeopleReport: 'Users in the longevity community commonly report improved immune resilience, including fewer and shorter illness episodes. It is a cornerstone of the classic Russian longevity protocol, typically administered biannually alongside Epithalon. Users describe it as supporting the immune system at a fundamental level by addressing age-related thymic involution. Long-term observational studies spanning 30+ years in elderly populations have investigated correlations with improved immune biomarkers. The peptide bioregulation community considers it essential for maintaining immune competence in aging.',
      popularWith: ['Longevity enthusiasts', 'Aging population', 'Immune optimization', 'Russian peptide bioregulation'],
      pairsWith: ['epithalon', 'thymosin-alpha-1', 'll-37', 'nad-plus', 'humanin'],
    },
  },
  {
    id: 'll-37',
    name: 'LL-37',
    abbreviation: 'LL-37',
    categories: ['Immune', 'Antimicrobial'],
    researchSummary:
      'LL-37 is the only cathelicidin-derived antimicrobial peptide identified in humans, produced by cleavage of the hCAP18 precursor protein. Research demonstrates broad-spectrum antimicrobial activity against bacteria, fungi, and enveloped viruses through membrane disruption. Studies also explore its immunomodulatory, angiogenic, and wound-healing properties beyond direct antimicrobial action.',
    mechanismOfAction:
      'Disrupts microbial membranes through electrostatic interaction with negatively charged lipid bilayers, forming toroidal pores. Also activates formyl peptide receptor-like 1 (FPRL1/FPR2), P2X7 receptor, and EGFR to modulate immune cell chemotaxis, cytokine production, and wound healing.',
    receptorTargets: ['FPR2/FPRL1', 'P2X7', 'EGFR', 'TLR4 (modulatory)'],
    signalingPathways: ['MAPK/ERK', 'NF-kB modulation', 'PI3K/Akt', 'WNT/beta-catenin', 'EGFR/STAT3'],
    stabilityNotes:
      'Store lyophilized at -20°C. Highly cationic and amphipathic; may adsorb to plastic surfaces. Reconstitute in sterile water. Sensitive to high salt concentrations which may affect secondary structure.',
    molecularWeight: '4493.33 Da',
    sequenceLength: 37,
    halfLife: '~minutes to hours (tissue-dependent)',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Antimicrobial defense', 'Immune modulation', 'Wound healing', 'Biofilm disruption'],
      commonGoals: ['Infection resistance', 'Immune support', 'Chronic infection management', 'Wound healing', 'Lyme disease support'],
      whatPeopleReport: 'Users commonly report improved resilience against chronic and recurrent infections. The Lyme disease and chronic infection communities frequently discuss LL-37 for its broad-spectrum antimicrobial activity against bacteria, fungi, and enveloped viruses. Many users describe it as a natural antimicrobial peptide that supports the body\'s innate immune defense without the resistance concerns of traditional antibiotics. Wound healing acceleration is also frequently reported. Some users incorporate it into protocols for biofilm-associated infections where conventional antimicrobials have limited penetration.',
      popularWith: ['Immune support', 'Chronic infection management', 'Lyme disease community', 'Wound healing', 'Antimicrobial research'],
      pairsWith: ['thymosin-alpha-1', 'kpv', 'bpc-157', 'thymalin', 'nad-plus'],
    },
  },

  // ─── ANTI-INFLAMMATORY ────────────────────────────────────────────────────────
  {
    id: 'kpv',
    name: 'KPV',
    abbreviation: 'KPV',
    categories: ['Anti-inflammatory'],
    researchSummary:
      'KPV is a C-terminal tripeptide fragment (Lys-Pro-Val) of alpha-melanocyte-stimulating hormone (alpha-MSH) that retains potent anti-inflammatory activity. Research demonstrates it inhibits NF-kB nuclear translocation and reduces pro-inflammatory cytokine production in multiple cell types. Studies in intestinal inflammation models show reduced mucosal damage and inflammatory infiltration. Gut mucosal healing - reduces intestinal inflammation, supports barrier integrity. Direct antimicrobial activity in addition to anti-inflammatory effects.',
    mechanismOfAction:
      'Enters cells and directly inhibits NF-kB activation by preventing IkB-alpha degradation and p65 nuclear translocation. Unlike full-length alpha-MSH, KPV may exert anti-inflammatory effects independently of melanocortin receptors, though some MC1R interaction has been reported.',
    receptorTargets: ['MC1R (partial)', 'Intracellular NF-kB pathway (direct)'],
    signalingPathways: ['NF-kB inhibition', 'IkB-alpha stabilization', 'PGE2 reduction', 'TNF-alpha suppression'],
    stabilityNotes:
      'Store lyophilized at -20°C. Tripeptide with moderate aqueous stability. Reconstitute in sterile water. Short plasma half-life typical of tripeptides but intracellular activity may persist.',
    molecularWeight: '342.43 Da',
    sequenceLength: 3,
    halfLife: '~minutes',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Gut inflammation reduction', 'Skin inflammation', 'Intestinal barrier support', 'Systemic anti-inflammatory'],
      commonGoals: ['Gut healing', 'IBD/IBS support', 'Skin conditions', 'Reduced systemic inflammation', 'Mucosal healing'],
      whatPeopleReport: 'Users commonly report significant improvements in gut-related symptoms including bloating, discomfort, and irregular digestion. The IBD and IBS communities frequently discuss KPV for its targeted anti-inflammatory effects on intestinal mucosa. Many users describe it as working synergistically with BPC-157 for comprehensive gut healing. Improvements in inflammatory skin conditions are also frequently reported when used topically or systemically. Users appreciate its mechanism of directly inhibiting NF-kB, the master inflammatory switch, without the immunosuppressive effects of conventional anti-inflammatory drugs.',
      popularWith: ['Gut health', 'IBD/IBS community', 'Skin health', 'Anti-inflammatory protocols', 'Autoimmune support'],
      pairsWith: ['bpc-157', 'll-37', 'thymosin-alpha-1', 'ghk-cu', 'glutathione'],
    },
  },

  // ─── MITOCHONDRIAL ────────────────────────────────────────────────────────────
  {
    id: 'mots-c',
    name: 'MOTS-c',
    abbreviation: 'MOTS-c',
    categories: ['Mitochondrial', 'Metabolic'],
    researchSummary:
      'MOTS-c (Mitochondrial Open Reading Frame of the 12S rRNA Type-c) is a mitochondria-derived peptide encoded within the 12S rRNA gene. Research reveals it as a mitochondrial-encoded signaling peptide that regulates metabolic homeostasis and insulin sensitivity. Studies demonstrate AMPK activation, enhanced glucose uptake, and exercise-mimetic effects in research models. Direct AMPK activator via folate-AICAR-AMPK axis. Exercise mimetic effects including shifting muscle fiber composition toward Type I. Enhances skeletal muscle glucose uptake independently of insulin. Upregulates PGC-1alpha for mitochondrial biogenesis.',
    mechanismOfAction:
      'Activates AMPK by altering the folate cycle and de novo purine biosynthesis pathway, leading to accumulation of AICAR (an endogenous AMPK activator). Translocates to the nucleus under metabolic stress to regulate adaptive gene expression. Enhances skeletal muscle glucose uptake independently of insulin.',
    receptorTargets: ['Intracellular (AMPK pathway)', 'Nuclear translocation'],
    signalingPathways: ['AMPK', 'Folate-AICAR-AMPK axis', 'mTOR inhibition', 'NRF2/ARE', 'SIRT1'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute in sterile water. Mitochondrial-derived peptide with moderate stability. Protect from repeated freeze-thaw. Use within 2 weeks of reconstitution.',
    molecularWeight: '2174.63 Da',
    sequenceLength: 16,
    halfLife: '~4-12 hours (estimated)',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Exercise mimetic', 'Metabolic optimization', 'Insulin sensitivity', 'Mitochondrial function'],
      commonGoals: ['Enhanced exercise performance', 'Fat metabolism', 'Blood sugar regulation', 'Cellular energy', 'Muscle fiber optimization'],
      whatPeopleReport: 'Users commonly report improved exercise tolerance and endurance, often describing it as providing a noticeable boost to workout performance. Enhanced fat metabolism and improved body composition are frequently cited over 8-12 week protocols. Many users in the metabolic health community value its direct AMPK activation, which mimics many of the cellular benefits of exercise. Some users report improved insulin sensitivity and blood sugar regulation. The longevity community considers MOTS-c a key mitochondrial-derived peptide for maintaining metabolic health during aging, as natural MOTS-c levels decline with age.',
      popularWith: ['Athletes', 'Metabolic health', 'Exercise optimization', 'Longevity seekers', 'Weight management'],
      pairsWith: ['ss-31', 'nad-plus', 'aod-9604', 'semaglutide', 'aicar'],
    },
  },
  {
    id: 'ss-31',
    name: 'SS-31',
    abbreviation: 'SS-31',
    categories: ['Mitochondrial'],
    researchSummary:
      'SS-31 (Elamipretide/Bendavia) is a cell-permeable tetrapeptide (D-Arg-Dmt-Lys-Phe-NH2) that selectively concentrates in the inner mitochondrial membrane at 1000-5000x enrichment over cytoplasm. Research demonstrates it stabilizes cardiolipin and optimizes electron transport chain function. Optimizes electron transport chain flow. Enhances ATP production while reducing ROS at source. Studies investigate its effects on mitochondrial bioenergetics, oxidative stress, and age-related mitochondrial dysfunction. Research in cardiac, renal, and neurological mitochondrial dysfunction.',
    mechanismOfAction:
      'Selectively binds cardiolipin in the inner mitochondrial membrane, stabilizing cytochrome c interaction and optimizing electron transfer between complexes III and IV. Reduces electron leak and ROS generation. Does not act as a conventional antioxidant but rather optimizes mitochondrial function at its source.',
    receptorTargets: ['Cardiolipin (inner mitochondrial membrane)'],
    signalingPathways: ['ETC optimization', 'Cardiolipin stabilization', 'ROS reduction', 'Cytochrome c interaction'],
    stabilityNotes:
      'Store lyophilized at -20°C. Contains D-amino acids and dimethyltyrosine which enhance stability. Reconstitute in sterile water. Cell-permeable without requiring specific transporters.',
    molecularWeight: '640.8 Da',
    sequenceLength: 4,
    halfLife: '~4 hours',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Mitochondrial function optimization', 'Cellular energy production', 'Oxidative stress reduction', 'Organ protection'],
      commonGoals: ['Mitochondrial health', 'Energy improvement', 'Anti-aging at the cellular level', 'Cardiac protection', 'Kidney support'],
      whatPeopleReport: 'Users commonly report improved energy levels and reduced fatigue, often describing a sense of cellular vitality rather than stimulant-like energy. The longevity community values SS-31 for its unique mechanism of stabilizing cardiolipin in the inner mitochondrial membrane, which optimizes electron transport chain function at its source. Some users report improvements in exercise recovery and cardiovascular endurance. Research in cardiac, renal, and neurological mitochondrial dysfunction models has generated significant interest. Users appreciate that it reduces ROS generation at the source rather than simply scavenging free radicals after they form.',
      popularWith: ['Longevity seekers', 'Mitochondrial health', 'Cardiac support', 'Energy optimization', 'Anti-aging research'],
      pairsWith: ['mots-c', 'nad-plus', 'humanin', 'epithalon', 'glutathione'],
    },
  },
  {
    id: 'nad-plus',
    name: 'NAD+',
    abbreviation: 'NAD+',
    categories: ['Mitochondrial', 'Longevity'],
    researchSummary:
      'NAD+ (Nicotinamide Adenine Dinucleotide) is an essential coenzyme present in all living cells, serving as a critical substrate for sirtuins, PARPs, and CD38. Research focuses on age-related NAD+ decline and its impact on mitochondrial function, DNA repair, and cellular metabolism. Studies investigate various precursor strategies (NMN, NR) and direct NAD+ repletion in research models.',
    mechanismOfAction:
      'Serves as an obligate co-substrate for sirtuin deacetylases (SIRT1-7), enabling epigenetic regulation and mitochondrial biogenesis. Required by PARP enzymes for DNA repair. Functions as an electron carrier in glycolysis, TCA cycle, and oxidative phosphorylation. CD38-mediated NAD+ consumption increases with aging.',
    receptorTargets: ['SIRT1-7 (co-substrate)', 'PARP1/2 (co-substrate)', 'CD38 (substrate)'],
    signalingPathways: ['SIRT1/PGC-1 alpha', 'PARP/DNA repair', 'AMPK', 'mTOR', 'Oxidative phosphorylation'],
    stabilityNotes:
      'Store at -20°C protected from light and moisture. Highly hygroscopic. Reduced form (NADH) is light-sensitive. Aqueous solutions degrade rapidly at room temperature. Maintain cold chain.',
    molecularWeight: '663.43 Da',
    halfLife: '~1-2 hours (plasma)',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Cellular energy restoration', 'DNA repair', 'Longevity support', 'Metabolic function'],
      commonGoals: ['Energy and vitality', 'Anti-aging', 'Cognitive clarity', 'Addiction recovery support', 'Cellular repair'],
      whatPeopleReport: 'Users commonly report a significant boost in energy and mental clarity, particularly with IV administration. Many describe feeling revitalized and cognitively sharper, often within hours of an IV infusion. The longevity community considers NAD+ repletion foundational to any anti-aging protocol, as NAD+ levels naturally decline 50% or more by middle age. Some users report improved mood and reduced brain fog. The addiction recovery community has explored NAD+ IV therapy as an adjunct for withdrawal support. Users frequently combine direct NAD+ repletion with precursor strategies (NMN, NR) for sustained benefits between infusions.',
      popularWith: ['Longevity enthusiasts', 'Anti-aging', 'Cognitive optimization', 'Addiction recovery', 'High performers'],
      pairsWith: ['epithalon', 'ss-31', 'mots-c', 'humanin', 'glutathione'],
    },
  },
  {
    id: 'slu-pp-332',
    name: 'SLU-PP-332',
    abbreviation: 'SLU-PP-332',
    categories: ['Mitochondrial'],
    researchSummary:
      'SLU-PP-332 is a small molecule agonist of estrogen-related receptors (ERRs), investigated as an exercise mimetic in preclinical metabolic research. Studies in mouse models demonstrate increased oxidative muscle fiber content, enhanced mitochondrial biogenesis, and improved exercise endurance. Research explores its potential as a tool compound for studying ERR-mediated metabolic regulation.',
    mechanismOfAction:
      'Activates the estrogen-related receptor (ERR) family, particularly ERR-alpha, ERR-beta, and ERR-gamma. ERR activation drives transcription of genes involved in mitochondrial biogenesis, oxidative phosphorylation, fatty acid oxidation, and the TCA cycle. Mimics transcriptional effects of endurance exercise on skeletal muscle.',
    receptorTargets: ['ERR-alpha', 'ERR-beta', 'ERR-gamma'],
    signalingPathways: ['ERR/PGC-1 alpha', 'Mitochondrial biogenesis', 'Oxidative phosphorylation', 'Fatty acid oxidation'],
    stabilityNotes:
      'Store at -20°C. Small molecule with good chemical stability. Soluble in DMSO for stock solutions. Protect from light and humidity.',
    molecularWeight: '~400 Da',
    halfLife: 'Under investigation',
    storageTemp: '-20°C',
  },

  // ─── LONGEVITY ────────────────────────────────────────────────────────────────
  {
    id: 'epithalon',
    name: 'Epithalon',
    categories: ['Longevity'],
    researchSummary:
      'Epithalon (Epitalon, Ala-Glu-Asp-Gly) is a synthetic tetrapeptide based on the natural pineal peptide epithalamin, developed by Professor Khavinson. Research explores its ability to activate telomerase and extend telomere length in human somatic cells. Studies in animal models and cell cultures investigate its geroprotective effects, including modulation of melatonin production and circadian rhythm regulation. Restores melatonin synthesis capacity and circadian rhythm regulation. Reduces lipid peroxidation and oxidative damage. Modulates aging-related gene expression patterns. Classic Russian Longevity Protocol: Epitalon 10mg x 10-20 days + Thymalin 10mg x 10 days, biannually.',
    mechanismOfAction:
      'Activates telomerase reverse transcriptase (hTERT) catalytic subunit expression, promoting telomere elongation in somatic cells approaching replicative senescence. May also stimulate pineal melatonin production and modulate neuroendocrine regulation of aging through the pineal-hypothalamic axis.',
    receptorTargets: ['hTERT (transcriptional activation)', 'Pineal gland regulatory elements'],
    signalingPathways: ['Telomerase/hTERT', 'Melatonin synthesis', 'Circadian clock regulation', 'Epigenetic modulation'],
    stabilityNotes:
      'Store lyophilized at -20°C. Tetrapeptide with moderate stability in aqueous solution. Reconstitute with sterile water. Short plasma half-life typical of small peptides.',
    molecularWeight: '390.35 Da',
    sequenceLength: 4,
    halfLife: '~minutes',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Telomere elongation', 'Longevity support', 'Melatonin regulation', 'Circadian rhythm optimization'],
      commonGoals: ['Longevity', 'Cellular aging reversal', 'Better sleep patterns', 'Oxidative stress reduction', 'Geroprotection'],
      whatPeopleReport: 'Users in the longevity community commonly report improved sleep quality and more regular circadian rhythms, often attributed to restored melatonin synthesis capacity. Many describe a general sense of vitality and well-being during and after 10-20 day treatment cycles. The telomerase activation mechanism generates significant interest among longevity enthusiasts, as telomere shortening is a hallmark of cellular aging. The classic Russian longevity protocol combines Epithalon with Thymalin biannually and is one of the most discussed longevity peptide regimens. Some users report improvements in skin quality and reduced oxidative stress markers. Long-term observational studies by Professor Khavinson spanning decades provide the foundational research for this peptide.',
      popularWith: ['Longevity seekers', 'Anti-aging enthusiasts', 'Sleep optimization', 'Russian peptide bioregulation', 'Geroprotection'],
      pairsWith: ['thymalin', 'nad-plus', 'ss-31', 'humanin', 'ghk-cu'],
    },
  },

  // ─── SLEEP ────────────────────────────────────────────────────────────────────
  {
    id: 'dsip',
    name: 'DSIP',
    abbreviation: 'DSIP',
    categories: ['Sleep', 'Neuropeptide'],
    researchSummary:
      'DSIP (Delta Sleep-Inducing Peptide) is a nonapeptide (Trp-Ala-Gly-Gly-Asp-Ala-Ser-Gly-Glu) originally isolated from cerebral venous blood of rabbits during electrically induced sleep. Research investigates its effects on sleep architecture, particularly delta wave (slow-wave) sleep promotion. Promotes delta wave (deep) sleep WITHOUT sedation. HPA axis modulation normalizes cortisol and enhances stress resilience. Pain modulation with opioid-like effects without addiction or tolerance. No next-day drowsiness; no tolerance or dependence development. Applications: primary insomnia, chronic stress, jet lag, chronic pain, substance withdrawal support. Studies also explore its potential stress-modulatory, analgesic, and endocrine-regulating properties.',
    mechanismOfAction:
      'Mechanism remains incompletely characterized. Proposed to modulate GABAergic and glutamatergic neurotransmission, influence cortisol and ACTH release, and interact with opioid systems. May affect serotonin and dopamine turnover in specific brain regions. Appears to act as a neuromodulator rather than through a single receptor target.',
    receptorTargets: ['GABA-A receptor (modulatory)', 'Opioid receptors (partial)', 'Serotonergic system'],
    signalingPathways: ['GABAergic', 'Serotonergic', 'Hypothalamic-pituitary-adrenal axis', 'Opioidergic'],
    stabilityNotes:
      'Store lyophilized at -20°C. Nonapeptide susceptible to proteolytic degradation. Reconstitute with sterile water and store at 2-8°C. Use shortly after reconstitution. Some research uses phosphorylated DSIP variant for improved stability.',
    molecularWeight: '848.82 Da',
    sequenceLength: 9,
    halfLife: '~7-8 minutes',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Deep sleep promotion', 'Stress modulation', 'Pain management', 'Recovery enhancement'],
      commonGoals: ['Better sleep quality', 'Delta wave sleep', 'Stress resilience', 'Chronic pain support', 'Jet lag management'],
      whatPeopleReport: 'Users commonly report deeper, more restorative sleep with increased time in delta wave (slow-wave) sleep phases. Many describe waking feeling more refreshed without the grogginess associated with pharmaceutical sleep aids. The absence of tolerance or dependence development is frequently cited as a major advantage. Some users report improved stress resilience and pain management as secondary benefits. The peptide is popular among shift workers and frequent travelers for circadian rhythm normalization and jet lag management. Users appreciate that it promotes natural sleep architecture rather than inducing sedation.',
      popularWith: ['Sleep optimization', 'Shift workers', 'Frequent travelers', 'Pain management', 'Stress management'],
      pairsWith: ['selank', 'epithalon', 'cjc-1295', 'ipamorelin', 'sermorelin'],
    },
  },

  // ─── REPRODUCTIVE ─────────────────────────────────────────────────────────────
  {
    id: 'kisspeptin-10',
    name: 'Kisspeptin-10',
    categories: ['Reproductive'],
    researchSummary:
      'Kisspeptin-10 is the C-terminal decapeptide fragment of kisspeptin-54, the endogenous ligand for the GPR54 (KISS1R) receptor. It is a critical regulator of the hypothalamic-pituitary-gonadal (HPG) axis and GnRH neuron activation. Research investigates its role in puberty onset, reproductive endocrinology, and as a diagnostic tool for hypothalamic amenorrhea and hypogonadism models.',
    mechanismOfAction:
      'Binds and activates the KISS1 receptor (GPR54) on GnRH neurons in the hypothalamus, triggering robust GnRH secretion and subsequent LH and FSH release from the anterior pituitary. Represents the most potent known endogenous stimulator of the reproductive hormone cascade.',
    receptorTargets: ['KISS1R (GPR54)'],
    signalingPathways: ['Gq/PLC/IP3', 'GnRH/LH/FSH cascade', 'PKC', 'MAPK/ERK'],
    stabilityNotes:
      'Store lyophilized at -20°C. Reconstitute in sterile water. Short-acting peptide with rapid clearance. Sensitive to enzymatic degradation. Use promptly after reconstitution.',
    molecularWeight: '1302.46 Da',
    sequenceLength: 10,
    halfLife: '~4 minutes',
    storageTemp: '-20°C',
  },
  {
    id: 'hcg',
    name: 'hCG',
    abbreviation: 'hCG',
    categories: ['Reproductive'],
    researchSummary:
      'Human chorionic gonadotropin (hCG) is a heterodimeric glycoprotein hormone naturally produced by trophoblast cells. Research extensively characterizes its role in maintaining corpus luteum progesterone production and modulating gonadal steroidogenesis. Studies investigate its applications in reproductive endocrinology research, including Leydig cell stimulation and ovulation induction models.',
    mechanismOfAction:
      'Binds and activates the luteinizing hormone/choriogonadotropin receptor (LHCGR), a G protein-coupled receptor, on gonadal cells. In Leydig cells, stimulates testosterone synthesis via cAMP/PKA-mediated StAR protein activation. In ovarian granulosa cells, promotes progesterone synthesis and oocyte maturation.',
    receptorTargets: ['LHCGR (LH/CG receptor)'],
    signalingPathways: ['cAMP/PKA', 'StAR protein activation', 'MAPK/ERK', 'PI3K/Akt'],
    stabilityNotes:
      'Store lyophilized at 2-8°C. Glycoprotein with relatively good stability. Reconstitute with provided diluent. Reconstituted solution stable at 2-8°C for 30-60 days depending on formulation. Avoid freezing reconstituted solution.',
    molecularWeight: '~36,700 Da',
    halfLife: '~24-36 hours',
    storageTemp: '2-8°C',
  },
  {
    id: 'hmg',
    name: 'HMG',
    abbreviation: 'HMG',
    categories: ['Reproductive'],
    researchSummary:
      'Human Menopausal Gonadotropin (HMG) is a preparation containing both follicle-stimulating hormone (FSH) and luteinizing hormone (LH) activity, originally derived from urinary sources. It is widely utilized in reproductive research for controlled ovarian stimulation models and gonadal function studies. Research also explores its use in spermatogenesis research models.',
    mechanismOfAction:
      'FSH component binds the FSH receptor (FSHR) on granulosa cells to promote follicular development and estradiol production. LH component binds LHCGR on theca cells to stimulate androgen production (which is aromatized to estrogen). Combined activity supports complete folliculogenesis.',
    receptorTargets: ['FSHR', 'LHCGR'],
    signalingPathways: ['cAMP/PKA', 'PI3K/Akt', 'MAPK/ERK', 'StAR protein activation'],
    stabilityNotes:
      'Store lyophilized at 2-8°C. Reconstitute with provided diluent. Glycoprotein preparation with moderate stability. Reconstituted material should be used promptly. Highly purified forms available for research use.',
    molecularWeight: '~30,000-40,000 Da (glycoprotein mixture)',
    halfLife: '~24 hours (FSH component); ~12 hours (LH component)',
    storageTemp: '2-8°C',
  },

  // ─── SEXUAL HEALTH ────────────────────────────────────────────────────────────
  {
    id: 'pt-141',
    name: 'PT-141',
    abbreviation: 'PT-141',
    categories: ['Sexual Health'],
    researchSummary:
      'PT-141 (Bremelanotide) is a synthetic cyclic heptapeptide melanocortin receptor agonist originally derived from Melanotan-II research. FDA-approved as Vyleesi for HSDD in premenopausal women. It is the first melanocortin-based compound studied for its effects on central nervous system arousal and sexual response pathways. Distinct from PDE5 inhibitors - works on desire/arousal through CNS, not erectile mechanics. Downstream dopaminergic and oxytocinergic signaling. Research demonstrates it activates hypothalamic pathways distinct from peripheral vascular mechanisms.',
    mechanismOfAction:
      'Selectively activates melanocortin-4 receptor (MC4R) in the hypothalamus and limbic system, stimulating central arousal pathways. Unlike PDE5 inhibitors, its mechanism is centrally mediated through dopaminergic and oxytocinergic downstream signaling. Also has affinity for MC1R and MC3R.',
    receptorTargets: ['MC4R (primary)', 'MC3R', 'MC1R'],
    signalingPathways: ['Melanocortin/MC4R', 'Hypothalamic dopaminergic', 'Oxytocinergic', 'cAMP/PKA'],
    stabilityNotes:
      'Store lyophilized at -20°C. Cyclic peptide structure provides enhanced stability compared to linear analogs. Reconstitute with bacteriostatic water. Stable at 2-8°C after reconstitution.',
    molecularWeight: '1025.18 Da',
    sequenceLength: 7,
    halfLife: '~2-4 hours',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Sexual function enhancement', 'Libido improvement', 'Central arousal activation', 'Desire enhancement'],
      commonGoals: ['Improved libido', 'Sexual wellness', 'Desire restoration', 'Intimacy enhancement'],
      whatPeopleReport: 'Users commonly report enhanced sexual desire and arousal, often describing the effect as distinctly different from PDE5 inhibitors because it works on the brain rather than blood flow. Both men and women report improvements, with many women noting it addresses low desire specifically. Effects typically begin 30-60 minutes after administration. Some users report mild nausea or flushing as temporary side effects that diminish with subsequent use. Many users describe it as uniquely effective for addressing desire-related concerns that other approaches have not resolved. FDA-approved as Vyleesi for hypoactive sexual desire disorder (HSDD) in premenopausal women.',
      popularWith: ['Sexual wellness', 'Women with HSDD', 'Couples', 'Anti-aging enthusiasts'],
      pairsWith: ['melanotan-2', 'oxytocin', 'kisspeptin-10'],
    },
  },

  // ─── COSMETIC ─────────────────────────────────────────────────────────────────
  {
    id: 'ghk-cu',
    name: 'GHK-Cu',
    abbreviation: 'GHK-Cu',
    categories: ['Cosmetic', 'Recovery', 'Anti-inflammatory', 'Neuropeptide'],
    researchSummary:
      'GHK-Cu (Glycyl-L-Histidyl-L-Lysine copper complex) is a naturally occurring copper-binding tripeptide found in human plasma, saliva, and urine. Research demonstrates it modulates expression of over 4,000 genes, with effects on collagen synthesis, wound repair, and anti-inflammatory signaling. Studies investigate its role in skin remodeling, hair follicle biology, and tissue regeneration models. Neuroprotective and anti-inflammatory for brain health. Reduces neuroinflammation via NF-kB modulation. Activates SOD for antioxidant protection. Regulates MMP/TIMP balance for controlled tissue remodeling. Recruits mesenchymal stem cells. Clinical apps: Post-procedure recovery, anti-aging skincare, hair restoration, scalp mesotherapy. Used in Alzheimer\'s research formulations.',
    mechanismOfAction:
      'The GHK tripeptide chelates copper(II) ions, and this complex activates intracellular signaling cascades promoting collagen I and III synthesis, glycosaminoglycan production, and decorin expression. Upregulates metalloproteinases for tissue remodeling while stimulating TGF-beta, VEGF, and FGF2 expression. Modulates Wnt signaling in hair follicle stem cells.',
    receptorTargets: ['Integrin receptors', 'Copper transporters (CTR1)', 'TGF-beta receptors'],
    signalingPathways: ['TGF-beta/Smad', 'Wnt/beta-catenin', 'VEGF', 'NF-kB suppression', 'MAPK/ERK'],
    stabilityNotes:
      'Store at 2-8°C. Copper complex is light-sensitive; store in amber containers. Stable in mildly acidic aqueous solutions (pH 5-6). Oxidation of copper can reduce efficacy; minimize air exposure.',
    molecularWeight: '403.93 Da',
    sequenceLength: 3,
    halfLife: '~hours (tissue-dependent)',
    storageTemp: '2-8°C',
    uses: {
      primaryUses: ['Skin rejuvenation', 'Hair regrowth', 'Wound healing', 'Anti-aging', 'Collagen stimulation'],
      commonGoals: ['Youthful skin', 'Hair restoration', 'Scar reduction', 'Post-procedure recovery', 'Neuroprotection'],
      whatPeopleReport: 'Users frequently report visible improvements in skin texture, firmness, and fine lines within 4-8 weeks of topical or injectable use. Hair regrowth and thickening is one of the most commonly cited benefits, with many users incorporating it into scalp mesotherapy protocols. Post-procedure recovery (after microneedling, laser treatments, or surgery) is commonly reported as faster with less scarring. The copper peptide complex is appreciated for its multi-pathway approach, modulating over 4,000 genes related to tissue remodeling. Some users in the longevity community also value its neuroprotective and anti-inflammatory properties for brain health support.',
      popularWith: ['Skincare enthusiasts', 'Hair restoration', 'Post-procedure recovery', 'Anti-aging', 'Longevity seekers'],
      pairsWith: ['bpc-157', 'tb-500', 'epithalon', 'ghk-cu', 'nad-plus'],
    },
  },
  {
    id: 'snap-8',
    name: 'SNAP-8',
    abbreviation: 'SNAP-8',
    categories: ['Cosmetic'],
    researchSummary:
      'SNAP-8 (Acetyl Octapeptide-3) is a synthetic octapeptide designed to modulate SNARE complex formation and reduce neuromuscular activity in skin research models. Studies demonstrate it competes with SNAP-25 to interfere with vesicular neurotransmitter release at the neuromuscular junction. Research focuses on its topical application in expression line reduction models.',
    mechanismOfAction:
      'Mimics the N-terminal domain of SNAP-25 and competitively interferes with SNARE complex assembly (SNAP-25/Syntaxin/VAMP). By destabilizing the ternary SNARE complex, it reduces acetylcholine vesicle fusion and release at the neuromuscular junction, decreasing muscular contraction intensity.',
    receptorTargets: ['SNARE complex (competitive inhibitor)', 'SNAP-25 binding site'],
    signalingPathways: ['SNARE complex inhibition', 'Neuromuscular junction modulation', 'Exocytosis reduction'],
    stabilityNotes:
      'Store at 2-8°C. Water-soluble peptide compatible with cosmetic formulations. Stable in aqueous solution at mildly acidic to neutral pH. Acetylation of N-terminus enhances stability. Effective concentration range studied in vitro.',
    molecularWeight: '1075.29 Da',
    sequenceLength: 8,
    halfLife: 'Topical (not systemically relevant)',
    storageTemp: '2-8°C',
  },

  // ─── TANNING ──────────────────────────────────────────────────────────────────
  {
    id: 'melanotan-1',
    name: 'Melanotan-1',
    abbreviation: 'MT-1',
    categories: ['Tanning'],
    researchSummary:
      'Melanotan-1 (Afamelanotide) is a synthetic linear tridecapeptide analog of alpha-MSH with enhanced potency and metabolic stability. Research focuses on its activation of melanocortin-1 receptor and subsequent stimulation of eumelanin production in melanocytes. Studies investigate its photoprotective properties and role in erythropoietic protoporphyria research models.',
    mechanismOfAction:
      'Selectively activates the melanocortin-1 receptor (MC1R) on epidermal melanocytes, stimulating adenylyl cyclase activity and cAMP production. This activates MITF (microphthalmia-associated transcription factor), which upregulates tyrosinase and other melanogenic enzymes, promoting eumelanin synthesis.',
    receptorTargets: ['MC1R (primary)'],
    signalingPathways: ['cAMP/PKA', 'MITF transcription', 'Tyrosinase activation', 'Melanogenesis cascade'],
    stabilityNotes:
      'Store lyophilized at -20°C. Norleucine substitution at position 4 and D-phenylalanine at position 7 enhance metabolic stability. Reconstituted solution stable at 2-8°C. More selective than MT-II.',
    molecularWeight: '1646.85 Da',
    sequenceLength: 13,
    halfLife: '~30 minutes to 2 hours',
    storageTemp: '-20°C',
  },
  {
    id: 'melanotan-2',
    name: 'Melanotan-2',
    abbreviation: 'MT-2',
    categories: ['Tanning', 'Sexual Health'],
    researchSummary:
      'Melanotan-2 (MT-II) is a synthetic cyclic heptapeptide analog of alpha-MSH that acts as a non-selective melanocortin receptor agonist. Research demonstrates it stimulates melanogenesis, but its non-selectivity also activates MC3R and MC4R, leading to additional central nervous system effects. Studies investigate melanogenesis, energy homeostasis, and sexual function pathways.',
    mechanismOfAction:
      'Non-selectively activates melanocortin receptors MC1R, MC3R, MC4R, and MC5R. MC1R activation promotes melanogenesis. MC4R activation in the hypothalamus modulates sexual arousal pathways and appetite circuits. Cyclic structure confers greater metabolic stability but reduced receptor selectivity compared to linear analogs.',
    receptorTargets: ['MC1R', 'MC3R', 'MC4R', 'MC5R'],
    signalingPathways: ['cAMP/PKA', 'MITF/melanogenesis', 'Hypothalamic MC4R signaling', 'Dopaminergic/oxytocinergic'],
    stabilityNotes:
      'Store lyophilized at -20°C. Cyclic structure enhances resistance to proteolytic degradation. Reconstitute with bacteriostatic water. Stable at 2-8°C for several weeks after reconstitution. Protect from light.',
    molecularWeight: '1024.18 Da',
    sequenceLength: 7,
    halfLife: '~1-2 hours',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Tanning and melanogenesis', 'Sexual function', 'Appetite modulation', 'UV protection'],
      commonGoals: ['Darker skin tone', 'UV protection enhancement', 'Libido improvement', 'Cosmetic tanning'],
      whatPeopleReport: 'Users commonly report significant darkening of skin tone within 1-2 weeks of starting a loading phase, even with minimal sun exposure. Many users describe a more even, natural-looking tan compared to UV-only tanning. Sexual function enhancement is frequently reported as a secondary benefit due to MC4R activation. Some users report temporary nausea and facial flushing after injection, particularly during early dosing. Appetite suppression is sometimes noted. Users generally describe a maintenance protocol of less frequent dosing once desired pigmentation is achieved. It is important to note that this peptide is non-selective across melanocortin receptors, which accounts for its broad range of effects.',
      popularWith: ['Tanning enthusiasts', 'Fair-skinned individuals', 'Cosmetic enhancement', 'Sexual wellness'],
      pairsWith: ['pt-141', 'ghk-cu', 'melanotan-1'],
    },
  },

  // ─── NEUROPEPTIDE ─────────────────────────────────────────────────────────────
  {
    id: 'oxytocin',
    name: 'Oxytocin',
    abbreviation: 'OXT',
    categories: ['Neuropeptide', 'Reproductive'],
    researchSummary: 'Oxytocin is a 9-amino acid cyclic peptide hormone produced in the hypothalamus and released by the posterior pituitary. Research investigates its role in social bonding, trust, empathy, and pair bonding. Studies also explore its effects on uterine contraction, lactation, and modulation of stress and anxiety responses. Emerging research examines its role in autism spectrum disorder models and PTSD.',
    mechanismOfAction: 'Binds the oxytocin receptor (OXTR), a Gq-coupled GPCR, activating phospholipase C and increasing intracellular calcium. In the brain, modulates GABAergic and serotonergic neurotransmission in amygdala and prefrontal circuits. Peripheral effects include uterine smooth muscle contraction and myoepithelial cell contraction in mammary glands.',
    receptorTargets: ['OXTR (oxytocin receptor)', 'V1a vasopressin receptor (partial)'],
    signalingPathways: ['Gq/PLC/IP3/Ca2+', 'GABAergic modulation', 'Serotonergic modulation', 'MAPK/ERK'],
    stabilityNotes: 'Store lyophilized at -20°C. Disulfide bridge critical for bioactivity. Reconstitute with sterile water. Sensitive to reductive conditions. Intranasal delivery common for CNS research.',
    molecularWeight: '1007.19 Da',
    sequenceLength: 9,
    halfLife: '~3-5 minutes (plasma)',
    storageTemp: '-20°C',
  },
  {
    id: 'vip',
    name: 'VIP',
    abbreviation: 'VIP',
    categories: ['Neuropeptide', 'Immune', 'Anti-inflammatory'],
    researchSummary: 'Vasoactive Intestinal Peptide is a 28-amino acid regulatory neuropeptide with broad physiological roles in vasodilation, immune modulation, and circadian rhythm regulation. Research investigates its potent anti-inflammatory effects, including inhibition of TNF-alpha, IL-6, and other pro-inflammatory cytokines. Studies in chronic inflammatory respiratory disease (CIRS), mold-related illness, and neurodegenerative models show promising immune-modulatory outcomes.',
    mechanismOfAction: 'Binds VPAC1 and VPAC2 G-protein coupled receptors, activating adenylyl cyclase and increasing intracellular cAMP. Promotes Th2 anti-inflammatory immune bias, inhibits NF-kB-mediated pro-inflammatory gene transcription, and supports regulatory T-cell differentiation. Also modulates PACAP signaling.',
    receptorTargets: ['VPAC1', 'VPAC2', 'PAC1 (low affinity)'],
    signalingPathways: ['cAMP/PKA', 'NF-kB inhibition', 'JAK/STAT (Th2 bias)', 'CREB transcription'],
    stabilityNotes: 'Store lyophilized at -20°C. Sensitive to proteolytic degradation; short plasma half-life. Reconstitute with bacteriostatic water. Intranasal administration studied for CIRS applications.',
    molecularWeight: '3326.26 Da',
    sequenceLength: 28,
    halfLife: '~1-2 minutes (plasma)',
    storageTemp: '-20°C',
  },

  // ─── ANTIOXIDANT ──────────────────────────────────────────────────────────────
  {
    id: 'glutathione',
    name: 'Glutathione',
    abbreviation: 'GSH',
    categories: ['Anti-inflammatory', 'Longevity'],
    researchSummary: 'Glutathione is a tripeptide (gamma-L-glutamyl-L-cysteinyl-glycine) and the most abundant intracellular antioxidant in human cells. Research investigates its critical role in detoxification, free radical scavenging, immune function, and cellular redox homeostasis. Studies examine its depletion in chronic disease, neurodegeneration, and aging models, and the effects of exogenous supplementation on oxidative stress biomarkers.',
    mechanismOfAction: 'Functions as a substrate for glutathione peroxidase (GPx) enzymes, reducing hydrogen peroxide and lipid hydroperoxides. Conjugates xenobiotics and endotoxins via glutathione S-transferase (GST) for Phase II detoxification. Maintains thiol-disulfide balance critical for protein function. Recycles vitamins C and E.',
    receptorTargets: ['GPx (glutathione peroxidase)', 'GST (glutathione S-transferase)', 'GR (glutathione reductase)'],
    signalingPathways: ['GSH/GSSG redox cycle', 'Phase II detoxification', 'NRF2/ARE antioxidant defense', 'Thioredoxin system'],
    stabilityNotes: 'Store lyophilized at -20°C protected from light. Reduced form (GSH) is easily oxidized to GSSG. Liposomal and S-acetyl forms offer improved oral bioavailability. IV glutathione requires immediate use.',
    molecularWeight: '307.32 Da',
    sequenceLength: 3,
    halfLife: '~minutes (rapidly consumed by enzymatic reactions)',
    storageTemp: '-20°C',
  },

  // ─── NEUROPROTECTIVE ──────────────────────────────────────────────────────────
  {
    id: 'ara-290',
    name: 'ARA-290',
    abbreviation: 'ARA-290',
    categories: ['Neuropeptide', 'Anti-inflammatory'],
    researchSummary: 'ARA-290 is an 11-amino acid peptide derived from the B-helix of erythropoietin (EPO), specifically engineered to activate the innate repair receptor (IRR) without erythropoietic activity. Research investigates its neuroprotective, anti-inflammatory, and tissue-repair properties. Studies in diabetic neuropathy, sarcoidosis, and chronic inflammatory conditions demonstrate improvements in nerve fiber density and pain biomarkers.',
    mechanismOfAction: 'Selectively binds the innate repair receptor (IRR), a heterodimer of EPO receptor and beta common receptor (CD131), distinct from the classical EPO receptor homodimer. Activates anti-apoptotic JAK2/STAT5 signaling, reduces NF-kB-mediated inflammation, and promotes Schwann cell migration and nerve repair.',
    receptorTargets: ['Innate Repair Receptor (EPOR/CD131 heterodimer)'],
    signalingPathways: ['JAK2/STAT5', 'NF-kB inhibition', 'PI3K/Akt', 'Anti-apoptotic signaling'],
    stabilityNotes: 'Store lyophilized at -20°C. Reconstitute with sterile water. Does not stimulate erythropoiesis, eliminating hematologic concerns of EPO. Stable synthetic peptide.',
    molecularWeight: '~1250 Da',
    sequenceLength: 11,
    halfLife: '~2-4 hours',
    storageTemp: '-20°C',
  },
  {
    id: 'dermorphin',
    name: 'Dermorphin',
    categories: ['Neuropeptide'],
    researchSummary: 'Dermorphin is a 7-amino acid opioid peptide originally isolated from the skin of South American tree frogs (Phyllomedusa). It is approximately 30-40 times more potent than morphine as a mu-opioid receptor agonist. Research investigates its analgesic properties, opioid receptor pharmacology, and potential applications in pain research models. Contains a D-alanine residue conferring enhanced enzymatic stability.',
    mechanismOfAction: 'Highly selective agonist of the mu-opioid receptor (MOR/OPRM1). Binding activates Gi/Go-mediated signaling, reducing adenylyl cyclase activity and cAMP production, activating GIRK potassium channels, and inhibiting voltage-gated calcium channels. D-Ala2 residue provides resistance to aminopeptidase degradation.',
    receptorTargets: ['MOR/OPRM1 (mu-opioid receptor)'],
    signalingPathways: ['Gi/Go inhibition of cAMP', 'GIRK activation', 'Ca2+ channel inhibition', 'Beta-arrestin signaling'],
    stabilityNotes: 'Store lyophilized at -20°C. D-alanine at position 2 significantly enhances metabolic stability compared to endogenous opioid peptides. Reconstitute in sterile water.',
    molecularWeight: '803.93 Da',
    sequenceLength: 7,
    halfLife: '~hours (enhanced by D-Ala)',
    storageTemp: '-20°C',
  },

  // ─── ONCOLOGY RESEARCH ────────────────────────────────────────────────────────
  {
    id: 'pnc-27',
    name: 'PNC-27',
    abbreviation: 'PNC-27',
    categories: ['Immune'],
    researchSummary: 'PNC-27 is a synthetic peptide containing an HDM-2-binding domain linked to a membrane-active penetration sequence. Research investigates its ability to selectively target cancer cells expressing surface HDM-2 (MDM-2) protein while sparing normal cells. Preclinical studies demonstrate selective membranolytic activity against various cancer cell lines. It remains an early-stage research compound.',
    mechanismOfAction: 'Binds surface-expressed HDM-2 protein on transformed cells. Upon binding, the penetrating peptide domain inserts into the cell membrane, forming pores that disrupt membrane integrity and induce necrosis. Normal cells without surface HDM-2 expression are not affected, providing selectivity.',
    receptorTargets: ['HDM-2/MDM-2 (surface-expressed on cancer cells)'],
    signalingPathways: ['Membrane disruption/pore formation', 'Necrotic cell death', 'p53-independent mechanism'],
    stabilityNotes: 'Store lyophilized at -20°C. Synthetic peptide with moderate stability. Reconstitute in sterile water. Research-stage compound with limited clinical data.',
    molecularWeight: '~3200 Da',
    halfLife: 'Under investigation',
    storageTemp: '-20°C',
  },

  // ─── NOOTROPIC ──────────────────────────────────────────────────────────────────
  {
    id: 'noopept',
    name: 'Noopept',
    abbreviation: 'GVS-111',
    categories: ['Nootropic'],
    researchSummary: 'Noopept (N-phenylacetyl-L-prolylglycine ethyl ester) is a synthetic dipeptide-derived nootropic compound developed at the Russian Academy of Medical Sciences. Research demonstrates it enhances neuroplasticity and BDNF expression at concentrations 1000x lower than piracetam. Studies investigate its neuroprotective effects against oxidative stress, amyloid-beta toxicity, and glutamate excitotoxicity. It has been studied in Alzheimer\'s formulations alongside Semax, Cerebrolysin, GHK-Cu, and IGF-1.',
    mechanismOfAction: 'Modulates AMPA and NMDA receptor-mediated neurotransmission, enhancing long-term potentiation (LTP). Increases BDNF and NGF expression in hippocampus. Active metabolite cycloprolylglycine (CPG) interacts with AMPA receptors. Also demonstrates anti-inflammatory and antioxidant properties in neural tissue.',
    receptorTargets: ['AMPA receptors', 'NMDA receptors', 'BDNF receptors (TrkB)'],
    signalingPathways: ['BDNF/TrkB signaling', 'AMPA receptor potentiation', 'NMDA receptor modulation', 'NGF upregulation', 'Antioxidant defense'],
    stabilityNotes: 'Store at -20°C. Small molecule with good oral bioavailability. Soluble in water. Rapidly absorbed and metabolized to active metabolite cycloprolylglycine. Protect from moisture.',
    molecularWeight: '318.37 Da',
    halfLife: '~30-60 minutes (prodrug; active metabolite persists longer)',
    storageTemp: '-20°C',
  },

  // ─── MITOCHONDRIAL-DERIVED ────────────────────────────────────────────────────
  {
    id: 'humanin',
    name: 'Humanin',
    abbreviation: 'HN',
    categories: ['Mitochondrial', 'Longevity', 'Neuropeptide'],
    researchSummary: 'Humanin is a 24-amino acid mitochondrial-derived peptide (MDP) encoded within the 16S rRNA gene, first identified in 2001 from surviving neurons in Alzheimer\'s disease brains. Research demonstrates potent cytoprotective, anti-apoptotic, and metabolic regulatory properties. Studies investigate its neuroprotection against amyloid-beta toxicity, cardiovascular protection, and insulin-sensitizing effects across multiple disease models.',
    mechanismOfAction: 'Inhibits pro-apoptotic proteins Bax, tBid, and IGFBP3, preventing mitochondrial permeability transition pore opening. Improves mitochondrial respiratory chain efficiency, increasing ATP production while reducing ROS generation. Activates PI3K/Akt pathway improving insulin sensitization and glucose metabolism. Protects against amyloid-beta-induced neurodegeneration and reduces ischemia-reperfusion injury.',
    receptorTargets: ['FPRL1/FPR2', 'CNTFR/WSX-1/gp130 tripartite receptor', 'IGFBP3 (inhibition)', 'Bax/tBid (inhibition)'],
    signalingPathways: ['PI3K/Akt', 'JAK/STAT3', 'Anti-apoptotic (Bax/tBid inhibition)', 'Mitochondrial ETC optimization', 'AMPK'],
    stabilityNotes: 'Store lyophilized at -20°C. Mitochondrial-derived peptide with moderate stability. S14G substitution (HNG) creates a more potent analog. Reconstitute in sterile water.',
    molecularWeight: '~2687 Da',
    sequenceLength: 24,
    halfLife: '~hours (under investigation)',
    storageTemp: '-20°C',
    uses: {
      primaryUses: ['Neuroprotection', 'Cellular survival', 'Longevity support', 'Metabolic regulation'],
      commonGoals: ['Brain health', 'Anti-aging', 'Mitochondrial protection', 'Insulin sensitivity', 'Cardiovascular support'],
      whatPeopleReport: 'Users in the longevity and neuroprotection communities report interest in Humanin for its unique origin as a mitochondrial-derived peptide discovered in surviving neurons of Alzheimer\'s disease brains. Studies suggest potent cytoprotective and anti-apoptotic properties across multiple tissue types. The peptide is commonly discussed for its multi-system protective effects spanning brain, heart, and metabolic health. Users value its insulin-sensitizing properties and its role in supporting mitochondrial respiratory chain efficiency. The S14G analog (Humanin G or HNG) is frequently referenced for its enhanced potency. It is considered a key component of comprehensive longevity and neuroprotective peptide protocols.',
      popularWith: ['Longevity seekers', 'Neuroprotection', 'Mitochondrial health', 'Anti-aging research', 'Cognitive decline prevention'],
      pairsWith: ['ss-31', 'mots-c', 'nad-plus', 'epithalon', 'dihexa'],
    },
  },

  // ─── SENOLYTIC ────────────────────────────────────────────────────────────────
  {
    id: 'foxo4-dri',
    name: 'FOXO4-DRI',
    abbreviation: 'FOXO4-DRI',
    categories: ['Longevity'],
    researchSummary: 'FOXO4-DRI is a D-retro-inverso peptide designed to selectively induce apoptosis in senescent cells while sparing healthy cells. Research demonstrates it disrupts the FOXO4-p53 interaction that normally protects senescent cells from programmed cell death. Studies in aged mice show restoration of fur density, renal function, and fitness following treatment. It represents one of the most targeted senolytic approaches in research.',
    mechanismOfAction: 'Displaces endogenous FOXO4 from p53 in senescent cells, triggering p53-mediated apoptosis specifically in cells that have entered irreversible growth arrest. Clears cells producing the senescence-associated secretory phenotype (SASP) - inflammatory factors including IL-6, IL-1beta, TNF-alpha, and MMPs. The D-retro-inverso modification provides resistance to proteolytic degradation while maintaining binding specificity.',
    receptorTargets: ['FOXO4/p53 interaction (disruption target)'],
    signalingPathways: ['p53-mediated apoptosis (senescent cell selective)', 'SASP reduction (IL-6, IL-1beta, TNF-alpha, MMPs)', 'Caspase cascade'],
    stabilityNotes: 'Store lyophilized at -20°C. D-retro-inverso modification confers strong resistance to proteolytic degradation. Reconstitute with sterile water. Enhanced bioavailability compared to L-amino acid analogs.',
    molecularWeight: '~4800 Da',
    halfLife: 'Extended (D-retro-inverso resistant to proteases)',
    storageTemp: '-20°C',
  },

  // ─── EXERCISE MIMETIC ─────────────────────────────────────────────────────────
  {
    id: 'aicar',
    name: 'AICAR',
    abbreviation: 'AICAR',
    categories: ['Mitochondrial', 'Metabolic'],
    researchSummary: 'AICAR (5-Aminoimidazole-4-carboxamide ribonucleotide) is an AMP analog and direct AMPK activator classified as an exercise mimetic. WADA S4 Prohibited substance. Research demonstrates it shifts muscle fiber composition toward oxidative Type I fibers, enhances fat oxidation, and promotes mitochondrial biogenesis. Studies in sedentary mice showed significant endurance improvements without exercise training.',
    mechanismOfAction: 'Metabolized intracellularly to ZMP, which allosterically activates AMP-activated protein kinase (AMPK) by mimicking AMP binding. Downstream AMPK activation promotes glucose uptake, fatty acid oxidation, mitochondrial biogenesis via PGC-1alpha, and shifts muscle fiber composition toward oxidative Type I phenotype.',
    receptorTargets: ['AMPK (allosteric activation via ZMP metabolite)'],
    signalingPathways: ['AMPK', 'PGC-1alpha/mitochondrial biogenesis', 'ACC inhibition (fat oxidation)', 'GLUT4 translocation', 'Muscle fiber type switching'],
    stabilityNotes: 'Store lyophilized at -20°C. Purine analog with moderate aqueous stability. Reconstitute in sterile water. Protect from repeated freeze-thaw cycles.',
    molecularWeight: '338.21 Da',
    halfLife: '~2-3 hours',
    storageTemp: '-20°C',
  },

  // ─── GROWTH HORMONE (RECOMBINANT) ────────────────────────────────────────────
  {
    id: 'somatropin',
    name: 'Somatropin',
    abbreviation: 'rHGH',
    categories: ['Growth Hormone'],
    researchSummary: 'Somatropin is recombinant human growth hormone, a 191-amino acid single-chain polypeptide produced by recombinant DNA technology. It is FDA-approved for multiple indications including pediatric growth hormone deficiency, adult GHD, Turner syndrome, and HIV wasting. Research investigates its effects on body composition, bone density, exercise capacity, and quality of life. It serves as the reference standard for all growth hormone research.',
    mechanismOfAction: 'Binds the growth hormone receptor (GHR), a type I cytokine receptor, inducing receptor dimerization and JAK2 tyrosine kinase activation. Downstream signaling through STAT5, MAPK, and PI3K pathways stimulates IGF-1 production in the liver, promotes linear growth, protein synthesis, lipolysis, and glucose mobilization.',
    receptorTargets: ['GHR (growth hormone receptor)', 'JAK2 tyrosine kinase'],
    signalingPathways: ['JAK2/STAT5', 'MAPK/ERK', 'PI3K/Akt', 'GH/IGF-1 axis', 'mTOR'],
    stabilityNotes: 'Store lyophilized at 2-8°C. Reconstituted solution refrigerate and use within 14-28 days. Do not freeze reconstituted. 191-amino acid sequence identical to endogenous hGH. Sensitive to shearing forces.',
    molecularWeight: '22,124 Da',
    sequenceLength: 191,
    halfLife: '~2-4 hours (SC injection)',
    storageTemp: '2-8°C',
  },
  {
    id: 'follistatin-344',
    name: 'Follistatin-344',
    abbreviation: 'FS-344',
    categories: ['Growth Hormone', 'Recovery'],
    researchSummary: 'Follistatin-344 is a naturally occurring glycoprotein that functions as a potent activin and myostatin antagonist. Research investigates its role in promoting skeletal muscle growth and inhibiting muscle atrophy by neutralizing the growth-suppressive effects of myostatin and activin A. Studies in animal models demonstrate significant increases in muscle mass. The 344-amino acid isoform is the most commonly studied variant in research settings.',
    mechanismOfAction: 'Binds and neutralizes activin A, myostatin (GDF-8), and other TGF-beta superfamily ligands with high affinity, preventing their interaction with activin type II receptors (ActRIIA/ActRIIB). This releases the inhibitory brake on muscle protein synthesis mediated by the Smad2/3 pathway, allowing enhanced mTOR-driven muscle growth.',
    receptorTargets: ['Myostatin/GDF-8 (neutralization)', 'Activin A (neutralization)', 'ActRIIA/ActRIIB (indirect)'],
    signalingPathways: ['Smad2/3 inhibition', 'mTOR/S6K activation', 'TGF-beta superfamily antagonism', 'Muscle protein synthesis'],
    stabilityNotes: 'Store lyophilized at -20°C. Glycoprotein requiring careful reconstitution. Sensitive to denaturation. Reconstitute slowly with sterile water. Store reconstituted at 2-8°C, use within days.',
    molecularWeight: '~38,000 Da',
    sequenceLength: 344,
    halfLife: '~hours',
    storageTemp: '-20°C',
  },
];

export const getPeptideById = (id: string): Peptide | undefined =>
  PEPTIDES.find((p) => p.id === id);

export const getPeptidesByCategory = (category: PeptideCategory): Peptide[] =>
  PEPTIDES.filter((p) => p.categories.includes(category));
