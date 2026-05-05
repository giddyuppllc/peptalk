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

  /** Optional training guidance that pairs with this peptide's mechanism. */
  fitnessGuidance?: {
    /** What kind of training to emphasize (e.g. "resistance training", "zone 2 cardio"). */
    emphasis: string;
    /** When during the cycle / day to lean into training. */
    timing?: string;
    /** Things to avoid or scale back. */
    cautions?: string[];
  };
  /** Specific vitamin / mineral recommendations to support the peptide's
   *  mechanism — separate from microEmphasis (which tends to be food-form).
   *  Examples: "B-complex 50mg/day," "Magnesium glycinate 300mg before bed." */
  vitaminEmphasis?: string[];
  /** Lifestyle pairings (sleep targets, stress practices, exposure timing). */
  lifestyleNotes?: string[];
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week, full-body or upper/lower split. Lean mass loss is the #1 risk on GLP-1s — lifting is the only thing that protects it.',
      timing: 'Morning lift before the dose if possible — appetite is highest in the early window. Skip cardio-heavy days when you\'re already deficit + dehydrated.',
      cautions: ['Avoid running fasted on dose day (week 1-2 nausea risk)', 'Drop volume 20% during titration weeks until appetite stabilizes'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day (B12 absorption drops with reduced food intake)',
      'Electrolyte mix daily (sodium 1-2g, potassium 500mg, magnesium 300-400mg)',
      'Vitamin D3 2000-4000 IU if you\'re indoors most days',
      'Iron only if labs indicate — don\'t guess',
    ],
    lifestyleNotes: [
      'Sleep 7-9h — calorie deficit + GLP-1 = recovery debt accumulates fast',
      'Walk 8-10k steps to support fat oxidation without burning into protein',
      'Manage stress (cortisol blocks the body-comp benefits) — 10 min/day breath work / sauna / similar',
    ],
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week — same lean-mass-preservation logic as semaglutide. Tirzepatide weight loss is faster, so the lifting is even more critical.',
      timing: 'Train morning when appetite is most workable.',
      cautions: ['Reduce intensity 20-30% during titration', 'Avoid fasted training in week 1-2 of new doses'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day (B12 absorption drops with lower food intake)',
      'Electrolyte mix daily (sodium, potassium, magnesium)',
      'Vitamin D3 2000-4000 IU',
      'Creatine monohydrate 5g/day — lean-mass insurance during rapid loss',
    ],
    lifestyleNotes: [
      'Sleep 7-9h consistently — fast loss compounds recovery debt',
      'Walking 8-10k steps daily supports fat ox without protein burn',
      'Stress management non-negotiable; cortisol negates body-comp gains',
    ],
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week is mandatory — strongest GLP-1 in the class means fastest weight loss, which means highest lean-mass risk. Lift heavy.',
      timing: 'Train morning before food when nausea is lowest. Skip cardio on dose day if energy is poor.',
      cautions: ['Reduce volume 25-30% during titration', 'Never train fasted in week 1-2 of a new dose'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day (especially B12)',
      'Electrolyte mix daily (sodium 1-2g, potassium 500mg, magnesium 300-400mg)',
      'Vitamin D3 4000 IU + K2 100mcg',
      'Creatine 5g/day — non-negotiable lean-mass insurance',
    ],
    lifestyleNotes: [
      'Sleep 8h+ — fastest weight-loss class means biggest recovery debt',
      'Walk 8-10k steps daily for fat-ox without protein burn',
      'Limit alcohol (already-fragile electrolyte balance)',
      'Stress management essential — cortisol drives the rebound on these peptides',
    ],
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3x/week as the lean-mass anchor. Cardio 2-3x/week for cardiometabolic benefit.',
      timing: 'Daily injection means more flexible training timing — train when energy is highest.',
      cautions: ['Watch for nausea on training days', 'Pre-workout meal 60-90 min before lifting'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day',
      'Electrolyte mix daily',
      'Vitamin D3 2000-4000 IU',
    ],
    lifestyleNotes: [
      'Sleep 7-9h consistently',
      'Walk 7-10k steps daily',
      'Daily injection rhythm pairs well with stable meal/sleep schedule',
    ],
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week. Often stacked with semaglutide/tirzepatide — same lifting priorities apply.',
      timing: 'Pre-meal injection means the post-meal training window is when satiety is strongest — light cardio works better than heavy lifts here.',
      cautions: ['Slow gastric emptying = avoid heavy meals 2-3h pre-training', 'Hydrate aggressively before training'],
    },
    vitaminEmphasis: [
      'Electrolyte mix daily',
      'Magnesium glycinate 300-400mg/day',
      'Fiber 30-40g/day from food',
    ],
    lifestyleNotes: [
      'Eat earlier in the day — late meals digest slowly on amylin agonists',
      'Sleep 7-9h to support recovery during deficit',
      'Track water intake — slowed gastric emptying masks thirst',
    ],
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
    fitnessGuidance: {
      emphasis: 'Heavy resistance training pairs hand-in-glove with GH pulses. 4-day upper/lower or push/pull/legs splits work well.',
      timing: 'Train in the late afternoon or early evening — natural cortisol curve is dropping and you can recover into the bedtime GH pulse.',
      cautions: ['Don\'t train in the 30 minutes after a dose', 'Skip late-evening cardio if it disrupts your dose timing'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 300-400mg before bed (deeper sleep = better GH)',
      'Zinc 15-25mg/day (GH synthesis cofactor)',
      'Vitamin D3 4000 IU + K2 100mcg',
      'Creatine 5g/day for lean-mass support',
    ],
    lifestyleNotes: [
      'Bedtime within 30 min of dose; pulse depends on deep sleep',
      'Cool, dark bedroom (65-68°F) — measurably more deep sleep',
      'No alcohol within 4h of dose — alcohol blunts the GH pulse hard',
    ],
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
    fitnessGuidance: {
      emphasis: 'Heavy resistance training 4x/week — CJC + ipamorelin amplifies natural GH pulses, and lifting is the trigger that converts that to muscle.',
      timing: 'Late afternoon training (4-6pm) hits naturally lower cortisol and lets you ride into the bedtime GH pulse.',
      cautions: ['No training within 30min of dose', 'Avoid late-night cardio that disrupts sleep'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 400mg before bed',
      'Zinc 25mg/day + copper 1-2mg',
      'Vitamin D3 4000 IU + K2 100mcg',
      'Creatine 5g/day',
      'Glycine 3-5g pre-bed for deeper sleep',
    ],
    lifestyleNotes: [
      'Bedtime within 30min of evening dose',
      'Cool dark bedroom (65-68°F)',
      'No alcohol within 4h of dose — alcohol kills the GH pulse',
      'Last meal 2-3h before bedtime dose for cleanest pulse',
    ],
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
    fitnessGuidance: {
      emphasis: 'Zone-2 cardio + resistance training combo — Tesamorelin\'s visceral-fat target compounds with both. 3 lifts + 3 cardio sessions per week.',
      timing: 'Train morning (post-dose, post-fast). Visceral lipolysis is most active in the morning fasted window.',
      cautions: ['Don\'t train fasted longer than 2h post-dose', 'Watch for joint stiffness — increase warm-up time'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 300-400mg/day',
      'Vitamin D3 4000 IU + K2',
      'Omega-3 2-3g EPA+DHA daily',
      'Creatine 5g/day',
    ],
    lifestyleNotes: [
      'Bedtime dose pairs best with consistent 10-11pm sleep schedule',
      'Last meal 2h pre-dose for clean GHRH pulse',
      'Limit alcohol — reduces both visceral-fat reduction and the GH pulse',
    ],
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
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week supports the natural GH amplification. Mild peptide so don\'t expect aggressive body-comp effects without lifting.',
      timing: 'Late afternoon training works well for cortisol/GH crossover. Bedtime dose then.',
      cautions: ['Skip late-evening cardio that pushes bedtime past 10pm'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 300mg before bed',
      'Zinc 15mg/day',
      'Vitamin D3 2000-4000 IU',
    ],
    lifestyleNotes: [
      'Bedtime within 30min of dose',
      'Last meal 2h before dose',
      'No alcohol within 4h of dose',
    ],
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
    fitnessGuidance: {
      emphasis: 'Train near (but not into) pain. Tissue-repair protocols accelerate when the area is loaded sub-maximally — full-rest delays remodeling.',
      timing: 'Inject near the injured site if practical. Time training 1-2 hours after the injection so peptide tissue concentration is highest.',
      cautions: ['Avoid maximal effort during weeks 1-2', 'Don\'t mask pain — BPC accelerates healing, doesn\'t numb damage'],
    },
    vitaminEmphasis: [
      'Vitamin C 1000mg/day (collagen synthesis cofactor)',
      'Zinc 15-25mg/day',
      'Copper 1-2mg (always paired with zinc)',
      'Glycine 5g/day (collagen amino acid)',
      'Magnesium glycinate 300mg before bed',
    ],
    lifestyleNotes: [
      'Sleep 7-9h — deep-sleep windows are when tissue remodeling actually happens',
      'Hydration 0.7 oz/lb minimum — connective tissue is 70% water',
      'Avoid NSAIDs unless absolutely needed — they blunt the inflammatory signaling BPC-157 modulates',
    ],
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
    fitnessGuidance: {
      emphasis: 'Sub-maximal loading on the injured area — same as BPC-157. TB-500 is systemic, so site-of-injection doesn\'t matter the way it does for BPC.',
      timing: 'Loading phase: 2x/week for 4-6 weeks lets blood supply remodel. Maintenance: 1x/week.',
      cautions: ['Don\'t return to full intensity until pain-free under load', 'Hide cardio inflammatory spikes if recovery is the goal'],
    },
    vitaminEmphasis: [
      'Vitamin C 1000mg/day',
      'Zinc 15-25mg/day + copper 1-2mg',
      'Glycine 5g/day or 1 tbsp gelatin',
      'Vitamin D3 4000 IU + K2 100mcg',
    ],
    lifestyleNotes: [
      'Sleep 7-9h — angiogenesis (new blood vessel growth) follows deep-sleep cycles',
      'Cold exposure on rest days may compound the angiogenesis benefit',
      'Avoid alcohol during loading phase — blunts the regenerative signal',
    ],
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
    fitnessGuidance: {
      emphasis: 'Zone-2 cardio (60-70% max HR) 3-4x/week stacks beautifully — both grow mitochondrial density. 30-45 min steady-state, not intervals.',
      timing: 'Train 30-60 min after the morning dose; insulin sensitivity is at its sharpest.',
      cautions: ['Skip late-night carbs on dose day to avoid blunting the AMPK signal', 'Don\'t over-restrict carbs — MOTS-c needs glucose to do its thing'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day (mitochondrial cofactor — B1, B2, B3 especially)',
      'Magnesium glycinate 300mg/day (>300 enzymatic mitochondrial reactions)',
      'CoQ10 100-200mg with a fatty meal',
      'Alpha-lipoic acid 300-600mg/day (mitochondrial antioxidant)',
    ],
    lifestyleNotes: [
      'Cold exposure 1-3x/week (60-90s cold shower) supports mito biogenesis',
      'Heat / sauna 20 min 3-4x/week — same mechanism, opposite direction',
      'Time-restricted eating (12-14h fast) compounds the AMPK signaling',
    ],
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
    fitnessGuidance: {
      emphasis: 'Fasted morning cardio compounds the lipolytic effect. Add 2-3 resistance sessions to maintain lean mass.',
      timing: 'Morning fasted dose + 30min walk or zone-2 cardio is the classic protocol.',
      cautions: ['Don\'t go to failure on empty stomach', 'Eat a protein-forward breakfast 30-60min after the cardio'],
    },
    vitaminEmphasis: [
      'L-carnitine 1-2g/day for fatty-acid transport',
      'B-complex 50mg/day',
      'Caffeine 100-200mg pre-cardio for synergistic lipolysis',
    ],
    lifestyleNotes: [
      'Morning sun exposure 10min within an hour of waking',
      'Hydration 0.7 oz/lb minimum',
      'Sleep 7-9h — fat ox tracks deep-sleep quality',
    ],
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
    fitnessGuidance: {
      emphasis: 'Heavy resistance training 4-5x/week — IGF-1 LR3 is highly anabolic; you need the stimulus to direct it toward muscle vs other tissues.',
      timing: 'Post-workout dose into a high-carb high-protein meal hits the anabolic window perfectly.',
      cautions: ['Never dose fasted (hypoglycemia risk)', 'Watch for site-specific tissue growth at injection sites — rotate', 'Cardiac hypertrophy risk on long cycles — keep cycles ≤6 weeks'],
    },
    vitaminEmphasis: [
      'Creatine 5g/day',
      'Beta-alanine 3-5g/day',
      'Vitamin D3 4000 IU + K2',
      'Omega-3 3g EPA+DHA daily',
    ],
    lifestyleNotes: [
      'Sleep 8-9h — anabolic recovery is sleep-dependent',
      'Limit cardio to 2x/week during cycle (don\'t outrun the anabolic signal)',
      'Get a basic blood panel before and after each cycle (IGF-1, fasting glucose, A1c)',
    ],
  }),

  // ── Cognitive / longevity ─────────────────────────────────────────────────
  g({
    peptideId: 'selank',
    displayName: 'Selank',
    adjustments: ['none'],
    summary:
      'Selank is a neuropeptide with anxiolytic effects. No specific nutrition shift required.',
    prompt: 'Selank users: no specific nutrition change.',
    fitnessGuidance: {
      emphasis: 'Pairs well with mind-body modalities — yoga, mobility, zone-2 cardio. Heavy lifts still fine but the anxiolytic effect doesn\'t add to PR pursuit.',
      timing: 'Use intranasal dose 30min before stressful events (presentations, anxious lifts, important meetings).',
      cautions: ['No documented training cautions'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 300-400mg/day',
      'L-theanine 100-200mg/day',
      'Omega-3 EPA+DHA 2g/day',
    ],
    lifestyleNotes: [
      'Pair with breathwork or meditation for compounded anxiolytic effect',
      'Sleep hygiene non-negotiable — Selank doesn\'t fix poor sleep',
      'Limit caffeine to mornings during high-stress weeks',
    ],
  }),
  g({
    peptideId: 'semax',
    displayName: 'Semax',
    adjustments: ['none'],
    summary:
      'Semax is a cognitive-focus peptide. No macro shift, but adequate omega-3s and B vitamins support the underlying neurotransmitter pathways.',
    prompt: 'Semax users: omega-3 + B-vitamin emphasis, no macro shift required.',
    fitnessGuidance: {
      emphasis: 'Mind-body training (climbing, martial arts, complex movement) leverages the focus enhancement.',
      timing: 'Dose 30-60min before deep-work sessions or technical training.',
      cautions: ['Don\'t use Semax to mask poor sleep — focus borrowing is real but unsustainable'],
    },
    vitaminEmphasis: [
      'Omega-3 EPA+DHA 2-3g/day',
      'B-complex 50mg/day (especially B6, B12, folate)',
      'Phosphatidylcholine 500-1000mg/day',
      'Lion\'s mane 1g/day (cognitive synergy)',
    ],
    lifestyleNotes: [
      'Sleep 7-9h — Semax amplifies, doesn\'t replace, recovery',
      'Time-block deep work to leverage the focus window (~3-4h post-dose)',
      'Limit alcohol — blunts BDNF expression that Semax upregulates',
    ],
  }),
  g({
    peptideId: 'epithalon',
    displayName: 'Epithalon',
    adjustments: ['none'],
    microEmphasis: ['zinc', 'selenium', 'vitamin D'],
    summary:
      'Epithalon is a telomerase-activating peptide used for longevity. Antioxidant-rich diet + micronutrients (zinc, selenium, D) support the longevity axis.',
    prompt: 'Epithalon users: antioxidant-rich diet, zinc + selenium + vitamin D.',
    fitnessGuidance: {
      emphasis: 'Zone-2 cardio + light resistance training. Avoid high-intensity training stress during the 10-20 day course — Epithalon\'s longevity signal is hampered by chronic inflammation.',
      timing: 'Train morning. Bedtime dose pairs with melatonin upregulation.',
      cautions: ['Skip cold plunges during course (excessive hormetic stress competes for the same pathway)', 'No alcohol during course'],
    },
    vitaminEmphasis: [
      'Vitamin D3 4000 IU + K2 100mcg',
      'Zinc 15-25mg + copper 1-2mg',
      'Selenium 100-200mcg/day',
      'NAD+ precursors (NMN 500mg or NR 300mg) — pairs with longevity axis',
      'Resveratrol 250-500mg/day with a fatty meal',
    ],
    lifestyleNotes: [
      'Bedtime dose synergizes with natural melatonin pulse',
      'Sleep 8h+ during the course — pineal-axis signaling depends on it',
      'Limit blue light 2h before bedtime dose',
      'Antioxidant-rich diet (berries, leafy greens, colored vegetables)',
    ],
  }),

  // ── New: GLP-1 family additions ───────────────────────────────────────────
  g({
    peptideId: 'mazdutide',
    displayName: 'Mazdutide',
    adjustments: ['higher_protein', 'hydration_plus', 'electrolyte_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.3,
    microEmphasis: ['B12', 'sodium', 'potassium', 'magnesium'],
    foodsEmphasize: ['lean protein', 'eggs', 'fish', 'leafy greens'],
    foodsAvoid: ['ultra-processed sugars', 'fried foods'],
    summary:
      'Mazdutide (GLP-1/glucagon dual agonist) drives both appetite suppression and resting metabolism. Same protein priority as semaglutide. Glucagon side increases hepatic glucose output — pair with consistent meal timing.',
    prompt: 'Mazdutide users: 1.0-1.2 g/lb protein, hydration + electrolytes, consistent meal timing.',
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week is the lean-mass anchor. Glucagon side means more flexibility with cardio than semaglutide.',
      timing: 'Train morning when nausea is lowest. Pre-workout meal of protein + slow carb 60-90min out.',
      cautions: ['Reduce volume during titration', 'Watch for heart-rate elevation on glucagon side'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day',
      'Electrolyte mix daily',
      'Vitamin D3 4000 IU',
      'Creatine 5g/day',
    ],
    lifestyleNotes: [
      'Sleep 7-9h consistently',
      'Walk 8-10k steps daily',
      'Limit alcohol — already-elevated resting metabolism is hard on the liver',
    ],
  }),
  g({
    peptideId: 'survodutide',
    displayName: 'Survodutide',
    adjustments: ['higher_protein', 'hydration_plus', 'electrolyte_plus'],
    proteinGPerLbRange: [1.0, 1.2],
    hydrationMultiplier: 1.3,
    microEmphasis: ['B12', 'sodium', 'potassium', 'magnesium'],
    foodsEmphasize: ['lean protein', 'fish', 'Greek yogurt', 'leafy greens'],
    foodsAvoid: ['ultra-processed sugars', 'large single-sitting meals'],
    summary:
      'Survodutide (GLP-1/glucagon dual agonist) targets both fat oxidation and appetite. Same protein-first approach as the GLP-1 class. Pair with consistent training to direct the metabolic boost toward lean tissue.',
    prompt: 'Survodutide users: protein priority, hydration + electrolytes, daily lifting.',
    fitnessGuidance: {
      emphasis: 'Resistance training 3-4x/week + zone-2 cardio. Glucagon side rewards aerobic conditioning.',
      timing: 'Morning training when energy is highest.',
      cautions: ['Reduce volume during titration', 'Pre-hydrate before training'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day',
      'Electrolyte mix daily',
      'Vitamin D3 4000 IU',
      'Creatine 5g/day',
    ],
    lifestyleNotes: [
      'Sleep 7-9h',
      'Walk 8-10k steps daily',
      'Limit alcohol',
    ],
  }),

  // ── GH secretagogue additions ────────────────────────────────────────────
  g({
    peptideId: 'ghrp-2',
    displayName: 'GHRP-2',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.2],
    foodsEmphasize: ['protein-rich breakfast', 'leafy greens'],
    foodsAvoid: ['sugar 2h before bedtime dose'],
    summary:
      'GHRP-2 stimulates GH release with mild appetite stimulation (less than GHRP-6). Empty-stomach dose; avoid carbs/insulin 2h pre-dose.',
    prompt: 'GHRP-2 users: empty-stomach dose, no carbs 2h pre-dose, protein-forward diet.',
    fitnessGuidance: {
      emphasis: 'Heavy resistance training 4x/week. Appetite stimulation makes hitting protein targets easier.',
      timing: 'Late afternoon training; bedtime dose.',
      cautions: ['Cortisol/prolactin bump is mild but can interfere with sleep if dosed too late'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 400mg before bed',
      'Zinc 25mg/day',
      'Vitamin D3 4000 IU',
      'Creatine 5g/day',
    ],
    lifestyleNotes: [
      'Bedtime within 30min of dose',
      'No alcohol within 4h',
      'Last meal 2-3h pre-dose',
    ],
  }),
  g({
    peptideId: 'ghrp-6',
    displayName: 'GHRP-6',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.3],
    foodsEmphasize: ['protein-dense meals', 'fiber'],
    foodsAvoid: ['simple sugars 2h pre-dose', 'processed snacks (appetite makes them tempting)'],
    summary:
      'GHRP-6 has the strongest appetite stimulation in the class — useful for bulking, dangerous for cutting. Protein priority + structured meal plan keep the hunger from derailing goals.',
    prompt: 'GHRP-6 users: structured meals, high protein, expect strong hunger.',
    fitnessGuidance: {
      emphasis: 'Heavy resistance training 4-5x/week — pair the hunger with high-volume training to drive lean mass.',
      timing: 'Late afternoon training; bedtime dose; first meal 30-60min post-dose.',
      cautions: ['Cortisol/prolactin elevation', 'Avoid for cutting cycles — fights against deficit'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 400mg before bed',
      'Zinc 25mg/day',
      'Vitamin D3 4000 IU',
      'Creatine 5g/day',
    ],
    lifestyleNotes: [
      'Pre-plan post-dose meals to avoid junk-food spirals',
      'Sleep 8h+ to support the calorie surplus',
    ],
  }),
  g({
    peptideId: 'hexarelin',
    displayName: 'Hexarelin',
    adjustments: ['lower_carb_pm', 'higher_protein'],
    proteinGPerLbRange: [1.0, 1.2],
    foodsAvoid: ['sugar 2h pre-dose'],
    summary:
      'Hexarelin is the strongest GHRP — also the highest cortisol/prolactin elevation. Limit cycles to 4-6 weeks. Empty stomach + no pre-dose carbs critical.',
    prompt: 'Hexarelin users: empty stomach, short cycles only, monitor cortisol/prolactin.',
    fitnessGuidance: {
      emphasis: 'Heavy compound lifts 3-4x/week. Skip excess cardio — cortisol is already elevated.',
      timing: 'Single late-evening dose. Train earlier in day.',
      cautions: ['Limit cycles to 4-6 weeks', 'Take 8-12 weeks off between cycles', 'Watch for water retention'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 400mg before bed',
      'Phosphatidylserine 200-400mg/day (cortisol management)',
      'Vitamin C 1g/day',
      'Vitamin D3 4000 IU',
    ],
    lifestyleNotes: [
      'Stress management is non-negotiable on Hexarelin (high cortisol risk)',
      'Sleep 8h+ minimum',
      'No alcohol during cycle',
    ],
  }),
  g({
    peptideId: 'hgh-fragment-176-191',
    displayName: 'HGH Fragment 176-191',
    adjustments: ['hydration_plus'],
    proteinGPerLbRange: [0.9, 1.1],
    hydrationMultiplier: 1.15,
    foodsEmphasize: ['lean protein', 'leafy greens'],
    foodsAvoid: ['simple carbs around dose'],
    summary:
      'HGH fragment 176-191 is GH\'s lipolytic fragment — promotes fat loss without IGF-1 effects. Empty-stomach dosing maximizes the lipolytic window.',
    prompt: 'HGH frag 176-191 users: empty stomach, fasted-cardio synergy, protein priority.',
    fitnessGuidance: {
      emphasis: 'Fasted morning cardio compounds the lipolytic effect (similar to AOD-9604). Add resistance for lean mass.',
      timing: '2-3 morning doses spaced 4-6h, ideally before fasted activity.',
      cautions: ['Don\'t train to failure on empty stomach', 'Eat protein within 60min post-cardio'],
    },
    vitaminEmphasis: [
      'L-carnitine 1-2g/day',
      'Caffeine 100-200mg pre-cardio',
      'B-complex 50mg/day',
      'Magnesium 300mg/day',
    ],
    lifestyleNotes: [
      'Sleep 7-9h',
      'Morning sun exposure within 60min of waking',
      'Hydration 0.7 oz/lb minimum',
    ],
  }),

  // ── Healing peptide additions ────────────────────────────────────────────
  g({
    peptideId: 'kpv',
    displayName: 'KPV',
    adjustments: ['collagen_emphasis'],
    microEmphasis: ['vitamin C', 'zinc', 'glycine'],
    foodsEmphasize: ['anti-inflammatory foods', 'omega-3 rich fish', 'leafy greens', 'turmeric'],
    foodsAvoid: ['inflammatory ultra-processed foods', 'excess seed oils'],
    summary:
      'KPV is α-MSH\'s anti-inflammatory tripeptide. Pairs hand-in-glove with anti-inflammatory diet (omega-3, polyphenols, low refined sugar). Great for gut + skin protocols.',
    prompt: 'KPV users: anti-inflammatory diet (omega-3, polyphenols, low sugar).',
    fitnessGuidance: {
      emphasis: 'Use during recovery weeks or when inflammation is the limiting factor. Train to feel, not numbers.',
      timing: 'Bedtime dose for skin/gut protocols.',
      cautions: ['Don\'t mask training-induced soreness with KPV — hides over-training signal'],
    },
    vitaminEmphasis: [
      'Vitamin C 1000mg/day',
      'Zinc 15-25mg + copper 1-2mg',
      'Omega-3 EPA+DHA 2-3g/day',
      'Curcumin 500-1000mg/day with black pepper',
    ],
    lifestyleNotes: [
      'Sleep 7-9h',
      'Stress management — chronic stress drives the inflammation KPV is fighting',
      'Limit alcohol during course',
    ],
  }),
  g({
    peptideId: 'll-37',
    displayName: 'LL-37',
    adjustments: ['none'],
    microEmphasis: ['vitamin D', 'zinc'],
    foodsEmphasize: ['vitamin D-rich foods', 'fatty fish', 'leafy greens'],
    summary:
      'LL-37 is a host-defense peptide. Vitamin D drives natural cathelicidin (LL-37) expression, so adequate D status amplifies the effect. Used in chronic infection / biofilm protocols.',
    prompt: 'LL-37 users: vitamin D status optimization, zinc sufficiency, anti-inflammatory diet.',
    fitnessGuidance: {
      emphasis: 'Light to moderate training only during active infection / biofilm protocol. Don\'t add training stress when immune system is already engaged.',
      timing: 'Dose timing flexible — protocol-driven.',
      cautions: ['Avoid HIIT during course', 'Watch for transient fatigue — normal'],
    },
    vitaminEmphasis: [
      'Vitamin D3 5000 IU + K2 100mcg (target 60-80 ng/mL)',
      'Zinc 25mg + copper 2mg',
      'Vitamin C 1000-2000mg/day',
      'Omega-3 2-3g EPA+DHA',
    ],
    lifestyleNotes: [
      'Sun exposure for endogenous D production',
      'Sleep 8h+ during course',
      'Address gut health (most LL-37 protocols are gut-related)',
    ],
  }),
  g({
    peptideId: 'ghk-cu',
    displayName: 'GHK-Cu',
    adjustments: ['collagen_emphasis'],
    microEmphasis: ['vitamin C', 'zinc', 'copper', 'glycine'],
    foodsEmphasize: ['bone broth', 'collagen protein', 'liver', 'oysters'],
    summary:
      'GHK-Cu is a copper-peptide that drives collagen, elastin, and tissue regeneration. Pair with vitamin C and glycine. Topical and injectable both benefit.',
    prompt: 'GHK-Cu users: collagen + vitamin C + glycine. Excellent for skin/hair protocols.',
    fitnessGuidance: {
      emphasis: 'Resistance training supports the collagen-synthesis signal. Avoid excessive cardio that competes for the regeneration window.',
      timing: 'Evening dose; topical applications post-shower.',
      cautions: ['Sun-protect treated skin', 'Avoid retinol same day as topical GHK-Cu'],
    },
    vitaminEmphasis: [
      'Vitamin C 1000-2000mg/day',
      'Glycine 5-10g/day',
      'Zinc 15mg + copper from food (not extra supplement — GHK-Cu provides)',
      'Vitamin A 5000 IU/day',
    ],
    lifestyleNotes: [
      'Sleep 7-9h — collagen synthesis happens during deep sleep',
      'Hydration 0.7 oz/lb minimum',
      'Avoid smoking — destroys the collagen GHK-Cu builds',
    ],
  }),

  // ── Cognitive / longevity additions ──────────────────────────────────────
  g({
    peptideId: 'dihexa',
    displayName: 'Dihexa',
    adjustments: ['none'],
    foodsEmphasize: ['choline-rich foods (eggs, liver)', 'omega-3 rich fish'],
    summary:
      'Dihexa is a potent neurogenic peptide (HGF agonist). Pair with adequate choline intake to support the neurotransmitter pathways it modulates.',
    prompt: 'Dihexa users: choline + omega-3 emphasis.',
    fitnessGuidance: {
      emphasis: 'Pair with skill acquisition or learning — Dihexa amplifies BDNF, training new motor patterns leverages the effect.',
      timing: 'Morning dose for daytime cognitive work.',
      cautions: ['Limited human data — start low and slow'],
    },
    vitaminEmphasis: [
      'Choline (alpha-GPC 300-600mg/day or CDP-choline 250-500mg)',
      'Omega-3 EPA+DHA 2-3g/day',
      'B-complex 50mg/day',
      'Phosphatidylserine 100-200mg/day',
    ],
    lifestyleNotes: [
      'Active learning during dose window (instrument, language, complex skill)',
      'Sleep 7-9h — memory consolidation depends on it',
      'Limit alcohol — antagonizes BDNF',
    ],
  }),
  g({
    peptideId: 'nad-plus',
    displayName: 'NAD+',
    adjustments: ['none'],
    microEmphasis: ['niacin', 'tryptophan'],
    foodsEmphasize: ['liver', 'tuna', 'salmon', 'mushrooms'],
    summary:
      'NAD+ supports mitochondrial function and longevity pathways. Adequate niacin/tryptophan in diet supports endogenous synthesis even when supplementing.',
    prompt: 'NAD+ users: niacin + tryptophan-rich diet, time-restricted eating compounds the longevity signal.',
    fitnessGuidance: {
      emphasis: 'Zone-2 cardio 3-4x/week stacks beautifully — both pathways grow mitochondrial density.',
      timing: 'Morning IV/SQ dose. Train within 2h for compounded effect.',
      cautions: ['Flushing (especially with niacin form)', 'Don\'t use to mask poor sleep'],
    },
    vitaminEmphasis: [
      'B-complex 50mg/day',
      'CoQ10 100-200mg with fatty meal',
      'Magnesium glycinate 300-400mg/day',
      'Resveratrol 250-500mg/day with fat',
    ],
    lifestyleNotes: [
      'Time-restricted eating (12-14h fast) compounds the AMPK/sirtuin signal',
      'Cold exposure 2-3x/week',
      'Sleep 7-9h',
    ],
  }),
  g({
    peptideId: 'ss-31',
    displayName: 'SS-31 (Elamipretide)',
    adjustments: ['none'],
    foodsEmphasize: ['antioxidant-rich produce', 'omega-3 rich fish'],
    summary:
      'SS-31 (Elamipretide) targets the inner mitochondrial membrane, reducing oxidative damage. Pair with antioxidant diet and avoid pro-oxidant insults (alcohol, smoking, ultra-processed foods).',
    prompt: 'SS-31 users: antioxidant-rich diet, avoid pro-oxidant insults.',
    fitnessGuidance: {
      emphasis: 'Zone-2 + resistance training. SS-31 protects mito from training stress, allowing slightly higher volume.',
      timing: 'Morning dose.',
      cautions: ['Don\'t use to outrun overtraining', 'Recovery still required'],
    },
    vitaminEmphasis: [
      'CoQ10 200mg with fatty meal',
      'Alpha-lipoic acid 300-600mg/day',
      'Omega-3 EPA+DHA 2-3g/day',
      'Vitamin E 200-400 IU/day with food',
    ],
    lifestyleNotes: [
      'Limit alcohol',
      'Cold exposure 2-3x/week',
      'Sleep 7-9h',
    ],
  }),

  // ── Sexual / reproductive ────────────────────────────────────────────────
  g({
    peptideId: 'pt-141',
    displayName: 'PT-141 (Bremelanotide)',
    adjustments: ['none'],
    foodsAvoid: ['heavy meals 2h pre-dose (slows absorption + amplifies nausea)'],
    summary:
      'PT-141 (Bremelanotide) is a melanocortin receptor agonist used for sexual function. Avoid heavy meals 2 hours before dose to reduce nausea side effect.',
    prompt: 'PT-141 users: empty-ish stomach 2h pre-dose, hydrate well.',
    fitnessGuidance: {
      emphasis: 'No specific training synergy.',
      timing: 'Dose 1-2h before intended use.',
      cautions: ['Nausea is the dose-limiting side effect', 'Watch BP — can elevate'],
    },
    vitaminEmphasis: [
      'Magnesium glycinate 300mg/day (BP support)',
      'L-citrulline 3-6g/day (synergistic with MC4R agonism)',
    ],
    lifestyleNotes: [
      'Hydrate well pre-dose',
      'Avoid alcohol within 4h pre-dose',
    ],
  }),
  g({
    peptideId: 'kisspeptin-10',
    displayName: 'Kisspeptin-10',
    adjustments: ['higher_protein'],
    proteinGPerLbRange: [0.9, 1.1],
    microEmphasis: ['zinc', 'vitamin D', 'magnesium'],
    foodsEmphasize: ['oysters', 'red meat', 'eggs', 'leafy greens'],
    summary:
      'Kisspeptin-10 stimulates GnRH/LH/FSH axis. Pair with foundational T-support nutrients (zinc, D, magnesium). Adequate protein supports the upstream hormonal cascade.',
    prompt: 'Kisspeptin users: zinc + D + magnesium, protein-forward diet.',
    fitnessGuidance: {
      emphasis: 'Heavy compound lifts 3-4x/week — leverages the natural T pulse.',
      timing: 'Morning training. Daily or EOD dose.',
      cautions: ['Don\'t over-do volume — cortisol antagonizes the LH pulse'],
    },
    vitaminEmphasis: [
      'Zinc 25mg + copper 2mg',
      'Vitamin D3 5000 IU + K2',
      'Magnesium glycinate 400mg/day',
      'Boron 3-6mg/day',
    ],
    lifestyleNotes: [
      'Sleep 8h+ — LH pulses are sleep-dependent',
      'Stress management essential',
      'Limit alcohol — kills the LH pulse',
    ],
  }),

  // ── Antioxidant / utility ────────────────────────────────────────────────
  g({
    peptideId: 'glutathione',
    displayName: 'Glutathione',
    adjustments: ['none'],
    microEmphasis: ['sulfur', 'selenium', 'vitamin C'],
    foodsEmphasize: ['cruciferous vegetables', 'garlic', 'onions', 'avocado', 'whey protein'],
    foodsAvoid: ['alcohol (depletes GSH)', 'ultra-processed foods'],
    summary:
      'Glutathione is the body\'s master antioxidant. Pair with sulfur-rich foods and cofactors (NAC, glycine, vitamin C). Liposomal/IV/SQ all work — oral is poorly absorbed.',
    prompt: 'Glutathione users: sulfur-rich diet (crucifers, alliums), NAC + glycine cofactors.',
    fitnessGuidance: {
      emphasis: 'Use post-heavy-training to support recovery. Light to moderate training otherwise.',
      timing: 'Morning or post-workout.',
      cautions: ['Sulfur smell post-IV is normal'],
    },
    vitaminEmphasis: [
      'NAC 600-1200mg/day',
      'Glycine 5g/day',
      'Vitamin C 1000-2000mg/day',
      'Selenium 100-200mcg/day',
      'Alpha-lipoic acid 300-600mg/day',
    ],
    lifestyleNotes: [
      'Cruciferous vegetables daily (sulforaphane drives endogenous GSH)',
      'Limit alcohol',
      'Sleep 7-9h',
    ],
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
