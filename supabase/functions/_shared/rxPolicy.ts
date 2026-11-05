/**
 * Aimee's dosing policy — the single source of truth for every Aimee prompt.
 *
 * James, 2026-11-05:
 *   (a) FDA-approved prescription drugs: Aimee may describe the general labeled
 *       use and standard titration, cited to the US prescribing information,
 *       with "I'm not a doctor — follow your prescriber", never personalised.
 *       A per-platform switch (approvedRxLabelInfo) — iOS may need it off.
 *   (b) Research / unapproved compounds (BPC-157, TB-500 and most of the
 *       Science Based Body catalog): facts and research findings only, never
 *       human doses or protocols, on every platform (RUO / legal exposure).
 *   (c) Personalised dosing: never, anywhere.
 *
 * (b) and (c) are not switches — they are fixed off and the admin page shows
 * them locked. (a) is stored per platform in public.ai_policy_settings
 * (migration 20261105010000) and edited from peptalk.bio/admin → Aimee rules.
 * A missing table, row or read error falls back to DEFAULT_POLICY, so the
 * functions can deploy before the migration.
 */

export type ChatPlatform = 'ios' | 'android' | 'web' | 'unknown';

export function normalizePlatform(v: unknown): ChatPlatform {
  return v === 'ios' || v === 'android' || v === 'web' ? v : 'unknown';
}

export interface AiPolicy {
  /** (a) General labeled use + standard titration for FDA-approved drugs. */
  approvedRxLabelInfo: boolean;
  /** (b) Always false. Typed as a literal so it cannot be switched on. */
  researchCompoundProtocols: false;
  /** (c) Always false. */
  personalisedRxDosing: false;
}

export const DEFAULT_POLICY: AiPolicy = {
  approvedRxLabelInfo: true,
  researchCompoundProtocols: false,
  personalisedRxDosing: false,
};

/** Shown on the admin page next to the two locked switches. */
export const LOCKED_REASONS = {
  researchCompoundProtocols:
    'Research compounds are sold for research use only; giving human doses or protocols for them is a legal exposure for Science Based Body.',
  personalisedRxDosing:
    "Choosing a dose for a person is prescribing. Aimee never uses someone's labs, weight, medications or profile to suggest a dose.",
} as const;

// ─── Compound classification ─────────────────────────────────────────────

export interface ApprovedRx {
  /** Names a user might type, lowercase. The first is the display name. */
  names: string[];
  display: string;
  brands: string;
  /** General labeled use and standard titration, from the US prescribing information. */
  label: string;
}

/**
 * FDA-approved drugs Aimee may describe from the label. Where dosing differs
 * by product or indication, the entry says so and gives no number — Aimee then
 * points to that product's prescribing information instead of picking one.
 */
