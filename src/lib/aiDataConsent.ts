/**
 * Client side of Aimee's health-data consent (App Review 5.1.2).
 *
 * When the user has turned aiDataConsent off, the request to aimee-chat /
 * aimee-chat-stream carries no health profile, Apple Health / Health Connect
 * metrics, lab values, dose history, workouts, nutrition or goals — only the
 * non-personal fields. The server enforces the same rule independently
 * (supabase/functions/_shared/aimeeConsent.ts); a jest test asserts the two
 * field lists match.
 */

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

/** Removes every personal field unless `hasConsent` is exactly true. Never mutates. */
export function applyAiDataConsent<T extends { hasConsent?: boolean }>(context: T): T {
  if (context.hasConsent === true) return context;
  const out: Record<string, unknown> = { ...context, hasConsent: false };
  for (const field of PERSONAL_CONTEXT_FIELDS) delete out[field];
  return out as T;
}
