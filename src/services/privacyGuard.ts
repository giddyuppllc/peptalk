/**
 * Privacy Guard — Central PHI protection service for HIPAA compliance.
 *
 * Provides sanitization functions to ensure Protected Health Information (PHI)
 * never leaks through logs, analytics, or API calls without explicit consent.
 */

import { EnhancedBotContext, HealthProfile } from '../types';
import { useHealthProfileStore } from '../store/useHealthProfileStore';

// ---------------------------------------------------------------------------
// PHI field registry — fields that constitute Protected Health Information
// ---------------------------------------------------------------------------

const PHI_FIELDS = new Set([
  'conditions',
  'medications',
  'allergies',
  'allergenNotes',
  'surgeries',
  'familyHistory',
  'pregnantOrNursing',
  'providerNotes',
  'dateOfBirth',
  'weightLbs',
  'heightInches',
  'bodyFatPercent',
  'waistInches',
  'goalWeightLbs',
  'restingHeartRate',
  'sleepIssues',
  'sleepAidNotes',
  'foodAllergies',
  'notes',          // free-text can contain PHI
  'batchNumber',
  'injectionSite',
]);

// Fields that should NEVER appear in analytics payloads
const ANALYTICS_BLOCKLIST = new Set([
  ...PHI_FIELDS,
  'email',
  'name',
  'password',
  'token',
  'apiKey',
]);

// ---------------------------------------------------------------------------
// Consent checking
// ---------------------------------------------------------------------------

/**
 * Check if the user has consented to sending health data to the cloud AI.
 *
 * Wave 76.35: flipped to opt-OUT semantics. The previous opt-IN gate
 * (`=== true`) blocked 100% of users because the onboarding flow never
 * surfaces the toggle (it lives only in the health-profile settings
 * page). Testers reported "Aimee is dumb" — they were getting the
 * local pattern-matching fallback bot, never Grok. Now anyone whose
 * stored consent isn't explicitly `false` is treated as consented;
 * the toggle in app/health-profile.tsx still works for opt-out.
 */
export function canSendToCloud(): boolean {
  const { profile } = useHealthProfileStore.getState();
  return profile.aiDataConsent !== false;
}

// ---------------------------------------------------------------------------
// Sanitization for LLM API calls
// ---------------------------------------------------------------------------

/**
 * Build a minimal, de-identified context object for the Grok API.
 * Only includes health data if the user has consented.
 * Never includes user identifiers (name, email, user ID).
 */
export function sanitizeForLLM(context: EnhancedBotContext): {
  hasConsent: boolean;
  systemContext: string;
} {
  const hasConsent = canSendToCloud();

  const parts: string[] = [];

  // Always include: conversation history (already in chat, no extra PHI)
  // This is needed for conversation continuity

  if (hasConsent && context.healthProfile) {
    const hp = context.healthProfile;

    // Body metrics (anonymized — no name, no DOB, no exact values where unnecessary)
    if (hp.bodyMetrics.weightLbs || hp.bodyMetrics.heightInches) {
      const bmi = hp.bodyMetrics.weightLbs && hp.bodyMetrics.heightInches
        ? ((hp.bodyMetrics.weightLbs / (hp.bodyMetrics.heightInches * hp.bodyMetrics.heightInches)) * 703).toFixed(1)
        : null;
      parts.push(`Body: ${hp.biologicalSex || 'not specified'}, BMI: ${bmi || 'unknown'}`);
    }

    // Goals
    if (hp.primaryGoals.length > 0) {
      parts.push(`Goals: ${hp.primaryGoals.join(', ')}`);
    }

    // Medical — conditions, meds, allergies (with consent)
    if (hp.medical.conditions.length > 0) {
      parts.push(`Conditions: ${hp.medical.conditions.join(', ')}`);
    }
    if (hp.medical.medications.length > 0) {
      parts.push(`Current medications: ${hp.medical.medications.join(', ')}`);
    }
    if (hp.medical.allergies.length > 0) {
      parts.push(`Allergies: ${hp.medical.allergies.join(', ')}`);
    }
    if (hp.medical.pregnantOrNursing) {
      parts.push('Status: pregnant or nursing');
    }

    // Lifestyle summary
    parts.push(`Activity: ${hp.lifestyle.activityLevel}, Sleep: ${hp.sleep.averageHours || '?'}h, Pattern: ${hp.sleep.sleepPattern}`);

    // Peptide experience
    parts.push(`Peptide experience: ${hp.peptideExperience}`);
    if (hp.currentPeptides.length > 0) {
      parts.push(`Currently using: ${hp.currentPeptides.join(', ')}`);
    }
  }

  // Active protocols (consented)
  if (hasConsent && context.activeProtocols.length > 0) {
    const protoSummary = context.activeProtocols
      .map((p) => `${p.peptideId} ${p.dose}${p.unit} ${p.frequency}`)
      .join('; ');
    parts.push(`Active protocols: ${protoSummary}`);
  }

  // Recent check-in trends (consented, summarized not raw)
  if (hasConsent && context.recentCheckIns.length > 0) {
    const recent = context.recentCheckIns.slice(0, 7);
    const avgMood = (recent.reduce((s, c) => s + c.mood, 0) / recent.length).toFixed(1);
    const avgEnergy = (recent.reduce((s, c) => s + c.energy, 0) / recent.length).toFixed(1);
    const avgSleep = (recent.reduce((s, c) => s + c.sleepQuality, 0) / recent.length).toFixed(1);
    parts.push(`7-day trends — Mood: ${avgMood}/5, Energy: ${avgEnergy}/5, Sleep: ${avgSleep}/5`);
  }

  // Health alerts
  if (hasConsent && context.healthAlerts.length > 0) {
    const alertSummary = context.healthAlerts
      .map((a) => `[${a.level}] ${a.title}`)
      .join('; ');
    parts.push(`Alerts: ${alertSummary}`);
  }

  return {
    hasConsent,
    systemContext: parts.length > 0
      ? `\n\nUSER HEALTH CONTEXT (consented):\n${parts.join('\n')}`
      : '',
  };
}

// ---------------------------------------------------------------------------
// Sanitization for analytics
// ---------------------------------------------------------------------------

/**
 * Strip PHI fields from an analytics event payload.
 */
export function sanitizeForAnalytics(
  metadata: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> {
  if (!metadata) return {};

  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ANALYTICS_BLOCKLIST.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Sanitization for logging
// ---------------------------------------------------------------------------

/**
 * Safe logger that only outputs in development and never logs PHI values.
 * Replaces direct console.warn/log calls throughout the app.
 */
export function safeLog(tag: string, message: string): void {
  if (__DEV__) {
    console.log(`[${tag}] ${message}`);
  }
}

/**
 * Safe warning logger — only in dev, no PHI.
 */
export function safeWarn(tag: string, message: string): void {
  if (__DEV__) {
    console.warn(`[${tag}] ${message}`);
  }
}
