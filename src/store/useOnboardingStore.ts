import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AgeRange,
  Ethnicity,
  Gender,
  GoalType,
  MaritalStatus,
  OnboardingProfile,
  PeptideCategory,
  ReferralClaim,
  ReferralSource,
} from '../types';
import { secureStorage } from '../services/secureStorage';

interface OnboardingStore {
  profile: OnboardingProfile;
  isComplete: boolean;
  hasHydrated: boolean;
  /** Whether the user has accepted the peptide research/education disclaimer */
  acceptedPeptideDisclaimer: boolean;
  setAcceptedPeptideDisclaimer: (accepted: boolean) => void;
  /** Whether the user has accepted the live community chat disclaimer.
   *  Shown the first time they enter any /community/live/[eventId] room. */
  acceptedLiveChatDisclaimer: boolean;
  setAcceptedLiveChatDisclaimer: (accepted: boolean) => void;
  /** Dosing calculator "Simple mode" preference. When true the
   *  calculator hides advanced inputs (intensity picker, titration
   *  ladder, weight-based dosing, supplies estimator) and shows just
   *  peptide → dose → frequency → BAC water → Calculate. Defaults to
   *  true for new accounts — most users don't need the deep-research
   *  surface and the previous default was overwhelming. */
  simpleCalculatorMode: boolean;
  setSimpleCalculatorMode: (simple: boolean) => void;
  /** Advanced workout inputs (RPE, tempo, %1RM, rest interval). Off by
   *  default — the simplified custom builder only captures sets × reps.
   *  Power users can flip this on in Profile → Settings to expose the
   *  full set-prescription form. */
  showAdvancedFitness: boolean;
  setShowAdvancedFitness: (show: boolean) => void;
  setGender: (gender: Gender) => void;
  setAgeRange: (ageRange: AgeRange) => void;
  setEthnicity: (ethnicity: Ethnicity) => void;
  setMaritalStatus: (status: MaritalStatus) => void;
  setReferralSource: (source: ReferralSource) => void;
  /** Intake referral-claim string (§11.2). Free text — server resolves
   *  it against the user_referrals table at signup. */
  referralClaim: ReferralClaim | null;
  setReferralClaim: (raw: string) => void;
  clearReferralClaim: () => void;
  setHealthGoals: (goals: GoalType[]) => void;
  toggleHealthGoal: (goal: GoalType) => void;
  setInterestCategories: (categories: PeptideCategory[]) => void;
  toggleInterestCategory: (category: PeptideCategory) => void;
  setAcceptedSafety: (accepted: boolean) => void;
  setDataShareConsent: (consent: boolean) => void;
  completeOnboarding: () => void;
  reset: () => void;

  /**
   * Server restore progress for the signed-in user (see
   * src/services/onboardingRestore.ts). Session-only — never persisted, so a
   * stored value can never stand in for a restore that did not run.
   *
   * `serverKnown` is the part 'settled' does NOT say. Settled means the
   * restore stopped; it is written identically by a success, a timeout and a
   * thrown error. Only `serverKnown` says the server's copy of this user's
   * answers was actually read — which is the precondition for overwriting it.
   */
  restore: { userId: string | null; status: 'idle' | 'pending' | 'settled'; serverKnown: boolean };
  setRestoreStatus: (
    userId: string | null,
    status: 'idle' | 'pending' | 'settled',
    meta?: { serverKnown?: boolean },
  ) => void;
  /** First unanswered step found by the restore, for the onboarding screen to open at. */
  resumeStep: { userId: string; step: 1 | 2 | 3 } | null;
  setResumeStep: (resume: { userId: string; step: 1 | 2 | 3 } | null) => void;
}

