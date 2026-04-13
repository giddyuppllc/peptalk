/**
 * Dev Accounts — Only available in development builds.
 * Hidden in production via __DEV__ flag.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Spacing } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import { useAuthStore } from '../src/store/useAuthStore';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import { useHealthProfileStore } from '../src/store/useHealthProfileStore';
import { DASHBOARD_SEGMENTS } from '../src/constants/segments';
import type { Gender, AgeRange, GoalType, PeptideCategory, BiologicalSex, ActivityLevel, SleepPattern, DietType } from '../src/types';

interface HealthData {
  sex: BiologicalSex;
  dob: string;
  weightLbs: number;
  heightInches: number;
  bodyFatPercent?: number;
  goalWeightLbs?: number;
  activityLevel: ActivityLevel;
  exerciseFrequency: number;
  exerciseTypes: string[];
  sleepHours: number;
  sleepPattern: SleepPattern;
  dietType: DietType;
  peptideExperience: 'none' | 'beginner' | 'intermediate' | 'experienced';
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  supplements?: string[];
}

interface TestAccount {
  name: string;
  email: string;
  gender: Gender;
  ageRange: AgeRange;
  goals: GoalType[];
  interests: PeptideCategory[];
  tier: 'free' | 'plus' | 'pro';
  health: HealthData;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    name: 'Jake (Send It)',
    email: 'jake@test.com',
    gender: 'Male',
    ageRange: '18-29',
    goals: ['muscle_gain', 'body_recomp', 'recovery'],
    interests: ['Growth Hormone', 'Recovery', 'Metabolic'],
    tier: 'pro',
    health: {
      sex: 'male', dob: '1999-03-15', weightLbs: 185, heightInches: 71,
      bodyFatPercent: 14, goalWeightLbs: 195, activityLevel: 'very_active',
      exerciseFrequency: 6, exerciseTypes: ['weight training', 'cardio', 'HIIT'],
      sleepHours: 7, sleepPattern: 'night_owl', dietType: 'no_restriction',
      peptideExperience: 'intermediate',
      supplements: ['creatine', 'protein', 'vitamin D'],
    },
  },
  {
    name: 'Sophia (Main Character)',
    email: 'sophia@test.com',
    gender: 'Female',
    ageRange: '18-29',
    goals: ['body_recomp', 'skin_hair', 'energy'],
    interests: ['Cosmetic', 'Metabolic', 'Longevity'],
    tier: 'plus',
    health: {
      sex: 'female', dob: '1998-07-22', weightLbs: 135, heightInches: 65,
      bodyFatPercent: 22, goalWeightLbs: 128, activityLevel: 'active',
      exerciseFrequency: 5, exerciseTypes: ['pilates', 'yoga', 'cardio'],
      sleepHours: 7.5, sleepPattern: 'early_bird', dietType: 'mediterranean',
      peptideExperience: 'beginner',
      supplements: ['collagen', 'biotin', 'magnesium'],
    },
  },
  {
    name: 'Marcus (The Operator)',
    email: 'marcus@test.com',
    gender: 'Male',
    ageRange: '30-44',
    goals: ['cognitive', 'energy', 'longevity'],
    interests: ['Nootropic', 'Longevity', 'Recovery'],
    tier: 'pro',
    health: {
      sex: 'male', dob: '1986-11-08', weightLbs: 195, heightInches: 73,
      bodyFatPercent: 18, activityLevel: 'moderate',
      exerciseFrequency: 4, exerciseTypes: ['weight training', 'running'],
      sleepHours: 6.5, sleepPattern: 'night_owl', dietType: 'keto',
      peptideExperience: 'experienced',
      supplements: ['lion\'s mane', 'omega-3', 'creatine', 'vitamin D'],
      conditions: ['mild anxiety'],
      medications: ['adderall'],
    },
  },
  {
    name: 'Sarah (Home & Health)',
    email: 'sarah@test.com',
    gender: 'Female',
    ageRange: '30-44',
    goals: ['hormonal', 'energy', 'skin_hair'],
    interests: ['Cosmetic', 'Immune', 'Sleep'],
    tier: 'plus',
    health: {
      sex: 'female', dob: '1988-04-12', weightLbs: 148, heightInches: 64,
      activityLevel: 'light',
      exerciseFrequency: 3, exerciseTypes: ['yoga', 'walking'],
      sleepHours: 6, sleepPattern: 'irregular', dietType: 'no_restriction',
      peptideExperience: 'beginner',
      supplements: ['iron', 'vitamin B12', 'probiotics'],
      conditions: ['hypothyroid'],
      medications: ['levothyroxine'],
    },
  },
  {
    name: 'Richard (Black Label)',
    email: 'richard@test.com',
    gender: 'Male',
    ageRange: '45-60',
    goals: ['longevity', 'hormonal', 'cognitive'],
    interests: ['Longevity', 'Sexual Health', 'Growth Hormone'],
    tier: 'pro',
    health: {
      sex: 'male', dob: '1972-09-03', weightLbs: 210, heightInches: 70,
      bodyFatPercent: 24, goalWeightLbs: 190, activityLevel: 'moderate',
      exerciseFrequency: 3, exerciseTypes: ['weight training', 'golf', 'swimming'],
      sleepHours: 6, sleepPattern: 'early_bird', dietType: 'mediterranean',
      peptideExperience: 'experienced',
      supplements: ['CoQ10', 'fish oil', 'vitamin D', 'zinc'],
      conditions: ['pre-diabetes', 'elevated cholesterol'],
      medications: ['metformin', 'atorvastatin'],
    },
  },
  {
    name: 'Diana (The Renaissance)',
    email: 'diana@test.com',
    gender: 'Female',
    ageRange: '45-60',
    goals: ['hormonal', 'skin_hair', 'longevity'],
    interests: ['Cosmetic', 'Longevity', 'Immune'],
    tier: 'pro',
    health: {
      sex: 'female', dob: '1975-01-20', weightLbs: 155, heightInches: 66,
      activityLevel: 'active',
      exerciseFrequency: 5, exerciseTypes: ['pilates', 'tennis', 'weight training'],
      sleepHours: 7, sleepPattern: 'early_bird', dietType: 'intermittent_fasting',
      peptideExperience: 'intermediate',
      supplements: ['collagen', 'resveratrol', 'NAD+', 'magnesium'],
    },
  },
  {
    name: 'Walter (Legacy Code)',
    email: 'walter@test.com',
    gender: 'Male',
    ageRange: '60+',
    goals: ['cognitive', 'recovery', 'longevity'],
    interests: ['Nootropic', 'Recovery', 'Longevity'],
    tier: 'free',
    health: {
      sex: 'male', dob: '1960-06-14', weightLbs: 180, heightInches: 69,
      activityLevel: 'light',
      exerciseFrequency: 2, exerciseTypes: ['walking', 'stretching'],
      sleepHours: 6, sleepPattern: 'early_bird', dietType: 'no_restriction',
      peptideExperience: 'none',
      conditions: ['hypertension', 'arthritis'],
      medications: ['lisinopril', 'aspirin'],
      supplements: ['glucosamine', 'vitamin D', 'fish oil'],
    },
  },
  {
    name: 'Margaret (Golden Grace)',
    email: 'margaret@test.com',
    gender: 'Female',
    ageRange: '60+',
    goals: ['recovery', 'cognitive', 'skin_hair'],
    interests: ['Recovery', 'Longevity', 'Cosmetic'],
    tier: 'free',
    health: {
      sex: 'female', dob: '1958-12-02', weightLbs: 145, heightInches: 63,
      activityLevel: 'light',
      exerciseFrequency: 3, exerciseTypes: ['yoga', 'walking', 'swimming'],
      sleepHours: 7, sleepPattern: 'early_bird', dietType: 'mediterranean',
      peptideExperience: 'none',
      conditions: ['osteoporosis'],
      medications: ['calcium', 'alendronate'],
      supplements: ['calcium', 'vitamin D', 'collagen'],
    },
  },
];

export default function DevAccountsScreen() {
  const router = useRouter();

  // Only available in dev builds
  if (!__DEV__) {
    router.replace('/');
    return null;
  }

  const t = useTheme();
  const login = useAuthStore((s) => s.login);
  const setGender = useOnboardingStore((s) => s.setGender);
  const setAgeRange = useOnboardingStore((s) => s.setAgeRange);
  const setHealthGoals = useOnboardingStore((s) => s.setHealthGoals);
  const setInterestCategories = useOnboardingStore((s) => s.setInterestCategories);
  const setAcceptedSafety = useOnboardingStore((s) => s.setAcceptedSafety);
  const setDataShareConsent = useOnboardingStore((s) => s.setDataShareConsent);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const setTier = useSubscriptionStore((s) => s.setTier);
  const healthStore = useHealthProfileStore();

  const handleLogin = async (account: TestAccount) => {
    const h = account.health;

    // Set ALL profile data BEFORE login (login has 800ms delay)
    // Use getState() to batch everything synchronously
    const onboarding = useOnboardingStore.getState();
    onboarding.setGender(account.gender);
    onboarding.setAgeRange(account.ageRange);
    onboarding.setHealthGoals(account.goals);
    onboarding.setInterestCategories(account.interests);
    onboarding.setAcceptedSafety(true);
    onboarding.setDataShareConsent(true);
    onboarding.completeOnboarding();

    // Set subscription tier
    setTier(account.tier);

    // Populate health profile
    const hp = useHealthProfileStore.getState();
    hp.resetProfile();
    hp.setBasicInfo(h.sex, h.dob);
    hp.setBodyMetrics({
      weightLbs: h.weightLbs,
      heightInches: h.heightInches,
      bodyFatPercent: h.bodyFatPercent,
      goalWeightLbs: h.goalWeightLbs,
    });
    hp.setGoals(account.goals);
    hp.setLifestyle({
      activityLevel: h.activityLevel,
      exerciseFrequency: h.exerciseFrequency,
      exerciseTypes: h.exerciseTypes,
      smokingStatus: 'never',
      alcoholFrequency: 'rarely',
      stressSources: [],
    });
    hp.setSleep({
      averageHours: h.sleepHours,
      sleepPattern: h.sleepPattern,
      sleepIssues: [],
      usesSleepAids: false,
    });
    hp.setNutrition({
      dietType: h.dietType,
      supplementsUsed: h.supplements ?? [],
      foodAllergies: [],
    });
    hp.setMedicalHistory({
      conditions: h.conditions ?? [],
      medications: h.medications ?? [],
      allergies: h.allergies ?? [],
      hasProviderSupervision: false,
    });
    hp.setPeptideExperience(h.peptideExperience);
    hp.setAiConsent(true);
    hp.completeSetup();

    // Login last (has 800ms async delay)
    await login(account.email, 'test123');

    // Find segment for display
    const segment = DASHBOARD_SEGMENTS.find(
      (s) => s.gender === account.gender && s.ageRange === account.ageRange
    );

    Alert.alert(
      `Logged in as ${account.name}`,
      `Dashboard: ${segment?.label ?? 'Default'}\nTier: ${account.tier.toUpperCase()}`,
      [{ text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)') }]
    );
  };

  const handleReset = () => {
    useAuthStore.getState().logout();
    useOnboardingStore.getState().reset();
    useHealthProfileStore.getState().resetProfile();
    Alert.alert('Reset', 'All accounts cleared. Restart the app to see onboarding.');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: t.text }]}>Dev Test Accounts</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Tap any account to instantly login with that demographic profile
        </Text>

        {TEST_ACCOUNTS.map((account) => {
          const segment = DASHBOARD_SEGMENTS.find(
            (s) => s.gender === account.gender && s.ageRange === account.ageRange
          );
          const palette = segment?.palette;

          return (
            <TouchableOpacity
              key={account.email}
              style={[
                styles.card,
                { borderLeftColor: palette?.primary ?? Colors.pepTeal, backgroundColor: t.glass },
              ]}
              onPress={() => handleLogin(account)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.name, { color: palette?.primary ?? Colors.pepTeal }]}>
                  {account.name}
                </Text>
                <View style={[styles.tierBadge, account.tier === 'pro' ? styles.proBadge : account.tier === 'plus' ? styles.plusBadge : [styles.freeBadge, { backgroundColor: t.isDark ? '#333' : '#6B7280' }]]}>
                  <Text style={[styles.tierText, { color: t.text }]}>{account.tier.toUpperCase().replace(/_/g, ' ')}</Text>
                </View>
              </View>

              <Text style={[styles.segmentLabel, { color: t.textSecondary }]}>
                {segment?.label} — "{segment?.tagline}"
              </Text>

              <View style={styles.metaRow}>
                <Text style={[styles.meta, { color: t.textSecondary }]}>
                  {account.gender} · {account.ageRange}
                </Text>
              </View>

              <View style={styles.tagsRow}>
                {account.goals.slice(0, 3).map((g) => (
                  <View key={g} style={[styles.tag, { backgroundColor: (palette?.primary ?? Colors.pepTeal) + '22' }]}>
                    <Text style={[styles.tagText, { color: palette?.primary ?? Colors.pepTeal }]}>
                      {g.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetText}>Reset All Accounts</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    color: Colors.darkText,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.glassWhite,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontFamily: Fonts.heading,
    fontSize: 18,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  freeBadge: {
    backgroundColor: '#333',
  },
  plusBadge: {
    backgroundColor: '#2a4a1a',
  },
  proBadge: {
    backgroundColor: '#3a1a4a',
  },
  tierText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.darkText,
    letterSpacing: 1,
  },
  segmentLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.darkTextSecondary,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  metaRow: {
    marginBottom: 8,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.darkTextSecondary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  resetBtn: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: '#3a1010',
    borderRadius: 12,
    alignItems: 'center',
  },
  resetText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: '#ff6b6b',
  },
});
