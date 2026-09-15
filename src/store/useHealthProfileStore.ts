import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useDoseLogStore } from './useDoseLogStore';
import { useChatStore } from './useChatStore';
import { useCheckinStore } from './useCheckinStore';
import { HealthProfile, BodyMetrics, MedicalHistory, NutritionProfile, SleepProfile, LifestyleProfile, DeviceConnections, GoalType, BiologicalSex, CycleTracking, OnboardingSnapshot } from '../types';
import type { ServerProfileFetch } from '../lib/onboardingRestore';
import { secureStorage } from '../services/secureStorage';
import { syncHealthProfile } from '../services/syncService';
import { Clamps, clampNumber } from '../utils/inputClamps';

// ---------------------------------------------------------------------------
// Local-only changes
// ---------------------------------------------------------------------------

/** >0 while a change must stay on this device (see the sync subscription). */
let profileSyncSuppressed = 0;

/**
 * Run `fn` without its profile changes reaching the server. Scoped: zustand
 * notifies subscribers synchronously inside `set`, so only changes made during
 * `fn` are skipped — the next ordinary edit syncs as normal. A counter rather
 * than a boolean so a nested call cannot re-enable sync for its outer caller.
 */
export function withoutProfileSync<T>(fn: () => T): T {
  profileSyncSuppressed += 1;
  try {
    return fn();
  } finally {
    profileSyncSuppressed -= 1;
  }
}

/**
 * True while inside withoutProfileSync. For the OTHER uploads of profile data
 * that do not go through this store's subscription — the onboarding restore's
 * mirror (src/services/onboardingRestore.ts) upserts health_profiles directly,
 * and a device wipe must not reach the server through it either.
 */
