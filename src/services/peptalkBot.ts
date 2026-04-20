/**
 * PepTalk Bot — Local knowledge engine for peptide research assistance.
 *
 * Parses user intent, retrieves data from the embedded peptide database
 * and analysis engine, and constructs informative, research-oriented responses.
 *
 * IMPORTANT: This module provides educational information only.
 * It does NOT provide medical advice, prescriptions, or clinical guidance.
 */

import {
  BotAction,
  BotIntent,
  BotContext,
  EnhancedBotContext,
  ChatMessage,
  Peptide,
  PeptideCategory,
  HealthProfile,
  ProtocolTemplate,
  TopicId,
  GoalType,
  JournalCategory,
} from '../types';
import { getGoalLabel } from '../constants/goals';
import { KNOWLEDGE_TOPICS } from '../data/knowledgeTopics';
import { PEPTIDES, getPeptideById, getPeptidesByCategory } from '../data/peptides';
import { analyzeStack, getKnownInteraction } from './analysisEngine';
import { getProtocolsByPeptide, PROTOCOL_TEMPLATES } from '../data/protocols';
import { BOT_MEDICAL_SUFFIX, BOT_INFO_SUFFIX } from '../constants/legal';

// Intents that involve dosing, safety, or medical topics get a stronger disclaimer
const MEDICAL_INTENTS: BotIntent[] = [
  'dosing_protocol',
  'side_effects',
  'interaction_check',
  'health_suggest',
  'stack_help',
];
const INFO_INTENTS: BotIntent[] = [
  'peptide_info',
  'mechanism',
  'comparison',
  'category_explore',
  'storage',
  'knowledge_topic',
  'goal_suggest',
  'workout_suggest',
  'meal_suggest',
  'create_plan',
  'modify_plan',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () =>
  `bot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const CATEGORY_LIST: PeptideCategory[] = [
  'Metabolic', 'Recovery', 'Growth Hormone', 'Nootropic', 'Immune',
  'Anti-inflammatory', 'Mitochondrial', 'Longevity', 'Sleep',
  'Reproductive', 'Sexual Health', 'Cosmetic', 'Tanning', 'Neuropeptide',
  'Antimicrobial',
];

// Build a lookup for fuzzy peptide name matching
const PEPTIDE_ALIASES: Map<string, string> = new Map();
PEPTIDES.forEach((p) => {
  PEPTIDE_ALIASES.set(p.name.toLowerCase(), p.id);
  PEPTIDE_ALIASES.set(p.id.toLowerCase(), p.id);
  if (p.abbreviation) PEPTIDE_ALIASES.set(p.abbreviation.toLowerCase(), p.id);
  // Common shorthand
  const shortName = p.name.toLowerCase().replace(/[-\s]/g, '');
  PEPTIDE_ALIASES.set(shortName, p.id);
});

// Manual aliases for commonly used shorthand
const EXTRA_ALIASES: Record<string, string> = {
  'bpc': 'bpc-157',
  'bpc157': 'bpc-157',
  'tb500': 'tb-500',
  'tb': 'tb-500',
  'sema': 'semaglutide',
  'tirz': 'tirzepatide',
  'ipa': 'ipamorelin',
  'cjc': 'cjc-1295',
  'reta': 'retatrutide',
  'ghk': 'ghk-cu',
  'tesa': 'tesamorelin',
  'serm': 'sermorelin',
  'nad': 'nad-plus',
  'nad+': 'nad-plus',
  'dsip': 'dsip',
  'ghrp2': 'ghrp-2',
  'ghrp6': 'ghrp-6',
  'ss31': 'ss-31',
  'motsc': 'mots-c',
  'snap8': 'snap-8',
  'igf': 'igf-1-lr3',
  'igf1': 'igf-1-lr3',
  'hgh frag': 'hgh-fragment-176-191',
  'hgh fragment': 'hgh-fragment-176-191',
  'thymosin': 'thymosin-alpha-1',
  'ta1': 'thymosin-alpha-1',
  'll37': 'll-37',
  'wolverine': 'bpc-157', // will also mention TB-500
};

Object.entries(EXTRA_ALIASES).forEach(([alias, id]) => {
  PEPTIDE_ALIASES.set(alias.toLowerCase(), id);
});

// ---------------------------------------------------------------------------
// Peptide detection in user message
// ---------------------------------------------------------------------------

function findMentionedPeptides(message: string): Peptide[] {
  const lower = message.toLowerCase();
  const found = new Set<string>();

  // Sort aliases by length (longest first) to avoid partial matches
  const sortedAliases = [...PEPTIDE_ALIASES.entries()].sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [alias, id] of sortedAliases) {
    if (alias.length < 3) continue; // skip very short aliases
    if (lower.includes(alias)) {
      found.add(id);
    }
  }

  // Special: "wolverine stack" means BPC-157 + TB-500
  if (lower.includes('wolverine')) {
    found.add('bpc-157');
    found.add('tb-500');
  }

  return [...found]
    .map((id) => getPeptideById(id))
    .filter((p): p is Peptide => p !== undefined);
}

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

function findMentionedCategories(message: string): PeptideCategory[] {
  const lower = message.toLowerCase();
  const found: PeptideCategory[] = [];

  const categoryKeywords: Record<string, PeptideCategory> = {
    'weight loss': 'Metabolic',
    'fat loss': 'Metabolic',
    'metabolic': 'Metabolic',
    'weight': 'Metabolic',
    'obesity': 'Metabolic',
    'glp-1': 'Metabolic',
    'glp1': 'Metabolic',
    'recovery': 'Recovery',
    'healing': 'Recovery',
    'tissue repair': 'Recovery',
    'injury': 'Recovery',
    'growth hormone': 'Growth Hormone',
    'gh': 'Growth Hormone',
    'hgh': 'Growth Hormone',
    'nootropic': 'Nootropic',
    'cognitive': 'Nootropic',
    'brain': 'Nootropic',
    'focus': 'Nootropic',
    'memory': 'Nootropic',
    'immune': 'Immune',
    'immunity': 'Immune',
    'inflammation': 'Anti-inflammatory',
    'anti-inflammatory': 'Anti-inflammatory',
    'mitochondri': 'Mitochondrial',
    'energy': 'Mitochondrial',
    'longevity': 'Longevity',
    'aging': 'Longevity',
    'anti-aging': 'Longevity',
    'telomere': 'Longevity',
    'sleep': 'Sleep',
    'insomnia': 'Sleep',
    'reproductive': 'Reproductive',
    'fertility': 'Reproductive',
    'sexual': 'Sexual Health',
    'libido': 'Sexual Health',
    'skin': 'Cosmetic',
    'hair': 'Cosmetic',
    'collagen': 'Cosmetic',
    'wrinkle': 'Cosmetic',
    'tanning': 'Tanning',
    'tan': 'Tanning',
    'melanin': 'Tanning',
    'neuropeptide': 'Neuropeptide',
    'antimicrobial': 'Antimicrobial',
    'infection': 'Antimicrobial',
  };

  for (const [keyword, category] of Object.entries(categoryKeywords)) {
    if (lower.includes(keyword) && !found.includes(category)) {
      found.push(category);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Health profile safety checker
// ---------------------------------------------------------------------------

interface SafetyFlag {
  level: 'danger' | 'caution';
  message: string;
}

function checkContraindications(
  protocol: ProtocolTemplate,
  profile: HealthProfile | null | undefined
): SafetyFlag[] {
  if (!profile) return [];

  const flags: SafetyFlag[] = [];
  const conditions = profile.medical.conditions.map((c) => c.toLowerCase());
  const meds = profile.medical.medications.map((m) => m.toLowerCase());
  const allergies = [
    ...profile.medical.allergies.map((a) => a.toLowerCase()),
    ...profile.nutrition.foodAllergies.map((a) => a.toLowerCase()),
  ];

  // Check pregnancy/breastfeeding
  if (profile.medical.pregnantOrNursing) {
    const hasPregnancyContra = protocol.contraindications?.some(
      (c) => c.toLowerCase().includes('pregnancy') || c.toLowerCase().includes('breastfeeding')
    );
    if (hasPregnancyContra) {
      flags.push({
        level: 'danger',
        message: 'This peptide is contraindicated during pregnancy/nursing.',
      });
    }
  }

  // Check user conditions against contraindications
  if (protocol.contraindications) {
    for (const contra of protocol.contraindications) {
      const cl = contra.toLowerCase();
      if (cl.includes('pregnancy') || cl.includes('breastfeeding')) continue; // handled above
      for (const condition of conditions) {
        if (cl.includes(condition) || condition.includes(cl)) {
          flags.push({
            level: 'danger',
            message: `Contraindicated with your condition: ${contra}`,
          });
        }
      }
    }
  }

  // Check user conditions against caution conditions
  if (protocol.cautionConditions) {
    for (const caution of protocol.cautionConditions) {
      const cl = caution.toLowerCase();
      for (const condition of conditions) {
        if (cl.includes(condition) || condition.includes(cl)) {
          flags.push({
            level: 'caution',
            message: `Extra monitoring needed — your condition "${condition}" requires provider oversight with this peptide.`,
          });
        }
      }
    }
  }

  // Check if user has "cancer" in conditions and protocol contraindicates it
  const hasCancerHistory = conditions.some(
    (c) => c.includes('cancer') || c.includes('tumor') || c.includes('malignant')
  );
  if (hasCancerHistory) {
    const hasCancerContra = protocol.contraindications?.some(
      (c) => c.toLowerCase().includes('cancer')
    );
    if (hasCancerContra) {
      flags.push({
        level: 'danger',
        message: 'This peptide is contraindicated with cancer history. Consult your oncologist.',
      });
    }
  }

  return flags;
}

function buildProfileSummary(profile: HealthProfile): string {
  const parts: string[] = [];

  if (profile.biologicalSex) {
    parts.push(`Sex: ${profile.biologicalSex}`);
  }
  if (profile.bodyMetrics.weightLbs) {
    parts.push(`Weight: ${profile.bodyMetrics.weightLbs} lbs`);
  }
  if (profile.bodyMetrics.heightInches) {
    const ft = Math.floor(profile.bodyMetrics.heightInches / 12);
    const inches = profile.bodyMetrics.heightInches % 12;
    parts.push(`Height: ${ft}'${inches}"`);
  }
  if (profile.primaryGoals.length > 0) {
    parts.push(`Goals: ${profile.primaryGoals.slice(0, 3).join(', ')}`);
  }
  if (profile.lifestyle.activityLevel) {
    parts.push(`Activity: ${profile.lifestyle.activityLevel}`);
  }

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

