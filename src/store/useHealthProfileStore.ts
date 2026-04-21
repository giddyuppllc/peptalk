import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useDoseLogStore } from './useDoseLogStore';
import { useChatStore } from './useChatStore';
import { useCheckinStore } from './useCheckinStore';
import {
  HealthProfile,
  BodyMetrics,
  MedicalHistory,
  NutritionProfile,
  SleepProfile,
  LifestyleProfile,
  DeviceConnections,
  GoalType,
  BiologicalSex,
  DietType,
  SleepPattern,
  ActivityLevel,
  ConnectedDevice,
  CycleTracking,
} from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncHealthProfile } from '../services/syncService';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const emptyBody: BodyMetrics = {};

const emptyMedical: MedicalHistory = {
  conditions: [],
  medications: [],
  allergies: [],
  hasProviderSupervision: false,
};

const emptyNutrition: NutritionProfile = {
  dietType: 'no_restriction',
  supplementsUsed: [],
  foodAllergies: [],
};

const emptySleep: SleepProfile = {
  sleepPattern: 'early_bird',
  sleepIssues: [],
  usesSleepAids: false,
};

const emptyLifestyle: LifestyleProfile = {
  activityLevel: 'moderate',
  exerciseTypes: [],
  stressSources: [],
  smokingStatus: 'never',
  alcoholFrequency: 'rarely',
};

const emptyDevices: DeviceConnections = {
  connectedDevices: [],
  healthKitEnabled: false,
  googleFitEnabled: false,
};

const emptyProfile: HealthProfile = {
  bodyMetrics: emptyBody,
  medical: emptyMedical,
  nutrition: emptyNutrition,
  sleep: emptySleep,
  lifestyle: emptyLifestyle,
  devices: emptyDevices,
  primaryGoals: [],
  secondaryGoals: [],
  peptideExperience: 'none',
  currentPeptides: [],
  pastPeptides: [],
  aiDataConsent: false,
  profileCompleteness: 0,
  lastUpdated: new Date().toISOString(),
  setupComplete: false,
};

// ---------------------------------------------------------------------------
// Completeness calculator
// ---------------------------------------------------------------------------