export function isProfileSyncSuppressed(): boolean {
  return profileSyncSuppressed > 0;
}

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
  aiDataConsent: true,
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
  /** Free-text goal expansion + feature-wish feedback. */
  setGoalNotes: (notes: string) => void;
  setFeatureWish: (wish: string) => void;
  /** Onboarding answers mirrored for restore on another device. */
  setOnboardingSnapshot: (snapshot: OnboardingSnapshot) => void;
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
          // Clamp every numeric input so a typo / paste / bad import
          // can't poison BMR, Aimee context, or the muscle-growth chart.
          // Pre-clamp wave (76.10 audit) found 9 unbounded entry points
          // — onboarding + health-profile + check-in + plan calc + Aimee
          // all converge here.
          const clamped: Partial<typeof state.profile.bodyMetrics> = {};
          if ('weightLbs' in metrics) clamped.weightLbs = Clamps.weightLbs(metrics.weightLbs);
          if ('heightInches' in metrics) clamped.heightInches = clampNumber((metrics as any).heightInches, 36, 96);
          if ('bodyFatPercent' in metrics) clamped.bodyFatPercent = Clamps.bodyFatPct(metrics.bodyFatPercent);
          if ('waistInches' in metrics) clamped.waistInches = Clamps.limbInches(metrics.waistInches);
          if ('goalWeightLbs' in metrics) clamped.goalWeightLbs = Clamps.weightLbs(metrics.goalWeightLbs);
          // Pass-through anything the clamp module doesn't know about
          // (target_macros etc) — better to let unknown fields land than
          // silently drop them.
          const merged = { ...state.profile.bodyMetrics, ...metrics, ...clamped };
          const updated = {
            ...state.profile,
            bodyMetrics: merged,
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

      setGoalNotes: (notes) =>
        set((state) => ({
          profile: {
            ...state.profile,
            goalNotes: notes,
            lastUpdated: new Date().toISOString(),
          },
        })),

      setFeatureWish: (wish) =>
        set((state) => ({
          profile: {
            ...state.profile,
            featureWish: wish,
            lastUpdated: new Date().toISOString(),
          },
        })),

      setOnboardingSnapshot: (snapshot) =>
        set((state) => ({
          profile: {
            ...state.profile,
            onboarding: snapshot,
            lastUpdated: new Date().toISOString(),
          },
        })),

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

      // List manipulation helpers. Every "add" routes through
      // Clamps.medicalTag (≤80 chars, trimmed) so a paste-bomb into
      // an allergies/conditions/medications field doesn't blow up
      // the Aimee prompt budget or saturate the row size on sync.
      addAllergy: (allergy) =>
        set((state) => {
          const clean = Clamps.medicalTag(allergy);
          if (!clean) return state;
          if (state.profile.medical.allergies.some((a) => a.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return {
            profile: {
              ...state.profile,
              medical: {
                ...state.profile.medical,
                allergies: [...state.profile.medical.allergies, clean],
              },
            },
          };
        }),

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
        set((state) => {
          const clean = Clamps.medicalTag(condition);
          if (!clean) return state;
          if (state.profile.medical.conditions.some((c) => c.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return {
            profile: {
              ...state.profile,
              medical: {
                ...state.profile.medical,
                conditions: [...state.profile.medical.conditions, clean],
              },
            },
          };
        }),

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
        set((state) => {
          const clean = Clamps.medicalTag(medication);
          if (!clean) return state;
          if (state.profile.medical.medications.some((m) => m.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return {
            profile: {
              ...state.profile,
              medical: {
                ...state.profile.medical,
                medications: [...state.profile.medical.medications, clean],
              },
            },
          };
        }),

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

      // Device-local. Both callers — Profile → "Delete My Data" and the logout
      // wipe — describe clearing THIS device. Without the suppression the
      // cloud-sync subscription below saw an empty profile as an edit and
      // upserted it over the server copy, silently destroying the data that
      // onboarding restore and the user's other devices read back. Removing
      // the server copy is delete-user's job (Delete Account), never this.
      resetProfile: () =>
        withoutProfileSync(() => set({ profile: emptyProfile, currentStep: 0 })),

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
      // Wave 76.35: existing testers all have aiDataConsent: false
      // from the old opt-IN default. Onboarding never surfaced the
      // toggle, so 100% were getting the local pattern-matching bot
      // instead of Grok ("Aimee is dumb" — never worked). Bump the
      // version + flip the persisted value once. Users who explicitly
      // hit the opt-out toggle after this migration still get respect.
      version: 2,
      migrate: (persisted: any, fromVersion) => {
        if (fromVersion < 2 && persisted?.profile) {
          persisted.profile.aiDataConsent = true;
        }
        return persisted;
      },
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
  // A local-only change (see withoutProfileSync). Returns BEFORE touching the
  // timer: a real edit made just before the reset is still owed its sync, and
  // cancelling it here would drop that edit rather than protect anything.
  if (profileSyncSuppressed > 0) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncHealthProfile(state.profile).catch(() => {});
  }, 800);
});

/**
 * Pull the authoritative health profile from Supabase on app boot.
 * Call this from _layout.tsx after restoreSession.
 *
 * Returns what it found, because the onboarding restore decides on it: "no
 * row" and "could not ask" must not look alike. `error` used to be ignored, so
 * a PostgREST failure read as a user with no profile.
 *
 * Concurrent calls share one request. Boot, the sign-in effect and the
 * onboarding restore all ask at nearly the same moment; separate requests
 * could land in any order, and a later "server wins" overwrite would wipe a
 * snapshot the restore had just written into the store.
 */
let inflightServerProfile: Promise<ServerProfileFetch> | null = null;

/**
 * Lazy, as before, so boot does not pull the client in early. A parameter only
 * so tests can hand in a client: jest cannot run a dynamic import() without
 * --experimental-vm-modules, and would report every case as a fetch error.
 */
type SupabaseLoader = () => Promise<{ supabase: unknown }>;
const loadSupabase: SupabaseLoader = () => import('../services/supabase');

export function syncHealthProfileFromServer(
  load: SupabaseLoader = loadSupabase,
): Promise<ServerProfileFetch> {
  if (inflightServerProfile) return inflightServerProfile;
  const request = (async (): Promise<ServerProfileFetch> => {
    try {
      const { supabase } = await load();
      const { data: { user }, error: userError } = await (supabase as any).auth.getUser();
      // supabase-js reports "no session" as an AuthSessionMissingError too;
      // only a DIFFERENT error means it could not tell.
      if (!user) {
        return userError && userError.name !== 'AuthSessionMissingError'
          ? { status: 'error' }
          : { status: 'signed-out' };
      }

      const { data, error } = await (supabase as any)
        .from('health_profiles')
        .select('profile, setup_complete, current_step')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return { status: 'error' };

      if (data?.profile) {
        // Server wins on boot — overwrite local if remote exists
        useHealthProfileStore.setState({
          profile: data.profile,
          currentStep: data.current_step ?? 0,
        });
      }
      return { status: 'ok', userId: user.id, profile: data?.profile ?? null };
    } catch {
      // offline or not yet synced — local state stands
      return { status: 'error' };
    }
  })();
  inflightServerProfile = request;
  void request.finally(() => {
    if (inflightServerProfile === request) inflightServerProfile = null;
  });
  return request;
}