export const APPROVED_RX: ApprovedRx[] = [
  {
    names: ['semaglutide', 'wegovy', 'ozempic'],
    display: 'Semaglutide',
    brands: 'Wegovy (chronic weight management), Ozempic (type 2 diabetes)',
    label:
      'Once-weekly subcutaneous injection. Wegovy: 0.25 mg weekly for 4 weeks, then stepped up every 4 weeks to 0.5 mg, 1 mg, 1.7 mg and a 2.4 mg maintenance dose (1.7 mg if 2.4 mg is not tolerated). Ozempic: 0.25 mg weekly for 4 weeks, then 0.5 mg; may be increased to 1 mg and then 2 mg, each after at least 4 weeks on the current dose.',
  },
  {
    names: ['tirzepatide', 'zepbound', 'mounjaro'],
    display: 'Tirzepatide',
    brands: 'Zepbound (chronic weight management), Mounjaro (type 2 diabetes)',
    label:
      'Once-weekly subcutaneous injection. Start at 2.5 mg weekly for 4 weeks, then increase in 2.5 mg steps after at least 4 weeks on the current dose; maintenance 5, 10 or 15 mg; maximum 15 mg weekly.',
  },
  {
    names: ['tesamorelin', 'egrifta'],
    display: 'Tesamorelin',
    brands: 'Egrifta SV (excess abdominal fat in adults with HIV-associated lipodystrophy)',
    label: '2 mg subcutaneous injection once daily.',
  },
  {
    names: ['bremelanotide', 'pt-141', 'pt141', 'vyleesi'],
    display: 'Bremelanotide (PT-141)',
    brands: 'Vyleesi (acquired, generalized hypoactive sexual desire disorder in premenopausal women)',
    label:
      '1.75 mg subcutaneous injection as needed, at least 45 minutes before anticipated sexual activity; no more than one dose in 24 hours and no more than 8 doses per month.',
  },
  {
    names: ['elamipretide', 'ss-31', 'ss31', 'forzinity'],
    display: 'Elamipretide (SS-31)',
    brands: 'Forzinity (Barth syndrome)',
    label: '40 mg subcutaneous injection once daily. Other uses are investigational.',
  },
  {
    names: ['methylene blue', 'provayblue'],
    display: 'Methylene blue',
    brands: 'ProvayBlue (acquired methemoglobinemia)',
    label: 'Given intravenously in a clinical setting, 1 mg/kg over 5–30 minutes. Not a home-use product.',
  },
  {
    names: ['testosterone', 'testosterone cypionate', 'testosterone enanthate'],
    display: 'Testosterone',
    brands: 'Many approved products (injections, gels, patches) for male hypogonadism',
    label:
      'Dosing differs by product and formulation — give no number; say it depends on the specific product and point to that product\'s prescribing information and their prescriber.',
  },
  {
    names: ['hcg', 'human chorionic gonadotropin', 'pregnyl', 'novarel'],
    display: 'HCG',
    brands: 'Pregnyl, Novarel (several indications)',
    label:
      'Dosing differs by indication — give no number; say it depends on what it is prescribed for and point to the prescribing information and their prescriber.',
  },
];

/** Dietary supplements sold over the counter — not research compounds. */
export const SUPPLEMENTS = ['l-carnitine', 'carnitine', 'alpha-gpc', 'cdp-choline', 'citicoline', 'creatine'];

/**
 * Named here so the model knows they are research / unapproved even when the
 * user uses a nickname. Anything that is neither approved nor a supplement is
 * treated as a research compound too — unknown means research, never approved.
 */
export const RESEARCH_COMPOUNDS = [
  'BPC-157', 'TB-500', 'GHK-Cu', 'KPV', 'KLOW and GLOW blends', 'CJC-1295', 'Ipamorelin', 'Sermorelin (no longer marketed in the US)',
  'Retatrutide', 'Mazdutide', 'Survodutide', 'Cagrilintide', 'Tesofensine', 'MK-677 (Ibutamoren)', 'YK-11', 'Cardarine (GW-501516)',
  'AICAR', 'Thymosin Alpha 1', 'Enclomiphene', 'Semax', 'Selank', 'DSIP', 'Epithalon', 'NAD+ injections', 'LL-37', 'SNAP-8', 'MOTS-c',
  'IGF-1 LR3', 'Dihexa', '9-ME-BC', 'AOD-9604', 'Kisspeptin',
];

export type CompoundClass = 'approved_rx' | 'supplement' | 'research';

export function classifyCompound(name: string): CompoundClass {
  const n = name.trim().toLowerCase();
  if (APPROVED_RX.some((r) => r.names.some((x) => n === x || n.startsWith(`${x} `)))) return 'approved_rx';
  if (SUPPLEMENTS.some((s) => n === s || n.startsWith(`${s} `))) return 'supplement';
  return 'research';
}

// ─── Prompt text ──────────────────────────────────────────────────────────

const DISCLAIMER = "I'm not a doctor — follow your prescriber's instructions.";