const emptyProfile: OnboardingProfile = {
  gender: null,
  ageRange: null,
  ethnicity: null,
  maritalStatus: null,
  referralSource: null,
  healthGoals: [],
  interestCategories: [],
  acceptedSafety: false,
  dataShareConsent: false,
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      profile: emptyProfile,
      isComplete: false,
      hasHydrated: false,
      acceptedPeptideDisclaimer: false,
      setAcceptedPeptideDisclaimer: (acceptedPeptideDisclaimer) =>
        set({ acceptedPeptideDisclaimer }),
      acceptedLiveChatDisclaimer: false,
      setAcceptedLiveChatDisclaimer: (acceptedLiveChatDisclaimer) =>
        set({ acceptedLiveChatDisclaimer }),
      simpleCalculatorMode: true,
      setSimpleCalculatorMode: (simpleCalculatorMode) =>
        set({ simpleCalculatorMode }),
      showAdvancedFitness: false,
      setShowAdvancedFitness: (showAdvancedFitness) =>
        set({ showAdvancedFitness }),

      setGender: (gender) =>
        set((state) => ({ profile: { ...state.profile, gender } })),
      setAgeRange: (ageRange) =>
        set((state) => ({ profile: { ...state.profile, ageRange } })),
      setEthnicity: (ethnicity) =>
        set((state) => ({ profile: { ...state.profile, ethnicity } })),
      setMaritalStatus: (maritalStatus) =>
        set((state) => ({ profile: { ...state.profile, maritalStatus } })),
      setReferralSource: (referralSource) =>
        set((state) => ({ profile: { ...state.profile, referralSource } })),
      referralClaim: null,
      setReferralClaim: (raw) =>
        set({
          referralClaim: raw.trim()
            ? { raw: raw.trim(), claimedAt: new Date().toISOString() }
            : null,
        }),
      clearReferralClaim: () => set({ referralClaim: null }),
      setHealthGoals: (healthGoals) =>
        set((state) => ({ profile: { ...state.profile, healthGoals } })),
      toggleHealthGoal: (goal) => {
        const { profile } = get();
        const next = profile.healthGoals.includes(goal)
          ? profile.healthGoals.filter((g) => g !== goal)
          : [...profile.healthGoals, goal];
        set((state) => ({
          profile: { ...state.profile, healthGoals: next },
        }));
      },
      setInterestCategories: (interestCategories) =>
        set((state) => ({
          profile: { ...state.profile, interestCategories },
        })),
      toggleInterestCategory: (category) => {
        const { profile } = get();
        const next = profile.interestCategories.includes(category)
          ? profile.interestCategories.filter((c) => c !== category)
          : [...profile.interestCategories, category];
        set((state) => ({
          profile: { ...state.profile, interestCategories: next },
        }));
      },
      setAcceptedSafety: (acceptedSafety) =>
        set((state) => ({ profile: { ...state.profile, acceptedSafety } })),
      setDataShareConsent: (dataShareConsent) =>
        set((state) => ({ profile: { ...state.profile, dataShareConsent } })),

      completeOnboarding: () => set({ isComplete: true }),
      // Both callers — the logout wipe and Delete My Data — leave the device
      // with no answers on it. The restore state has to go with them: left at
      // 'settled', the mirror treats the emptied store as an edit worth
      // uploading, and a device-only wipe destroys the server record.
      reset: () =>
        set({
          profile: emptyProfile,
          isComplete: false,
          resumeStep: null,
          restore: { userId: null, status: 'idle', serverKnown: false },
        }),

      restore: { userId: null, status: 'idle', serverKnown: false },
      setRestoreStatus: (userId, status, meta) =>
        set({ restore: { userId, status, serverKnown: meta?.serverKnown === true } }),
      resumeStep: null,
      setResumeStep: (resumeStep) => set({ resumeStep }),
    }),
    {
      name: 'peptalk-onboarding',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        profile: state.profile,
        isComplete: state.isComplete,
        acceptedPeptideDisclaimer: state.acceptedPeptideDisclaimer,
        acceptedLiveChatDisclaimer: state.acceptedLiveChatDisclaimer,
        simpleCalculatorMode: state.simpleCalculatorMode,
        showAdvancedFitness: state.showAdvancedFitness,
      }),
      onRehydrateStorage: () => (state) => {
        const safeProfile = {
          ...emptyProfile,
          ...state?.profile,
          healthGoals: state?.profile?.healthGoals ?? [],
          interestCategories: state?.profile?.interestCategories ?? [],
        };
        useOnboardingStore.setState({
          profile: safeProfile,
          isComplete: state?.isComplete ?? false,
          acceptedPeptideDisclaimer: state?.acceptedPeptideDisclaimer ?? false,
          acceptedLiveChatDisclaimer: state?.acceptedLiveChatDisclaimer ?? false,
          simpleCalculatorMode: state?.simpleCalculatorMode ?? true,
          showAdvancedFitness: state?.showAdvancedFitness ?? false,
          hasHydrated: true,
        });
      },
    }
  )
);
