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
  setGender: (gender: Gender) => void;
  setAgeRange: (ageRange: AgeRange) => void;
  setEthnicity: (ethnicity: Ethnicity) => void;
  setMaritalStatus: (status: MaritalStatus) => void;
  setReferralSource: (source: ReferralSource) => void;
  setHealthGoals: (goals: GoalType[]) => void;
  toggleHealthGoal: (goal: GoalType) => void;
  setInterestCategories: (categories: PeptideCategory[]) => void;
  toggleInterestCategory: (category: PeptideCategory) => void;
  setAcceptedSafety: (accepted: boolean) => void;
  setDataShareConsent: (consent: boolean) => void;
  completeOnboarding: () => void;
  reset: () => void;
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
      reset: () => set({ profile: emptyProfile, isComplete: false }),
    }),
    {
      name: 'peptalk-onboarding',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        profile: state.profile,
        isComplete: state.isComplete,
        acceptedPeptideDisclaimer: state.acceptedPeptideDisclaimer,
        acceptedLiveChatDisclaimer: state.acceptedLiveChatDisclaimer,
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
          hasHydrated: true,
        });
      },
    }
  )
);
