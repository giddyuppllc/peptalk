/**
 * Aimee — what may reach the AI provider when the user has not consented to
 * sharing health data. Server-side enforcement; pure, so jest can test it.
 *
 * App Review 5.1.2: the client sends `hasConsent` (the aiDataConsent toggle in
 * app/health-profile.tsx) alongside pre-summarised health context. Until
 * 2026-09-15 both the client and both prompt builders sent/rendered every
 * summary regardless of the flag; only a one-line "has NOT consented" note
 * changed. A tampered or stale client must not be able to override that, so the
 * server drops the fields itself.
 *
 * Mirrors src/lib/aiDataConsent.ts on the client — a jest test asserts the two
 * field lists are identical.
 */

/** Fields that describe the user's body, health, activity or medication. */
export const PERSONAL_CONTEXT_FIELDS = [
  'activeProtocolSummary',
  'recentDosesSummary',
  'healthAlertsSummary',
  'healthProfileSummary',
  'biometricsSummary',
  'labResultsSummary',
  'workoutSummary',
  'nutritionSummary',
  'bodyTrendSummary',
  'selfStatedGoal',
  'workoutDaysPerWeek',
] as const;

export type PersonalContextField = (typeof PERSONAL_CONTEXT_FIELDS)[number];

/**
 * Returns the context with every personal field removed unless `hasConsent` is
 * exactly true. Non-personal fields (tier, simpleMode, currentRoute) pass
 * through. Never mutates the input.
 */
export function applyAiDataConsent<T extends { hasConsent?: boolean }>(context: T): T {
  if (context.hasConsent === true) return context;
  const out: Record<string, unknown> = { ...context, hasConsent: false };
  for (const field of PERSONAL_CONTEXT_FIELDS) delete out[field];
  return out as T;
}

/**
 * Tools that read the user's stored health records server-side and return them
 * to the model. Without consent they are neither offered nor executed.
 */
export const CONSENT_REQUIRED_TOOLS = ['summarize_pattern', 'get_user_metrics'] as const;

export function toolRequiresAiDataConsent(name: string): boolean {
  return (CONSENT_REQUIRED_TOOLS as readonly string[]).includes(name);
}

export function toolsAllowedForConsent<T extends { function: { name: string } }>(
  tools: T[],
  hasConsent: boolean,
): T[] {
  return hasConsent ? tools : tools.filter((t) => !toolRequiresAiDataConsent(t.function.name));
}