function calcCompleteness(p: HealthProfile): number {
  let score = 0;
  let total = 0;

  // Body (20 pts)
  total += 20;
  if (p.bodyMetrics.weightLbs) score += 7;
  if (p.bodyMetrics.heightInches) score += 7;
  if (p.biologicalSex) score += 6;

  // Medical (20 pts)
  total += 20;
  if (p.medical.conditions.length > 0 || p.medical.allergies.length > 0) score += 10;
  score += 5; // just having this section means they've addressed it
  if (p.medical.hasProviderSupervision) score += 5;

  // Nutrition (15 pts)
  total += 15;
  if (p.nutrition.dietType !== 'no_restriction') score += 5;
  if (p.nutrition.supplementsUsed.length > 0) score += 5;
  if (p.nutrition.dailyProteinGrams) score += 5;

  // Sleep (15 pts)
  total += 15;
  if (p.sleep.averageHours) score += 5;
  if (p.sleep.bedtime) score += 5;
  if (p.sleep.wakeTime) score += 5;

  // Lifestyle (15 pts)
  total += 15;
  if (p.lifestyle.exerciseFrequency) score += 5;
  if (p.lifestyle.exerciseTypes.length > 0) score += 5;
  if (p.lifestyle.activityLevel !== 'moderate') score += 5; // they actually set it

  // Goals (15 pts)
  total += 15;
  if (p.primaryGoals.length > 0) score += 10;
  if (p.peptideExperience !== 'none') score += 5;

  return Math.round((score / total) * 100);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface HealthProfileStore {
  profile: HealthProfile;
  currentStep: number; // tracks setup wizard progress (0-6)

  // Step setters
  setBasicInfo: (sex?: BiologicalSex, dob?: string) => void;
  setBodyMetrics: (metrics: Partial<BodyMetrics>) => void;
  setMedicalHistory: (medical: Partial<MedicalHistory>) => void;
  setCycleTracking: (cycle: Partial<CycleTracking>) => void;
  setNutrition: (nutrition: Partial<NutritionProfile>) => void;
  setSleep: (sleep: Partial<SleepProfile>) => void;
  setLifestyle: (lifestyle: Partial<LifestyleProfile>) => void;
  setDevices: (devices: Partial<DeviceConnections>) => void;
  setGoals: (primary: GoalType[], secondary?: GoalType[]) => void;
  setPeptideExperience: (
    level: HealthProfile['peptideExperience'],
    current?: string[],
    past?: string[]
  ) => void;

  // Allergen helpers
  addAllergy: (allergy: string) => void;
  removeAllergy: (allergy: string) => void;
  addFoodAllergy: (allergy: string) => void;
  removeFoodAllergy: (allergy: string) => void;
  addCondition: (condition: string) => void;
  removeCondition: (condition: string) => void;
  addMedication: (medication: string) => void;
  removeMedication: (medication: string) => void;

  // Consent
  setAiConsent: (consent: boolean) => void;

  // Data management
  deleteAllHealthData: () => void;

  // Navigation
  setStep: (step: number) => void;
  completeSetup: () => void;
  resetProfile: () => void;

  // Queries
  hasAllergy: (substance: string) => boolean;
  hasCondition: (condition: string) => boolean;
  getBMI: () => number | null;
}

export const useHealthProfileStore = create<HealthProfileStore>()(
  persist(
    (set, get) => ({
      profile: emptyProfile,
      currentStep: 0,

      setBasicInfo: (biologicalSex, dateOfBirth) =>
        set((state) => ({
          profile: {
            ...state.profile,
            biologicalSex: biologicalSex ?? state.profile.biologicalSex,
            dateOfBirth: dateOfBirth ?? state.profile.dateOfBirth,
            profileCompleteness: calcCompleteness({
              ...state.profile,
              biologicalSex: biologicalSex ?? state.profile.biologicalSex,
            }),
            lastUpdated: new Date().toISOString(),
          },
        })),

      setBodyMetrics: (metrics) =>
        set((state) => {
          const updated = {
            ...state.profile,
            bodyMetrics: { ...state.profile.bodyMetrics, ...metrics },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setMedicalHistory: (medical) =>
        set((state) => {
          const updated = {
            ...state.profile,
            medical: { ...state.profile.medical, ...medical },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setCycleTracking: (cycle) =>
        set((state) => {
          const updated = {
            ...state.profile,
            cycle: { ...(state.profile.cycle ?? {}), ...cycle },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setNutrition: (nutrition) =>
        set((state) => {
          const updated = {
            ...state.profile,
            nutrition: { ...state.profile.nutrition, ...nutrition },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setSleep: (sleep) =>
        set((state) => {
          const updated = {
            ...state.profile,
            sleep: { ...state.profile.sleep, ...sleep },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setLifestyle: (lifestyle) =>
        set((state) => {
          const updated = {
            ...state.profile,
            lifestyle: { ...state.profile.lifestyle, ...lifestyle },
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setDevices: (devices) =>
        set((state) => ({
          profile: {
            ...state.profile,
            devices: { ...state.profile.devices, ...devices },
            lastUpdated: new Date().toISOString(),
          },
        })),

      setGoals: (primary, secondary) =>
        set((state) => {
          const updated = {
            ...state.profile,
            primaryGoals: primary,
            secondaryGoals: secondary ?? state.profile.secondaryGoals,
            lastUpdated: new Date().toISOString(),
          };
          return { profile: { ...updated, profileCompleteness: calcCompleteness(updated) } };
        }),

      setPeptideExperience: (level, current, past) =>
        set((state) => ({
          profile: {
            ...state.profile,
            peptideExperience: level,
            currentPeptides: current ?? state.profile.currentPeptides,
            pastPeptides: past ?? state.profile.pastPeptides,
            lastUpdated: new Date().toISOString(),
          },
        })),

      // List manipulation helpers
      addAllergy: (allergy) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              allergies: [...new Set([...state.profile.medical.allergies, allergy])],
            },
          },
        })),

      removeAllergy: (allergy) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              allergies: state.profile.medical.allergies.filter((a) => a !== allergy),
            },
          },
        })),

      addFoodAllergy: (allergy) =>
        set((state) => ({
          profile: {
            ...state.profile,
            nutrition: {
              ...state.profile.nutrition,
              foodAllergies: [...new Set([...state.profile.nutrition.foodAllergies, allergy])],
            },
          },
        })),

      removeFoodAllergy: (allergy) =>
        set((state) => ({
          profile: {
            ...state.profile,
            nutrition: {
              ...state.profile.nutrition,
              foodAllergies: state.profile.nutrition.foodAllergies.filter((a) => a !== allergy),
            },
          },
        })),

      addCondition: (condition) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              conditions: [...new Set([...state.profile.medical.conditions, condition])],
            },
          },
        })),

      removeCondition: (condition) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              conditions: state.profile.medical.conditions.filter((c) => c !== condition),
            },
          },
        })),

      addMedication: (medication) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              medications: [...new Set([...state.profile.medical.medications, medication])],
            },
          },
        })),

      removeMedication: (medication) =>
        set((state) => ({
          profile: {
            ...state.profile,
            medical: {
              ...state.profile.medical,
              medications: state.profile.medical.medications.filter((m) => m !== medication),
            },
          },
        })),

      // Consent
      setAiConsent: (consent) =>
        set((state) => ({
          profile: {
            ...state.profile,
            aiDataConsent: consent,
            lastUpdated: new Date().toISOString(),
          },
        })),

      // Data management — HIPAA right to erasure
      deleteAllHealthData: () => {
        set({ profile: { ...emptyProfile }, currentStep: 0 });
        // Also clear other stores that hold PHI
        try {
          const doseStore = useDoseLogStore.getState();
          const chatStore = useChatStore.getState();
          const checkinStore = useCheckinStore.getState();
          // Clear doses and protocols
          if (doseStore.doses && Array.isArray(doseStore.doses)) {
            doseStore.doses.forEach((d: { id: string }) => doseStore.deleteDose(d.id));
          }
          if (doseStore.protocols && Array.isArray(doseStore.protocols)) {
            doseStore.protocols
              .filter((p: { isActive: boolean }) => p.isActive)
              .forEach((p: { id: string }) => doseStore.deactivateProtocol(p.id));
          }
          // Clear chat
          if (chatStore.clearChat) chatStore.clearChat();
          // Clear check-ins
          if (checkinStore.clearAll) checkinStore.clearAll();
        } catch {
          // Stores may not be available yet — profile reset is still done
        }
      },

      setStep: (step) => set({ currentStep: step }),

      completeSetup: () =>
        set((state) => ({
          profile: {
            ...state.profile,
            setupComplete: true,
            lastUpdated: new Date().toISOString(),
            profileCompleteness: calcCompleteness(state.profile),
          },
        })),

      resetProfile: () => set({ profile: emptyProfile, currentStep: 0 }),

      // Queries
      hasAllergy: (substance) => {
        const { medical, nutrition } = get().profile;
        const lower = substance.toLowerCase();
        return (
          medical.allergies.some((a) => a.toLowerCase().includes(lower)) ||
          nutrition.foodAllergies.some((a) => a.toLowerCase().includes(lower))
        );
      },

      hasCondition: (condition) => {
        const lower = condition.toLowerCase();
        return get().profile.medical.conditions.some((c) =>
          c.toLowerCase().includes(lower)
        );
      },

      getBMI: () => {
        const { weightLbs, heightInches } = get().profile.bodyMetrics;
        if (!weightLbs || !heightInches || heightInches === 0) return null;
        return (weightLbs / (heightInches * heightInches)) * 703;
      },
    }),
    {
      name: 'peptalk-health-profile',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        profile: state.profile,
        currentStep: state.currentStep,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Cloud sync — fire whenever the profile changes.
// Debounced so rapid edits don't spam the network. Fire-and-forget.
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;
useHealthProfileStore.subscribe((state, prev) => {
  if (state.profile === prev.profile) return; // no change
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncHealthProfile(state.profile).catch(() => {});
  }, 800);
});

/**
 * Pull the authoritative health profile from Supabase on app boot.
 * Call this from _layout.tsx after restoreSession.
 */
export async function syncHealthProfileFromServer(): Promise<void> {
  try {
    const { supabase } = await import('../services/supabase');
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return;

    const { data } = await (supabase as any)
      .from('health_profiles')
      .select('profile, setup_complete, current_step')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.profile) {
      // Server wins on boot — overwrite local if remote exists
      useHealthProfileStore.setState({
        profile: data.profile,
        currentStep: data.current_step ?? 0,
      });
    }
  } catch {
    // offline or not yet synced — local state stands
  }
}
