/**
 * Onboarding — 4-screen page-by-page questionnaire.
 *
 * Screen 1: Welcome (Get Started / Sign In)
 * Screen 2: About You (gender, age, goals)
 * Screen 3: Health Basics (weight, height, activity — optional)
 * Screen 4: Create Account + Choose Plan
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { useHealthProfileStore } from '../src/store/useHealthProfileStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import { calculateMacros } from '../src/utils/macroCalculator';
import { isValidEmail, validatePassword, PASSWORD_MIN_LENGTH } from '../src/utils/validation';
import { useMealStore } from '../src/store/useMealStore';
import { useProgressGoalsStore } from '../src/store/useProgressGoalsStore';
import { trackOnboardingComplete } from '../src/services/analyticsEvents';
import { PasswordToggle } from '../src/components/PasswordToggle';
import { AgeRange, Gender, ActivityLevel } from '../src/types';
import { GOAL_OPTIONS } from '../src/constants/goals';
import {
  ContraceptionMethod,
  CONTRACEPTION_LABELS,
  CONTRACEPTION_OPTIONS,
  predictionModeFor,
} from '../src/types/cycle';
import { useCycleStore } from '../src/store/useCycleStore';
import {
  useCommunityPrefsStore,
  type CommunityPreset,
} from '../src/store/useCommunityPrefsStore';

const COMMUNITY_PRESETS: {
  value: CommunityPreset;
  label: string;
  body: string;
}[] = [
  {
    value: 'all_in',
    label: 'All in',
    body: 'Share streak, adherence, body-comp deltas, and milestones.',
  },
  {
    value: 'picky',
    label: 'Picky',
    body: 'Streak and milestones only. Edit per-category later.',
  },
  {
    value: 'nothing',
    label: 'Nothing',
    body: 'Stay completely private. No public surfaces.',
  },
];

const { width: SW } = Dimensions.get('window');

// ─── Options ────────────────────────────────────────────────────────────────

const GENDER_OPTIONS: { value: Gender; label: string; icon: string }[] = [
  { value: 'Male', label: 'Male', icon: 'man-outline' },
  { value: 'Female', label: 'Female', icon: 'woman-outline' },
];


const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Little to no exercise' },
  { value: 'light', label: 'Light', desc: '1-2 days/week' },
  { value: 'moderate', label: 'Moderate', desc: '3-5 days/week' },
  { value: 'active', label: 'Active', desc: '6-7 days/week' },
  { value: 'very_active', label: 'Very Active', desc: 'Athlete / 2x daily' },
];

const PLANS: { tier: 'free' | 'plus' | 'pro'; name: string; price: string; badge?: string; features: string[] }[] = [
  {
    tier: 'free', name: 'Free', price: '$0',
    features: ['Meal & calorie tracking', 'Peptide calculators', 'Exercise library', 'Learn hub'],
  },
  {
    tier: 'plus', name: 'PepTalk+', price: '$9.99/mo', badge: 'POPULAR',
    features: ['Unlimited Stack Builder + interaction analysis', 'Aimee chat (20/day) on dosing & timing', 'Food Scanner + voice meal log', 'Apple Watch + Google Fit sync'],
  },
  {
    tier: 'pro', name: 'PepTalk Pro', price: '$49.99/mo', badge: 'BEST VALUE',
    features: ['Everything in Plus', 'Custom workout generator', 'Meal plans & recipes', 'Health reports & exports'],
  },
];

// Colors — gender-neutral until user selects gender
const ACCENT = '#2D2D2D';       // Clean black (Jamie's "black glass" buttons)
const ACCENT_LIGHT = '#4A4A4A';
const SURFACE = '#F7F7F7';      // Neutral warm gray
const HIGHLIGHT = '#E89672';    // Subtle warm pop for selected states

// ─── Component ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditMode = edit === 'true';
  const isAuthenticated = useAuthStore((st) => st.isAuthenticated);
  const isComplete = useOnboardingStore((st) => st.isComplete);

  const [step, setStep] = useState(isEditMode ? 1 : 0);

  // Auto-route logged-in users after the welcome animation plays
  React.useEffect(() => {
    if (step === 0 && isAuthenticated && isComplete && !isEditMode) {
      const timer = setTimeout(() => {
        router.replace('/(tabs)');
      }, 1800); // Let the animation play for 1.8s then auto-route
      return () => clearTimeout(timer);
    }
  }, [step, isAuthenticated, isComplete, isEditMode]);

  // Age (exact)
  const [selectedAge, setSelectedAge] = useState(0);

  const ageToRange = (age: number): AgeRange => {
    if (age < 30) return '18-29';
    if (age < 45) return '30-44';
    if (age < 61) return '45-60';
    return '60+';
  };

  // Health basics
  const [weightLbs, setWeightLbs] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState<number | null>(null);
  const [goalNotes, setGoalNotes] = useState('');
  const [featureWish, setFeatureWish] = useState('');

  // Cycle tracking — only meaningful when biologicalSex is female. Captures
  // contraception method (12 first-class options) + last-period date when
  // the chosen method's prediction mode benefits from one. Drives the cycle
  // engine's prediction routing (cyclical / continuous / scheduled / etc.).
  const [contraceptionMethod, setContraceptionMethod] = useState<ContraceptionMethod | null>(null);
  const [lastPeriodDate, setLastPeriodDate] = useState('');

  // Account
  const [accountFirstName, setAccountFirstName] = useState('');
  const [accountLastName, setAccountLastName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'plus' | 'pro'>('free');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // §11.2 + §11.4 — referral-claim string + community public-tracking
  // opt-in preset. Both committed at handleNext() on the account step.
  const [referralClaimRaw, setReferralClaimRaw] = useState('');
  const [communityPreset, setCommunityPreset] = useState<
    'all_in' | 'picky' | 'nothing'
  >('nothing');

  // Stores
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const isLoggingIn = useAuthStore((s) => s.isLoading);
  const setTier = useSubscriptionStore((s) => s.setTier);
  const setMealTargets = useMealStore((s) => s.setTargets);
  const setGoalValue = useProgressGoalsStore((s) => s.setGoalValue);
  const {
    profile, setGender, setAgeRange, toggleHealthGoal,
    setAcceptedSafety, completeOnboarding,
    setReferralClaim,
  } = useOnboardingStore();
  const applyCommunityPreset = useCommunityPrefsStore((s) => s.applyPreset);
  const {
    setBodyMetrics,
    setLifestyle,
    setCycleTracking,
    setGoalNotes: persistGoalNotes,
    setFeatureWish: persistFeatureWish,
  } = useHealthProfileStore();
  const setCurrentContraception = useCycleStore((s) => s.setCurrentContraception);

  // ── Navigation ────────────────────────────────────────────────────────────

  const totalSteps = 4;

  const passwordCheck = useMemo(() => validatePassword(accountPassword), [accountPassword]);
  const emailOk = useMemo(() => isValidEmail(accountEmail), [accountEmail]);

  // Required questions — gender, age, weight, height, primary goal (5).
  // Everything else (activity, workout days, cycle, goal notes, feature
  // wish, account creation) is reachable but marked "Set up later in
  // Profile" and gated only on Step 3 (account screen itself).
  const weightValid = useMemo(() => {
    const w = parseFloat(weightLbs);
    return !isNaN(w) && w >= 50 && w <= 1000;
  }, [weightLbs]);

  const heightValid = useMemo(() => {
    const f = parseInt(heightFeet, 10);
    const i = parseInt(heightInches, 10);
    return !isNaN(f) && f >= 3 && f <= 8 && (isNaN(i) || (i >= 0 && i < 12));
  }, [heightFeet, heightInches]);

  const canContinue = useMemo(() => {
    if (step === 0) return true; // Welcome — always can continue
    // Step 1: gender + age + at least 1 goal (3 of 5 required questions).
    if (step === 1) return Boolean(profile.gender && selectedAge >= 18 && profile.healthGoals.length > 0);
    // Step 2: weight + height now required (the remaining 2 of 5). All
    // other Step 2 inputs (activity, workout days, cycle, notes) stay
    // optional and are flagged "Set up later in Profile."
    if (step === 2) return weightValid && heightValid;
    if (step === 3) {
      return (
        accountFirstName.trim().length > 0 &&
        accountLastName.trim().length > 0 &&
        emailOk &&
        passwordCheck.valid &&
        acceptedTerms
      );
    }
    return true;
  }, [step, profile.gender, selectedAge, profile.healthGoals.length, weightValid, heightValid, accountFirstName, accountLastName, emailOk, passwordCheck.valid, acceptedTerms]);

  // Skip-and-Explore — lands the user on Home (tabs) with whatever
  // defaults they've filled in so far. We mark onboarding complete so
  // the route gate doesn't bounce them back, but DON'T set isComplete
  // until we've at least preserved what they entered. This is the
  // consumer escape hatch from the questionnaire.
  const handleSkipAndExplore = () => {
    // Persist any partial answers the user has entered before bouncing
    // them to home. None of these are required to display tabs, but
    // saving means a returning user picks up where they left off.
    if (profile.gender && selectedAge >= 18) {
      setAgeRange(ageToRange(selectedAge));
    }
    if (weightValid) setBodyMetrics({ weightLbs: parseFloat(weightLbs) });
    if (heightValid) {
      const f = parseInt(heightFeet, 10);
      const i = parseInt(heightInches, 10) || 0;
      setBodyMetrics({ heightInches: f * 12 + i });
    }
    // Default plan: free. User can upgrade from Profile → Subscription.
    setTier('free');
    completeOnboarding();
    trackOnboardingComplete(step);
    router.replace('/(tabs)');
  };

  const handleNext = async () => {
    if (!canContinue) return;

    // Step 0: Accept safety
    if (step === 0) {
      setAcceptedSafety(true);
      setStep(1);
      return;
    }

    // Step 1: About You — set age range from exact age, then advance
    if (step === 1) {
      setAgeRange(ageToRange(selectedAge));
      if (isEditMode) {
        Alert.alert('Profile Updated', 'Your profile has been saved.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      setStep(2);
      return;
    }

    // Step 2: Save health basics
    if (step === 2) {
      const weight = parseFloat(weightLbs);
      const feet = parseInt(heightFeet, 10);
      const inches = parseInt(heightInches, 10);
      // Clamp to plausible adult ranges. Without this, a 999999 lb /
      // 99 ft 99 in entry was silently persisted to the health profile
      // and downstream poisoned macro calc + Aimee context. P0 from
      // input validation audit (Wave 76.8).
      if (!isNaN(weight) && weight >= 50 && weight <= 1000) {
        setBodyMetrics({ weightLbs: weight });
      }
      if (!isNaN(feet) && feet >= 1 && feet <= 8) {
        const safeInches = !isNaN(inches) && inches >= 0 && inches < 12 ? inches : 0;
        setBodyMetrics({ heightInches: feet * 12 + safeInches });
      }
      setLifestyle({
        activityLevel,
        ...(workoutDaysPerWeek != null ? { exerciseFrequency: workoutDaysPerWeek } : {}),
      });
      const trimmedGoalNotes = goalNotes.trim();
      if (trimmedGoalNotes) persistGoalNotes(trimmedGoalNotes);
      // Cycle tracking — only when user picks a method AND is female. The
      // 12 contraception options drive the prediction mode (cyclical /
      // continuous / scheduled / pregnancy / returning / irregular) so the
      // cycle engine knows what to predict and how to interpret data.
      if (contraceptionMethod && profile.gender === 'Female') {
        const mode = predictionModeFor(contraceptionMethod);
        const wantsLastPeriod = mode === 'cyclical' || mode === 'scheduled_cycle';
        const validDate = wantsLastPeriod && /^\d{4}-\d{2}-\d{2}$/.test(lastPeriodDate);
        setCycleTracking({
          trackingEnabled: true,
          lastPeriodStartDate: validDate ? lastPeriodDate : undefined,
        });
        setCurrentContraception(contraceptionMethod);
      }
      setStep(3);
      return;
    }

    // Step 3: Create account + set plan + finish
    if (step === 3) {
      setAccountError('');
      try {
        // Create the account. signup() returns
        // `{ requiresEmailConfirmation: true }` when Supabase is in
        // email-verification mode (no session granted yet) — in that case
        // we surface a "check your email" alert + route to the login
        // screen instead of routing into tabs (the user can't actually
        // use the app until they confirm + log in).
        const result = await signup(
          accountFirstName.trim(),
          accountLastName.trim(),
          accountEmail,
          accountPassword,
        );
        // Don't grant a paid tier locally — the IAP receipt validator
        // (Apple/Google webhook → validate-purchase edge fn → profile
        // subscription_tier) owns that. Default everyone to free here.
        setTier('free');

        // Auto-calculate macros
        const body = useHealthProfileStore.getState().profile.bodyMetrics;
        const life = useHealthProfileStore.getState().profile.lifestyle;
        const macros = calculateMacros({
          weightLbs: body.weightLbs, heightInches: body.heightInches,
          gender: profile.gender, ageRange: profile.ageRange,
          activityLevel: life.activityLevel, goals: profile.healthGoals,
        });
        if (macros) {
          setMealTargets({
            calories: macros.calories, proteinGrams: macros.proteinGrams,
            carbsGrams: macros.carbsGrams, fatGrams: macros.fatGrams,
            fiberGrams: macros.fiberGrams, waterOz: macros.waterOz,
          });
          setGoalValue('cal', macros.calories);
          setGoalValue('pro', macros.proteinGrams);
          setGoalValue('carb', macros.carbsGrams);
          setGoalValue('fat', macros.fatGrams);
          setGoalValue('fiber', macros.fiberGrams);
          setGoalValue('water', macros.waterOz);
        }

        const trimmedFeatureWish = featureWish.trim();
        if (trimmedFeatureWish) persistFeatureWish(trimmedFeatureWish);

        // §11.2 — persist the referral claim so signup-time attribution
        // can pick it up server-side.
        const trimmedRef = referralClaimRaw.trim();
        if (trimmedRef) setReferralClaim(trimmedRef);

        // §11.4 — apply the community public-tracking preset chosen at
        // intake. User can fine-tune per-category later in Profile.
        applyCommunityPreset(communityPreset);

        completeOnboarding();
        trackOnboardingComplete(0);

        if (result.requiresEmailConfirmation) {
          // Email-confirmation flow. The auth.users row exists + the
          // confirmation email is on its way, but the user has no session
          // yet so we can't drop them into tabs (every authed call would
          // 401). Send them to the login screen with a friendly note;
          // their saved onboarding answers persist locally so re-login
          // just unlocks the app.
          Alert.alert(
            'Check your email',
            `We sent a confirmation link to ${accountEmail.trim()}. Tap the link, then come back and sign in.`,
            [{ text: 'OK', onPress: () => router.replace('/auth') }],
          );
          return;
        }
        router.replace('/(tabs)');
      } catch (err: any) {
        // Surface the real error rather than swallowing it into a
        // generic message — silent catches hid the login-vs-signup bug
        // for weeks. Falls back to a friendly default if the error
        // arrived without a message.
        setAccountError(err?.message ?? 'Could not create account. Try again.');
      }
    }
  };

  const handleBack = () => {
    if (step === 0) return;
    if (isEditMode && step === 1) { router.back(); return; }
    setStep((s) => s - 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
      {/* Progress bar */}
      {step > 0 && (
        <View style={s.progressWrap}>
          <View style={s.progressTrack}>
            <Animated.View
              style={[s.progressFill, { width: `${(step / (totalSteps - 1)) * 100}%` }]}
            />
          </View>
          <Text style={s.progressText}>Step {step} of {totalSteps - 1}</Text>
        </View>
      )}

      {/* Back button — only on welcome screen (steps 1-3 have footer nav) */}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 0: WELCOME
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 0 && (
        <View style={s.screenCenter}>
          {/* Logo — fades in first */}
          <Animated.View entering={FadeInDown.delay(200).duration(700)} style={s.welcomeLogoWrap}>
            <Text style={s.welcomeLogo}>PepTalk</Text>
            <View style={s.welcomeAccentBar} />
            <Text style={s.welcomeTagline}>Your health. Optimized.</Text>
          </Animated.View>

          {/* Features — stagger in one by one */}
          <View style={s.welcomeFeatures}>
            {[
              { icon: 'nutrition-outline', title: 'Eat', desc: 'Track meals & macros', color: '#E89672', bg: '#E8967218' },
              { icon: 'barbell-outline', title: 'Train', desc: 'Log workouts & progress', color: '#A4D9D1', bg: '#F4ECC220' },
              { icon: 'flask-outline', title: 'Learn', desc: 'Peptide education & dosing', color: '#E8948E', bg: '#F2D8D518' },
              { icon: 'heart-outline', title: 'Track', desc: 'Health, sleep & recovery', color: '#8FAA8B', bg: '#A9C4A618' },
            ].map((f, i) => (
              <Animated.View
                key={f.title}
                entering={FadeInDown.delay(500 + i * 120).duration(500)}
                style={s.welcomeFeatureRow}
              >
                <View style={[s.welcomeFeatureIcon, { backgroundColor: f.bg }]}>
                  <Ionicons name={f.icon as any} size={22} color={f.color} />
                </View>
                <View style={s.welcomeFeatureText}>
                  <Text style={s.welcomeFeatureTitle}>{f.title}</Text>
                  <Text style={s.welcomeFeatureDesc}>{f.desc}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* CTA — fades up after features */}
          <Animated.View entering={FadeInUp.delay(1100).duration(500)}>
            <TouchableOpacity style={s.primaryBtn} onPress={handleNext} activeOpacity={0.85}>
              <View style={s.blackBtn}>
                <Text style={s.blackBtnText} numberOfLines={1}>Get Started</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.signInLink} onPress={() => router.push('/auth')} activeOpacity={0.7}>
              <Text style={s.signInLinkText}>Already have an account? <Text style={{ color: HIGHLIGHT, fontWeight: '700' }}>Sign In</Text></Text>
            </TouchableOpacity>

            {/* Skip-and-Explore — lands the user on Home with defaults
                applied. The consumer escape hatch from the questionnaire. */}
            <TouchableOpacity
              style={s.exploreLink}
              onPress={handleSkipAndExplore}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding and explore PepTalk"
            >
              <Text style={s.exploreLinkText}>
                Or <Text style={{ color: '#2D2D2D', fontWeight: '700', textDecorationLine: 'underline' }}>Skip and explore</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Trust badges — fade in last */}
          <Animated.View entering={FadeInUp.delay(1400).duration(500)} style={s.welcomeTrust}>
            <View style={s.trustItem}>
              <Ionicons name="lock-closed" size={16} color="#9CA3AF" />
              <Text style={s.trustText}>Encrypted</Text>
            </View>
            <View style={s.trustItem}>
              <Ionicons name="shield-checkmark" size={16} color="#9CA3AF" />
              <Text style={s.trustText}>Private</Text>
            </View>
            <View style={s.trustItem}>
              <Ionicons name="eye-off" size={16} color="#9CA3AF" />
              <Text style={s.trustText}>No ads</Text>
            </View>
            <View style={s.trustItem}>
              <Ionicons name="gift-outline" size={16} color="#9CA3AF" />
              <Text style={s.trustText}>Free to start</Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 1: ABOUT YOU
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
          <FlatList
            data={[1]} // Single item to enable scrolling
            keyExtractor={() => 'about'}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentContainerStyle={s.scrollPadding}
            renderItem={() => (
              <View>
                <Text style={s.stepTitle}>About you</Text>
                <Text style={s.stepSub}>Three answers. Direct. The numbers depend on them.</Text>

                {/* Sex */}
                <Text style={s.label}>Sex <Text style={s.requiredMark}>*</Text></Text>
                <View style={s.genderRow}>
                  {GENDER_OPTIONS.map((g) => {
                    const active = profile.gender === g.value;
                    return (
                      <TouchableOpacity
                        key={g.value}
                        style={[s.genderCard, active && { borderColor: ACCENT, backgroundColor: `${HIGHLIGHT}15` }]}
                        onPress={() => setGender(g.value)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={g.icon as any} size={28} color={active ? ACCENT : '#6B7280'} />
                        <Text style={[s.genderLabel, active && { color: ACCENT, fontWeight: '700' }]}>{g.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Age */}
                <Text style={s.label}>Age <Text style={s.requiredMark}>*</Text></Text>
                <TextInput
                  style={s.ageInput}
                  placeholder="e.g. 30"
                  placeholderTextColor="#C7C7CC"
                  value={selectedAge > 0 ? String(selectedAge) : ''}
                  onChangeText={(val) => {
                    const num = parseInt(val, 10);
                    if (!val) setSelectedAge(0);
                    else if (!isNaN(num) && num >= 0 && num <= 100) setSelectedAge(num);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Age"
                  accessibilityHint="Enter your age between 18 and 100"
                />
                {selectedAge > 0 && selectedAge < 18 && (
                  <Text style={s.inlineHint}>You must be 18 or older to use PepTalk.</Text>
                )}

                {/* Goals */}
                <Text style={s.label}>Your goal <Text style={s.requiredMark}>*</Text></Text>
                <Text style={s.labelSub}>Pick one or more.</Text>
                <View style={s.chipGrid}>
                  {GOAL_OPTIONS.map((goal) => {
                    const active = profile.healthGoals.includes(goal.value);
                    return (
                      <TouchableOpacity
                        key={goal.value}
                        style={[s.chip, active && { backgroundColor: `${HIGHLIGHT}18`, borderColor: HIGHLIGHT }]}
                        onPress={() => toggleHealthGoal(goal.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.chipText, active && { color: ACCENT, fontWeight: '600' }]}>
                          {goal.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          />
          {/* Fixed footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.footerBackBtn} onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color="#6B7280" />
              <Text style={s.footerBackText}>Back</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={s.footerSkipBtn}
                onPress={handleSkipAndExplore}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip and explore PepTalk with defaults"
              >
                <Text style={s.footerSkipText}>Skip & explore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.footerNextBtn, !canContinue && { opacity: 0.4 }]}
                onPress={handleNext}
                disabled={!canContinue}
                activeOpacity={0.85}
              >
                <Text style={s.footerNextText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 2: HEALTH BASICS — weight + height required, rest deferred
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
          <FlatList
            data={[1]}
            keyExtractor={() => 'health'}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentContainerStyle={s.scrollPadding}
            keyboardShouldPersistTaps="handled"
            renderItem={() => (
              <View>
                <Text style={s.stepTitle}>Basics</Text>
                <Text style={s.stepSub}>Weight and height. The rest lives in Profile.</Text>

                <Text style={s.label}>Weight today (lb) <Text style={s.requiredMark}>*</Text></Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 165"
                  placeholderTextColor="#9CA3AF"
                  value={weightLbs}
                  onChangeText={setWeightLbs}
                  keyboardType="numeric"
                  accessibilityLabel="Weight in pounds, required"
                />

                <Text style={s.label}>Height <Text style={s.requiredMark}>*</Text></Text>
                <View style={s.heightRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput style={s.input} placeholder="Feet" placeholderTextColor="#9CA3AF" value={heightFeet} onChangeText={setHeightFeet} keyboardType="numeric" accessibilityLabel="Height in feet, required" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput style={s.input} placeholder="Inches" placeholderTextColor="#9CA3AF" value={heightInches} onChangeText={setHeightInches} keyboardType="numeric" accessibilityLabel="Height inches" />
                  </View>
                </View>

                <View style={s.laterBanner}>
                  <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                  <Text style={s.laterBannerText}>
                    Activity level, workout days, cycle tracking, and goal notes are all set up later in Profile.
                  </Text>
                </View>

                <Text style={s.label}>Activity Level</Text>
                {ACTIVITY_LEVELS.map((al) => {
                  const active = activityLevel === al.value;
                  return (
                    <TouchableOpacity
                      key={al.value}
                      style={[s.activityRow, active && { borderColor: ACCENT, backgroundColor: `${HIGHLIGHT}10` }]}
                      onPress={() => setActivityLevel(al.value)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.radio, active && { borderColor: ACCENT }]}>
                        {active && <View style={[s.radioDot, { backgroundColor: ACCENT }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.activityLabel, active && { color: ACCENT }]}>{al.label}</Text>
                        <Text style={s.activityDesc}>{al.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <Text style={s.label}>How many days a week do you work out?</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((days) => {
                    const active = workoutDaysPerWeek === days;
                    return (
                      <TouchableOpacity
                        key={days}
                        onPress={() => setWorkoutDaysPerWeek(days)}
                        style={[
                          s.chip,
                          active && { backgroundColor: `${HIGHLIGHT}18`, borderColor: HIGHLIGHT },
                          { minWidth: 44, alignItems: 'center' },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${days} days per week`}
                      >
                        <Text style={[s.chipText, active && { color: ACCENT, fontWeight: '700' }]}>
                          {days === 0 ? 'None' : days === 7 ? 'Daily' : days}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={s.label}>What's your main goal? (optional)</Text>
                <Text style={s.labelSub}>
                  In your own words — fat loss for summer, lift heavier, recover from injury, anything.
                </Text>
                <TextInput
                  style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholder="e.g. Drop 15 lbs and not lose strength"
                  placeholderTextColor="#9CA3AF"
                  value={goalNotes}
                  onChangeText={setGoalNotes}
                  multiline
                  maxLength={300}
                />

                {/* Cycle tracking — first-class step for female users.
                    12 contraception options drive prediction mode so the
                    cycle engine knows what to predict (cyclical / continuous
                    / scheduled / pregnancy / returning / irregular). Last-
                    period date only shown when the chosen mode benefits. */}
                {profile.gender === 'Female' && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={s.label}>Your cycle situation</Text>
                    <Text style={s.labelSub}>
                      Pick what fits today — you can change this anytime.
                    </Text>
                    {CONTRACEPTION_OPTIONS.map((method) => {
                      const active = contraceptionMethod === method;
                      return (
                        <TouchableOpacity
                          key={method}
                          style={[s.activityRow, active && { borderColor: ACCENT, backgroundColor: `${HIGHLIGHT}10` }]}
                          onPress={() => setContraceptionMethod(method)}
                          activeOpacity={0.7}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={CONTRACEPTION_LABELS[method]}
                        >
                          <View style={[s.radio, active && { borderColor: ACCENT }]}>
                            {active && <View style={[s.radioDot, { backgroundColor: ACCENT }]} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.activityLabel, active && { color: ACCENT }]}>
                              {CONTRACEPTION_LABELS[method]}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {contraceptionMethod &&
                      ['cyclical', 'scheduled_cycle'].includes(predictionModeFor(contraceptionMethod)) && (
                      <>
                        <Text style={[s.label, { marginTop: 16 }]}>
                          When did your last period start?
                        </Text>
                        <TextInput
                          style={s.input}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#9CA3AF"
                          value={lastPeriodDate}
                          onChangeText={setLastPeriodDate}
                          keyboardType="numbers-and-punctuation"
                          autoCapitalize="none"
                        />
                        <Text style={[s.activityDesc, { marginTop: 6, marginLeft: 0 }]}>
                          Optional — you can update this anytime in settings.
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          />
          <View style={s.footer}>
            <TouchableOpacity style={s.footerBackBtn} onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color="#6B7280" />
              <Text style={s.footerBackText}>Back</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={s.footerSkipBtn}
                onPress={handleSkipAndExplore}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip and explore PepTalk with defaults"
              >
                <Text style={s.footerSkipText}>Skip & explore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.footerNextBtn, !canContinue && { opacity: 0.4 }]}
                onPress={handleNext}
                disabled={!canContinue}
                activeOpacity={0.85}
              >
                <Text style={s.footerNextText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 3: CREATE ACCOUNT + PLAN
      ═══════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
          <FlatList
            data={[1]}
            keyExtractor={() => 'account'}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            contentContainerStyle={s.scrollPadding}
            keyboardShouldPersistTaps="handled"
            renderItem={() => (
              <View>
                <Text style={s.stepTitle}>Create Account</Text>
                <Text style={s.stepSub}>Almost there!</Text>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="First name" placeholderTextColor="#9CA3AF" value={accountFirstName} onChangeText={setAccountFirstName} />
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="Last name" placeholderTextColor="#9CA3AF" value={accountLastName} onChangeText={setAccountLastName} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor="#9CA3AF"
                  value={accountEmail}
                  onChangeText={setAccountEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                {accountEmail.length > 0 && !emailOk && (
                  <Text style={s.inlineHint}>Enter a valid email address.</Text>
                )}
                <View style={s.passwordWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={`Password (${PASSWORD_MIN_LENGTH}+ characters)`}
                    placeholderTextColor="#9CA3AF"
                    value={accountPassword}
                    onChangeText={setAccountPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    textContentType="newPassword"
                  />
                  <PasswordToggle
                    visible={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    size={20}
                    color="#6B7280"
                  />
                </View>
                {accountPassword.length > 0 && !passwordCheck.valid && (
                  <Text style={s.inlineHint}>{passwordCheck.message}</Text>
                )}

                {!!accountError && <Text style={s.errorText}>{accountError}</Text>}

                {/* §11.2 — Referral claim. Optional. */}
                <Text style={[s.label, { marginTop: 20 }]}>Did someone refer you?</Text>
                <Text style={s.labelSub}>Their code, handle, or name. Optional.</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. JAMIE10"
                  placeholderTextColor="#9CA3AF"
                  value={referralClaimRaw}
                  onChangeText={setReferralClaimRaw}
                  autoCapitalize="characters"
                  accessibilityLabel="Referral code, handle, or name (optional)"
                />

                {/* §11.4 — Community public-tracking opt-in. */}
                <Text style={[s.label, { marginTop: 20 }]}>Public progress sharing</Text>
                <Text style={s.labelSub}>Off by default. You can change this in Profile any time.</Text>
                <View style={{ gap: 8, marginBottom: 12 }}>
                  {COMMUNITY_PRESETS.map((p) => {
                    const active = communityPreset === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[
                          s.chip,
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                          },
                          active && {
                            backgroundColor: `${HIGHLIGHT}18`,
                            borderColor: HIGHLIGHT,
                          },
                        ]}
                        onPress={() => setCommunityPreset(p.value)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${p.label}. ${p.body}`}
                      >
                        <View
                          style={[
                            s.radio,
                            { width: 18, height: 18, borderRadius: 9 },
                            active && { borderColor: ACCENT },
                          ]}
                        >
                          {active ? (
                            <View
                              style={[
                                s.radioDot,
                                { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
                              ]}
                            />
                          ) : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              s.chipText,
                              { fontWeight: '700' },
                              active && { color: ACCENT },
                            ]}
                          >
                            {p.label}
                          </Text>
                          <Text style={[s.labelSub, { marginTop: 2 }]}>
                            {p.body}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[s.label, { marginTop: 20 }]}>Choose your plan</Text>
                {PLANS.map((plan) => {
                  const active = selectedPlan === plan.tier;
                  return (
                    <TouchableOpacity
                      key={plan.tier}
                      style={[s.planCard, active && { borderColor: ACCENT, backgroundColor: `${HIGHLIGHT}08` }]}
                      onPress={() => setSelectedPlan(plan.tier)}
                      activeOpacity={0.8}
                    >
                      <View style={s.planHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={s.planName}>{plan.name}</Text>
                            {plan.badge && (
                              <View style={[s.planBadge, { backgroundColor: HIGHLIGHT }]}>
                                <Text style={s.planBadgeText}>{plan.badge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.planPrice}>{plan.price}</Text>
                        </View>
                        <View style={[s.radio, active && { borderColor: ACCENT }]}>
                          {active && <View style={[s.radioDot, { backgroundColor: ACCENT }]} />}
                        </View>
                      </View>
                      {plan.features.map((f) => (
                        <View key={f} style={s.planFeatureRow}>
                          <Ionicons name="checkmark" size={14} color={active ? HIGHLIGHT : '#6B7280'} />
                          <Text style={[s.planFeatureText, active && { color: '#2D2D2D' }]}>{f}</Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                  );
                })}

                {/* Trust icons */}
                <View style={s.trustRow}>
                  <View style={s.trustItem}>
                    <Ionicons name="lock-closed" size={18} color={HIGHLIGHT} />
                    <Text style={s.trustText}>Encrypted</Text>
                  </View>
                  <View style={s.trustItem}>
                    <Ionicons name="shield-checkmark" size={18} color={HIGHLIGHT} />
                    <Text style={s.trustText}>Private</Text>
                  </View>
                  <View style={s.trustItem}>
                    <Ionicons name="eye-off" size={18} color={HIGHLIGHT} />
                    <Text style={s.trustText}>No ads</Text>
                  </View>
                </View>

                {/* Feature-wish feedback — final intake question. Reads
                    by Edward post-signup to drive the roadmap. */}
                <Text style={[s.label, { marginTop: 20 }]}>
                  One feature you wish PepTalk had? (optional)
                </Text>
                <Text style={s.labelSub}>
                  We read every answer. This is how the app gets better.
                </Text>
                <TextInput
                  style={[s.input, { minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }]}
                  placeholder="e.g. A way to log my dad's protocol next to mine"
                  placeholderTextColor="#9CA3AF"
                  value={featureWish}
                  onChangeText={setFeatureWish}
                  multiline
                  maxLength={400}
                />

                {/* Terms agreement */}
                <View style={s.termsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.termsTitle}>I understand and agree</Text>
                    <Text style={s.termsBody}>
                      PepTalk is for educational purposes only and does not provide medical advice. I accept full responsibility for my health decisions.
                    </Text>
                  </View>
                  <Switch
                    value={acceptedTerms}
                    onValueChange={setAcceptedTerms}
                    trackColor={{ false: 'rgba(0,0,0,0.10)', true: `${HIGHLIGHT}55` }}
                    thumbColor={acceptedTerms ? HIGHLIGHT : '#ccc'}
                  />
                </View>
              </View>
            )}
          />
          <View style={s.footer}>
            <TouchableOpacity style={s.footerBackBtn} onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color="#6B7280" />
              <Text style={s.footerBackText}>Back</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={s.footerSkipBtn}
                onPress={handleSkipAndExplore}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Skip account creation and explore PepTalk with defaults"
              >
                <Text style={s.footerSkipText}>Skip & explore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.footerNextBtn, (!canContinue || isLoggingIn) && { opacity: 0.4 }]}
                onPress={handleNext}
                disabled={!canContinue || isLoggingIn}
                activeOpacity={0.85}
              >
                <Text style={s.footerNextText}>{isLoggingIn ? 'Creating…' : 'Create Account'}</Text>
                <Ionicons name={isLoggingIn ? 'hourglass' : 'checkmark'} size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Progress ─────────────────────────────────────────────────────────────
  progressWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: HIGHLIGHT,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },

  // ── Back ─────────────────────────────────────────────────────────────────
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },

  // ── Screen layouts ───────────────────────────────────────────────────────
  screenCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // ── Welcome (Screen 0) ──────────────────────────────────────────────────
  welcomeContent: {
    paddingHorizontal: 24,
  },
  welcomeLogoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeLogo: {
    fontSize: 48,
    fontFamily: 'Playfair-Black',
    color: '#2D2D2D',
    letterSpacing: -1.5,
  },
  welcomeAccentBar: {
    width: 40,
    height: 3,
    backgroundColor: HIGHLIGHT,
    borderRadius: 2,
    marginVertical: 12,
  },
  welcomeTagline: {
    fontSize: 17,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
  },
  welcomeFeatures: {
    marginBottom: 36,
    gap: 16,
  },
  welcomeFeatureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
  },
  welcomeFeatureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  welcomeFeatureText: {
    flex: 1,
  },
  welcomeFeatureTitle: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
    color: '#2D2D2D',
    marginBottom: 2,
  },
  welcomeFeatureDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
  },
  blackBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2D2D2D',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 24,
  },
  blackBtnText: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
  },
  welcomeTrust: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 24,
    paddingHorizontal: 8,
  },

  // ── Step header ──────────────────────────────────────────────────────────
  stepTitle: {
    fontSize: 28,
    fontFamily: 'Playfair-Black',
    color: '#2D2D2D',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  stepSub: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    marginBottom: 24,
  },

  // ── Labels ───────────────────────────────────────────────────────────────
  label: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: '#2D2D2D',
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  labelSub: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#9CA3AF',
    marginBottom: 12,
    marginTop: -6,
  },
  requiredMark: {
    color: '#E89672',
    fontFamily: 'DMSans-Bold',
  },
  laterBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginTop: 20,
    marginBottom: 4,
  },
  laterBannerText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    flex: 1,
    lineHeight: 17,
  },
  exploreLink: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  exploreLinkText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
  },

  // ── Gender cards ─────────────────────────────────────────────────────────
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: SURFACE,
    gap: 8,
  },
  genderLabel: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
    color: '#2D2D2D',
  },

  // ── Age input ─────────────────────────────────────────────────────────────
  ageInput: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: SURFACE,
    paddingHorizontal: 20,
    fontSize: 24,
    fontFamily: 'Playfair-ExtraBold',
    color: '#2D2D2D',
    textAlign: 'center',
  },

  // ── Goal chips ───────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: SURFACE,
  },
  chipText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    color: '#2D2D2D',
  },

  // ── Inputs ───────────────────────────────────────────────────────────────
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: SURFACE,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    color: '#2D2D2D',
    marginBottom: 12,
  },
  heightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: 8,
  },
  inlineHint: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    color: '#DC2626',
    marginTop: 6,
    marginBottom: 4,
  },

  // ── Activity levels ──────────────────────────────────────────────────────
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  activityLabel: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
    color: '#2D2D2D',
  },
  activityDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Radio ────────────────────────────────────────────────────────────────
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // ── Plans ────────────────────────────────────────────────────────────────
  planCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 16,
    marginBottom: 10,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  planName: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
    color: '#2D2D2D',
  },
  planPrice: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
    marginTop: 2,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  planFeatureText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    flex: 1,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  primaryBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  primaryBtnGrad: {
    height: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  signInLink: {
    paddingVertical: 16,
  },
  signInLinkText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  scrollPadding: {
    paddingHorizontal: 24,
    // Bottom padding tall enough to clear the absolute-positioned
    // footer + safe-area inset on small phones (iPhone SE / mini).
    // Tester #37: "the screen of off the page" — content was scrolling
    // under the Continue button.
    paddingBottom: 140,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFFFFF',
  },
  footerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  footerBackText: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },
  footerNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  footerNextText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
  },
  footerSkipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  footerSkipText: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },
  bottomAction: {
    paddingBottom: 16,
    paddingTop: 16,
  },
  legalText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },

  // ── Trust icons ──────────────────────────────────────────────────────────
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  trustItem: {
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },

  // ── Terms agreement ──────────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginTop: 16,
    marginBottom: 8,
  },
  termsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 4,
  },
  termsBody: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
});