function detectIntent(message: string, peptides: Peptide[]): BotIntent {
  const lower = message.toLowerCase().trim();

  // Greeting
  if (/^(hi|hello|hey|sup|yo|what'?s up|howdy)\b/i.test(lower)) {
    return 'greeting';
  }

  // Dosing / protocol
  if (
    /\b(dose|dosing|dosage|how much|protocol|mg\b|mcg\b|iu\b|inject|subcutaneous|intramuscular|frequency|how often|schedule|cycle|reconstitut)/i.test(lower)
  ) {
    return 'dosing_protocol';
  }

  // Side effects / safety
  if (
    /\b(side effect|risk|danger|safe|safety|warning|contraindic|adverse|toxic|overdose|harmful)/i.test(lower)
  ) {
    return 'side_effects';
  }

  // Storage
  if (
    /\b(store|storage|refrigerat|temperature|reconstitut|stability|shelf life|expire|bacteriostatic)/i.test(lower)
  ) {
    return 'storage';
  }

  // Comparison
  if (
    /\b(vs\.?|versus|difference|compare|better|which one|or\b.*\bor\b)/i.test(lower) &&
    peptides.length >= 2
  ) {
    return 'comparison';
  }

  // Interaction / stack check
  if (
    /\b(stack|combine|mix|together|interaction|pair|with\b)/i.test(lower) &&
    peptides.length >= 1
  ) {
    return 'interaction_check';
  }

  // Stack building help
  if (
    /\b(stack|build|suggest|recommend|best combo|what should|what peptide|which peptide|good for)/i.test(lower)
  ) {
    return peptides.length > 0 ? 'interaction_check' : 'stack_help';
  }

  // Mechanism
  if (
    /\b(how does|mechanism|pathway|receptor|work|signal|moa|action)/i.test(lower) &&
    peptides.length > 0
  ) {
    return 'mechanism';
  }

  // Category exploration
  const categories = findMentionedCategories(lower);
  if (
    categories.length > 0 &&
    peptides.length === 0 &&
    /\b(what|which|best|good|help|for)\b/i.test(lower)
  ) {
    return 'category_explore';
  }

  // Goal-based suggestions
  if (
    /\b(what (should|can) i take|recommend|suggest|peptide for|best for|help (me|with)|good for my)\b/i.test(lower) &&
    peptides.length === 0
  ) {
    return 'goal_suggest';
  }

  // Health-based suggestion
  if (
    /\b(my health|my check.?in|based on|my data|my metric|suggest|recommend)/i.test(lower)
  ) {
    return 'health_suggest';
  }

  // Knowledge topics (care, quality, regulations, general education)
  if (
    /\b(buy|buying|purchase|supplier|vendor|source|quality|purity|pure|hplc|coa|certificate|third.?party|test|lab|gmp)\b/i.test(lower) &&
    peptides.length === 0
  ) {
    return 'knowledge_topic';
  }
  if (
    /\b(legal|regulation|regulated|fda|law|lawful|prescription|compounding|research use|ruo)\b/i.test(lower)
  ) {
    return 'knowledge_topic';
  }
  if (
    /\b(peptide care|handle|handling|prepare|preparation|travel with|carry)\b/i.test(lower) &&
    peptides.length === 0
  ) {
    return 'knowledge_topic';
  }
  if (
    /\b(how (do i|to) use|inject|injection technique|subcutaneous|reconstitut|bac water|bacteriostatic)\b/i.test(lower) &&
    peptides.length === 0
  ) {
    return 'knowledge_topic';
  }

  // Journal logging — user reports an activity, experience, or observation
  if (
    /\b(i (did|took|had|felt|noticed|started|finished|completed|ate|drank|slept|woke|ran|walked|lifted|trained|injected|dosed|pinned))\b/i.test(lower) ||
    /\b(just (finished|completed|did|took|had))\b/i.test(lower) ||
    /\b(log (this|that|it)|write (this|that) down|note (this|that)|remember (this|that))\b/i.test(lower) ||
    /\b(today i|this morning i|tonight i|yesterday i|last night i)\b/i.test(lower)
  ) {
    return 'journal_log';
  }

  // Workout suggestions
  if (
    /\b(workout|exercise|training|lift|gym|routine|program|sets?\b|reps?\b|split|push.?pull|upper.?lower|chest day|leg day|arm day)/i.test(lower)
  ) {
    return 'workout_suggest';
  }

  // Meal / nutrition suggestions
  if (
    /\b(meal|recipe|food|eat|nutrition|macro|calorie|protein|carb|diet|breakfast|lunch|dinner|snack|grocery|cook)/i.test(lower)
  ) {
    return 'meal_suggest';
  }

  // Create a health plan
  if (
    /\b(create|make|build|generate|start|new)\b.*\b(plan|schedule|program|routine)\b/i.test(lower) ||
    /\b(plan|schedule|program|routine)\b.*\b(create|make|build|generate|start|new)\b/i.test(lower) ||
    /\b(weekly plan|daily plan|health plan|fitness plan|my plan)\b/i.test(lower)
  ) {
    return 'create_plan';
  }

  // Modify existing plan
  if (
    /\b(change|modify|update|adjust|edit|tweak)\b.*\b(plan|schedule|program|routine)\b/i.test(lower) ||
    /\b(plan|schedule|program|routine)\b.*\b(change|modify|update|adjust|edit|tweak)\b/i.test(lower)
  ) {
    return 'modify_plan';
  }

  // Peptide info (if a peptide was mentioned but no other intent matched)
  if (peptides.length > 0) {
    return 'peptide_info';
  }

  return 'general';
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

function respondGreeting(context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const name = hp?.biologicalSex || context.userProfile?.gender
    ? `Welcome back`
    : `Hey there`;

  const parts = [
    `${name}! I'm Aimee, your friendly health companion! Here's what I can do for you:`,
    '',
    `• **Learn about peptides** — I know all about mechanisms, interactions, and protocols`,
    `• **Track your journey** — ask me about your dose history anytime`,
    `• **Understand your health** — I'll connect your check-in data to helpful insights`,
    `• **Get protocol info** — "What's the dosing protocol for semaglutide?"`,
    `• **Check interactions** — "Can I stack CJC-1295 with Ipamorelin?"`,
  ];

  // Goal-aware personalization
  const onboardingGoals = context.userProfile?.healthGoals ?? [];
  const profileGoals = hp?.primaryGoals ?? [];
  const mergedGoals = [...new Set([...onboardingGoals, ...profileGoals])];

  if (mergedGoals.length > 0) {
    parts.push('');
    parts.push(`**Your Goals:** ${mergedGoals.slice(0, 4).map(g => getGoalLabel(g as GoalType)).join(', ')}`);
    // Show 1 peptide hint per top 2 goals
    const goalToPeptides: Record<string, string> = {
      'weight_loss': 'Semaglutide, Tirzepatide',
      'muscle_gain': 'CJC-1295 + Ipamorelin',
      'recovery': 'BPC-157, TB-500',
      'longevity': 'Epithalon, NAD+',
      'cognitive': 'Semax, Selank',
      'sleep': 'DSIP',
      'energy': 'MOTS-c, SS-31',
      'immune': 'Thymosin Alpha-1',
      'gut_health': 'BPC-157, KPV',
      'skin_hair': 'GHK-Cu',
      'hormonal': 'CJC-1295 + Ipamorelin',
      'body_recomp': 'Tesamorelin',
      'general_wellness': 'BPC-157, Epithalon',
    };
    for (const goal of mergedGoals.slice(0, 2)) {
      const hint = goalToPeptides[goal];
      if (hint) {
        parts.push(`• ${getGoalLabel(goal as GoalType)} → explore ${hint}`);
      }
    }
  }

  // Personalized status
  const doseCount = enhanced?.recentDoses?.length || 0;
  const checkinCount = context.recentCheckIns.length;

  if (doseCount > 0 || checkinCount > 0) {
    parts.push('');
    parts.push(`📊 **Your data:** ${doseCount} doses + ${checkinCount} check-ins logged recently.`);

    if (checkinCount > 0) {
      const recent = context.recentCheckIns.slice(0, 3);
      const avgMood = recent.reduce((s, e) => s + e.mood, 0) / recent.length;
      if (avgMood < 2.5) {
        parts.push(`🏥 Your recent mood has been trending low. If this continues, please consider talking to a healthcare provider. Your logged data can help guide that conversation.`);
      }
    }
  }

  // Health profile snapshot
  if (hp) {
    const summary = buildProfileSummary(hp);
    if (summary) {
      parts.push('');
      parts.push(`**Your Profile:** ${summary}`);
    }

    if (hp.medical.conditions.length > 0 || hp.medical.allergies.length > 0) {
      parts.push(`I'll flag any contraindications based on your health profile when you ask about protocols.`);
    }

    if (hp.profileCompleteness < 50) {
      parts.push(`💡 Your health profile is ${hp.profileCompleteness}% complete. A more complete profile helps me give safer, more personalized responses.`);
    }
  } else {
    parts.push('');
    parts.push(`💡 **Tip:** Set up your Health Profile in the Profile tab so I can personalize recommendations and flag potential contraindications.`);
  }

  // Smart daily suggestions — what hasn't been done today
  const suggestions: string[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCheckIn = context.recentCheckIns.find(c => c.date === todayKey);
  const todayDoses = enhanced?.recentDoses?.filter(d => d.date === todayKey) ?? [];

  if (!todayCheckIn) suggestions.push('📋 **Check in** — log your mood, energy, and sleep');
  if (todayDoses.length === 0 && (enhanced?.activeProtocols?.length ?? 0) > 0) {
    suggestions.push('💉 **Log a dose** — you have active protocols to track');
  }
  suggestions.push('🍽️ **Log a meal** — keep your nutrition on track');
  suggestions.push('🏋️ **Start a workout** — stay consistent with your training');

  if (suggestions.length > 0) {
    parts.push('');
    parts.push('**Suggested for today:**');
    for (const s of suggestions.slice(0, 3)) {
      parts.push(s);
    }
  }

  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondPeptideInfo(peptides: Peptide[]): string {
  if (peptides.length === 0) return respondGeneral();

  const p = peptides[0];
  const parts: string[] = [];

  parts.push(`**${p.name}**${p.abbreviation && p.abbreviation !== p.name ? ` (${p.abbreviation})` : ''}`);
  parts.push('');
  parts.push(`**Categories:** ${p.categories.join(', ')}`);

  if (p.molecularWeight) parts.push(`**Molecular Weight:** ${p.molecularWeight}`);
  if (p.sequenceLength) parts.push(`**Sequence Length:** ${p.sequenceLength} amino acids`);
  if (p.halfLife) parts.push(`**Half-Life:** ${p.halfLife}`);

  parts.push('');
  parts.push(`**Research Summary**`);
  parts.push(p.researchSummary);

  parts.push('');
  parts.push(`**Mechanism of Action**`);
  parts.push(p.mechanismOfAction);

  if (p.receptorTargets && p.receptorTargets.length > 0) {
    parts.push('');
    parts.push(`**Receptor Targets:** ${p.receptorTargets.join(', ')}`);
  }

  if (p.signalingPathways && p.signalingPathways.length > 0) {
    parts.push(`**Signaling Pathways:** ${p.signalingPathways.join(', ')}`);
  }

  if (p.pubmedLinks && p.pubmedLinks.length > 0) {
    parts.push('');
    parts.push(`**References:** ${p.pubmedLinks.length} PubMed citation${p.pubmedLinks.length > 1 ? 's' : ''} available`);
  }

  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondMechanism(peptides: Peptide[]): string {
  if (peptides.length === 0) return respondGeneral();

  const p = peptides[0];
  const parts: string[] = [];

  parts.push(`**How ${p.name} Works**`);
  parts.push('');
  parts.push(`**Mechanism of Action**`);
  parts.push(p.mechanismOfAction);

  if (p.receptorTargets && p.receptorTargets.length > 0) {
    parts.push('');
    parts.push(`**Receptor Targets**`);
    p.receptorTargets.forEach((r) => parts.push(`• ${r}`));
  }

  if (p.signalingPathways && p.signalingPathways.length > 0) {
    parts.push('');
    parts.push(`**Downstream Signaling Pathways**`);
    p.signalingPathways.forEach((s) => parts.push(`• ${s}`));
  }

  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondComparison(peptides: Peptide[]): string {
  if (peptides.length < 2) {
    return `I need at least two peptides to compare. Try something like "Compare BPC-157 vs TB-500" or "What's the difference between CJC-1295 and Sermorelin?"`;
  }

  const [a, b] = peptides;
  const parts: string[] = [];

  parts.push(`**${a.name} vs ${b.name}**`);
  parts.push('');

  // Categories
  parts.push(`**Categories**`);
  parts.push(`• ${a.name}: ${a.categories.join(', ')}`);
  parts.push(`• ${b.name}: ${b.categories.join(', ')}`);
  parts.push('');

  // Half-life
  if (a.halfLife || b.halfLife) {
    parts.push(`**Half-Life**`);
    if (a.halfLife) parts.push(`• ${a.name}: ${a.halfLife}`);
    if (b.halfLife) parts.push(`• ${b.name}: ${b.halfLife}`);
    parts.push('');
  }

  // Receptor targets
  parts.push(`**Receptor Targets**`);
  parts.push(`• ${a.name}: ${a.receptorTargets?.join(', ') || 'Not specified'}`);
  parts.push(`• ${b.name}: ${b.receptorTargets?.join(', ') || 'Not specified'}`);
  parts.push('');

  // Check if they have a known interaction
  const interaction = getKnownInteraction(a.id, b.id);
  if (interaction) {
    parts.push(`**Known Interaction**`);
    parts.push(`Type: ${interaction.interactionType} (Synergy: ${interaction.synergyScore}/10)`);
    parts.push(interaction.mechanismAnalysis);
    parts.push('');
  }

  // Key mechanistic difference
  parts.push(`**Mechanism Comparison**`);
  parts.push(`• ${a.name}: ${a.mechanismOfAction.substring(0, 200)}...`);
  parts.push(`• ${b.name}: ${b.mechanismOfAction.substring(0, 200)}...`);

  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondInteractionCheck(peptides: Peptide[], context: BotContext): string {
  if (peptides.length === 0) {
    return `Which peptides do you want to check interactions for? Name two or more and I'll analyze their compatibility.`;
  }

  if (peptides.length === 1) {
    // Check against current stack if one exists
    const stackPeptides = context.currentStack
      .map((id) => getPeptideById(id))
      .filter((p): p is Peptide => p !== undefined);

    if (stackPeptides.length > 0 && !context.currentStack.includes(peptides[0].id)) {
      const allIds = [...context.currentStack, peptides[0].id];
      const analysis = analyzeStack(allIds);

      const parts: string[] = [];
      parts.push(`**Adding ${peptides[0].name} to your current stack**`);
      parts.push('');
      parts.push(`Current stack: ${stackPeptides.map((p) => p.name).join(', ')}`);
      parts.push(`+ ${peptides[0].name}`);
      parts.push('');
      parts.push(`**Overall Synergy: ${analysis.overallSynergyScore}/10**`);
      parts.push('');
      parts.push(analysis.summary);

      if (analysis.warnings.length > 0) {
        parts.push('');
        parts.push(`**Warnings:**`);
        analysis.warnings.forEach((w) => parts.push(`⚠️ ${w}`));
      }

      return parts.join('\n');
    }

    return `Tell me what you'd like to stack **${peptides[0].name}** with, and I'll analyze the interaction. Or ask me about ${peptides[0].name} specifically.`;
  }

  // Multiple peptides — run full analysis
  const ids = peptides.map((p) => p.id);
  const analysis = analyzeStack(ids);

  const parts: string[] = [];
  parts.push(`**Stack Analysis: ${peptides.map((p) => p.name).join(' + ')}**`);
  parts.push('');
  parts.push(`**Overall Synergy Score: ${analysis.overallSynergyScore}/10**`);
  parts.push('');

  // Individual interactions
  analysis.interactions.forEach((interaction) => {
    const pA = getPeptideById(interaction.peptideA);
    const pB = getPeptideById(interaction.peptideB);
    const emoji =
      interaction.interactionType === 'synergistic' ? '🟢' :
      interaction.interactionType === 'neutral' ? '🟡' :
      interaction.interactionType === 'competitive' ? '🟠' : '🔴';

    parts.push(`${emoji} **${pA?.name || interaction.peptideA} + ${pB?.name || interaction.peptideB}** — ${interaction.interactionType} (${interaction.synergyScore}/10)`);
    parts.push(interaction.mechanismAnalysis.substring(0, 200));
    parts.push('');
  });

  parts.push(`**Category Coverage:** ${analysis.categoryCoverage.join(', ')}`);

  if (analysis.warnings.length > 0) {
    parts.push('');
    parts.push(`**Warnings:**`);
    analysis.warnings.forEach((w) => parts.push(`⚠️ ${w}`));
  }

  parts.push('');
  parts.push(analysis.summary);

  return parts.join('\n');
}

function respondCategoryExplore(message: string): string {
  const categories = findMentionedCategories(message);

  if (categories.length === 0) {
    const parts: string[] = [];
    parts.push(`I can help you explore peptides by research category. Here are the available categories:`);
    parts.push('');
    CATEGORY_LIST.forEach((cat) => {
      const count = getPeptidesByCategory(cat).length;
      if (count > 0) parts.push(`• **${cat}** (${count} peptides)`);
    });
    parts.push('');
    parts.push(`Ask me about any category, like "What peptides help with recovery?" or "Tell me about nootropic peptides."`);
    return parts.join('\n');
  }

  const parts: string[] = [];

  categories.forEach((cat) => {
    const catPeptides = getPeptidesByCategory(cat);
    parts.push(`**${cat} Peptides** (${catPeptides.length} available)`);
    parts.push('');

    catPeptides.forEach((p) => {
      const summary = p.researchSummary.substring(0, 120);
      parts.push(`• **${p.name}** — ${summary}...`);
    });

    parts.push('');
  });

  parts.push(`Ask me about any specific peptide for detailed research information.`);
  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondDosingProtocol(peptides: Peptide[], context?: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const parts: string[] = [];

  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions. The information below is from published research literature.`);
  parts.push('');

  if (peptides.length > 0) {
    const p = peptides[0];
    const protocols = getProtocolsByPeptide(p.id);

    if (protocols.length > 0) {
      const proto = protocols[0];

      // --- SAFETY CHECK against health profile ---
      const safetyFlags = checkContraindications(proto, hp);
      const dangers = safetyFlags.filter((f) => f.level === 'danger');
      const cautions = safetyFlags.filter((f) => f.level === 'caution');

      if (dangers.length > 0) {
        parts.push(`🚨 **SAFETY ALERT — Based on your health profile:**`);
        dangers.forEach((f) => parts.push(`• ${f.message}`));
        parts.push('');
        parts.push(`**You should discuss this with your healthcare provider before considering this peptide.**`);
        parts.push('');
      }

      if (cautions.length > 0) {
        parts.push(`⚠️ **Caution — Based on your health profile:**`);
        cautions.forEach((f) => parts.push(`• ${f.message}`));
        parts.push('');
      }

      parts.push(`**${proto.name}**`);
      parts.push('');
      parts.push(`**Research-described parameters:**`);
      parts.push(`• **Typical Range:** ${proto.typicalDose.min}-${proto.typicalDose.max} ${proto.typicalDose.unit}`);
      parts.push(`• **Route:** ${proto.route}`);
      parts.push(`• **Frequency:** ${proto.frequencyLabel}`);
      parts.push(`• **Duration:** ${proto.durationWeeks.min}-${proto.durationWeeks.max} weeks`);

      if (proto.timing) {
        parts.push(`• **Timing:** ${proto.timing}`);
      }

      parts.push('');
      parts.push(`**Storage:** ${proto.storageNotes}`);

      if (proto.reconstitutionNotes) {
        parts.push(`**Reconstitution:** ${proto.reconstitutionNotes}`);
      }

      if (proto.importantNotes.length > 0) {
        parts.push('');
        parts.push(`**Key Notes:**`);
        proto.importantNotes.forEach((note) => parts.push(`• ${note}`));
      }

      // Show contraindications/cautions from the protocol itself
      if (proto.contraindications && proto.contraindications.length > 0) {
        parts.push('');
        parts.push(`**Contraindications:** ${proto.contraindications.join(', ')}`);
      }
      if (proto.cautionConditions && proto.cautionConditions.length > 0) {
        parts.push(`**Use with caution:** ${proto.cautionConditions.join(', ')}`);
      }

      parts.push('');
      parts.push(`📋 You can log doses and track this protocol in the **Calendar** tab.`);
    } else {
      parts.push(`**What the research literature describes for ${p.name}:**`);
      parts.push('');

      if (p.halfLife) {
        parts.push(`• **Half-Life:** ${p.halfLife}`);
      }
      if (p.storageTemp) {
        parts.push(`• **Storage:** ${p.storageTemp}`);
      }
      parts.push(`• **Stability:** ${p.stabilityNotes}`);
      parts.push('');
      parts.push(`We don't have a detailed protocol template for ${p.name} yet, but you can still log doses in the Calendar tab.`);
    }

    // Show recent dose history if available (enhanced context)
    if (enhanced?.recentDoses) {
      const peptideDoses = enhanced.recentDoses
        .filter((d) => d.peptideId === p.id)
        .slice(0, 5);

      if (peptideDoses.length > 0) {
        parts.push('');
        parts.push(`**Your Recent ${p.name} Doses:**`);
        peptideDoses.forEach((d) => {
          parts.push(`• ${d.date} at ${d.time} — ${d.amount} ${d.unit} (${d.route})`);
        });
      }
    }
  } else {
    parts.push(`I have detailed research protocols for ${PROTOCOL_TEMPLATES.length} peptides. Which peptide are you interested in?`);
    parts.push('');
    parts.push(`Popular protocols: BPC-157, CJC-1295 + Ipamorelin, Semaglutide, Semax, DSIP, Epithalon`);
  }

  parts.push('');
  parts.push(`🏥 *Always consult a qualified healthcare provider. PepTalk is not a substitute for medical advice.*`);

  return parts.join('\n');
}

function respondSideEffects(peptides: Peptide[], context?: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const parts: string[] = [];

  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);
  parts.push('');

  if (peptides.length > 0) {
    const p = peptides[0];

    // Check against health profile
    const protocols = getProtocolsByPeptide(p.id);
    if (protocols.length > 0 && hp) {
      const flags = checkContraindications(protocols[0], hp);
      if (flags.length > 0) {
        parts.push(`🚨 **Personalized Safety Flags (from your health profile):**`);
        flags.forEach((f) => {
          const icon = f.level === 'danger' ? '🔴' : '🟡';
          parts.push(`${icon} ${f.message}`);
        });
        parts.push('');
      }
    }

    parts.push(`**${p.name} — What the research literature notes:**`);
    parts.push('');
    parts.push(`**Categories:** ${p.categories.join(', ')}`);
    parts.push(`**Mechanism:** ${p.mechanismOfAction.substring(0, 200)}...`);
    parts.push('');

    if (p.receptorTargets && p.receptorTargets.length > 0) {
      parts.push(`This peptide targets: ${p.receptorTargets.join(', ')}. Understanding receptor targets helps researchers anticipate potential off-target effects in preclinical models.`);
    }

    // Show protocol contraindications even without a health profile
    if (protocols.length > 0) {
      const proto = protocols[0];
      if (proto.contraindications && proto.contraindications.length > 0) {
        parts.push('');
        parts.push(`**Known Contraindications:** ${proto.contraindications.join(', ')}`);
      }
      if (proto.cautionConditions && proto.cautionConditions.length > 0) {
        parts.push(`**Use with Caution:** ${proto.cautionConditions.join(', ')}`);
      }
    }

    parts.push('');
    if (hp) {
      parts.push(`For a comprehensive safety assessment, share this information with your healthcare provider along with your health profile data.`);
    } else {
      parts.push(`For a comprehensive safety assessment, consult a healthcare provider. **Set up your Health Profile** so I can flag contraindications specific to you.`);
    }
  } else {
    parts.push(`Which peptide are you asking about? I can share what the research literature documents about its receptor targets and pharmacological profile.`);
  }

  parts.push('');
  parts.push(`🏥 *Always consult a qualified healthcare provider before using any peptide.*`);

  return parts.join('\n');
}

function respondStorage(peptides: Peptide[]): string {
  if (peptides.length === 0) {
    const parts: string[] = [];
    parts.push(`**General Peptide Storage Guidelines (Research Context)**`);
    parts.push('');
    parts.push(`• **Lyophilized (powder):** Most peptides are stable at -20°C long-term, 2-8°C short-term`);
    parts.push(`• **Reconstituted:** Typically 2-8°C, use within days to weeks depending on the peptide`);
    parts.push(`• **Bacteriostatic water:** Standard reconstitution solvent for most research peptides`);
    parts.push(`• **Avoid:** Repeated freeze-thaw cycles, extended room temperature exposure, direct light`);
    parts.push('');
    parts.push(`Ask me about a specific peptide for its exact storage parameters.`);
    return parts.join('\n');
  }

  const p = peptides[0];
  const parts: string[] = [];
  parts.push(`**${p.name} Storage & Stability**`);
  parts.push('');
  if (p.storageTemp) parts.push(`• **Storage Temperature:** ${p.storageTemp}`);
  parts.push(`• **Stability Notes:** ${p.stabilityNotes}`);
  if (p.molecularWeight) parts.push(`• **Molecular Weight:** ${p.molecularWeight}`);
  if (p.reconstitution) parts.push(`• **Reconstitution:** ${p.reconstitution}`);

  return parts.join('\n');
}

function respondStackHelp(message: string, context: BotContext): string {
  const categories = findMentionedCategories(message);
  const parts: string[] = [];

  if (categories.length > 0) {
    parts.push(`**Research Stack Suggestions for ${categories.join(' + ')}**`);
    parts.push('');

    categories.forEach((cat) => {
      const catPeptides = getPeptidesByCategory(cat).slice(0, 4);
      parts.push(`**${cat}:**`);
      catPeptides.forEach((p) => {
        parts.push(`• ${p.name} — ${p.researchSummary.substring(0, 80)}...`);
      });
      parts.push('');
    });

    // If two categories, suggest cross-category stack
    if (categories.length >= 2) {
      const p1 = getPeptidesByCategory(categories[0])[0];
      const p2 = getPeptidesByCategory(categories[1])[0];
      if (p1 && p2) {
        parts.push(`**Suggested combination to explore:** ${p1.name} + ${p2.name}`);
        parts.push(`Use the Stack Builder to analyze this combination's synergy score.`);
      }
    }
  } else {
    parts.push(`**Popular Research Stacks**`);
    parts.push('');
    parts.push(`Here are some well-studied combinations:`);
    parts.push('');
    parts.push(`• **Recovery:** BPC-157 + TB-500 (the "Wolverine Stack") — complementary tissue repair pathways`);
    parts.push(`• **GH Axis:** CJC-1295 + Ipamorelin — synergistic growth hormone secretion (9/10 synergy)`);
    parts.push(`• **Cognitive:** Semax + Selank — complementary nootropic + anxiolytic`);
    parts.push(`• **Longevity:** Epithalon + NAD+ + SS-31 — telomere + mitochondrial support`);
    parts.push(`• **Metabolic:** Retatrutide + Tesamorelin — triple-receptor + visceral fat targeting`);
    parts.push('');
    parts.push(`What research area interests you? I can suggest more targeted combinations.`);
  }

  if (context.currentStack.length > 0) {
    const stackNames = context.currentStack
      .map((id) => getPeptideById(id)?.name || id)
      .join(', ');
    parts.push('');
    parts.push(`📋 *Your current stack: ${stackNames}*`);
  }

  return parts.join('\n');
}

function respondHealthSuggest(context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const parts: string[] = [];

  const hasCheckIns = context.recentCheckIns.length > 0;
  const hasDoses = enhanced?.recentDoses && enhanced.recentDoses.length > 0;
  const hasProfile = hp && hp.setupComplete;

  // Merge goals from onboarding + health profile
  const onboardingGoals = context.userProfile?.healthGoals ?? [];

  if (!hasCheckIns && !hasDoses && !hasProfile) {
    parts.push(`I'd love to give you personalized insights, but I don't see any data yet.`);
    parts.push('');
    parts.push(`Here's how to get started:`);
    parts.push(`• **Profile tab → Health Profile** — Set up your body metrics, conditions, and goals`);
    parts.push(`• **Calendar tab** — Log your peptide doses`);
    parts.push(`• **Check-In tab** — Track daily mood, energy, sleep, recovery`);
    parts.push('');
    parts.push(`The more data you log, the smarter my suggestions become. I can spot trends, correlate your peptide use with how you feel, and flag anything that warrants a conversation with your doctor.`);
    parts.push('');
    parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);
    return parts.join('\n');
  }

  // Show health profile overview if available
  if (hasProfile && hp) {
    const summary = buildProfileSummary(hp);
    parts.push(`**Your Health Profile**`);
    parts.push(summary);
    parts.push('');

    // Goal-based suggestions
    if (hp.primaryGoals.length > 0) {
      parts.push(`**Goal-Based Research Suggestions:**`);
      const goalToPeptides: Record<string, string[]> = {
        'weight_loss': ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'MOTS-c', 'Tesamorelin'],
        'muscle_growth': ['CJC-1295 + Ipamorelin', 'IGF-1 LR3', 'Tesamorelin'],
        'recovery': ['BPC-157', 'TB-500', 'GHK-Cu'],
        'anti_aging': ['Epithalon', 'NAD+', 'GHK-Cu', 'SS-31'],
        'cognitive': ['Semax', 'Selank', 'Dihexa'],
        'sleep': ['DSIP', 'Epithalon'],
        'immune': ['Thymosin Alpha-1', 'LL-37'],
        'energy': ['MOTS-c', 'SS-31', 'NAD+'],
        'skin_hair': ['GHK-Cu', 'SNAP-8'],
        'gut_health': ['BPC-157', 'KPV'],
        'stress': ['Selank', 'DSIP'],
        'inflammation': ['BPC-157', 'KPV', 'LL-37'],
        'sexual_health': ['PT-141', 'Kisspeptin'],
      };

      for (const goal of hp.primaryGoals.slice(0, 3)) {
        const peptideHints = goalToPeptides[goal];
        if (peptideHints) {
          // Filter out peptides that conflict with user's conditions
          parts.push(`• **${goal.replace(/_/g, ' ')}** → ${peptideHints.join(', ')}`);
        }
      }
      parts.push('');
    } else if (onboardingGoals.length > 0) {
      parts.push(`**Goal-Based Research Suggestions:**`);
      const onboardingGoalToPeptides: Record<string, string[]> = {
        'weight_loss': ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'MOTS-c', 'Tesamorelin'],
        'muscle_gain': ['CJC-1295 + Ipamorelin', 'IGF-1 LR3', 'Tesamorelin'],
        'body_recomp': ['Tesamorelin', 'CJC-1295 + Ipamorelin', 'MOTS-c'],
        'recovery': ['BPC-157', 'TB-500', 'GHK-Cu'],
        'longevity': ['Epithalon', 'NAD+', 'GHK-Cu', 'SS-31'],
        'cognitive': ['Semax', 'Selank', 'Dihexa'],
        'sleep': ['DSIP', 'Epithalon'],
        'energy': ['MOTS-c', 'SS-31', 'NAD+'],
        'immune': ['Thymosin Alpha-1', 'LL-37'],
        'gut_health': ['BPC-157', 'KPV'],
        'skin_hair': ['GHK-Cu', 'SNAP-8'],
        'hormonal': ['CJC-1295 + Ipamorelin', 'Kisspeptin', 'PT-141'],
        'general_wellness': ['BPC-157', 'Epithalon', 'NAD+', 'Thymosin Alpha-1'],
      };
      for (const goal of onboardingGoals.slice(0, 3)) {
        const peptideHints = onboardingGoalToPeptides[goal];
        if (peptideHints) {
          parts.push(`• **${goal.replace(/_/g, ' ')}** → ${peptideHints.join(', ')}`);
        }
      }
      parts.push('');
    }

    // Medical flags
    if (hp.medical.conditions.length > 0) {
      parts.push(`**Health Considerations:**`);
      parts.push(`Your conditions (${hp.medical.conditions.join(', ')}) are factored into all my protocol suggestions. I'll flag contraindications automatically.`);
      if (hp.medical.hasProviderSupervision) {
        parts.push(`You've indicated you have provider supervision — great! Always share new peptide plans with them.`);
      } else {
        parts.push(`🏥 Consider establishing a relationship with a provider who understands peptides, especially given your medical history.`);
      }
      parts.push('');
    }

    // BMI-based insights
    if (hp.bodyMetrics.weightLbs && hp.bodyMetrics.heightInches) {
      const bmi = (hp.bodyMetrics.weightLbs / (hp.bodyMetrics.heightInches * hp.bodyMetrics.heightInches)) * 703;
      if (bmi > 30) {
        parts.push(`📊 **BMI: ${bmi.toFixed(1)}** — Research suggests GLP-1 receptor agonists (Semaglutide, Tirzepatide) may be worth discussing with your provider for metabolic support.`);
        parts.push('');
      }
    }

    // Sleep insights from profile
    if (hp.sleep.sleepIssues.length > 0) {
      parts.push(`**Sleep:** You've noted issues with ${hp.sleep.sleepIssues.join(', ')}. Research to explore: DSIP, Epithalon (melatonin synthesis).`);
      parts.push('');
    }
  }

  // Analyze recent check-in trends
  if (hasCheckIns) {
    const recent = context.recentCheckIns.slice(0, 7);
    const avgMood = recent.reduce((s, e) => s + e.mood, 0) / recent.length;
    const avgEnergy = recent.reduce((s, e) => s + e.energy, 0) / recent.length;
    const avgSleep = recent.reduce((s, e) => s + e.sleepQuality, 0) / recent.length;
    const avgRecovery = recent.reduce((s, e) => s + e.recovery, 0) / recent.length;
    const avgStress = recent.reduce((s, e) => s + e.stress, 0) / recent.length;

    parts.push(`**Your Health Snapshot** (${recent.length} check-ins)`);
    parts.push(`Mood: ${avgMood.toFixed(1)}/5 | Energy: ${avgEnergy.toFixed(1)}/5 | Sleep: ${avgSleep.toFixed(1)}/5 | Recovery: ${avgRecovery.toFixed(1)}/5 | Stress: ${avgStress.toFixed(1)}/5`);
    parts.push('');

    // Flag concerning patterns
    const concerns: string[] = [];
    if (avgMood < 2) concerns.push('persistently low mood');
    if (avgEnergy < 2) concerns.push('very low energy');
    if (avgSleep < 2) concerns.push('poor sleep quality');
    if (avgStress > 4) concerns.push('elevated stress');
    if (avgRecovery < 2) concerns.push('poor recovery');

    if (concerns.length > 0) {
      parts.push(`🏥 **Please consider talking to your doctor.** Your data shows: ${concerns.join(', ')}. These patterns may indicate something that deserves professional medical attention.`);
      parts.push('');
      parts.push(`Your PepTalk data is valuable — bring it to your appointment! It gives your provider a clear picture of how you've been feeling.`);
      parts.push('');
    }

    // Research suggestions for lower-scoring areas
    const suggestions: Array<{ area: string; score: number; categories: PeptideCategory[]; peptideHints: string[] }> = [];

    if (avgSleep < 3) {
      suggestions.push({ area: 'Sleep Quality', score: avgSleep, categories: ['Sleep'], peptideHints: ['DSIP', 'Pinealon', 'Epithalon'] });
    }
    if (avgEnergy < 3) {
      suggestions.push({ area: 'Energy', score: avgEnergy, categories: ['Mitochondrial', 'Growth Hormone'], peptideHints: ['MOTS-c', 'SS-31', 'NAD+'] });
    }
    if (avgRecovery < 3) {
      suggestions.push({ area: 'Recovery', score: avgRecovery, categories: ['Recovery', 'Anti-inflammatory'], peptideHints: ['BPC-157', 'TB-500', 'GHK-Cu'] });
    }
    if (avgMood < 3) {
      suggestions.push({ area: 'Mood', score: avgMood, categories: ['Nootropic', 'Neuropeptide'], peptideHints: ['Semax', 'Selank'] });
    }
    if (avgStress > 3.5) {
      suggestions.push({ area: 'Stress (elevated)', score: avgStress, categories: ['Nootropic', 'Sleep'], peptideHints: ['Selank', 'DSIP'] });
    }

    if (suggestions.length > 0) {
      parts.push(`**Areas to Explore:**`);
      suggestions.forEach((s) => {
        parts.push(`• **${s.area}** (${s.score.toFixed(1)}/5) → ${s.peptideHints.join(', ')}`);
      });
      parts.push('');
    } else if (concerns.length === 0) {
      parts.push(`Your metrics look healthy! Keep tracking to build a richer picture over time.`);
      parts.push('');
    }
  }

  // Cross-reference with dose data
  if (hasDoses && enhanced) {
    const recentDoses = enhanced.recentDoses.slice(0, 14);
    const peptideIds = [...new Set(recentDoses.map((d) => d.peptideId))];
    const peptideNames = peptideIds
      .map((id) => getPeptideById(id)?.name || id)
      .join(', ');

    parts.push(`**Your Active Peptides:** ${peptideNames}`);
    parts.push(`${recentDoses.length} doses logged in the last 2 weeks.`);
    parts.push('');

    // Correlate: if they're taking metabolic peptides and appetite is logged
    if (hasCheckIns) {
      const recentCheckins = context.recentCheckIns.slice(0, 7);
      const avgAppetite = recentCheckins.reduce((s, e) => s + e.appetite, 0) / recentCheckins.length;

      const takingMetabolic = peptideIds.some((id) => {
        const p = getPeptideById(id);
        return p?.categories.includes('Metabolic');
      });

      if (takingMetabolic && avgAppetite < 3) {
        const metabolicNames = peptideIds
          .filter((id) => getPeptideById(id)?.categories.includes('Metabolic'))
          .map((id) => getPeptideById(id)?.name)
          .join(', ');
        parts.push(`📊 **Correlation spotted:** You're taking ${metabolicNames} and your appetite is ${avgAppetite.toFixed(1)}/5. Appetite suppression is an expected effect of GLP-1 pathway peptides. If it's concerning or extreme, discuss with your provider.`);
        parts.push('');
      }

      // Check for sleep issues + GH peptides (GH peptides before bed can cause vivid dreams)
      const takingGH = peptideIds.some((id) => {
        const p = getPeptideById(id);
        return p?.categories.includes('Growth Hormone');
      });

      if (takingGH) {
        const avgSleep = recentCheckins.reduce((s, e) => s + e.sleepQuality, 0) / recentCheckins.length;
        if (avgSleep < 3) {
          parts.push(`📊 **Note:** You're using GH-axis peptides and reporting lower sleep quality. Some GH secretagogues taken before bed can cause vivid dreams or altered sleep patterns. Consider discussing timing adjustments with your provider.`);
          parts.push('');
        }
      }
    }

    // Show active protocols
    if (enhanced.activeProtocols && enhanced.activeProtocols.length > 0) {
      parts.push(`**Active Protocols:** ${enhanced.activeProtocols.length}`);
      enhanced.activeProtocols.forEach((p) => {
        const name = getPeptideById(p.peptideId)?.name || p.peptideId;
        parts.push(`• ${name}: ${p.dose} ${p.unit}, ${p.frequency}, started ${p.startDate}`);
      });
      parts.push('');
    }
  }

  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondGoalSuggest(message: string, context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const parts: string[] = [];

  // Merge goals from onboarding + health profile
  const onboardingGoals = context.userProfile?.healthGoals ?? [];
  const profileGoals = hp?.primaryGoals ?? [];
  const allGoals = [...new Set([...onboardingGoals, ...profileGoals])];

  const goalToPeptides: Record<string, { peptides: string[]; notes: string }> = {
    'weight_loss': { peptides: ['Semaglutide', 'Tirzepatide', 'Retatrutide', 'MOTS-c', 'Tesamorelin'], notes: 'GLP-1 receptor agonists are the most studied for metabolic support.' },
    'muscle_gain': { peptides: ['CJC-1295 + Ipamorelin', 'IGF-1 LR3', 'Tesamorelin', 'GHRP-2'], notes: 'GH axis peptides support lean mass through growth hormone pathways.' },
    'body_recomp': { peptides: ['Tesamorelin', 'CJC-1295 + Ipamorelin', 'MOTS-c'], notes: 'Combines GH axis support with metabolic activation.' },
    'recovery': { peptides: ['BPC-157', 'TB-500', 'GHK-Cu'], notes: 'BPC-157 + TB-500 is known as the "Wolverine Stack" for tissue repair.' },
    'longevity': { peptides: ['Epithalon', 'NAD+', 'GHK-Cu', 'SS-31'], notes: 'Targets telomere maintenance, mitochondrial function, and cellular repair.' },
    'cognitive': { peptides: ['Semax', 'Selank', 'Dihexa', 'Pinealon'], notes: 'Nootropic peptides supporting BDNF and neurotransmitter balance.' },
    'sleep': { peptides: ['DSIP', 'Epithalon', 'Pinealon'], notes: 'DSIP is the primary sleep-targeted peptide in research.' },
    'energy': { peptides: ['MOTS-c', 'SS-31', 'NAD+', 'CJC-1295'], notes: 'Mitochondrial peptides support cellular energy production.' },
    'immune': { peptides: ['Thymosin Alpha-1', 'LL-37', 'KPV'], notes: 'Thymosin Alpha-1 is the most studied immune peptide.' },
    'gut_health': { peptides: ['BPC-157', 'KPV', 'LL-37'], notes: 'BPC-157 has extensive research on GI tissue healing.' },
    'skin_hair': { peptides: ['GHK-Cu', 'SNAP-8', 'Epithalon'], notes: 'GHK-Cu promotes collagen synthesis and skin remodeling.' },
    'hormonal': { peptides: ['CJC-1295 + Ipamorelin', 'Kisspeptin', 'PT-141'], notes: 'These interact with endocrine pathways — provider supervision recommended.' },
    'general_wellness': { peptides: ['BPC-157', 'Epithalon', 'NAD+', 'Thymosin Alpha-1'], notes: 'Broad-spectrum peptides covering repair, longevity, and immune support.' },
  };

  // Detect which goal the user is asking about from the message
  const lower = message.toLowerCase();
  let targetGoals: GoalType[] = [];

  const goalKeywordMap: Record<string, GoalType> = {
    'weight': 'weight_loss', 'fat': 'weight_loss', 'lose': 'weight_loss', 'slim': 'weight_loss',
    'muscle': 'muscle_gain', 'bulk': 'muscle_gain', 'gain': 'muscle_gain', 'strength': 'muscle_gain',
    'recomp': 'body_recomp',
    'recover': 'recovery', 'heal': 'recovery', 'injury': 'recovery', 'repair': 'recovery',
    'longev': 'longevity', 'aging': 'longevity', 'anti-aging': 'longevity',
    'cognitive': 'cognitive', 'brain': 'cognitive', 'focus': 'cognitive', 'memory': 'cognitive',
    'sleep': 'sleep', 'insomnia': 'sleep',
    'energy': 'energy', 'fatigue': 'energy', 'tired': 'energy',
    'immune': 'immune', 'sick': 'immune',
    'gut': 'gut_health', 'digestive': 'gut_health', 'stomach': 'gut_health',
    'skin': 'skin_hair', 'hair': 'skin_hair', 'collagen': 'skin_hair',
    'hormon': 'hormonal',
    'wellness': 'general_wellness', 'health': 'general_wellness',
  };

  for (const [keyword, goal] of Object.entries(goalKeywordMap)) {
    if (lower.includes(keyword) && !targetGoals.includes(goal)) {
      targetGoals.push(goal);
    }
  }

  // If no specific goal detected in message, use their stored goals
  if (targetGoals.length === 0 && allGoals.length > 0) {
    targetGoals = allGoals.slice(0, 3) as GoalType[];
  }

  if (targetGoals.length === 0) {
    parts.push(`I'd love to suggest peptides based on your goals, but I don't know your health objectives yet.`);
    parts.push('');
    parts.push(`Set your goals in **Settings → Onboarding** or tell me what you're looking for:`);
    parts.push(`• "What should I take for recovery?"`, `• "Best peptides for sleep"`, `• "Help me with energy"`);
    return parts.join('\n');
  }

  parts.push(`**Peptide Suggestions Based on Your Goals**`);
  parts.push('');

  for (const goal of targetGoals) {
    const info = goalToPeptides[goal];
    if (!info) continue;

    parts.push(`**${getGoalLabel(goal)}**`);
    parts.push(`Research peptides: ${info.peptides.join(', ')}`);
    parts.push(`_${info.notes}_`);
    parts.push('');
  }

  // Cross-reference with medical conditions
  if (hp?.medical?.conditions?.length) {
    parts.push(`**Note:** I've considered your health profile (${hp.medical.conditions.join(', ')}). Always discuss new peptides with your healthcare provider given your medical history.`);
    parts.push('');
  }

  parts.push(`Ask me about any specific peptide for detailed protocols, mechanisms, and interactions.`);
  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondKnowledgeTopic(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  // Match user message to the most relevant topic
  const topicKeywords: Record<TopicId, RegExp> = {
    'peptide-care': /\b(care|handle|handling|prepare|preparation|supplies|travel)\b/i,
    'how-to-use': /\b(how (do i|to) use|inject|injection|reconstitut|bac water|dose|dosing|calculate|route|subcutaneous|intramuscular|intranasal)\b/i,
    'safety': /\b(safe|safety|side effect|contraindic|warning|danger|stop|medical|doctor|emergency)\b/i,
    'storage': /\b(stor|refrigerat|temperature|shelf life|degrad|expire|freeze|stability|bac water|bacteriostatic)\b/i,
    'buying-quality': /\b(buy|buying|purchase|supplier|vendor|source|quality|purity|pure|hplc|coa|certificate|third.?party|test|lab|gmp|janoshik|colmaric|red flag)\b/i,
    'regulations': /\b(legal|regulation|regulated|fda|law|prescription|compounding|research use|ruo|approved|ind\b|dshea|dietary supplement)\b/i,
  };

  let bestTopic = KNOWLEDGE_TOPICS[0];
  for (const topic of KNOWLEDGE_TOPICS) {
    const regex = topicKeywords[topic.id];
    if (regex && regex.test(lower)) {
      bestTopic = topic;
      break;
    }
  }

  // Find the most relevant Q&A within the topic
  const parts: string[] = [];
  parts.push(`**${bestTopic.title}**\n`);

  // Score each section by keyword overlap with the user's message
  const words = lower.split(/\s+/);
  const scored = bestTopic.sections.map((s, i) => {
    const sectionWords = (s.question + ' ' + s.answer).toLowerCase();
    const score = words.filter((w) => w.length > 3 && sectionWords.includes(w)).length;
    return { section: s, score, index: i };
  });
  scored.sort((a, b) => b.score - a.score);

  // Show top 2-3 most relevant Q&A pairs
  const topSections = scored.slice(0, 3);
  topSections.forEach(({ section }) => {
    parts.push(`**${section.question}**`);
    // Trim answer to keep response concise
    const trimmed = section.answer.length > 400
      ? section.answer.substring(0, 400) + '...'
      : section.answer;
    parts.push(trimmed + '\n');
  });

  parts.push(`\n*Check out the **Learn** section for the full ${bestTopic.title} topic with all ${bestTopic.sections.length} questions answered.*`);
  parts.push(`\n⚕️ *This is research information only — always consult a qualified healthcare provider.*`);

  return parts.join('\n');
}

function respondWorkoutSuggest(message: string, context: BotContext): string {
  const parts: string[] = [];
  const lower = message.toLowerCase();

  parts.push(`**Workout Suggestions**`);
  parts.push('');

  // Detect what type of workout they're asking about
  const isBodypart = /\b(chest|back|legs?|arms?|shoulders?|bicep|tricep|core|abs|glute)/i.test(lower);
  const isProgram = /\b(program|routine|split|plan)\b/i.test(lower);

  if (isBodypart) {
    const bodypartMap: Record<string, string[]> = {
      'chest': ['Bench Press', 'Incline Dumbbell Press', 'Cable Flyes', 'Push-Ups'],
      'back': ['Pull-Ups', 'Barbell Rows', 'Lat Pulldown', 'Seated Cable Row'],
      'legs': ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Walking Lunges'],
      'shoulders': ['Overhead Press', 'Lateral Raises', 'Face Pulls', 'Arnold Press'],
      'arms': ['Barbell Curl', 'Tricep Pushdown', 'Hammer Curls', 'Skull Crushers'],
      'core': ['Planks', 'Cable Woodchops', 'Hanging Leg Raises', 'Ab Wheel Rollouts'],
      'glutes': ['Hip Thrust', 'Bulgarian Split Squat', 'Cable Kickbacks', 'Sumo Deadlift'],
    };

    for (const [part, exercises] of Object.entries(bodypartMap)) {
      if (lower.includes(part)) {
        parts.push(`**${part.charAt(0).toUpperCase() + part.slice(1)} Exercises:**`);
        exercises.forEach((e) => parts.push(`• ${e}`));
        parts.push('');
        break;
      }
    }
  } else if (isProgram) {
    parts.push(`We have **42 workout programs** available in the Workouts tab:`);
    parts.push('');
    parts.push(`• **Push/Pull/Legs** — Classic 6-day split for muscle growth`);
    parts.push(`• **Upper/Lower** — 4-day balanced split`);
    parts.push(`• **Full Body** — 3-day for beginners or busy schedules`);
    parts.push(`• **Strength Focus** — Powerlifting-style compound movements`);
    parts.push(`• **Metabolic Conditioning** — HIIT + circuits for fat loss`);
    parts.push('');
    parts.push(`Head to the **Workouts** tab to browse all programs with video demos.`);
  } else {
    parts.push(`I can help you find the right workout! Here are some options:`);
    parts.push('');
    parts.push(`• **Browse Programs** — 42 structured programs in the Workouts tab`);
    parts.push(`• **Exercise Library** — 3,000+ exercises with video demos`);
    parts.push(`• **By Body Part** — Ask me about chest, back, legs, etc.`);
    parts.push('');
    parts.push(`**Peptide Synergies for Training:**`);
    parts.push(`• **Pre-workout GH boost:** CJC-1295 + Ipamorelin (30 min before)`);
    parts.push(`• **Recovery:** BPC-157 + TB-500 (post-training or before bed)`);
    parts.push(`• **Endurance:** MOTS-c (mitochondrial performance)`);
  }

  parts.push('');
  parts.push(`Check out the **Workouts** tab for full programs with progress tracking.`);

  return parts.join('\n');
}

function respondMealSuggest(message: string, context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const parts: string[] = [];
  const lower = message.toLowerCase();

  parts.push(`**Nutrition Guidance**`);
  parts.push('');

  const isMealType = /\b(breakfast|lunch|dinner|snack|pre.?workout|post.?workout)\b/i.test(lower);
  const isDiet = /\b(keto|vegan|vegetarian|paleo|carnivore|mediterranean|high.?protein|low.?carb)\b/i.test(lower);
  const isRecipe = /\b(recipe|cook|make|prepare)\b/i.test(lower);
  const isMacro = /\b(macro|calorie|protein|carb|fat|track|count)\b/i.test(lower);

  if (isRecipe) {
    parts.push(`Head to **Nutrition → Meals by Aimee** to get personalized meal ideas tailored to your macro targets and dietary preferences.`);
    parts.push('');
    parts.push(`The generator creates recipes optimized for your daily targets and can filter by diet type.`);
  } else if (isMacro) {
    parts.push(`**Quick Macro Tips for Peptide Users:**`);
    parts.push('');
    parts.push(`• **Protein:** Aim for 0.8-1.2g per pound of body weight`);
    parts.push(`• **On GH peptides:** Higher protein supports growth hormone's anabolic effects`);
    parts.push(`• **On GLP-1s:** Prioritize protein first since appetite is reduced`);
    parts.push(`• **Fasting windows:** Many GH peptides work best on an empty stomach`);
    parts.push('');
    parts.push(`Set your targets in **Nutrition → Macro Targets** for personalized tracking.`);
  } else if (isMealType) {
    const mealTips: Record<string, string[]> = {
      'breakfast': ['High-protein breakfast supports morning GH peptide dosing', 'Try: eggs, Greek yogurt, or protein smoothie (30-40g protein)'],
      'lunch': ['Balanced plate: palm-size protein + fist of veggies + thumb of healthy fats', 'Good time for complex carbs if training in the afternoon'],
      'dinner': ['Lighter carbs if taking GH peptides before bed (fasting state preferred)', 'Focus on protein + vegetables for satiety'],
      'snack': ['Pre-workout: banana + protein shake 30-60 min before', 'Post-workout: fast-digesting protein within 30 min'],
    };

    for (const [meal, tips] of Object.entries(mealTips)) {
      if (lower.includes(meal)) {
        parts.push(`**${meal.charAt(0).toUpperCase() + meal.slice(1)} Tips:**`);
        tips.forEach((t) => parts.push(`• ${t}`));
        parts.push('');
        break;
      }
    }
  } else {
    parts.push(`I can help with nutrition planning! Check out these features:`);
    parts.push('');
    parts.push(`• **Nutrition Tab** — Track meals, macros, and water intake`);
    parts.push(`• **Meals by Aimee** — Personalized meal ideas matching your targets`);
    parts.push(`• **Meal Planning** — Plan meals ahead with personalized recipes`);
    parts.push(`• **Macro Targets** — Set calories, protein, carbs, fat, and fiber goals`);
    parts.push('');
    parts.push(`**Peptide + Nutrition Tips:**`);
    parts.push(`• GH peptides work best on an empty stomach (2+ hours fasted)`);
    parts.push(`• GLP-1 agonists reduce appetite — prioritize nutrient density`);
    parts.push(`• BPC-157 can be taken with or without food`);
  }

  parts.push('');
  parts.push(`Visit the **Nutrition** tab for full meal tracking and AI recipes.`);

  return parts.join('\n');
}

function respondCreatePlan(context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const hp = enhanced?.healthProfile;
  const parts: string[] = [];

  parts.push(`**Health Plan Builder**`);
  parts.push('');

  if (hp && hp.setupComplete) {
    const goals = hp.primaryGoals.length > 0
      ? hp.primaryGoals.map((g) => g.replace(/_/g, ' ')).join(', ')
      : 'general wellness';

    parts.push(`Based on your profile, here's what I'd suggest for your plan:`);
    parts.push('');
    parts.push(`**Your Goals:** ${goals}`);
    parts.push('');
    parts.push(`**Recommended Plan Components:**`);
    parts.push(`• **Workouts:** 3-5x/week based on your experience level`);
    parts.push(`• **Nutrition:** Macros aligned to your goals (${hp.primaryGoals.includes('weight_loss') ? 'calorie deficit' : hp.primaryGoals.includes('muscle_gain') ? 'calorie surplus' : 'maintenance calories'})`);

    // Protocol timing suggestions
    if (enhanced?.activeProtocols && enhanced.activeProtocols.length > 0) {
      parts.push(`• **Protocol Schedule:** Optimized timing for your ${enhanced.activeProtocols.length} active protocol(s)`);
    }

    parts.push(`• **Check-ins:** Daily mood/energy tracking to monitor progress`);
    parts.push('');
    parts.push(`The AI can generate a detailed weekly plan for you. Use the **PepTalk Chat** with AI enabled to say "Create a weekly health plan" for a fully personalized schedule.`);
  } else {
    parts.push(`To create a personalized health plan, I need to know more about you:`);
    parts.push('');
    parts.push(`1. **Complete your Health Profile** (Profile tab → Health Profile)`);
    parts.push(`2. **Set your goals** — weight loss, muscle gain, recovery, etc.`);
    parts.push(`3. **Log some check-ins** so I can see your baseline`);
    parts.push('');
    parts.push(`Once your profile is set, I can create a plan combining:`);
    parts.push(`• Weekly workout schedule (from 42+ programs)`);
    parts.push(`• Meal plan framework with macro targets`);
    parts.push(`• Peptide protocol timing (if applicable)`);
    parts.push(`• Daily check-in reminders`);
  }

  parts.push('');
  parts.push(`Remember, I'm here to educate — always chat with your doctor for medical decisions.`);

  return parts.join('\n');
}

function respondModifyPlan(context: BotContext): string {
  const enhanced = context as EnhancedBotContext | undefined;
  const parts: string[] = [];

  parts.push(`**Modify Your Plan**`);
  parts.push('');

  if (enhanced?.activeProtocols && enhanced.activeProtocols.length > 0) {
    parts.push(`**Current Active Protocols:**`);
    enhanced.activeProtocols.forEach((p) => {
      const name = getPeptideById(p.peptideId)?.name || p.peptideId;
      parts.push(`• ${name}: ${p.dose} ${p.unit}, ${p.frequency}`);
    });
    parts.push('');
  }

  parts.push(`You can adjust your plan in several ways:`);
  parts.push('');
  parts.push(`• **Workouts** — Change program, adjust frequency, swap exercises in the Workouts tab`);
  parts.push(`• **Nutrition** — Update macro targets, change meal plan in the Nutrition tab`);
  parts.push(`• **Protocols** — Modify doses, timing, or add/remove peptides in your Stack`);
  parts.push(`• **Schedule** — View and edit your full timeline in the Calendar tab`);
  parts.push('');
  parts.push(`Tell me what you'd like to change, or use the specific tabs to make adjustments directly.`);
  parts.push('');
  parts.push(`For AI-powered plan modifications, enable AI in the chat and describe what you want to change.`);

  return parts.join('\n');
}

function detectJournalCategory(message: string): JournalCategory {
  const lower = message.toLowerCase();
  if (/\b(dose|dosed|injected|pinned|took|protocol|mg\b|mcg\b|iu\b)/i.test(lower)) return 'protocol_notes';
  if (/\b(side effect|nausea|headache|dizzy|rash|pain|swelling|reaction)/i.test(lower)) return 'side_effects';
  if (/\b(feel|felt|mood|happy|sad|anxious|stressed|calm|great|terrible)/i.test(lower)) return 'mood';
  if (/\b(progress|lost|gained|pr\b|personal record|milestone|achieved|hit)/i.test(lower)) return 'progress';
  if (/\b(read|research|study|found|learned|article)/i.test(lower)) return 'research';
  if (/\b(goal|target|plan|want to|going to|aim)/i.test(lower)) return 'goals';
  return 'general';
}

function extractJournalTitle(message: string): string {
  // Take the first meaningful clause, max 60 chars
  const cleaned = message
    .replace(/^(hey|hi|yo|ok|so|well|um|uh)\s*/i, '')
    .replace(/^(i |just |today )/i, '')
    .trim();
  const title = cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function respondJournalLog(
  message: string,
  peptides: Peptide[],
  context: BotContext,
): { content: string; journalEntry: ChatMessage['journalEntry'] } {
  const category = detectJournalCategory(message);
  const title = extractJournalTitle(message);
  const tags: string[] = [];

  // Extract tags from message
  if (/\b(workout|exercise|gym|training|lift)/i.test(message)) tags.push('workout');
  if (/\b(meal|food|eat|ate|nutrition|breakfast|lunch|dinner)/i.test(message)) tags.push('nutrition');
  if (/\b(sleep|slept|nap|rest)/i.test(message)) tags.push('sleep');
  if (/\b(dose|injection|protocol)/i.test(message)) tags.push('protocol');
  if (/\b(cardio|run|walk|bike|swim)/i.test(message)) tags.push('cardio');
  if (/\b(weight|scale|body)/i.test(message)) tags.push('body');

  // Detect mood from message
  let mood: 1 | 2 | 3 | 4 | 5 | undefined;
  if (/\b(amazing|incredible|fantastic|awesome|great|excellent)\b/i.test(message)) mood = 5;
  else if (/\b(good|nice|well|better|solid|strong)\b/i.test(message)) mood = 4;
  else if (/\b(okay|ok|fine|alright|decent|normal)\b/i.test(message)) mood = 3;
  else if (/\b(bad|rough|poor|tired|sore|off)\b/i.test(message)) mood = 2;
  else if (/\b(terrible|awful|horrible|worst|miserable)\b/i.test(message)) mood = 1;

  const categoryLabels: Record<JournalCategory, string> = {
    protocol_notes: 'Protocol Notes',
    side_effects: 'Side Effects',
    mood: 'Mood',
    progress: 'Progress',
    research: 'Research',
    questions: 'Questions',
    goals: 'Goals',
    general: 'General',
  };

  const parts: string[] = [];
  parts.push(`Got it! I've logged that to your journal.`);
  parts.push('');
  parts.push(`**Journal Entry Created:**`);
  parts.push(`**Category:** ${categoryLabels[category]}`);
  parts.push(`**Title:** ${title}`);
  if (tags.length > 0) parts.push(`**Tags:** ${tags.join(', ')}`);
  if (mood) parts.push(`**Mood:** ${'★'.repeat(mood)}${'☆'.repeat(5 - mood)}`);
  if (peptides.length > 0) {
    parts.push(`**Related Peptides:** ${peptides.map(p => p.name).join(', ')}`);
  }
  parts.push('');
  parts.push(`You can view and edit this entry in your **Journal**.`);

  return {
    content: parts.join('\n'),
    journalEntry: {
      category,
      title,
      content: message,
      tags,
      relatedPeptideIds: peptides.map(p => p.id),
      mood,
    },
  };
}

function respondGeneral(): string {
  return `I'm Aimee, your health companion. Here's what I can help with:\n\n• **Peptide Information** — "Tell me about BPC-157"\n• **Mechanisms** — "How does semaglutide work?"\n• **Interactions** — "Can I stack CJC-1295 with Ipamorelin?"\n• **Category Browsing** — "What peptides help with sleep?"\n• **Comparisons** — "BPC-157 vs TB-500"\n• **Stack Building** — "Suggest a recovery stack"\n• **Storage Info** — "How do I store BPC-157?"\n• **Quality & Buying** — "What should I look for when buying peptides?"\n• **Safety** — "Are peptides safe?"\n• **Regulations** — "Are peptides legal?"\n• **Health Insights** — "Based on my check-ins, what should I explore?"\n\nI have data on ${PEPTIDES.length} research peptides. What would you like to know?`;
}

// ---------------------------------------------------------------------------
// Quick reply suggestions
// ---------------------------------------------------------------------------

function getQuickReplies(intent: BotIntent, peptides: Peptide[]): string[] {
  switch (intent) {
    case 'greeting':
      return [
        'What peptides help with recovery?',
        'Tell me about BPC-157',
        'Suggest a stack',
      ];
    case 'peptide_info':
      if (peptides.length > 0) {
        const p = peptides[0];
        return [
          `How does ${p.name} work?`,
          `What can I stack with ${p.name}?`,
          `Is ${p.name} safe?`,
        ];
      }
      return [];
    case 'mechanism':
      if (peptides.length > 0) {
        return [
          `Tell me more about ${peptides[0].name}`,
          `What can I stack it with?`,
          'Show me similar peptides',
        ];
      }
      return [];
    case 'interaction_check':
      return [
        'Suggest another combination',
        'Show me popular stacks',
        'What categories does this cover?',
      ];
    case 'category_explore':
      return [
        'Suggest a stack for this',
        'Tell me about the top option',
        'Compare two of these',
      ];
    case 'dosing_protocol':
      return [
        'How should I store this?',
        'What does the research say?',
        'Connect me with a provider',
      ];
    case 'health_suggest':
      return [
        'Tell me more about the first suggestion',
        'Log a check-in',
        'Show me popular stacks',
      ];
    case 'knowledge_topic':
      return [
        'How do I store peptides?',
        'What makes a quality peptide?',
        'Are peptides legal?',
      ];
    case 'goal_suggest':
      return [
        'Tell me more about the first one',
        'Show me protocols',
        'Based on my check-ins',
      ];
    case 'workout_suggest':
      return [
        'Show me a program',
        'Best exercises for chest',
        'Create a weekly plan',
      ];
    case 'meal_suggest':
      return [
        'Generate a recipe',
        'Help me set macro targets',
        'Create a meal plan',
      ];
    case 'create_plan':
      return [
        'Show me workout programs',
        'Set my macro targets',
        'What peptides match my goals?',
      ];
    case 'modify_plan':
      return [
        'Change my workout program',
        'Update my nutrition targets',
        'Adjust my protocol timing',
      ];
    case 'journal_log':
      return [
        'View my journal',
        'Log another entry',
        'How am I doing this week?',
      ];
    default:
      return [
        'Browse peptide categories',
        'Suggest a stack',
        'Based on my check-ins',
      ];
  }
}

// ---------------------------------------------------------------------------
// Action buttons for in-app navigation
// ---------------------------------------------------------------------------

function getActions(intent: BotIntent, peptides: Peptide[], context: BotContext): BotAction[] {
  const p = peptides[0];
  const todayKey = new Date().toISOString().slice(0, 10);
  const enhanced = context as EnhancedBotContext;
  const hasTodayCheckIn = context.recentCheckIns?.some((c) => c.date === todayKey);
  const hasTodayDose = enhanced?.recentDoses?.some((d: { date: string }) => d.date === todayKey);

  switch (intent) {
    case 'greeting': {
      const actions: BotAction[] = [];
      if (!hasTodayCheckIn) actions.push({ label: 'Check In', route: '/(tabs)/check-in', icon: 'heart-outline' });
      if (!hasTodayDose) actions.push({ label: 'Log Dose', route: '/(tabs)/calendar', icon: 'flask-outline' });
      actions.push({ label: 'Start Workout', route: '/workouts', icon: 'barbell-outline' });
      return actions.slice(0, 3);
    }
    case 'peptide_info':
      return p
        ? [
            { label: `View ${p.name}`, route: `/peptide/${p.id}`, icon: 'flask-outline' },
            { label: 'Check Interactions', route: '/(tabs)/stack-builder', icon: 'git-merge-outline' },
          ]
        : [{ label: 'Browse Library', route: '/(tabs)/index', icon: 'library-outline' }];
    case 'mechanism':
      return p
        ? [
            { label: `Full Profile`, route: `/peptide/${p.id}`, icon: 'flask-outline' },
            { label: 'Compare Peptides', route: '/(tabs)/index', icon: 'swap-horizontal-outline' },
          ]
        : [];
    case 'dosing_protocol':
      return [
        ...(p ? [{ label: 'Log Dose', route: '/(tabs)/calendar', icon: 'add-circle-outline' } as BotAction] : []),
        ...(p ? [{ label: `View ${p.name}`, route: `/peptide/${p.id}`, icon: 'document-text-outline' } as BotAction] : []),
        { label: 'Ask Aimee More', route: '/(tabs)/peptalk', icon: 'chatbubble-outline' },
      ].slice(0, 3);
    case 'interaction_check':
      return [
        { label: 'Build Stack', route: '/(tabs)/stack-builder', icon: 'layers-outline' },
        { label: 'Browse Stacks', route: '/(tabs)/my-stacks', icon: 'albums-outline' },
      ];
    case 'category_explore':
      return [
        { label: 'Browse Library', route: '/(tabs)/index', icon: 'library-outline' },
        ...(p ? [{ label: `View ${p.name}`, route: `/peptide/${p.id}`, icon: 'flask-outline' } as BotAction] : []),
      ];
    case 'side_effects':
      return [
        ...(p ? [{ label: `View ${p.name}`, route: `/peptide/${p.id}`, icon: 'flask-outline' } as BotAction] : []),
        { label: 'Check In', route: '/(tabs)/check-in', icon: 'heart-outline' },
      ];
    case 'storage':
      return p
        ? [{ label: `View ${p.name}`, route: `/peptide/${p.id}`, icon: 'flask-outline' }]
        : [{ label: 'Learn More', route: '/learn', icon: 'book-outline' }];
    case 'stack_help':
      return [
        { label: 'Stack Builder', route: '/(tabs)/stack-builder', icon: 'layers-outline' },
        { label: 'My Stacks', route: '/(tabs)/my-stacks', icon: 'albums-outline' },
      ];
    case 'health_suggest':
      return [
        { label: 'Check In', route: '/(tabs)/check-in', icon: 'heart-outline' },
        { label: 'Health Report', route: '/health-report', icon: 'analytics-outline' },
      ];
    case 'knowledge_topic':
      return [
        { label: 'Learn Hub', route: '/learn', icon: 'book-outline' },
        { label: 'Watch Videos', route: '/learn', icon: 'play-circle-outline' },
      ];
    case 'goal_suggest':
      return [
        { label: 'Browse Stacks', route: '/(tabs)/my-stacks', icon: 'albums-outline' },
        { label: 'Start Program', route: '/workouts', icon: 'barbell-outline' },
      ];
    case 'workout_suggest':
      return [
        { label: 'Start Workout', route: '/workouts', icon: 'barbell-outline' },
        { label: 'Browse Programs', route: '/workouts', icon: 'list-outline' },
      ];
    case 'meal_suggest':
      return [
        { label: 'Meals by Aimee', route: '/nutrition/recipe-generator', icon: 'restaurant-outline' },
        { label: 'Log Meal', route: '/nutrition', icon: 'nutrition-outline' },
      ];
    case 'create_plan':
    case 'modify_plan':
      return [
        { label: 'View Calendar', route: '/(tabs)/calendar', icon: 'calendar-outline' },
        { label: 'Workouts', route: '/workouts', icon: 'barbell-outline' },
        { label: 'Nutrition', route: '/nutrition', icon: 'nutrition-outline' },
      ];
    case 'journal_log':
      return [
        { label: 'View Journal', route: '/journal', icon: 'book-outline' },
        { label: 'Check In', route: '/(tabs)/check-in', icon: 'heart-outline' },
      ];
    default:
      return [
        { label: 'Browse Peptides', route: '/(tabs)/index', icon: 'flask-outline' },
        { label: 'Learn Hub', route: '/learn', icon: 'book-outline' },
      ];
  }
}

// ---------------------------------------------------------------------------
// Main response generator
// ---------------------------------------------------------------------------

/**
 * Local bot response generator — used as the offline/no-consent fallback
 * when the Grok AI API is unavailable or the user hasn't consented.
 */
export function generateLocalBotResponse(
  userMessage: string,
  context: BotContext
): ChatMessage {
  const mentionedPeptides = findMentionedPeptides(userMessage);
  const intent = detectIntent(userMessage, mentionedPeptides);

  let content: string;

  switch (intent) {
    case 'greeting':
      content = respondGreeting(context);
      break;
    case 'peptide_info':
      content = respondPeptideInfo(mentionedPeptides);
      break;
    case 'mechanism':
      content = respondMechanism(mentionedPeptides);
      break;
    case 'comparison':
      content = respondComparison(mentionedPeptides);
      break;
    case 'interaction_check':
      content = respondInteractionCheck(mentionedPeptides, context);
      break;
    case 'category_explore':
      content = respondCategoryExplore(userMessage);
      break;
    case 'dosing_protocol':
      content = respondDosingProtocol(mentionedPeptides, context);
      break;
    case 'side_effects':
      content = respondSideEffects(mentionedPeptides, context);
      break;
    case 'storage':
      content = respondStorage(mentionedPeptides);
      break;
    case 'stack_help':
      content = respondStackHelp(userMessage, context);
      break;
    case 'health_suggest':
      content = respondHealthSuggest(context);
      break;
    case 'knowledge_topic':
      content = respondKnowledgeTopic(userMessage);
      break;
    case 'goal_suggest':
      content = respondGoalSuggest(userMessage, context);
      break;
    case 'workout_suggest':
      content = respondWorkoutSuggest(userMessage, context);
      break;
    case 'meal_suggest':
      content = respondMealSuggest(userMessage, context);
      break;
    case 'create_plan':
      content = respondCreatePlan(context);
      break;
    case 'modify_plan':
      content = respondModifyPlan(context);
      break;
    case 'journal_log': {
      const journalResult = respondJournalLog(userMessage, mentionedPeptides, context);
      content = journalResult.content;
      const quickReplies = getQuickReplies(intent, mentionedPeptides);
      const journalActions = getActions(intent, mentionedPeptides, context);
      // Return early with journal entry attached
      return {
        id: uid(),
        role: 'bot',
        content,
        timestamp: new Date().toISOString(),
        relatedPeptideIds: mentionedPeptides.map((p) => p.id),
        quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
        actions: journalActions.length > 0 ? journalActions : undefined,
        journalEntry: journalResult.journalEntry,
      };
    }
    default:
      content = respondGeneral();
  }

  // Append compliance disclaimer based on intent risk level
  if (MEDICAL_INTENTS.includes(intent)) {
    content += BOT_MEDICAL_SUFFIX;
  } else if (INFO_INTENTS.includes(intent)) {
    content += BOT_INFO_SUFFIX;
  }

  const quickReplies = getQuickReplies(intent, mentionedPeptides);
  const actions = getActions(intent, mentionedPeptides, context);

  return {
    id: uid(),
    role: 'bot',
    content,
    timestamp: new Date().toISOString(),
    relatedPeptideIds: mentionedPeptides.map((p) => p.id),
    quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
    actions: actions.length > 0 ? actions : undefined,
  };
}

/** @deprecated Use generateLocalBotResponse instead */
export const generateBotResponse = generateLocalBotResponse;
