/**
 * Aimee's health-data consent, for the AI edge functions OTHER than chat.
 *
 * `_shared/aimeeConsent.ts` covers aimee-chat / aimee-chat-stream, whose
 * request carries one pre-summarised `AimeeServerContext`. The rest of the AI
 * surface — lab interpretation, the lab photo scanner, the weekly-report
 * rewrite, meal plans, recipes, pantry suggestions, workout design — each POST
 * their own body shape, and until 2026-09-16 not one of them consulted the
 * health toggle at all. Accepting the launch-time AI modal (a different
 * consent, `useAiConsentStore`) was enough to send lab values, a photo of a
 * lab report, dose logs, side-effect severities, check-in moods, medical and
 * food allergies, the active peptide stack, goals, age and sex.
 *
 * Two rules, keyed by edge-function name:
 *
 *   - REFUSE:  the feature is meaningless without health data, so without
 *              consent the function does not run at all.
 *   - STRIP:   the feature still works, so the health fields are deleted from
 *              the body and everything else proceeds.
 *
 * Enforced here as well as on the client (src/lib/aiFeatureConsent.ts) so a
 * stale or tampered client cannot override it. A jest test asserts the two
 * registries are byte-identical and that every function below actually calls
 * one of these helpers.
 *
 * DEPLOY ORDER: these functions read `hasConsent` off the request body and
 * treat an ABSENT flag as "no consent", exactly as aimee-chat already does.
 * A client build that predates src/lib/aiFeatureConsent.ts sends no flag, so
 * deploying these functions ahead of the app strips health fields for everyone
 * on the old build. Ship the app first, or at the same time.
 */

/**
 * Health fields each AI edge function's request body may carry.
 *
 * An entry with an empty list is a deliberate statement, not an omission: that
 * function carries no health field, so there is nothing to strip. The launch
 * AI-consent modal (which names messages, voice and photos) is what covers it.
 * Adding a health field to one of those bodies without adding it here is what
 * `scripts/verify-ai-consent.mjs` fails on.
 */
export const AI_FEATURE_HEALTH_FIELDS: Record<string, readonly string[]> = {
  // ── refuse without consent ────────────────────────────────────────────────
  /** Lab panel, active peptide ids, age, sex, goals. */
  'aimee-lab-interpret': ['results', 'activePeptides', 'profile'],
  /** A photograph of a lab report. The image IS the health record. */
  'lab-scan': ['imageBase64'],
  /** Templated weekly report: dose counts, side-effect severities, moods. */
  'aimee-report-rewrite': ['body', 'headline', 'recommendation'],

  // ── strip without consent ─────────────────────────────────────────────────
  /** Medical + food allergies, and the user's active peptide stack. */
  'aimee-pantry-meal': ['allergens', 'activeStackPeptides'],
  /** Medical + food allergies, health-profile goals and diet type. */
  'aimee-plan': ['allergens', 'goals', 'dietType'],
  /** Medical + food allergies. `constraints` is screen state the user typed. */
  'aimee-recipe': ['allergens'],
  /** Derived from profile.biologicalSex. goal/days/location are screen state. */
  'aimee-workout': ['gender'],

  // ── no health field in the body ───────────────────────────────────────────
  /** An audio clip of the user speaking. */
  'aimee-voice': [],
  /** A photograph of a meal. */
  'food-scan': [],
  /** A photograph of a pantry shelf. */
  'aimee-pantry-scan': [],
};

/** Functions that must not run at all without health-data consent. */
export const CONSENT_REQUIRED_FUNCTIONS: readonly string[] = [
  'aimee-lab-interpret',
  'lab-scan',
  'aimee-report-rewrite',
];

/** Every function this module governs. */
export const AI_FEATURE_FUNCTIONS: readonly string[] = Object.keys(AI_FEATURE_HEALTH_FIELDS);

export function requiresHealthConsent(fn: string): boolean {
  return CONSENT_REQUIRED_FUNCTIONS.includes(fn);
}

export function healthFieldsFor(fn: string): readonly string[] {
  return AI_FEATURE_HEALTH_FIELDS[fn] ?? [];
}

/** True only for an explicit `hasConsent: true`. Absent or falsy ⇒ no consent. */
export function hasHealthConsent(body: unknown): boolean {
  return (body as { hasConsent?: unknown } | null)?.hasConsent === true;
}

/**
 * Returns the body with every health field for `fn` removed unless consent is
 * exactly true. Never mutates the input.
 */
export function stripHealthFields<T extends object>(fn: string, body: T, consent: boolean): T {
  if (consent === true) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>), hasConsent: false };
  for (const field of healthFieldsFor(fn)) delete out[field];
  return out as T;
}

/**
 * The single call each edge function makes. Returns `{ refuse: true }` when the
 * function is on the refuse list and consent is absent — the caller answers 403
 * — otherwise the body with health fields stripped as needed.
 */
export function applyFeatureConsent<T extends object>(
  fn: string,
  body: T,
): { refuse: true; body: T } | { refuse: false; body: T } {
  const consent = hasHealthConsent(body);
  if (!consent && requiresHealthConsent(fn)) return { refuse: true, body };
  return { refuse: false, body: stripHealthFields(fn, body, consent) };
}

/**
 * The refusal payload. Reuses the string the client already shows for a
 * declined AI consent (src/services/labAnalysisService.ts) — no new copy.
 */
export const HEALTH_CONSENT_REFUSAL = {
  error: 'AI features need your consent — you can enable them any time.',
  consent: true,
} as const;
