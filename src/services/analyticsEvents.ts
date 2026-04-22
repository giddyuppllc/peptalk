import { getSegmentByProfile } from '../constants/segments';
import { useAuthStore } from '../store/useAuthStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { sanitizeForAnalytics } from './privacyGuard';

interface AnalyticsEventPayload {
  event: string;
  timestamp: string;
  userId?: string;
  segmentId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

const getEndpoint = () => process.env.EXPO_PUBLIC_ANALYTICS_URL ?? '';

const canShare = () => {
  const { profile } = useOnboardingStore.getState();
  return profile.dataShareConsent && profile.acceptedSafety;
};

const buildBasePayload = (): Pick<
  AnalyticsEventPayload,
  'userId' | 'segmentId'
> => {
  const { user } = useAuthStore.getState();
  const { profile } = useOnboardingStore.getState();
  const segment = getSegmentByProfile(profile.gender, profile.ageRange);
  return {
    userId: user?.id,
    segmentId: segment?.id,
  };
};

export const sendAnalyticsEvent = async (
  event: string,
  metadata: AnalyticsEventPayload['metadata'] = {}
) => {
  if (!canShare()) return;

  const payload: AnalyticsEventPayload = {
    event,
    timestamp: new Date().toISOString(),
    ...buildBasePayload(),
    metadata: sanitizeForAnalytics(metadata),
  };

  const endpoint = getEndpoint();

  if (!endpoint) {
    if (__DEV__) console.info('[Analytics] Endpoint not configured');
    return;
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[Analytics] Failed to send event', error);
  }
};

export const trackPeptideView = (peptideId: string, peptideName: string) => {
  return sendAnalyticsEvent('peptide_view', { peptideId, peptideName });
};

export const trackPeptideSearch = (query: string, resultCount: number) => {
  if (!query.trim()) return;
  return sendAnalyticsEvent('peptide_search', { query, resultCount });
};

export const trackOnboardingComplete = (interestCount: number) => {
  return sendAnalyticsEvent('onboarding_complete', { interestCount });
};

export const trackCheckInSaved = (date: string, hasNotes: boolean) => {
  return sendAnalyticsEvent('checkin_saved', { date, hasNotes });
};

export const trackConsentUpdated = (
  acceptedSafety: boolean,
  dataShareConsent: boolean
) => {
  return sendAnalyticsEvent('consent_updated', { acceptedSafety, dataShareConsent });
};

// ── Auth funnel ─────────────────────────────────────────────────────────────

export const trackSignupStarted = () => sendAnalyticsEvent('signup_started');
export const trackSignupCompleted = () => sendAnalyticsEvent('signup_completed');
export const trackSignupFailed = (reason: string) =>
  sendAnalyticsEvent('signup_failed', { reason: reason.slice(0, 120) });
export const trackLoginSucceeded = () => sendAnalyticsEvent('login_succeeded');
export const trackLoginFailed = (reason: string) =>
  sendAnalyticsEvent('login_failed', { reason: reason.slice(0, 120) });

// ── Paywall / subscription funnel ──────────────────────────────────────────

export const trackPaywallViewed = (feature: string, requiredTier: string) =>
  sendAnalyticsEvent('paywall_viewed', { feature, requiredTier });
export const trackPaywallDismissed = (feature: string) =>
  sendAnalyticsEvent('paywall_dismissed', { feature });
export const trackUpgradeInitiated = (productId: string, tier: string) =>
  sendAnalyticsEvent('upgrade_initiated', { productId, tier });
export const trackUpgradeSucceeded = (productId: string, tier: string) =>
  sendAnalyticsEvent('upgrade_succeeded', { productId, tier });
export const trackUpgradeFailed = (productId: string, reason: string) =>
  sendAnalyticsEvent('upgrade_failed', { productId, reason: reason.slice(0, 120) });
export const trackRestoreAttempted = () => sendAnalyticsEvent('restore_attempted');
export const trackRestoreSucceeded = (restoredCount: number) =>
  sendAnalyticsEvent('restore_succeeded', { restoredCount });
export const trackRestoreFailed = (reason: string) =>
  sendAnalyticsEvent('restore_failed', { reason: reason.slice(0, 120) });

// ── Core actions ────────────────────────────────────────────────────────────

export const trackMealLogged = (mealType: string, hasPhoto: boolean) =>
  sendAnalyticsEvent('meal_logged', { mealType, hasPhoto });
export const trackDoseLogged = (peptideId: string) =>
  sendAnalyticsEvent('dose_logged', { peptideId });
export const trackWorkoutLogged = (durationMinutes: number) =>
  sendAnalyticsEvent('workout_logged', { durationMinutes });
export const trackChatMessageSent = (isAI: boolean) =>
  sendAnalyticsEvent('chat_message_sent', { isAI });
export const trackFeatureGated = (feature: string, currentTier: string) =>
  sendAnalyticsEvent('feature_gated', { feature, currentTier });
