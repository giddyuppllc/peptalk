/**
 * Client side of Aimee's health-data consent for the AI edge functions other
 * than chat. Mirrors supabase/functions/_shared/aiFeatureConsent.ts — a jest
 * test asserts the two registries match exactly.
 *
 * The app has two separate consents and they are not interchangeable:
 *
 *   - `useAiConsentStore.consented` (the launch modal, `ensureAiConsent()`)
 *     — "may we send your messages, voice and photos to an AI provider".
 *   - `profile.aiDataConsent` (the health toggle, `canSendToCloud()`)
 *     — "may we use your HEALTH PROFILE for personalised AI responses".
 *
 * Every call below used to check only the first. Route each request body
 * through `withHealthConsent()` and the second is enforced too: health fields
 * are dropped, `hasConsent` is stamped so the server can enforce it again, and
 * the features that are meaningless without health data refuse up front via
 * `healthConsentGranted()`.
 */

import { canSendToCloud } from '../services/privacyGuard';

export const AI_FEATURE_HEALTH_FIELDS: Record<string, readonly string[]> = {
  'aimee-lab-interpret': ['results', 'activePeptides', 'profile'],
  'lab-scan': ['imageBase64'],
  'aimee-report-rewrite': ['body', 'headline', 'recommendation'],
  'aimee-pantry-meal': ['allergens', 'activeStackPeptides'],
  'aimee-plan': ['allergens', 'goals', 'dietType'],
  'aimee-recipe': ['allergens'],
  'aimee-workout': ['gender'],
  'aimee-voice': [],
  'food-scan': [],
  'aimee-pantry-scan': [],
};

export const CONSENT_REQUIRED_FUNCTIONS: readonly string[] = [
  'aimee-lab-interpret',
  'lab-scan',
  'aimee-report-rewrite',
];

export const AI_FEATURE_FUNCTIONS: readonly string[] = Object.keys(AI_FEATURE_HEALTH_FIELDS);

export function requiresHealthConsent(fn: string): boolean {
  return CONSENT_REQUIRED_FUNCTIONS.includes(fn);
}

export function healthFieldsFor(fn: string): readonly string[] {
  return AI_FEATURE_HEALTH_FIELDS[fn] ?? [];
}

/** Pure — the server half of the same rule, exported so the mirror test can run it. */
export function stripHealthFields<T extends object>(fn: string, body: T, consent: boolean): T {
  if (consent === true) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>), hasConsent: false };
  for (const field of healthFieldsFor(fn)) delete out[field];
  return out as T;
}

/**
 * Has the user allowed their health profile to reach the AI provider?
 * Call this before a `CONSENT_REQUIRED_FUNCTIONS` request and abort on false.
 */
export function healthConsentGranted(): boolean {
  return canSendToCloud();
}

/**
 * Stamp `hasConsent` on an outgoing AI request body and remove the health
 * fields when the toggle is off. Every client call to a function in
 * `AI_FEATURE_HEALTH_FIELDS` must send a body built by this.
 */
export function withHealthConsent<T extends object>(
  fn: string,
  body: T,
): T & { hasConsent: boolean } {
  const consent = canSendToCloud();
  return stripHealthFields(fn, { ...body, hasConsent: consent }, consent) as T & {
    hasConsent: boolean;
  };
}
