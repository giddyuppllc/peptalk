import { EducationalArticle, ArticleCategory } from '../types';

/**
 * Educational articles for the Learn section.
 * Start with 2 real articles, add more via Grok EDU prompts over time.
 */
const _RAW_ARTICLES: EducationalArticle[] = [
  {
    id: 'what-is-a-peptide',
    title: 'What Is a Peptide?',
    slug: 'what-is-a-peptide',
    category: 'fundamentals',
    imageUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80',
    summary: 'Everything you need to know about peptides — what they are, how they work, and why they matter for health research.',
    sections: [
      {
        heading: 'The Basics',
        content: 'Peptides are short chains of amino acids linked by peptide bonds. While proteins can contain hundreds or thousands of amino acids, peptides are typically defined as chains of 2 to 50 amino acids. The simplest peptide, a dipeptide, contains just two amino acids. As the chain grows longer, we call them oligopeptides (2-20 amino acids) and polypeptides (20-50+), eventually becoming proteins.\n\nYour body produces thousands of peptides naturally. They act as signaling molecules, hormones, neurotransmitters, and antimicrobial agents. Insulin, for example, is a peptide hormone consisting of 51 amino acids that regulates blood sugar. Oxytocin, the "bonding hormone," is just 9 amino acids long.',
      },
      {
        heading: 'How Peptides Differ from Proteins',
        content: 'The main difference between peptides and proteins is size and complexity. Proteins are longer chains (typically 50+ amino acids) that fold into complex three-dimensional structures. This folding gives proteins their specific functions — enzymes, structural components, antibodies.\n\nPeptides are smaller and simpler. They don\'t typically fold into complex shapes, which makes them easier to synthesize in a lab and faster for the body to absorb. However, their smaller size also means they\'re more quickly broken down by enzymes in the body, which is why many therapeutic peptides need to be injected rather than taken orally.',
      },
      {
        heading: 'Endogenous vs Exogenous Peptides',
        content: 'Endogenous peptides are those your body naturally produces — insulin, growth hormone-releasing hormone (GHRH), endorphins, enkephalins, and hundreds more. These play critical roles in metabolism, immune function, pain modulation, and growth.\n\nExogenous peptides are synthetic or externally sourced versions. Some are exact copies of natural peptides (like synthetic insulin). Others are modified versions designed to be more stable or potent (like semaglutide, a modified GLP-1 peptide that lasts much longer in the body than natural GLP-1). Research peptides like BPC-157 were originally discovered in gastric juice but are now produced synthetically.',
      },
      {
        heading: 'How Peptides Work in the Body',
        content: 'Peptides work by binding to specific receptors on cell surfaces, triggering signaling cascades inside the cell. Think of it like a key fitting into a lock — the peptide (key) binds to a receptor (lock), which activates a chain of biochemical events.\n\nFor example, GLP-1 receptor agonists like semaglutide bind to GLP-1 receptors in the pancreas, gut, and brain. This triggers insulin release, slows gastric emptying, and reduces appetite — all through a single receptor interaction.\n\nThe half-life of a peptide (how long it stays active in the body) varies enormously. Natural GLP-1 has a half-life of about 2 minutes. Semaglutide, through fatty acid modification, extends this to about 7 days.',
      },
      {
        heading: 'Categories of Peptides',
        content: 'Peptides span an enormous range of functions:\n\n• Metabolic — GLP-1 agonists, amylin analogs (weight and blood sugar)\n• Growth Hormone Axis — GHRPs, GHRHs (growth, recovery, body composition)\n• Tissue Repair — BPC-157, TB-500 (healing, injury recovery)\n• Nootropic — Semax, Selank (cognitive function, focus)\n• Antimicrobial — LL-37, defensins (infection defense)\n• Cosmetic — GHK-Cu, SNAP-8, Argireline (skin, hair)\n• Longevity — Epithalon, MOTS-c (aging, mitochondrial function)\n• Pain — Ziconotide, endorphins (pain management)\n• Immune — Thymosin alpha-1, thymopentin (immune modulation)',
      },
      {
        heading: 'Common Misconceptions',
        content: 'Peptides are NOT steroids. Anabolic steroids are synthetic versions of testosterone and other sex hormones. Peptides are amino acid chains that work through completely different mechanisms — receptor signaling rather than direct hormone replacement.\n\nPeptides are NOT SARMs (Selective Androgen Receptor Modulators). SARMs target androgen receptors specifically. Peptides target a wide variety of receptors depending on the specific peptide.\n\nThe legal status of peptides varies widely. Many are FDA-approved medications (semaglutide, teriparatide, ziconotide). Others are sold as "research chemicals" in a legal gray area. Some are compounded by pharmacies under specific regulations. Always verify the legal status of any peptide in your jurisdiction.',
      },
    ],
    citations: [
      { text: 'Fosgerau K, Hoffmann T. Peptide therapeutics: current status and future directions. Drug Discov Today. 2015;20(1):122-128.', url: 'https://doi.org/10.1016/j.drudis.2014.10.003' },
      { text: 'Lau JL, Dunn MK. Therapeutic peptides: Historical perspectives, current development trends, and future directions. Bioorg Med Chem. 2018;26(10):2700-2707.', url: 'https://doi.org/10.1016/j.bmc.2017.06.052' },
      { text: 'Muttenthaler M, et al. Trends in peptide drug discovery. Nat Rev Drug Discov. 2021;20:309-325.', url: 'https://doi.org/10.1038/s41573-020-00135-8' },
      { text: 'Wang L, et al. Therapeutic peptides: current applications and future directions. Signal Transduct Target Ther. 2022;7(1):48.', url: 'https://doi.org/10.1038/s41392-022-00904-4' },
    ],
    relatedPeptideIds: ['semaglutide', 'bpc-157', 'ghk-cu', 'thymosin-alpha-1', 'epithalon'],
    lastUpdated: '2025-01-15',
  },
  {
    id: 'why-lab-testing-matters',
    title: 'Why Independent Lab Testing Matters',
    slug: 'why-lab-testing-matters',
    category: 'testing',
    imageUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80',
    summary: 'Understanding how HPLC, mass spectrometry, and endotoxin testing protect you — and what to look for in a Certificate of Analysis.',
    sections: [
      {
        heading: 'Why Third-Party Testing Is Critical',
        content: 'The peptide market includes a wide range of suppliers with varying quality standards. A Certificate of Analysis (COA) from the seller is a start, but independent third-party testing provides real verification. Studies have shown discrepancies between labeled and actual peptide content in research-grade products — in some cases, vials contained the wrong peptide entirely or had significantly lower purity than claimed.\n\nThird-party testing bridges the trust gap. An accredited, independent laboratory has no financial incentive to provide favorable results, making their analysis more reliable.',
      },
      {
        heading: 'HPLC Purity Testing',
        content: 'High-Performance Liquid Chromatography (HPLC) is the gold standard for assessing peptide purity. It separates the peptide from any impurities, degradation products, or truncated sequences in the sample.\n\nThe result is expressed as a percentage — e.g., ">98% purity." For research-grade peptides, ≥95% is generally acceptable. Pharmaceutical-grade is ≥98%. The HPLC chromatogram (the graphical output) should show one dominant peak. Multiple peaks suggest contamination or degradation.\n\nCommon impurities detected by HPLC include: deletion sequences (peptide missing amino acids), oxidized forms, deamidated forms, and residual protecting groups from synthesis.',
      },
      {
        heading: 'Mass Spectrometry',
        content: 'Mass spectrometry (MS) confirms the molecular identity of the peptide. It measures the molecular weight of the compound and compares it to the expected value. If the measured mass doesn\'t match the expected molecular weight for that peptide, something is wrong — you may have a different peptide, a truncated version, or a degradation product.\n\nLC-MS (Liquid Chromatography-Mass Spectrometry) combines the separation power of HPLC with the identification power of MS, giving both purity and identity confirmation in one analysis.',
      },
      {
        heading: 'Endotoxin and Sterility Testing',
        content: 'For any peptide intended for injection, endotoxin testing is non-negotiable. Endotoxins are bacterial cell wall fragments that can cause fever, inflammation, and in severe cases, septic shock.\n\nThe LAL (Limulus Amebocyte Lysate) test detects endotoxins. FDA limits for injectable products are typically <5 EU/kg body weight. USP <71> sterility testing confirms no viable microorganisms are present.\n\nAdditional microbial testing (USP <61>/<62>) checks for total aerobic count, yeast, mold, and objectionable organisms. Heavy metal testing (USP <232>/<233>) screens for arsenic, lead, mercury, and cadmium.',
      },
      {
        heading: 'How to Get Your Peptides Tested',
        content: 'Several laboratories offer peptide testing services for individuals and researchers:\n\n• Janoshik Analyticals — Popular in the research peptide community, offers HPLC, MS, and endotoxin testing. Turnaround time is typically 1-3 weeks.\n• Colmaric Analyticals — US-based lab offering comprehensive peptide analysis.\n• Other ISO 17025-accredited analytical labs.\n\nCosts typically range from $50-150 per test depending on the type of analysis. While this adds cost, it\'s a small price for confidence in what you\'re putting in your body.',
      },
    ],
    citations: [
      { text: 'USP General Chapter <71> Sterility Tests. United States Pharmacopeia.', url: 'https://www.usp.org' },
      { text: 'USP General Chapter <85> Bacterial Endotoxins Test. United States Pharmacopeia.', url: 'https://www.usp.org' },
      { text: 'USP General Chapters <232>/<233> Elemental Impurities. United States Pharmacopeia.', url: 'https://www.usp.org' },
      { text: 'FDA Guidance for Industry: Analytical Procedures and Methods Validation for Drugs and Biologics. 2015.', url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents' },
    ],
    relatedPeptideIds: ['bpc-157', 'tb-500', 'semaglutide'],
    lastUpdated: '2025-01-15',
  },
  {
    id: 'safe-injection-practices',
    title: 'Safe Injection Practices for Peptides',
    slug: 'safe-injection-practices',
    category: 'safety',
    imageUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&q=80',
    summary: 'A comprehensive guide to subcutaneous injection technique, injection site rotation, and hygiene best practices for peptide administration.',
    sections: [
      {
        heading: 'Preparing Your Workspace and Supplies',
        content: 'Before administering any injection, establishing a clean and organized workspace is essential. Start by washing your hands thoroughly with soap and warm water for at least 20 seconds, then dry with a clean paper towel. Prepare all supplies on a clean, flat surface: your reconstituted peptide vial, an alcohol swab, a sterile insulin syringe (typically 29-31 gauge, 0.5-1 mL), and a sharps disposal container.\n\nNever reuse syringes or needles under any circumstances. Each injection requires a new, individually packaged sterile syringe. Inspect the syringe packaging for any signs of damage or tampering before opening. Also inspect your peptide vial — the solution should be clear and free of particles or cloudiness, which could indicate contamination or degradation.\n\nKeep your sharps container within arm\'s reach so you can immediately dispose of the used syringe after injection. Never recap a used needle, as this is a common cause of accidental needlestick injuries. If a syringe or needle is dropped on a non-sterile surface, discard it and start with a new one.',
      },
      {
        heading: 'Subcutaneous Injection Technique',
        content: 'Subcutaneous (SubQ) injection delivers the peptide into the fatty tissue layer between the skin and muscle. This is the most common route for peptide administration because it provides steady absorption and is relatively simple to perform at home.\n\nTo draw up your dose, first swab the top of the peptide vial with an alcohol pad. Pull back the syringe plunger to draw in air equal to your intended dose volume, then insert the needle into the vial through the rubber stopper and push the air in. Invert the vial and slowly draw out your calculated dose, tapping the syringe gently to move any air bubbles to the top, then push the plunger slightly to expel them.\n\nFor the injection itself, clean the chosen injection site with an alcohol swab using a circular motion from the center outward. Let the alcohol dry completely — injecting through wet alcohol can cause stinging. Pinch a fold of skin and fat between your thumb and forefinger, insert the needle at a 45-90 degree angle (90 degrees for most body types, 45 degrees for very lean individuals), depress the plunger slowly and steadily, wait 5-10 seconds, then withdraw the needle. Apply gentle pressure with a cotton ball if needed, but do not rub the site.',
      },
      {
        heading: 'Injection Site Rotation',
        content: 'Rotating injection sites is critical for preventing lipodystrophy — the breakdown or buildup of fat tissue under the skin that results from repeated injections in the same location. Lipodystrophy can cause unsightly lumps or indentations and may also affect peptide absorption, leading to inconsistent dosing.\n\nThe primary subcutaneous injection sites include: the abdomen (at least 2 inches from the navel), the front or outer thigh, the back of the upper arm, and the upper outer buttocks. Each of these areas has sufficient subcutaneous fat for comfortable injection and reliable absorption.\n\nA practical rotation strategy is to divide each area into quadrants and move systematically through them. For example, if you inject daily, you might use the left abdomen on Monday, right abdomen on Tuesday, left thigh on Wednesday, and so on. Keep a simple log of your injection sites — many people note the site in their dose tracking app. Each new injection should be at least 1 inch (2.5 cm) away from the previous site in the same area.',
      },
      {
        heading: 'Hygiene and Infection Prevention',
        content: 'Infection at the injection site, while uncommon with proper technique, can range from mild localized redness to serious abscess formation. Prevention starts with hand hygiene and extends to every step of the process.\n\nAlways store your reconstituted peptides according to their requirements (typically refrigerated at 2-8 degrees Celsius). Never use a peptide solution that appears cloudy, discolored, or contains floating particles. Check expiration dates and discard any vial that has been reconstituted beyond its recommended shelf life.\n\nThe rubber stopper on your peptide vial should be swabbed with alcohol before every draw. If you are using multi-dose vials, be aware that each needle puncture through the stopper introduces a small risk of contamination. Most practitioners recommend discarding a multi-dose vial after 28 days regardless of remaining volume, though specific guidance may vary by product.\n\nWatch injection sites for signs of infection: increasing redness, warmth, swelling, pain, or pus. Mild redness and a small bump immediately after injection are normal and typically resolve within hours. However, symptoms that worsen over 24-48 hours or are accompanied by fever should be evaluated by a healthcare provider promptly.',
      },
      {
        heading: 'Needle Selection and Disposal',
        content: 'For subcutaneous peptide injections, insulin syringes with attached needles are the most practical choice. The most commonly used sizes are 29-gauge or 31-gauge needles, 8mm (5/16 inch) to 12.7mm (1/2 inch) in length. Thinner gauges (higher numbers) cause less discomfort but may be slower to draw up viscous solutions. Shorter needles are appropriate for leaner individuals.\n\nSyringe volume depends on your dose. A 0.5 mL (50-unit) insulin syringe provides finer graduation marks and is ideal for doses under 0.5 mL. A 1 mL (100-unit) syringe is better for larger volumes. Always use a syringe that allows you to accurately measure your specific dose.\n\nProper sharps disposal is both a safety and legal requirement in most jurisdictions. Place used syringes immediately into an FDA-cleared sharps container or a heavy-duty plastic container with a tight-fitting lid (such as a laundry detergent bottle). Never throw loose syringes in household trash or recycling. When your sharps container is three-quarters full, seal it and follow your local guidelines for disposal — many pharmacies, hospitals, and community programs accept sharps containers.',
      },
    ],
    citations: [
      { text: 'WHO Best Practices for Injections and Related Procedures Toolkit. World Health Organization. 2010.', url: 'https://www.who.int/publications/i/item/9789241599252' },
      { text: 'CDC Injection Safety Guidelines. Centers for Disease Control and Prevention.', url: 'https://www.cdc.gov/injection-safety/' },
      { text: 'Frid AH, et al. New insulin delivery recommendations. Mayo Clin Proc. 2016;91(9):1231-1255.', url: 'https://doi.org/10.1016/j.mayocp.2016.06.010' },
    ],
    relatedPeptideIds: ['semaglutide', 'bpc-157', 'tirzepatide', 'ipamorelin', 'cjc-1295'],
    lastUpdated: '2025-03-01',
  },
  {
    id: 'understanding-glp1-receptor-agonists',
    title: 'Understanding GLP-1 Receptor Agonists',
    slug: 'understanding-glp1-receptor-agonists',
    category: 'fundamentals',
    goalTypes: ['weight_loss', 'body_recomp', 'general_wellness'],
    imageUrl: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=600&q=80',
    summary: 'How semaglutide, tirzepatide, and other GLP-1 receptor agonists work — their mechanism of action, metabolic effects, and what the clinical evidence shows.',
    sections: [
      {
        heading: 'What Is GLP-1?',
        content: 'Glucagon-like peptide-1 (GLP-1) is a hormone produced by L-cells in the small intestine in response to food intake. It belongs to a class of hormones called incretins, which play a central role in blood sugar regulation and appetite control. When you eat, GLP-1 is released into the bloodstream and acts on multiple organ systems simultaneously.\n\nNatural GLP-1 stimulates insulin secretion from the pancreas in a glucose-dependent manner — meaning it only triggers insulin release when blood sugar is elevated, which significantly reduces the risk of hypoglycemia. It also suppresses glucagon (a hormone that raises blood sugar), slows gastric emptying (so food moves through the stomach more slowly), and acts on appetite centers in the brain to promote satiety.\n\nThe challenge with natural GLP-1 is its extremely short half-life: approximately 2 minutes. The enzyme DPP-4 (dipeptidyl peptidase-4) rapidly breaks it down in the bloodstream. This is why pharmaceutical research focused on creating GLP-1 receptor agonists — synthetic peptides that activate the same receptors but resist degradation, lasting hours or even days instead of minutes.',
      },
      {
        heading: 'Semaglutide: Mechanism and Evidence',
        content: 'Semaglutide is a modified GLP-1 analog with 94% structural similarity to human GLP-1. Its key innovation is a C-18 fatty acid chain that allows it to bind to albumin in the blood, shielding it from DPP-4 degradation and extending its half-life to approximately 7 days. This enables once-weekly dosing.\n\nThe STEP (Semaglutide Treatment Effect in People with Obesity) clinical trial program demonstrated remarkable efficacy. STEP 1 showed that participants receiving 2.4 mg weekly semaglutide lost an average of 14.9% of body weight over 68 weeks, compared to 2.4% with placebo. STEP 2 in patients with type 2 diabetes showed 9.6% weight loss. These results represented a paradigm shift in pharmacological weight management.\n\nBeyond weight loss, semaglutide has shown cardiovascular benefits. The SELECT trial demonstrated a 20% reduction in major adverse cardiovascular events (heart attack, stroke, cardiovascular death) in overweight or obese adults without diabetes. This led to expanded indications and cemented GLP-1 agonists as a significant therapeutic class beyond diabetes management.',
      },
      {
        heading: 'Tirzepatide: The Dual Agonist Approach',
        content: 'Tirzepatide represents the next evolution in incretin-based therapies. Unlike semaglutide, which targets only the GLP-1 receptor, tirzepatide is a dual GIP/GLP-1 receptor agonist. GIP (glucose-dependent insulinotropic polypeptide) is another incretin hormone that works synergistically with GLP-1 to enhance insulin secretion and metabolic regulation.\n\nThe SURMOUNT clinical trial program produced striking results. SURMOUNT-1 showed that the highest dose of tirzepatide (15 mg weekly) produced an average weight loss of 22.5% over 72 weeks in participants without diabetes — the largest weight reduction seen with any pharmacotherapy at that time. More than a third of participants lost over 25% of their body weight.\n\nThe dual mechanism appears to offer advantages beyond additive effects. GIP receptor activation may enhance fat oxidation, improve lipid metabolism, and provide additional appetite suppression through central nervous system pathways distinct from GLP-1. Research is ongoing to fully characterize how these two receptor systems interact, but the clinical outcomes suggest meaningful synergy.',
      },
      {
        heading: 'Side Effects and Considerations',
        content: 'The most common side effects of GLP-1 receptor agonists are gastrointestinal: nausea, vomiting, diarrhea, and constipation. These effects are most pronounced during dose escalation and typically diminish over time as the body adapts. Slow, gradual dose titration is the primary strategy for minimizing GI side effects — this is why both semaglutide and tirzepatide protocols involve stepping up the dose over several weeks or months.\n\nMore serious but less common concerns include pancreatitis (inflammation of the pancreas), gallbladder disease, and potential thyroid effects. In animal studies, GLP-1 agonists caused thyroid C-cell tumors in rodents, though this has not been confirmed in humans. They are contraindicated in patients with a personal or family history of medullary thyroid carcinoma or Multiple Endocrine Neoplasia syndrome type 2.\n\nMuscle loss during rapid weight reduction is an important consideration. Studies show that approximately 25-40% of weight lost with GLP-1 agonists may be lean mass rather than fat. Adequate protein intake (1.0-1.6 g/kg/day) and resistance training are strongly recommended to preserve muscle during treatment. Healthcare provider supervision is essential for anyone using these medications.',
      },
      {
        heading: 'The Future of GLP-1-Based Therapies',
        content: 'The GLP-1 field is evolving rapidly. Triple agonists targeting GLP-1, GIP, and glucagon receptors simultaneously are in clinical trials, with early results suggesting even greater weight loss and metabolic improvement. Oral formulations of semaglutide (Rybelsus) are already available for diabetes, and higher-dose oral versions for obesity are in development.\n\nResearch is also exploring GLP-1 agonists for conditions beyond obesity and diabetes, including non-alcoholic fatty liver disease (NAFLD/NASH), Alzheimer\'s disease, Parkinson\'s disease, and substance use disorders. The GLP-1 receptor is widely expressed in the brain, and emerging evidence suggests neuroprotective and anti-inflammatory effects.\n\nThe cost and accessibility of these therapies remain significant challenges. Supply constraints, high prices, and insurance coverage limitations have been barriers for many patients. The entry of compounding pharmacies and potential biosimilar competition may help expand access, though quality and regulatory considerations in the compounding space remain areas of active discussion.',
      },
    ],
    citations: [
      { text: 'Wilding JPH, et al. Once-weekly semaglutide in adults with overweight or obesity (STEP 1). N Engl J Med. 2021;384:989-1002.', url: 'https://doi.org/10.1056/NEJMoa2032183' },
      { text: 'Jastreboff AM, et al. Tirzepatide once weekly for the treatment of obesity (SURMOUNT-1). N Engl J Med. 2022;387:205-216.', url: 'https://doi.org/10.1056/NEJMoa2206038' },
      { text: 'Lincoff AM, et al. Semaglutide and cardiovascular outcomes in obesity without diabetes (SELECT). N Engl J Med. 2023;389:2221-2232.', url: 'https://doi.org/10.1056/NEJMoa2307563' },
    ],
    relatedPeptideIds: ['semaglutide', 'tirzepatide'],
    lastUpdated: '2025-03-01',
  },
  {
    id: 'peptide-storage-and-reconstitution',
    title: 'Peptide Storage and Reconstitution Guide',
    slug: 'peptide-storage-and-reconstitution',
    category: 'delivery',
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&q=80',
    summary: 'Everything you need to know about storing lyophilized peptides, reconstituting with bacteriostatic water, calculating doses, and maximizing shelf life.',
    sections: [
      {
        heading: 'Understanding Lyophilized Peptides',
        content: 'Most research and therapeutic peptides arrive as a lyophilized (freeze-dried) powder — a delicate cake or powder at the bottom of a sealed glass vial. Lyophilization removes water from the peptide solution through sublimation, leaving behind a stable dry form that can be stored much longer than a liquid solution.\n\nLyophilized peptides are inherently more stable than reconstituted ones because water is a primary driver of peptide degradation. Chemical reactions like oxidation, deamidation, and hydrolysis all require water. In dry form, these reactions are dramatically slowed, allowing peptides to maintain potency for months or even years under proper conditions.\n\nThe lyophilized cake should appear as a uniform white to off-white powder. If the powder appears discolored (yellow, brown), partially collapsed, or has an unusual odor, this could indicate degradation during manufacturing or storage. While some peptides may naturally have a slight color, significant discoloration is a red flag.',
      },
      {
        heading: 'Reconstitution: Step by Step',
        content: 'Reconstitution is the process of adding a sterile diluent to the lyophilized peptide to create an injectable solution. The most commonly used diluent is bacteriostatic water (BAC water) — sterile water containing 0.9% benzyl alcohol as a preservative. The benzyl alcohol inhibits bacterial growth, making multi-dose use safer.\n\nTo reconstitute: clean the rubber stoppers of both the peptide vial and the BAC water vial with alcohol swabs. Draw your chosen volume of BAC water into a sterile syringe. Insert the needle into the peptide vial and aim the stream of water at the inside wall of the vial, allowing it to trickle down gently onto the powder. Do NOT inject the water directly onto the powder — the force can damage the peptide structure.\n\nAfter adding the water, gently swirl the vial in a circular motion. Never shake a peptide vial, as vigorous agitation can cause foaming, denaturation, and loss of potency. Most peptides will dissolve within 1-3 minutes of gentle swirling. If the solution remains cloudy after 5 minutes of swirling, allow it to sit in the refrigerator for 30 minutes. If it still does not clear, the peptide may be degraded or contaminated.',
      },
      {
        heading: 'Calculating Your Concentration and Dose',
        content: 'After reconstitution, you need to know your concentration to draw accurate doses. The formula is simple: concentration = total peptide (mcg or mg) divided by total water added (mL).\n\nFor example, if you have a 5 mg vial of BPC-157 and add 2 mL of BAC water, your concentration is 5 mg / 2 mL = 2.5 mg/mL, or 2,500 mcg/mL. If your desired dose is 250 mcg, you need: 250 mcg / 2,500 mcg/mL = 0.1 mL, which equals 10 units on a standard 100-unit insulin syringe.\n\nChoosing how much water to add is a balance between convenience and accuracy. Less water means a more concentrated solution and smaller injection volumes, but it also means each unit on the syringe represents a larger dose — making precise dosing harder. More water means lower concentration and larger injection volumes, but more granular dosing control. For most peptides, adding 1-2 mL of BAC water strikes a good balance.',
      },
      {
        heading: 'Storage Conditions and Shelf Life',
        content: 'Proper storage is critical for maintaining peptide potency. Unreconstituted (lyophilized) peptides should be stored in a freezer (-20 degrees Celsius) for long-term storage, where they can remain stable for 12-24 months or longer depending on the specific peptide. For shorter-term storage (up to several months), refrigeration at 2-8 degrees Celsius is acceptable.\n\nOnce reconstituted with bacteriostatic water, peptides must be refrigerated at 2-8 degrees Celsius (standard refrigerator temperature). The benzyl alcohol preservative in BAC water provides microbial protection, but the peptide itself is now in solution and susceptible to degradation. Most reconstituted peptides maintain acceptable potency for 21-28 days when properly refrigerated. Some more stable peptides may last longer, but 28 days is a conservative and widely recommended maximum.\n\nNever freeze reconstituted peptides unless specifically instructed to do so — the freeze-thaw cycle can cause aggregation and denaturation. Protect peptides from light by storing in a dark location or wrapping vials in aluminum foil. Temperature fluctuations (such as a vial left on a counter during use) should be minimized by returning the vial to the refrigerator immediately after drawing your dose.',
      },
      {
        heading: 'Bacteriostatic Water vs Sterile Water',
        content: 'Bacteriostatic water (BAC water) and sterile water for injection are both used for reconstitution, but they serve different purposes. BAC water contains 0.9% benzyl alcohol, which acts as a bacteriostatic agent — it prevents the growth of bacteria that might be introduced when a needle punctures the vial stopper. This makes BAC water appropriate for multi-dose vials that will be accessed multiple times.\n\nSterile water for injection contains no preservative. It is intended for single-use applications where the entire vial contents will be used immediately. If sterile water is used for a multi-dose vial, the lack of preservative means bacteria can proliferate in the solution with each additional needle puncture, creating an infection risk.\n\nFor virtually all peptide reconstitution scenarios involving multi-dose vials, bacteriostatic water is the recommended choice. The one exception is if an individual has a known allergy or sensitivity to benzyl alcohol, in which case sterile water should be used and the entire vial contents should be drawn into individual syringes and stored (pre-loaded syringes can be stored refrigerated for up to 7 days). Always source your BAC water from a reputable pharmacy or medical supplier.',
      },
    ],
    citations: [
      { text: 'Manning MC, et al. Stability of protein pharmaceuticals: an update. Pharm Res. 2010;27(4):544-575.', url: 'https://doi.org/10.1007/s11095-009-0045-6' },
      { text: 'Pace CN, et al. How to measure and predict the molar absorption coefficient of a protein. Protein Sci. 1995;4(11):2411-2423.', url: 'https://doi.org/10.1002/pro.5560041120' },
      { text: 'USP General Chapter <797> Pharmaceutical Compounding — Sterile Preparations. United States Pharmacopeia.', url: 'https://www.usp.org' },
    ],
    relatedPeptideIds: ['bpc-157', 'tb-500', 'ipamorelin', 'cjc-1295', 'semaglutide'],
    lastUpdated: '2025-03-01',
  },
  {
    id: 'growth-hormone-peptides-explained',
    title: 'Growth Hormone Peptides Explained',
    slug: 'growth-hormone-peptides-explained',
    category: 'fundamentals',
    goalTypes: ['muscle_gain', 'recovery', 'longevity', 'body_recomp', 'sleep'],
    imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&q=80',
    summary: 'A comprehensive guide to growth hormone secretagogues and releasing peptides — CJC-1295, Ipamorelin, Sermorelin, and GHRP-6, including how they work and how they differ.',
    sections: [
      {
        heading: 'The Growth Hormone Axis',
        content: 'Human growth hormone (HGH or GH) is a 191-amino-acid protein produced by the anterior pituitary gland. Its release is governed by two opposing hypothalamic hormones: growth hormone-releasing hormone (GHRH), which stimulates GH release, and somatostatin, which inhibits it. This push-pull system creates the pulsatile pattern of GH secretion — most GH is released in pulses during deep sleep, with smaller pulses throughout the day.\n\nGH exerts its effects both directly and through insulin-like growth factor 1 (IGF-1), which is produced primarily in the liver in response to GH stimulation. Together, GH and IGF-1 promote tissue growth and repair, fat metabolism, bone density, muscle protein synthesis, and immune function. GH levels decline naturally with age — approximately 14% per decade after age 30 — contributing to many age-related changes in body composition, energy, sleep quality, and recovery capacity.\n\nGrowth hormone peptides (also called secretagogues) work by stimulating the body\'s own GH production rather than replacing it with exogenous GH. This approach preserves the natural pulsatile release pattern and the body\'s feedback mechanisms, which is considered advantageous over direct GH administration.',
      },
      {
        heading: 'GHRH Analogs: CJC-1295 and Sermorelin',
        content: 'GHRH analogs mimic the action of natural growth hormone-releasing hormone, binding to GHRH receptors on the pituitary to stimulate GH release. Sermorelin is the original GHRH analog — it consists of the first 29 amino acids of the 44-amino-acid GHRH molecule, which is the minimum fragment needed for full biological activity. It was FDA-approved for diagnosing and treating growth hormone deficiency in children and was available as a prescription medication (Geref) before being discontinued for commercial reasons.\n\nCJC-1295 is a modified GHRH analog with significantly improved pharmacokinetics. The "DAC" (Drug Affinity Complex) version includes a maleimido group that binds covalently to serum albumin after injection, extending the half-life from minutes to approximately 8 days. This provides a sustained elevation of GH and IGF-1 levels. The "no DAC" version (also called Modified GRF 1-29) has amino acid substitutions that improve stability but still has a shorter half-life of about 30 minutes, making it better suited for creating acute GH pulses.\n\nThe distinction matters for dosing strategy. CJC-1295 with DAC can be injected once or twice weekly for a steady GH elevation. CJC-1295 without DAC is typically dosed 1-3 times daily (often before bed) to amplify natural GH pulses.',
      },
      {
        heading: 'Ghrelin Mimetics: Ipamorelin and GHRP-6',
        content: 'Ghrelin mimetics (also called growth hormone releasing peptides or GHRPs) work through a completely different receptor — the ghrelin/GHS receptor — to stimulate GH release. This pathway is complementary to GHRH, which is why combining a GHRH analog with a ghrelin mimetic produces a synergistic effect, amplifying GH release beyond what either achieves alone.\n\nIpamorelin is considered the most selective ghrelin mimetic available. It stimulates GH release with minimal impact on cortisol, prolactin, and aldosterone — hormones that other GHRPs tend to elevate as side effects. This clean profile makes it popular for protocols where minimizing side effects is a priority. Typical dosing ranges from 100-300 mcg, administered 1-3 times daily, often combined with CJC-1295 (no DAC) for the synergistic "CJC/Ipa" protocol.\n\nGHRP-6 is a more potent but less selective GH secretagogue. It produces a stronger GH pulse than Ipamorelin but also significantly increases ghrelin and cortisol levels. The ghrelin elevation causes intense hunger approximately 20 minutes after injection, which can be desirable for those seeking to increase caloric intake (e.g., athletes in a bulking phase) but undesirable for those focused on fat loss. GHRP-6 also stimulates gastric motility and has shown gastroprotective properties in research.',
      },
      {
        heading: 'Stacking Strategies and Protocols',
        content: 'The most well-established GH peptide protocol is the CJC-1295 (no DAC) + Ipamorelin combination, often called "CJC/Ipa." This stack leverages two complementary pathways — GHRH and ghrelin receptor activation — to amplify GH release synergistically. Research shows the combination can produce GH pulses 3-5 times greater than either peptide alone.\n\nTiming is important for GH peptide protocols. Growth hormone is released in its largest natural pulse during deep sleep (typically within the first 1-2 hours). Dosing a GH peptide stack 30-60 minutes before bed on an empty stomach (GH release is blunted by elevated blood sugar and insulin) takes advantage of this natural physiology. Some protocols add a second dose upon waking, also on an empty stomach.\n\nCycle length varies, but common protocols run 8-12 weeks followed by a 4-week break to prevent receptor desensitization. Some practitioners advocate for continuous low-dose use (particularly with CJC-1295 with DAC), while others prefer the pulsatile approach. Individual response, bloodwork monitoring (particularly IGF-1 levels, fasting glucose, and HbA1c), and clinical guidance should drive protocol decisions.',
      },
      {
        heading: 'Safety Considerations and Monitoring',
        content: 'While growth hormone peptides are generally considered to have a favorable safety profile compared to exogenous GH — primarily because they preserve the body\'s natural feedback mechanisms — they are not without risks. Water retention, joint stiffness, tingling or numbness in extremities, and increased hunger are commonly reported side effects, particularly at higher doses.\n\nLong-term elevation of GH and IGF-1 levels is a theoretical concern, as chronically high IGF-1 has been associated with increased risk of certain cancers in epidemiological studies. This is why bloodwork monitoring is important: baseline and periodic testing of IGF-1, fasting glucose, HbA1c, and a comprehensive metabolic panel help ensure levels remain within a healthy physiological range rather than supraphysiological territory.\n\nGH peptides are contraindicated in individuals with active malignancies, as GH and IGF-1 can promote cell proliferation. They should also be used with caution in individuals with diabetes or pre-diabetes, as GH has counter-regulatory effects on insulin and can worsen insulin resistance. As with any bioactive compound, consultation with a knowledgeable healthcare provider is strongly recommended before beginning any GH peptide protocol.',
      },
    ],
    citations: [
      { text: 'Teichman SL, et al. Prolonged stimulation of growth hormone (GH) and insulin-like growth factor I secretion by CJC-1295, a long-acting analog of GH-releasing hormone. J Clin Endocrinol Metab. 2006;91(3):799-805.', url: 'https://doi.org/10.1210/jc.2005-1536' },
      { text: 'Raun K, et al. Ipamorelin, the first selective growth hormone secretagogue. Eur J Endocrinol. 1998;139(5):552-561.', url: 'https://doi.org/10.1530/eje.0.1390552' },
      { text: 'Nass R, et al. Effects of an oral ghrelin mimetic on body composition and clinical outcomes in healthy older adults. Ann Intern Med. 2008;149(9):601-611.', url: 'https://doi.org/10.7326/0003-4819-149-9-200811040-00003' },
    ],
    relatedPeptideIds: ['cjc-1295', 'ipamorelin'],
    lastUpdated: '2025-03-01',
  },
  {
    id: 'peptide-regulation-what-you-need-to-know',
    title: 'Peptide Regulation: What You Need to Know',
    slug: 'peptide-regulation-what-you-need-to-know',
    category: 'regulation',
    imageUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=80',
    summary: 'An overview of the regulatory landscape for peptides in the United States — FDA approval status, compounding pharmacy rules, the research chemical market, and recent regulatory changes.',
    sections: [
      {
        heading: 'FDA-Approved Peptide Medications',
        content: 'Several peptide-based medications have gone through the full FDA approval process and are available by prescription. These include some of the most impactful drugs of the past decade. Semaglutide (marketed as Ozempic for diabetes and Wegovy for weight management) and tirzepatide (Mounjaro for diabetes, Zepbound for weight management) are GLP-1 receptor agonists that have transformed obesity treatment.\n\nOther FDA-approved peptide drugs include teriparatide (Forteo) for osteoporosis, octreotide (Sandostatin) for acromegaly and carcinoid tumors, and ziconotide (Prialt) for severe chronic pain. Thymalfasin (thymosin alpha-1, marketed as Zadaxin) is approved in several countries outside the US for hepatitis B and as an immune adjuvant, though it does not have FDA approval in the United States.\n\nFDA-approved peptides have undergone rigorous clinical trials demonstrating safety and efficacy, are manufactured under strict Good Manufacturing Practice (GMP) standards, and are subject to post-marketing surveillance. When a peptide is available as an FDA-approved product, this represents the highest standard of quality and evidence.',
      },
      {
        heading: 'Compounding Pharmacies and 503A/503B Regulations',
        content: 'Compounding pharmacies play a significant and sometimes controversial role in the peptide landscape. Under the Federal Food, Drug, and Cosmetic Act, there are two categories of compounding facilities. Section 503A pharmacies compound individual prescriptions based on a specific patient\'s needs, as prescribed by a licensed healthcare provider. Section 503B outsourcing facilities can produce larger batches without individual prescriptions but must register with the FDA and comply with GMP standards.\n\nCompounding pharmacies can legally produce peptide preparations when there is a documented shortage of the FDA-approved version, or when a patient needs a customized formulation (different dose, different delivery route, allergen-free formulation). During the semaglutide and tirzepatide shortages beginning in 2022-2023, compounding pharmacies became a major source of these medications.\n\nHowever, the regulatory landscape shifted significantly when the FDA began evaluating which peptides could remain on compounding formularies. In late 2023 and into 2024, the FDA issued guidance removing several popular research peptides from the compounding category, including BPC-157 and several others. This created significant uncertainty in the market and prompted ongoing legal and regulatory challenges from compounding pharmacy trade groups.',
      },
      {
        heading: 'The Research Chemical Market',
        content: 'Many peptides that are not FDA-approved and not available through compounding pharmacies are sold as "research chemicals" or "for research use only." This market exists in a legal gray area. The peptides themselves are not illegal to purchase in most jurisdictions, but they are not approved for human use, and selling them for human consumption would violate FDA regulations.\n\nThe research chemical market has significant quality variability. Without the regulatory oversight that applies to pharmaceutical manufacturers and compounding pharmacies, there is no guarantee of purity, sterility, identity, or potency. Some vendors provide third-party Certificates of Analysis (COAs) from independent laboratories, while others provide in-house testing of questionable reliability, or no testing at all.\n\nFor consumers, this creates a buyer-beware situation. Reputable research peptide vendors typically provide batch-specific third-party COAs showing HPLC purity and mass spectrometry identity verification at minimum. Even with COAs, the peptide is not manufactured under pharmaceutical GMP conditions. Understanding these distinctions is important for making informed decisions about sourcing.',
      },
      {
        heading: 'Recent Regulatory Developments',
        content: 'The peptide regulatory landscape has been particularly dynamic in 2024-2025. The FDA\'s Center for Drug Evaluation and Research (CDER) has taken increased interest in the peptide market, driven largely by the explosion in demand for GLP-1 agonists and growing public use of research peptides.\n\nKey developments include the FDA\'s updated Bulk Drug Substance list, which determines which compounds pharmacies can legally compound. Several peptides were nominated for inclusion or removal, with public comment periods generating significant industry and consumer response. The FDA also increased enforcement actions against companies marketing unapproved peptides for human use, particularly those making specific therapeutic claims.\n\nAt the state level, regulations vary considerably. Some states have enacted legislation specifically addressing peptide compounding and telehealth prescribing. The intersection of telemedicine platforms, compounding pharmacies, and peptide prescribing has created new regulatory questions that state medical boards and pharmacy boards are actively addressing. Consumers should be aware that legality may differ based on their state of residence.',
      },
      {
        heading: 'What This Means for Consumers',
        content: 'Navigating the peptide regulatory landscape requires understanding several key principles. First, FDA-approved peptide medications obtained through licensed pharmacies with a valid prescription represent the safest and most legally clear option. If an FDA-approved version of a peptide exists, it should be the first choice.\n\nFor peptides that are available through compounding pharmacies, working with a licensed healthcare provider who can write a prescription and a reputable 503A or 503B pharmacy provides a reasonable middle ground. Verify that the pharmacy is licensed in its state, registered with the FDA (for 503B facilities), and follows appropriate quality standards. Organizations like the Professional Compounding Centers of America (PCCA) and the Alliance for Pharmacy Compounding provide resources for finding reputable compounders.\n\nThe regulatory environment continues to evolve, and what is available through compounding today may change. Stay informed about FDA guidance updates, particularly regarding the Bulk Drug Substance list and shortage declarations. Advocacy organizations and industry groups regularly publish updates on regulatory changes affecting peptide access. Regardless of sourcing, medical supervision, appropriate lab monitoring, and informed consent about the regulatory status of any peptide used are essential components of responsible use.',
      },
    ],
    citations: [
      { text: 'FDA Compounding Laws and Policies. U.S. Food and Drug Administration.', url: 'https://www.fda.gov/drugs/human-drug-compounding/compounding-laws-and-policies' },
      { text: 'FDA Bulk Drug Substances Used in Compounding Under Section 503B of the FD&C Act.', url: 'https://www.fda.gov/drugs/human-drug-compounding/bulk-drug-substances-used-compounding-under-section-503b-fdc-act' },
      { text: 'National Academies of Sciences, Engineering, and Medicine. The Clinical Utility of Compounded Bioidentical Hormone Therapy: A Review of Safety, Effectiveness, and Use. 2020.', url: 'https://doi.org/10.17226/25791' },
    ],
    relatedPeptideIds: ['semaglutide', 'tirzepatide', 'bpc-157', 'thymosin-alpha-1'],
    lastUpdated: '2025-03-01',
  },
];

// Lazy Proxy
export const EDUCATIONAL_ARTICLES: EducationalArticle[] = new Proxy([] as EducationalArticle[], {
  get(_, prop) {
    if (prop === 'length') return _RAW_ARTICLES.length;
    if (prop === 'map') return _RAW_ARTICLES.map.bind(_RAW_ARTICLES);
    if (prop === 'filter') return _RAW_ARTICLES.filter.bind(_RAW_ARTICLES);
    if (prop === 'forEach') return _RAW_ARTICLES.forEach.bind(_RAW_ARTICLES);
    if (prop === 'find') return _RAW_ARTICLES.find.bind(_RAW_ARTICLES);
    if (prop === 'slice') return _RAW_ARTICLES.slice.bind(_RAW_ARTICLES);
    if (prop === Symbol.iterator) return _RAW_ARTICLES[Symbol.iterator].bind(_RAW_ARTICLES);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return _RAW_ARTICLES[Number(prop)];
    return (_RAW_ARTICLES as any)[prop];
  },
});

export const getArticleById = (id: string): EducationalArticle | undefined =>
  _RAW_ARTICLES.find((a) => a.id === id);

export const getArticleBySlug = (slug: string): EducationalArticle | undefined =>
  _RAW_ARTICLES.find((a) => a.slug === slug);

export const getArticlesByCategory = (category: ArticleCategory): EducationalArticle[] =>
  _RAW_ARTICLES.filter((a) => a.category === category);
