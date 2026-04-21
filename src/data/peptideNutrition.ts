/**
 * Peptide-specific nutrition guidance.
 *
 * For each peptide, captures:
 *   - How macro targets should shift (if at all)
 *   - Hydration / micronutrient / timing emphases
 *   - Short user-facing summary for the peptide detail page
 *
 * Used by:
 *   - Peptide detail page → "Nutrition for this peptide" section
 *   - Aimee system prompt → mentions when user is on a matching peptide
 *   - aimee-pantry-meal edge function → biases meal suggestions (C5)
 *   - Macro calculator (C2) → already references GLP-1s to bump protein target
 *
 * This is research-informed guidance, NOT medical advice. Every reference
 * in the app should pair this data with a "consult a provider" note.
 */

export type MacroAdjustment =
  | 'higher_protein'     // push protein target up (e.g. GLP-1 lean-mass preservation)
  | 'lower_carb_pm'      // avoid carbs within 2 hours pre-sleep (GH pulse)
  | 'carb_timing_prep'   // carbs around workouts (e.g. IGF-1 LR3)
  | 'collagen_emphasis'  // extra glycine/collagen (BPC-157, TB-500 healing)
  | 'hydration_plus'     // extra water (GLP-1, diuretic-adjacent)
  | 'electrolyte_plus'   // Na/K/Mg emphasis (cutting peptides, fasting peptides)
  | 'iron_rich'          // anemia-susceptible users
  | 'none';              // no specific nutrition adjustment

export interface PeptideNutritionGuidance {
  peptideId: string;
  displayName: string;
  /** Macro-level recommendations. */
  adjustments: MacroAdjustment[];
  /** Specific protein target range in g per lb bodyweight (if different from default 0.8). */
  proteinGPerLbRange?: [number, number];
  /** Hydration target as a multiplier of the default 0.5 oz/lb. */
  hydrationMultiplier?: number;
  /** Micronutrients worth emphasizing. */
  microEmphasis?: string[];
  /** Foods / food categories to emphasize. */
  foodsEmphasize?: string[];
  /** Foods / categories to limit or avoid. */
  foodsAvoid?: string[];
  /** Short one-paragraph summary for the peptide detail page. */
  summary: string;
  /** One-liner for Aimee system prompt injection. */
  prompt: string;
}

const g = (entry: PeptideNutritionGuidance): [string, PeptideNutritionGuidance] => [
  entry.peptideId.toLowerCase(),
  entry,
];