/**
 * The DOSING POLICY section every Aimee prompt carries. It replaces all other
 * dosing guidance; the prompts no longer contain dose tables or protocol
 * templates, so there is nothing else for the model to quote.
 */
export function dosingPolicySection(policy: AiPolicy): string {
  const approved = policy.approvedRxLabelInfo
    ? `3. FDA-APPROVED PRESCRIPTION DRUGS (listed below): you MAY describe the general labeled use and the standard titration exactly as summarised below, and you MUST say it comes from the drug's US prescribing information (e.g. "per the Wegovy prescribing information"). Every such reply MUST include: "${DISCLAIMER}" Describe the label as written for everyone — never adjust, pick a step, or say what THEY should take. Never say where or how to obtain a prescription drug.
APPROVED DRUGS — LABEL SUMMARIES (US prescribing information):
${APPROVED_RX.map((r) => `- ${r.display} — ${r.brands}: ${r.label}`).join('\n')}`
    : `3. FDA-APPROVED PRESCRIPTION DRUGS (${APPROVED_RX.map((r) => r.display).join(', ')}): discuss them factually — what they are, how they work, what they are approved for, research and side effects — but give NO doses or titration on this platform. For dosing, say it is set out in the drug's prescribing information and decided with their prescriber. Never say where or how to obtain them.`;

  return `=== DOSING POLICY (overrides anything else in these instructions) ===
1. NEVER PERSONALISE. Never use the user's labs, weight, age, sex, medications, conditions, goals or any profile data to suggest, choose or adjust a dose, and never say "for you", "your dose" or "you should take". Doses are a decision for the user and their prescriber.
2. RESEARCH / UNAPPROVED COMPOUNDS — every peptide or compound that is not an FDA-approved drug listed below and not an over-the-counter supplement, including: ${RESEARCH_COMPOUNDS.join(', ')}. You MAY explain what they are, how they are thought to work, what has been studied (in which models — cell, animal or human — and what was found), their regulatory status, and known risks. You MUST NOT give any human dose, dose range, frequency, cycle, titration, stack, reconstitution recipe or protocol, including "research", "published", "community" or "typical" figures, and including mild/standard/aggressive tiers. Do not say where or how to get them. If asked, say plainly that PepTalk does not provide dosing or protocols for research compounds.
${approved}
4. OVER-THE-COUNTER SUPPLEMENTS (e.g. L-carnitine, alpha-GPC, citicoline, creatine): you may mention the serving range typically printed on product labels, generally and never personalised.
5. DOSING CALCULATOR: it only does reconstitution math with numbers the user already has (their vial, their water, the amount their prescriber gave them). Never fill in or suggest an amount yourself.
6. LOGGING: when the user tells you what they took, you may log exactly what they said. Logging is recording, not advice — do not comment on whether the amount is right.
=== END DOSING POLICY ===`;
}

// ─── Settings (ai_policy_settings, cached) ───────────────────────────────

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; policy: AiPolicy }>();

/** Test hook: forget cached settings. */
export function clearPolicyCache() {
  cache.clear();
}

/**
 * The policy for a platform. Unknown platforms read the iOS row (the one most
 * likely to be locked down). Any failure — table missing, row missing, network
 * — returns DEFAULT_POLICY and is not cached, so it recovers on the next call.
 */
export async function loadAiPolicy(supabase: any, platform: ChatPlatform): Promise<AiPolicy> {
  const key = platform === 'unknown' ? 'ios' : platform;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.policy;
  try {
    const { data, error } = await supabase
      .from('ai_policy_settings')
      .select('approved_rx_label_info')
      .eq('platform', key)
      .maybeSingle();
    if (error || !data || typeof data.approved_rx_label_info !== 'boolean') return DEFAULT_POLICY;
    const policy: AiPolicy = { ...DEFAULT_POLICY, approvedRxLabelInfo: data.approved_rx_label_info };
    cache.set(key, { at: Date.now(), policy });
    return policy;
  } catch {
    return DEFAULT_POLICY;
  }
}
