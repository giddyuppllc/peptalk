/**
 * Data Export Service — GDPR/privacy-compliant data export.
 *
 * Aggregates all user data from Zustand stores into a JSON structure
 * that can be shared via the system share sheet.
 */

import { Share, Platform } from 'react-native';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useStackStore } from '../store/useStackStore';
import { useJournalStore } from '../store/useJournalStore';
import { useMealStore } from '../store/useMealStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportData {
  exportDate: string;
  appVersion: string;
  platform: string;
  profile: Record<string, unknown>;
  checkIns: unknown[];
  doseLog: {
    protocols: unknown[];
    doses: unknown[];
  };
  stacks: unknown[];
  journal: unknown[];
  meals: {
    targets: unknown;
    meals: unknown[];
    customFoods: unknown[];
    waterLog: Record<string, number>;
    mealPlan: unknown[];
  };
  workouts: {
    logs: unknown[];
    activeProgram: unknown;
  };
  subscription: {
    tier: string;
    expiresAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

/**
 * Gather all user data into a single exportable object.
 */
export function gatherAllData(): ExportData {
  const onboarding = useOnboardingStore.getState();
  const checkin = useCheckinStore.getState();
  const doseLog = useDoseLogStore.getState();
  const stacks = useStackStore.getState();
  const journal = useJournalStore.getState();
  const meals = useMealStore.getState();
  const workouts = useWorkoutStore.getState();
  const subscription = useSubscriptionStore.getState();

  return {
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0',
    platform: Platform.OS,
    profile: {
      ...onboarding.profile,
    },
    checkIns: checkin.entries,
    doseLog: {
      protocols: doseLog.protocols,
      doses: doseLog.doses,
    },
    stacks: stacks.savedStacks,
    journal: journal.entries,
    meals: {
      targets: meals.targets,
      meals: meals.meals,
      customFoods: meals.customFoods,
      waterLog: meals.waterLog,
      mealPlan: meals.mealPlan,
    },
    workouts: {
      logs: workouts.logs,
      activeProgram: workouts.activeProgram,
    },
    subscription: {
      tier: subscription.tier,
      expiresAt: subscription.expiresAt,
    },
  };
}

/**
 * Export all user data as JSON via the share sheet.
 */
export async function exportUserData(): Promise<boolean> {
  try {
    const data = gatherAllData();
    const json = JSON.stringify(data, null, 2);

    const result = await Share.share({
      message: json,
      title: 'PepTalk Data Export',
    });

    return result.action === Share.sharedAction;
  } catch (error) {
    if (__DEV__) console.warn('[exportService] Export failed:', error);
    return false;
  }
}