export const PEPTIDE_NUTRITION: Record<string, PeptideNutritionGuidance> = Object.fromEntries([
  // ── GLP-1 / dual agonists — always push protein, hydration ────────────────
  g({
    peptideId: 'semaglutide',
    displayName: 'Semaglutide',
    adjustments: ['higher_protein', 'hydration_plus', 'electrolyte_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.3,
    microEmphasis: ['B12', 'iron', 'sodium', 'potassium', 'magnesium'],
    foodsEmphasize: ['lean protein', 'Greek yogurt', 'eggs', 'fish', 'leafy greens', 'cottage cheese'],
    foodsAvoid: ['ultra-processed sugars', 'fried foods (trigger nausea)', 'large single-sitting portions'],
    summary:
      'On semaglutide, appetite drops sharply and many users under-eat protein — leading to lean-mass loss. Target 1.0–1.2 g protein per lb bodyweight, eat small frequent portions, and prioritize hydration (appetite suppression often suppresses thirst cues too).',
    prompt:
      'Semaglutide users: 1.0–1.2 g/lb protein to preserve lean mass; small frequent meals; extra hydration + electrolytes.',
  }),
  g({
    peptideId: 'tirzepatide',
    displayName: 'Tirzepatide',
    adjustments: ['higher_protein', 'hydration_plus', 'electrolyte_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.3,
    microEmphasis: ['B12', 'iron', 'sodium', 'potassium', 'magnesium', 'vitamin D'],
    foodsEmphasize: ['lean protein', 'eggs', 'fish', 'Greek yogurt', 'leafy greens', 'berries'],
    foodsAvoid: ['ultra-processed sugars', 'fried/greasy foods', 'heavy single-sitting meals'],
    summary:
      'Tirzepatide (dual GIP/GLP-1 agonist) produces stronger appetite suppression than semaglutide. Protein priority is critical — 1.0–1.2 g/lb. Spread intake across 4–5 small meals. Pre-hydrate before meals to reduce nausea.',
    prompt:
      'Tirzepatide users: 1.0–1.2 g/lb protein, small frequent meals, pre-hydrate to reduce nausea.',
  }),
  g({
    peptideId: 'retatrutide',
    displayName: 'Retatrutide',
    adjustments: ['higher_protein', 'hydration_plus', 'electrolyte_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.3,
    microEmphasis: ['B12', 'iron', 'potassium', 'magnesium'],
    foodsEmphasize: ['lean protein', 'eggs', 'Greek yogurt', 'fatty fish', 'vegetables'],
    foodsAvoid: ['sugar-heavy snacks', 'large meals'],
    summary:
      'Retatrutide (triple GLP-1/GIP/glucagon agonist) produces the strongest appetite suppression of the current class. Protein target 1.0–1.2 g/lb is non-negotiable to avoid muscle loss during rapid weight loss. Prioritize whole-food protein at every meal.',
    prompt:
      'Retatrutide users: strict 1.0–1.2 g/lb protein, hydration critical, small meals spread out.',
  }),
  g({
    peptideId: 'liraglutide',
    displayName: 'Liraglutide',
    adjustments: ['higher_protein', 'hydration_plus'],
    proteinGPerLbRange: [0.9, 1.1],
    hydrationMultiplier: 1.2,
    microEmphasis: ['B12', 'iron'],
    foodsEmphasize: ['lean protein', 'vegetables', 'whole grains'],
    foodsAvoid: ['ultra-processed sugars', 'fried foods'],
    summary:
      'Liraglutide (shorter-acting GLP-1) has milder appetite suppression than once-weekly agents. Protein 0.9–1.1 g/lb, focus on balanced meals.',
    prompt: 'Liraglutide users: 0.9–1.1 g/lb protein, balanced meals.',
  }),
  g({
    peptideId: 'cagrilintide',
    displayName: 'Cagrilintide',
    adjustments: ['higher_protein', 'hydration_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.25,
    microEmphasis: ['potassium', 'magnesium'],
    foodsEmphasize: ['protein', 'fiber-rich veggies'],
    foodsAvoid: ['rapid-digesting carbs'],
    summary:
      'Cagrilintide (amylin analog) slows gastric emptying. Pair protein with fiber to avoid post-meal blood-sugar spikes. Same protein priority as other cutting peptides.',
    prompt: 'Cagrilintide users: protein + fiber combos, slow-digesting meals.',
  }),

  // ── GH secretagogues — pre-sleep low-carb ────────────────────────────────
  g({
    peptideId: 'ipamorelin',
    displayName: 'Ipamorelin',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.2],
    foodsEmphasize: ['protein at breakfast', 'Greek yogurt (pre-sleep if tolerated)'],
    foodsAvoid: ['sugar / high-glycemic carbs within 2 hours before bed'],
    summary:
      'Ipamorelin stimulates a natural GH pulse. Carbs and insulin blunt that pulse, so avoid high-glycemic foods for 2 hours before a bedtime dose. Take the dose on an empty stomach and wait ~30 min before eating. Protein supports the recovery side of the GH/IGF-1 axis.',
    prompt:
      'Ipamorelin users: empty-stomach dose, no high-glycemic carbs 2h pre-dose (blunts GH release).',
  }),
  g({
    peptideId: 'cjc-1295',
    displayName: 'CJC-1295',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.2],
    foodsEmphasize: ['protein-rich breakfast', 'leafy greens'],
    foodsAvoid: ['sugar 2h before bedtime dose'],
    summary:
      'CJC-1295 (especially paired with ipamorelin) shares the same "empty stomach + no pre-sleep carbs" rule. Protein priority 1.0–1.2 g/lb to support the recovery pulse.',
    prompt: 'CJC-1295 users: empty-stomach dose, low-carb evening dose, protein-forward diet.',
  }),
  g({
    peptideId: 'tesamorelin',
    displayName: 'Tesamorelin',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.1],
    foodsEmphasize: ['whole proteins', 'fiber-rich veggies'],
    foodsAvoid: ['simple sugars, especially 2h pre-dose'],
    summary:
      'Tesamorelin reduces visceral fat via GHRH analog action. Fast 2 hours before and 30 min after the dose for best effect. Balanced protein intake (1.0–1.1 g/lb) supports lean-mass preservation.',
    prompt: 'Tesamorelin users: 2h fast pre-dose + 30min post, protein-forward diet.',
  }),
  g({
    peptideId: 'sermorelin',
    displayName: 'Sermorelin',
    adjustments: ['lower_carb_pm'],
    proteinGPerLbRange: [0.9, 1.1],
    foodsAvoid: ['sugar before bedtime dose'],
    summary:
      'Sermorelin has the shortest half-life in the GHRH class. Take on empty stomach, pre-sleep; avoid sugary foods 2h before. No special macro shift otherwise.',
    prompt: 'Sermorelin users: empty stomach pre-sleep dose, no sugar 2h before.',
  }),

  // ── Healing / repair peptides ─────────────────────────────────────────────
  g({
    peptideId: 'bpc-157',
    displayName: 'BPC-157',
    adjustments: ['collagen_emphasis'],
    microEmphasis: ['vitamin C', 'zinc', 'copper', 'glycine'],
    foodsEmphasize: ['bone broth', 'collagen protein', 'citrus', 'leafy greens', 'eggs'],
    summary:
      'BPC-157 accelerates soft-tissue and GI healing. No macro shift needed, but collagen synthesis benefits from glycine (bone broth, gelatin) and cofactors (vitamin C, zinc, copper). For gut-healing protocols, pair with meal timing (taken ~20 min before eating).',
    prompt:
      'BPC-157 users: collagen/glycine emphasis (bone broth, gelatin), vitamin C + zinc cofactors.',
  }),
  g({
    peptideId: 'tb-500',
    displayName: 'TB-500 (Thymosin Beta-4)',
    adjustments: ['collagen_emphasis'],
    microEmphasis: ['zinc', 'magnesium', 'vitamin C'],
    foodsEmphasize: ['collagen sources', 'berries', 'citrus'],
    summary:
      'TB-500 promotes tissue regeneration and angiogenesis. Same cofactor emphasis as BPC-157 — glycine + vitamin C + zinc. Adequate protein (0.8–1.0 g/lb) supports repair.',
    prompt: 'TB-500 users: collagen + vitamin C cofactors for tissue repair.',
  }),

  // ── Metabolic / mitochondrial ─────────────────────────────────────────────
  g({
    peptideId: 'mots-c',
    displayName: 'MOTS-c',
    adjustments: ['carb_timing_prep'],
    foodsEmphasize: ['complex carbs around workouts', 'B-vitamin-rich foods'],
    summary:
      'MOTS-c is a mitochondrial peptide — improves insulin sensitivity and glucose uptake. Time your higher-carb meals around workouts for best effect. Dose in the morning (energy expenditure pulse).',
    prompt: 'MOTS-c users: time carbs around workouts, morning dose.',
  }),
  g({
    peptideId: 'aod-9604',
    displayName: 'AOD-9604',
    adjustments: ['higher_protein', 'hydration_plus'],
    proteinGPerLbRange: [0.9, 1.1],
    hydrationMultiplier: 1.15,
    summary:
      'AOD-9604 is a GH fragment that promotes lipolysis without affecting blood sugar. Protein priority + hydration. No special timing beyond empty-stomach dose.',
    prompt: 'AOD-9604 users: protein + hydration, empty-stomach dose.',
  }),

  // ── Growth / IGF ──────────────────────────────────────────────────────────
  g({
    peptideId: 'igf-1-lr3',
    displayName: 'IGF-1 LR3',
    adjustments: ['carb_timing_prep', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.3],
    foodsEmphasize: ['carbs + protein post-workout', 'high-quality whole foods'],
    foodsAvoid: ['fasted-state dosing when hypoglycemia-prone'],
    summary:
      'IGF-1 LR3 increases nutrient partitioning toward muscle. Time carbs around the dose to fuel the anabolic window. Protein priority 1.0–1.3 g/lb. Watch blood sugar — can cause hypoglycemia if dosed without food.',
    prompt:
      'IGF-1 LR3 users: post-workout dose with carbs + protein; protein target 1.0–1.3 g/lb.',
  }),

  // ── Cognitive / longevity ─────────────────────────────────────────────────
  g({
    peptideId: 'selank',
    displayName: 'Selank',
    adjustments: ['none'],
    summary:
      'Selank is a neuropeptide with anxiolytic effects. No specific nutrition shift required.',
    prompt: 'Selank users: no specific nutrition change.',
  }),
  g({
    peptideId: 'semax',
    displayName: 'Semax',
    adjustments: ['none'],
    summary:
      'Semax is a cognitive-focus peptide. No macro shift, but adequate omega-3s and B vitamins support the underlying neurotransmitter pathways.',
    prompt: 'Semax users: omega-3 + B-vitamin emphasis, no macro shift required.',
  }),
  g({
    peptideId: 'epithalon',
    displayName: 'Epithalon',
    adjustments: ['none'],
    microEmphasis: ['zinc', 'selenium', 'vitamin D'],
    summary:
      'Epithalon is a telomerase-activating peptide used for longevity. Antioxidant-rich diet + micronutrients (zinc, selenium, D) support the longevity axis.',
    prompt: 'Epithalon users: antioxidant-rich diet, zinc + selenium + vitamin D.',
  }),
]);

/**
 * Look up nutrition guidance by peptide id (case-insensitive).
 */
export function getPeptideNutrition(peptideId: string): PeptideNutritionGuidance | undefined {
  return PEPTIDE_NUTRITION[peptideId.toLowerCase()];
}

/**
 * Merge nutrition guidance across multiple active peptides — used by the
 * stack-aware meal suggestion feature (C5).
 *
 * Returns a combined set of prompts + foods to emphasize/avoid, de-duped.
 */
export function aggregateStackNutrition(peptideIds: string[]): {
  prompts: string[];
  foodsEmphasize: string[];
  foodsAvoid: string[];
  microEmphasis: string[];
  /** Max protein g/lb across the stack — used to bias meal suggestions. */
  proteinGPerLbMax: number;
  hydrationMultiplier: number;
} {
  const prompts: string[] = [];
  const foodsEmphasize = new Set<string>();
  const foodsAvoid = new Set<string>();
  const microEmphasis = new Set<string>();
  let proteinGPerLbMax = 0.8;
  let hydrationMultiplier = 1;

  for (const id of peptideIds) {
    const g = getPeptideNutrition(id);
    if (!g) continue;
    prompts.push(g.prompt);
    g.foodsEmphasize?.forEach((f) => foodsEmphasize.add(f));
    g.foodsAvoid?.forEach((f) => foodsAvoid.add(f));
    g.microEmphasis?.forEach((m) => microEmphasis.add(m));
    if (g.proteinGPerLbRange) {
      proteinGPerLbMax = Math.max(proteinGPerLbMax, g.proteinGPerLbRange[1]);
    }
    if (g.hydrationMultiplier && g.hydrationMultiplier > hydrationMultiplier) {
      hydrationMultiplier = g.hydrationMultiplier;
    }
  }

  return {
    prompts,
    foodsEmphasize: Array.from(foodsEmphasize),
    foodsAvoid: Array.from(foodsAvoid),
    microEmphasis: Array.from(microEmphasis),
    proteinGPerLbMax,
    hydrationMultiplier,
  };
}
