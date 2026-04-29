import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Animated as RNAnimated,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Divider } from '@gluestack-ui/themed';
import { PepTalkCharacter } from '../../src/components/PepTalkCharacter';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { ProgressRing } from '../../src/components/ProgressRing';
import { DailyProgressChart, type ChartSegment, type ChartPage } from '../../src/components/DailyProgressChart';
import { useProgressGoalsStore, type GoalCategory } from '../../src/store/useProgressGoalsStore';
import { TrendCard } from '../../src/components/TrendCard';
import { Sparkline } from '../../src/components/Sparkline';
import { SearchBar } from '../../src/components/SearchBar';
import { CategoryGrid } from '../../src/components/CategoryGrid';
import { PeptideCard } from '../../src/components/PeptideCard';
import { Disclaimer } from '../../src/components/Disclaimer';
import { LeaderboardStrip } from '../../src/components/LeaderboardStrip';
import { StepGoalRing } from '../../src/components/StepGoalRing';
import { MacroProgressRing } from '../../src/components/MacroProgressRing';
import { ActiveProtocolBanner } from '../../src/components/ActiveProtocolBanner';
import { TodaysPlanCard } from '../../src/components/TodaysPlanCard';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import {
  isHealthDataAvailable,
  getHealthMetrics,
  getHealthSourceLabel,
  HealthMetrics,
} from '../../src/services/healthDataService';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import {
  computeCyclePhase,
  PHASE_LABELS,
  PHASE_BLURBS,
  type CyclePhaseInfo,
} from '../../src/services/cycleService';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useNotificationStore } from '../../src/store/useNotificationStore';
import { useAchievementStore } from '../../src/store/useAchievementStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useMealStore } from '../../src/store/useMealStore';
import { useStackStore } from '../../src/store/useStackStore';
import { useWorkoutTemplateStore } from '../../src/store/useWorkoutTemplateStore';
import { getExerciseById } from '../../src/data/exercises';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { getSegmentByProfile, getLayoutByGender } from '../../src/constants/segments';
import { getEthnicityProfile } from '../../src/constants/ethnicityProfiles';
import { getTestProfile } from '../../src/constants/testProfiles';
import { PEPTIDES } from '../../src/data/peptides';
import { PeptideCategory } from '../../src/types';
import { trackPeptideSearch } from '../../src/services/analyticsEvents';
import { getPeptideById } from '../../src/data/peptides';
import { useTutorialStore } from '../../src/store/useTutorialStore';
import { useTourTarget } from '../../src/hooks/useTourTarget';
import { UpgradeNudgeCard } from '../../src/components/UpgradeNudgeCard';

// ─── Constants ──────────────────────────────────────────────────────────────

const HEALTH_TIPS = [
  'Consistency beats intensity. Small daily habits compound into transformative results.',
  'Hydration amplifies peptide absorption. Aim for half your body weight in ounces daily.',
  'Sleep is your most powerful recovery tool. Prioritize 7-9 hours tonight.',
  'Track your journey. What gets measured gets improved.',
  'Your body is rebuilding itself right now. Give it the nutrients it needs.',
  'Stress management is not optional -- it is foundational to peptide efficacy.',
  'Movement is medicine. Even a 10-minute walk improves bioavailability.',
  'Listen to your body. Subtle signals today become clear patterns over time.',
  'Recovery days are growth days. Rest is productive.',
  'Every check-in is a data point in your transformation story.',
];

const QUICK_ACTIONS = [
  { id: 'checkin', icon: 'heart-outline' as const, label: 'Check In', route: '/(tabs)/check-in', colors: ['#e3a7a1', '#c98a84'] as [string, string] },
  { id: 'dose', icon: 'flask-outline' as const, label: 'Log Dose', route: '/(tabs)/calendar', colors: ['#E89672', '#C76B45'] as [string, string] },
  { id: 'workout', icon: 'barbell-outline' as const, label: 'Workout', route: '/workouts', colors: ['#E89672', '#C76B45'] as [string, string] },
  { id: 'nutrition', icon: 'nutrition-outline' as const, label: 'Nutrition', route: '/nutrition', colors: ['#F4E9A7', '#E8A05A'] as [string, string] },
  { id: 'peptalk', icon: 'chatbubble-outline' as const, label: 'Ask Aimee', route: '/(tabs)/peptalk', colors: ['#BADDCB', '#B8913D'] as [string, string] },
  { id: 'journal', icon: 'book-outline' as const, label: 'Journal', route: '/journal', colors: ['#06b6d4', '#0891b2'] as [string, string] },
  { id: 'bodymap', icon: 'body-outline' as const, label: 'Body Map', route: '/body-map', colors: ['#22c55e', '#16a34a'] as [string, string] },
];

const HERO_BACKGROUND_IMAGES: Record<string, string> = {
  default: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
  fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
  science: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=800&q=80',
};

function getHeroBackgroundUri(segmentLabel?: string): string {
  if (!segmentLabel) return HERO_BACKGROUND_IMAGES.default;
  const lower = segmentLabel.toLowerCase();
  if (lower.includes('send') || lower.includes('beast') || lower.includes('shred')) {
    return HERO_BACKGROUND_IMAGES.fitness;
  }
  if (lower.includes('biohack') || lower.includes('science') || lower.includes('research')) {
    return HERO_BACKGROUND_IMAGES.science;
  }
  return HERO_BACKGROUND_IMAGES.default;
}

// ─── Greeting Logic ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay(); // 0=Sun
  const start = new Date(referenceDate);
  start.setDate(start.getDate() - day); // Go to Sunday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// ─── Timeline Event Type ─────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  time: string;
  sortKey: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  type: 'dose' | 'checkin' | 'workout' | 'meal';
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const t = useTheme();
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const activeCategory =
    typeof category === 'string' ? category : category?.[0];

  // ── Tutorial: auto-start on first visit ───────────────────────────────────
  const hasSeenTour = useTutorialStore((s) => s.hasSeenTour);
  const tourActive = useTutorialStore((s) => s.tourActive);
  const startTour = useTutorialStore((s) => s.startTour);
  useEffect(() => {
    if (!hasSeenTour && !tourActive) {
      // Delay briefly so the page is rendered before the modal pops
      const timer = setTimeout(() => startTour('intro'), 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTour, tourActive, startTour]);

  // ── Tour targets for SpotlightTour highlighting ───────────────────────────
  const fabRef = useTourTarget('home_fab');
  const progressRingsRef = useTourTarget('home_progress_rings');

  // ── Animated values (RN Animated API) ─────────────────────────────────────
  const heroOpacity = useRef(new RNAnimated.Value(0)).current;
  const heroTranslateY = useRef(new RNAnimated.Value(20)).current;
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(heroOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      RNAnimated.timing(heroTranslateY, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle pulse for the streak fire icon. Hold the loop handle so we can
    // stop it when the Home tab unmounts — otherwise the loop runs forever
    // as the user navigates between tabs and the old values stay held in
    // memory after each re-mount.
    const pulseLoop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    return () => {
      pulseLoop.stop();
    };
  }, []);

  // ── State ─────────────────────────────────────────────────────────────────
  const [showLibrary, setShowLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatText, setChatText] = useState('');
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new RNAnimated.Value(0)).current;


  // ── Stores ────────────────────────────────────────────────────────────────
  const profile = useOnboardingStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const userEmail = user?.email;
  const healthProfile = useHealthProfileStore((s) => s.profile);
  const entries = useCheckinStore((s) => s.entries);
  // Cycle phase — only for female users who've opted in + set a last-period date
  const cycleInfo = useMemo<CyclePhaseInfo | null>(() => {
    if (healthProfile?.biologicalSex !== 'female') return null;
    if (!healthProfile?.cycle?.trackingEnabled) return null;
    return computeCyclePhase(
      healthProfile.cycle.lastPeriodStartDate,
      healthProfile.cycle.typicalCycleLength,
      healthProfile.cycle.typicalPeriodLength,
    );
  }, [healthProfile?.biologicalSex, healthProfile?.cycle]);

  // Show a soft "set up cycle" nudge for female users who haven't opted in yet.
  const showCycleSetupNudge =
    healthProfile?.biologicalSex === 'female' &&
    !healthProfile?.cycle?.trackingEnabled;

  const protocols = useDoseLogStore((s) => s.protocols);
  const doses = useDoseLogStore((s) => s.doses);
  const notifPrefs = useNotificationStore((s) => s.preferences);
  // Select individual slices so this component doesn't re-render on every
  // unrelated achievement store mutation (viewed peptides, articles read, etc.)
  const xp = useAchievementStore((s) => s.xp);
  const earnedBadgeIds = useAchievementStore((s) => s.earnedBadgeIds);
  const getLevel = useAchievementStore((s) => s.getLevel);
  const checkAndAward = useAchievementStore((s) => s.checkAndAward);
  const workoutLogs = useWorkoutStore((s) => s.logs);
  const activeProgram = useWorkoutStore((s) => s.activeProgram);
  const meals = useMealStore((s) => s.meals);
  const getDailyProgress = useMealStore((s) => s.getDailyProgress);
  const getWater = useMealStore((s) => s.getWater);
  const mealTargets = useMealStore((s) => s.targets);
  const stacks = useStackStore((s) => s.savedStacks);
  const activePlan = usePlanStore((s) => s.activePlan);
  const getTodayItems = usePlanStore((s) => s.getTodayItems);
  const getWeeklyProgress = usePlanStore((s) => s.getWeeklyProgress);
  const completeItem = usePlanStore((s) => s.completeItem);
  const uncompleteItem = usePlanStore((s) => s.uncompleteItem);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Use hardcoded test profile if available, fall back to onboarding store
  const testProfile = useMemo(() => getTestProfile(userEmail), [userEmail]);
  const effectiveGender = testProfile?.gender ?? profile.gender;
  const effectiveAgeRange = testProfile?.ageRange ?? profile.ageRange;

  const segment = useMemo(
    () => getSegmentByProfile(effectiveGender, effectiveAgeRange),
    [effectiveGender, effectiveAgeRange],
  );

  // 2 UI layouts: male or female (age-specific content still via segment)
  const layout = useMemo(
    () => getLayoutByGender(effectiveGender),
    [effectiveGender],
  );

  const ethnicityProfile = useMemo(
    () => getEthnicityProfile(testProfile?.ethnicity ?? profile.ethnicity),
    [testProfile?.ethnicity, profile.ethnicity],
  );

  const hasDemographics = Boolean(effectiveGender && effectiveAgeRange);
  const accentColor = ethnicityProfile?.paletteAccent ?? segment.palette.primary;

  const todayCheckin = useMemo(
    () => entries.find((e) => e.date === todayKey()) ?? null,
    [entries],
  );

  const streak = useMemo(() => {
    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    if (entries.length === 0) return 0;
    const dates = new Set(entries.map((entry) => entry.date));
    let count = 0;
    const cursor = new Date();
    while (dates.has(toDateKey(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [entries]);

  const activeProtocolCount = useMemo(
    () => (protocols ?? []).filter((p) => p.isActive).length,
    [protocols],
  );

  const level = useMemo(() => getLevel(), [xp]);

  const todayDate = todayKey();
  const dailyMacros = useMemo(
    () => getDailyProgress(todayDate),
    [getDailyProgress, todayDate, meals],
  );
  const todayWater = useMemo(
    () => getWater(todayDate),
    [getWater, todayDate],
  );
  const waterPercent = (() => {
    const target = mealTargets.waterOz ?? 100;
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.round((todayWater / target) * 100));
  })();

  // ── Swipeable progress dashboard data ─────────────────────────────────────

  const progressGoals = useProgressGoalsStore((s) => s.goals);

  const todayWorkoutCount = useMemo(() => workoutLogs.filter((w) => w.date === todayDate).length, [workoutLogs, todayDate]);
  const todayWorkoutDuration = useMemo(() => workoutLogs.filter((w) => w.date === todayDate).reduce((s2, w) => s2 + w.durationMinutes, 0), [workoutLogs, todayDate]);
  const todayDoseCount = useMemo(() => doses.filter((d) => d.date === todayDate).length, [doses, todayDate]);

  const currentValues: Record<string, number> = useMemo(() => {
    const tt = dailyMacros?.totals ?? { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 };
    return {
      cal: tt.calories, pro: tt.proteinGrams, carb: tt.carbsGrams, fat: tt.fatGrams,
      fiber: tt.fiberGrams, water: todayWater,
      // Limit nutrients
      sodium: (tt as any).sodiumMg ?? 0, sugar: (tt as any).sugarGrams ?? 0,
      chol: (tt as any).cholesterolMg ?? 0, satfat: (tt as any).saturatedFatGrams ?? 0,
      // Minerals
      potassium: (tt as any).potassiumMg ?? 0, calcium: (tt as any).calciumMg ?? 0,
      iron: (tt as any).ironMg ?? 0, magnesium: (tt as any).magnesiumMg ?? 0,
      zinc: (tt as any).zincMg ?? 0, phosphorus: (tt as any).phosphorusMg ?? 0,
      selenium: (tt as any).seleniumMcg ?? 0, copper: (tt as any).copperMg ?? 0,
      manganese: (tt as any).manganeseMg ?? 0,
      // Vitamins
      vita: (tt as any).vitaminAMcg ?? 0, vitc: (tt as any).vitaminCMg ?? 0,
      vitd: (tt as any).vitaminDMcg ?? 0, vite: (tt as any).vitaminEMg ?? 0,
      vitk: (tt as any).vitaminKMcg ?? 0,
      vitb1: (tt as any).vitaminB1Mg ?? 0, vitb2: (tt as any).vitaminB2Mg ?? 0,
      vitb3: (tt as any).vitaminB3Mg ?? 0, vitb5: (tt as any).vitaminB5Mg ?? 0,
      vitb6: (tt as any).vitaminB6Mg ?? 0, vitb12: (tt as any).vitaminB12Mcg ?? 0,
      folate: (tt as any).folateMcg ?? 0, choline: (tt as any).cholineMg ?? 0,
      // Omega fatty acids
      omega3: (tt as any).omega3Grams ?? 0, omega6: (tt as any).omega6Grams ?? 0,
      workout: Math.min(todayWorkoutCount, 1), steps: todayCheckin?.steps ?? 0,
      active: todayCheckin?.activeCalories ?? 0, sleep: todayCheckin?.sleepStages?.total ?? 0,
      sleepq: todayCheckin?.sleepQuality ?? 0, recovery: todayCheckin?.recovery ?? 0,
      duration: todayWorkoutDuration,
      checkin: todayCheckin ? 1 : 0, doses: todayDoseCount,
      mood: todayCheckin?.mood ?? 0, energy: todayCheckin?.energy ?? 0,
      stress: todayCheckin?.stress ?? 0, weight: todayCheckin?.weightLbs ?? 0,
      rhr: todayCheckin?.restingHeartRate ?? 0, hrv: todayCheckin?.hrvMs ?? 0,
      vo2: todayCheckin?.vo2Max ?? 0, spo2: todayCheckin?.spo2 ?? 0,
    };
  }, [dailyMacros, todayWater, todayWorkoutCount, todayWorkoutDuration, todayCheckin, todayDoseCount]);

  const chartPages: ChartPage[] = useMemo(() => {
    const categories: { category: GoalCategory; title: string; icon: string; requiredFeature?: string; requiredTier?: string }[] = [
      { category: 'macros', title: 'Macros & Calories', icon: 'nutrition-outline' },
      { category: 'vitamins', title: 'Vitamins & Minerals', icon: 'flask-outline', requiredFeature: 'vitamins_donut_chart', requiredTier: 'PLUS' },
      { category: 'fitness', title: 'Fitness & Activity', icon: 'fitness-outline' },
      { category: 'health', title: 'Health & Wellness', icon: 'heart-outline' },
    ];
    return categories.map(({ category, title, icon, requiredFeature, requiredTier }) => ({
      title, icon, category, requiredFeature, requiredTier,
      segments: progressGoals
        .filter((g) => g.category === category && g.enabled)
        .map((g) => ({
          key: g.key, label: g.label, color: g.color,
          current: Math.round((currentValues[g.key] ?? 0) * 10) / 10,
          goal: g.goal, unit: g.unit, inverse: g.inverse,
        })),
    }));
  }, [progressGoals, currentValues]);

  // ── Daily health tip (rotates by day) ─────────────────────────────────────

  const dailyTip = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return HEALTH_TIPS[dayOfYear % HEALTH_TIPS.length];
  }, []);

  // ── Next milestone ────────────────────────────────────────────────────────

  const nextMilestone = useMemo(() => {
    const milestones = [7, 14, 30, 60, 90, 180, 365];
    const next = milestones.find((m) => m > streak);
    if (!next) return null;
    return { target: next, daysLeft: next - streak };
  }, [streak]);

  // ── 7-day trend data ──────────────────────────────────────────────────────

  const trendData = useMemo(() => {
    const last7 = entries
      .filter((e) => {
        const d = new Date(e.date);
        const now = new Date();
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      mood: last7.map((e) => e.mood),
      energy: last7.map((e) => e.energy),
      sleep: last7.map((e) => e.sleepQuality),
    };
  }, [entries]);

  // ── Weekly Calendar Strip ──────────────────────────────────────────────────

  const weekDays = useMemo(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() + weekOffset * 7);
    return getWeekDays(ref);
  }, [weekOffset]);

  const weekActivityMap = useMemo(() => {
    const map: Record<string, { meals: boolean; workouts: boolean; checkins: boolean; doses: boolean }> = {};
    weekDays.forEach((d) => {
      const key = dateKey(d);
      map[key] = {
        meals: meals.some((m) => m.date === key),
        workouts: workoutLogs.some((w) => w.date === key),
        checkins: entries.some((e) => e.date === key),
        doses: doses.some((dose) => dose.date === key),
      };
    });
    return map;
  }, [weekDays, meals, workoutLogs, entries, doses]);

  const weekLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (first.getMonth() === last.getMonth()) {
      return `${months[first.getMonth()]} ${first.getDate()}–${last.getDate()}`;
    }
    return `${months[first.getMonth()]} ${first.getDate()} – ${months[last.getMonth()]} ${last.getDate()}`;
  }, [weekDays]);

  // ── Selected Day Timeline ─────────────────────────────────────────────────

  const selectedDayCheckin = useMemo(
    () => entries.find((e) => e.date === selectedDay) ?? null,
    [entries, selectedDay],
  );

  const selectedDayMeals = useMemo(
    () => meals.filter((m) => m.date === selectedDay),
    [meals, selectedDay],
  );
  const selectedDayMealCals = useMemo(
    () => selectedDayMeals.reduce((sum, m) => sum + m.foods.reduce((s2, f) => s2 + f.calories, 0) + (m.quickLog?.calories ?? 0), 0),
    [selectedDayMeals],
  );
  const selectedDayWorkoutList = useMemo(
    () => workoutLogs.filter((w) => w.date === selectedDay),
    [workoutLogs, selectedDay],
  );
  const selectedDayDoseList = useMemo(
    () => doses.filter((d) => d.date === selectedDay),
    [doses, selectedDay],
  );

  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];
    const day = selectedDay;

    // Doses
    doses.filter((d) => d.date === day).forEach((dose) => {
      const peptide = getPeptideById(dose.peptideId);
      events.push({
        id: dose.id,
        time: dose.time ? formatTime(dose.time) : 'Logged',
        sortKey: dose.time || '00:00',
        title: peptide?.name ?? dose.peptideId,
        subtitle: `${dose.amount} ${dose.unit} - ${dose.route}`,
        icon: 'flask-outline',
        color: '#E89672',
        type: 'dose',
      });
    });

    // Check-in
    const dayCheckin = selectedDayCheckin;
    if (dayCheckin) {
      events.push({
        id: `checkin-${day}`,
        time: dayCheckin.createdAt
          ? formatTime(`${new Date(dayCheckin.createdAt).getHours()}:${new Date(dayCheckin.createdAt).getMinutes()}`)
          : 'Logged',
        sortKey: dayCheckin.createdAt
          ? `${String(new Date(dayCheckin.createdAt).getHours()).padStart(2, '0')}:${String(new Date(dayCheckin.createdAt).getMinutes()).padStart(2, '0')}`
          : '08:00',
        title: 'Daily Check-in',
        subtitle: `Mood ${dayCheckin.mood}/5 | Energy ${dayCheckin.energy}/5`,
        icon: 'heart-outline',
        color: '#e3a7a1',
        type: 'checkin',
      });
    }

    // Workouts
    workoutLogs.filter((w) => w.date === day).forEach((workout) => {
      const startDate = workout.startedAt ? new Date(workout.startedAt) : null;
      events.push({
        id: workout.id,
        time: startDate ? formatTime(`${startDate.getHours()}:${startDate.getMinutes()}`) : 'Logged',
        sortKey: startDate
          ? `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
          : '06:00',
        title: 'Workout Complete',
        subtitle: `${workout.sets?.length ?? 0} sets | ${workout.durationMinutes ?? 0} min`,
        icon: 'barbell-outline',
        color: '#E89672',
        type: 'workout',
      });
    });

    // Meals
    meals.filter((m) => m.date === day).forEach((meal) => {
      const mealDate = meal.timestamp ? new Date(meal.timestamp) : null;
      const mealTime = mealDate ? `${mealDate.getHours()}:${mealDate.getMinutes()}` : null;
      const totalCal = (meal.foods ?? []).reduce((sum, f) => sum + f.calories, 0) + (meal.quickLog?.calories ?? 0);
      events.push({
        id: meal.id,
        time: mealTime ? formatTime(mealTime) : 'Logged',
        sortKey: mealTime
          ? `${String(mealDate!.getHours()).padStart(2, '0')}:${String(mealDate!.getMinutes()).padStart(2, '0')}`
          : '12:00',
        title: (meal.mealType ?? 'Meal').charAt(0).toUpperCase() + (meal.mealType ?? 'meal').slice(1),
        subtitle: `${totalCal} cal`,
        icon: 'nutrition-outline',
        color: '#F4E9A7',
        type: 'meal',
      });
    });

    return events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  }, [selectedDay, selectedDayCheckin, doses, workoutLogs, meals]);

  // ── Aimee Says (contextual suggestion) ─────────────────────────────────────

  const pepeSuggestion = useMemo(() => {
    const today = todayKey();
    const hasCheckin = entries.some((e) => e.date === today);
    const hasWorkout = workoutLogs.some((w) => w.date === today);
    const hasMeal = meals.some((m) => m.date === today);

    if (!hasCheckin) {
      return {
        message: 'Hey! Start your day with a quick check-in',
        route: '/(tabs)/check-in' as const,
        actionLabel: 'Check In',
        icon: 'heart-outline' as const,
      };
    }
    if (!hasWorkout) {
      return {
        message: "Ready to move? Let's get a workout in",
        route: '/workouts' as const,
        actionLabel: 'Workout',
        icon: 'barbell-outline' as const,
      };
    }
    if (!hasMeal) {
      return {
        message: "Don't forget to track your meals",
        route: '/nutrition' as const,
        actionLabel: 'Log Meal',
        icon: 'nutrition-outline' as const,
      };
    }
    return {
      message: 'Amazing day! You are crushing it',
      route: '/(tabs)/peptalk' as const,
      actionLabel: 'Ask Aimee',
      icon: 'chatbubble-outline' as const,
    };
  }, [entries, workoutLogs, meals]);

  // ── Today's Plan ────────────────────────────────────────────────────────

  const todayPlanItems = useMemo(() => getTodayItems(), [activePlan]);
  const weeklyProgress = useMemo(() => getWeeklyProgress(), [activePlan]);

  // ── Health Metrics ────────────────────────────────────────────────────────

  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics | null>(null);
  const [healthAvailable, setHealthAvailable] = useState(false);

  useEffect(() => {
    const available = isHealthDataAvailable();
    setHealthAvailable(available);
    if (available) {
      getHealthMetrics()
        .then(setHealthMetrics)
        .catch(() => {});
    }
  }, []);

  // ── Achievement Checker ───────────────────────────────────────────────────

  useEffect(() => {
    checkAndAward({
      checkinCount: entries.length,
      streak,
      workoutCount: workoutLogs.length,
      mealCount: meals.length,
      stackCount: stacks.filter((s: any) => !s.isCurated).length,
      waterGoalHit: waterPercent >= 100,
      profileComplete: healthProfile.setupComplete,
      programComplete:
        activeProgram !== null &&
        activeProgram.completedDays.length >= 40,
    });
  }, [
    entries.length,
    streak,
    workoutLogs.length,
    meals.length,
    stacks,
    waterPercent,
    healthProfile.setupComplete,
    activeProgram,
    checkAndAward,
  ]);

  // ── Setup Checklist ───────────────────────────────────────────────────────

  const setupItems = useMemo(
    () => [
      {
        id: 'profile',
        label: 'Complete health profile',
        complete: healthProfile.setupComplete,
        route: '/health-report' as const,
      },
      {
        id: 'checkin',
        label: 'First check-in',
        complete: entries.length > 0,
        route: '/(tabs)/check-in' as const,
      },
      {
        id: 'reminders',
        label: 'Set up reminders',
        complete: notifPrefs.enabled,
        route: '/(tabs)/profile' as const,
      },
    ],
    [healthProfile.setupComplete, entries.length, notifPrefs.enabled],
  );

  const allSetupComplete = setupItems.every((item) => item.complete);

  // ── Prompt Chips ──────────────────────────────────────────────────────────

  const promptChips = useMemo(() => {
    const focusAreas = (segment?.focusAreas ?? []).slice(0, 3);
    return focusAreas.map((area) => `Tell me about ${area.toLowerCase()}`);
  }, [segment?.focusAreas]);

  // ── Peptide Library ───────────────────────────────────────────────────────

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const basePeptides = useMemo(() => {
    if (!activeCategory) return PEPTIDES;
    return PEPTIDES.filter((p) =>
      p.categories.includes(activeCategory as PeptideCategory),
    );
  }, [activeCategory]);

  const filteredPeptides = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return basePeptides;
    // Strip dashes/spaces from both query and target so "MOTSC" matches "MOTS-C",
    // "GHK CU" matches "GHK-Cu", etc. Tester-reported.
    const normalize = (s: string) => s.toLowerCase().replace(/[-\s]/g, '');
    const nq = normalize(q);
    return basePeptides.filter(
      (p) =>
        normalize(p.name).includes(nq) ||
        (p.abbreviation && normalize(p.abbreviation).includes(nq)) ||
        p.categories.some((c) => normalize(c).includes(nq)),
    );
  }, [basePeptides, searchQuery]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      trackPeptideSearch(searchQuery, filteredPeptides.length);
    }, 500);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [filteredPeptides.length, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSendChat = () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    router.push({
      pathname: '/(tabs)/peptalk',
      params: { message: text },
    });
  };

  const handlePromptChip = (prompt: string) => {
    router.push({
      pathname: '/(tabs)/peptalk',
      params: { message: prompt },
    });
  };

  // ── Subscription tier ──────────────────────────────────────────────────────
  const tier = useSubscriptionStore((s) => s.tier) as string;
  const isPro = tier === 'pro';
  const isPlus = tier === 'plus' || isPro;

  // ── Nutrition summary ────────────────────────────────────────────────────
  const calPercent = mealTargets.calories > 0
    ? Math.min(100, Math.round((dailyMacros.totals.calories / mealTargets.calories) * 100))
    : 0;
  const todayMealCount = meals.filter((m) => m.date === todayDate).length;

  // ── Workout summary ──────────────────────────────────────────────────────
  const todayWorkouts = workoutLogs.filter((w) => w.date === todayDate);

  // ── FAB Menu ─────────────────────────────────────────────────────────────
  const toggleFab = () => {
    const opening = !fabOpen;
    setFabOpen(opening);
    RNAnimated.spring(fabAnim, {
      toValue: opening ? 1 : 0,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const closeFab = () => {
    setFabOpen(false);
    RNAnimated.spring(fabAnim, {
      toValue: 0,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const [showWorkoutSheet, setShowWorkoutSheet] = useState(false);

  const FAB_ITEMS: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; route: string; onPress?: () => void }[] = [
    // Log Meal → Nutrition mint
    { label: 'Log Meal', icon: 'nutrition-outline', color: '#6FA891', route: '/nutrition/food-search' },
    // Log Dose → Peptides blue
    { label: 'Log Dose', icon: 'flask-outline', color: '#7ABED0', route: '/(tabs)/calendar?openLog=1' },
    // Log Workout → open selection sheet
    { label: 'Log Workout', icon: 'barbell-outline', color: '#D98C86', route: '', onPress: () => { setFabOpen(false); setShowWorkoutSheet(true); } },
    // Daily Log → Home peach (merged check-in + journal)
    { label: 'Daily Log', icon: 'clipboard-outline', color: '#E89672', route: '/(tabs)/check-in' },
  ];

  // Recent completed workouts (for the selection sheet)
  const recentCompletedWorkouts = useMemo(() => {
    return workoutLogs
      .filter((w) => w.completedAt)
      .slice(0, 5);
  }, [workoutLogs]);

  // Next program workout
  const nextProgramDay = useMemo(() => {
    if (!activeProgram) return null;
    const program = activeProgram;
    const weeks = (program as any)?.program?.weeks;
    if (!weeks) return null;
    for (const week of weeks) {
      for (const day of week.days) {
        if (!program.completedDays.includes(day.id)) {
          return { weekNumber: week.weekNumber, dayName: day.name, dayId: day.id };
        }
      }
    }
    return null;
  }, [activeProgram]);

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Leaderboard — fixed above scroll */}
      <LeaderboardStrip />

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* ═══════════════════════════════════════════════════════════════
            HERO — Full-width warm gradient banner
        ═══════════════════════════════════════════════════════════════ */}
        <RNAnimated.View
          style={{
            opacity: heroOpacity,
            transform: [{ translateY: heroTranslateY }],
          }}
        >
          <View style={[styles.heroCard, { borderColor: 'transparent' }]}>
          <LinearGradient
            colors={[t.primaryLight, t.primaryLight, t.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Decorative circles */}
            <View style={[styles.heroDecorCircle, styles.heroDecorCircle1, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
            <View style={[styles.heroDecorCircle, styles.heroDecorCircle2, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            <View style={[styles.heroDecorCircle, styles.heroDecorCircle3, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
          </LinearGradient>
          <View style={styles.heroBanner}>
            {/* Top row: Greeting + Profile avatar */}
            <View style={styles.heroTopRow}>
              <Text style={[styles.heroGreeting, { color: '#2D2D2D' }]}>
                {getGreeting()}{user?.firstName ? `,\n${user.firstName}` : ''}
              </Text>
              <View style={styles.profileAvatarWrap}>
                <TouchableOpacity
                  style={[styles.profileAvatar, { borderColor: '#2D2D2D' }]}
                  onPress={() => router.push('/(tabs)/profile')}
                  activeOpacity={0.7}
                >
                  {user?.avatarUri ? (
                    <Image source={{ uri: user.avatarUri }} style={styles.profileAvatarImg} />
                  ) : (
                    <View style={[styles.profileAvatarFallback, { backgroundColor: 'rgba(255,255,255,0.6)' }]}>
                      <Text style={[styles.profileAvatarInitial, { color: '#2D2D2D' }]}>
                        {(user?.firstName ?? 'U')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/profile')}
                  activeOpacity={0.6}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.viewProfileLink, { color: '#2D2D2D' }]}>View Profile</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats row — inline on the banner */}
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <RNAnimated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons name="flame" size={20} color={t.primary} />
                </RNAnimated.View>
                <View>
                  <Text style={[styles.heroStatValue, { color: '#2D2D2D' }]}>{streak} day streak</Text>
                  {nextMilestone && (
                    <Text style={[styles.heroStatSub, { color: '#4B5563' }]}>
                      {nextMilestone.daysLeft} to {nextMilestone.target}-day
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.heroStat}>
                <Ionicons name="trophy" size={20} color={t.secondary} />
                <View>
                  <Text style={[styles.heroStatValue, { color: '#2D2D2D' }]}>{workoutLogs.length} workouts</Text>
                  <Text style={[styles.heroStatSub, { color: '#4B5563' }]}>logged</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Ionicons name="star" size={20} color={t.accent} />
                <View>
                  <Text style={[styles.heroStatValue, { color: '#2D2D2D' }]}>Level {level.level}</Text>
                  <Text style={[styles.heroStatSub, { color: '#4B5563' }]}>{level.title}</Text>
                </View>
              </View>

              <View style={styles.heroStat}>
                <Ionicons
                  name={todayCheckin ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={todayCheckin ? '#16A34A' : '#9CA3AF'}
                />
                <View>
                  <Text style={[styles.heroStatValue, { color: '#2D2D2D' }]}>
                    {todayCheckin ? 'Logged today' : 'Daily log due'}
                  </Text>
                  <Text style={[styles.heroStatSub, { color: '#4B5563' }]}>
                    {todayCheckin ? `Mood ${todayCheckin.mood}/5` : 'Start your day'}
                  </Text>
                </View>
              </View>
            </View>

            {activeProtocolCount > 0 && (
              <View style={[styles.heroStat, { marginTop: 4 }]}>
                <Ionicons name="flask" size={20} color={t.primary} />
                <View>
                  <Text style={[styles.heroStatValue, { color: '#2D2D2D' }]}>
                    {activeProtocolCount} active protocol{activeProtocolCount > 1 ? 's' : ''}
                  </Text>
                  <Text style={[styles.heroStatSub, { color: '#4B5563' }]}>tracking</Text>
                </View>
              </View>
            )}
          </View>
          </View>
        </RNAnimated.View>

        {/* ═══════════════════════════════════════════════════════════════
            DAILY HEALTH SNAPSHOT — step ring + macro ring + active protocol
        ═══════════════════════════════════════════════════════════════ */}
        <View style={styles.healthSnapshotRow}>
          <StepGoalRing
            onPress={() => router.push('/settings/integrations' as any)}
          />
          <MacroProgressRing
            onPress={() => router.push('/(tabs)/nutrition' as any)}
          />
        </View>
        <View style={styles.protocolBannerWrap}>
          <ActiveProtocolBanner />
        </View>

        {/* Today's plan — context-aware to-do list. Hides itself when nothing's left. */}
        <View style={styles.protocolBannerWrap}>
          <TodaysPlanCard />
        </View>

        {/* ═══════════════════════════════════════════════════════════════
            GET STARTED (new users only)
        ═══════════════════════════════════════════════════════════════ */}
        {!allSetupComplete && (
          <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Get Started</Text>
              <View style={[styles.sectionAccent, { backgroundColor: t.primary }]} />
            </View>
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
              {setupItems.map((item, i) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.setupRow, i < setupItems.length - 1 && styles.setupRowBorder]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.complete ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={item.complete ? t.primary : '#C7C7CC'}
                  />
                  <Text style={[styles.setupLabel, { color: t.text }, item.complete && styles.setupLabelDone]}>
                    {item.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#6b7280" />
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            WEEKLY CALENDAR STRIP — Inline week view with activity dots
        ═══════════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(130).duration(400)} style={styles.section}>
          {/* Header: week label + nav arrows + full calendar link */}
          <View style={styles.weekHeader}>
            <View style={styles.weekNav}>
              <TouchableOpacity onPress={() => setWeekOffset(weekOffset - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
                <Ionicons name="chevron-back" size={18} color={t.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.weekLabel, { color: t.text }]}>{weekLabel}</Text>
              <TouchableOpacity
                onPress={() => weekOffset < 0 && setWeekOffset(weekOffset + 1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={weekOffset >= 0}
              >
                <Ionicons name="chevron-forward" size={18} color={weekOffset >= 0 ? 'transparent' : t.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/calendar')}
              activeOpacity={0.7}
              style={styles.calendarLink}
            >
              <Ionicons name="calendar-outline" size={15} color={t.primary} />
              <Text style={[styles.calendarLinkText, { color: t.primary }]}>Full Calendar</Text>
            </TouchableOpacity>
          </View>

          {/* Day cells */}
          <View style={[styles.weekStrip, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            {weekDays.map((d) => {
              const key = dateKey(d);
              const isToday = key === todayKey();
              const isSelected = key === selectedDay;
              const isFuture = d > new Date();
              const activity = weekActivityMap[key];
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.weekDayCell,
                    isSelected && [styles.weekDayCellSelected, { backgroundColor: t.primary }],
                  ]}
                  onPress={() => !isFuture && setSelectedDay(key)}
                  activeOpacity={isFuture ? 1 : 0.7}
                >
                  <Text style={[
                    styles.weekDayLabel,
                    { color: isSelected ? '#fff' : t.textSecondary },
                    isToday && !isSelected && { color: t.primary, fontFamily: 'DMSans-Bold' },
                  ]}>
                    {DAY_LABELS[d.getDay()]}
                  </Text>
                  <Text style={[
                    styles.weekDayNumber,
                    { color: isSelected ? '#fff' : isFuture ? '#D1D5DB' : t.text },
                    isToday && !isSelected && { color: t.primary },
                  ]}>
                    {d.getDate()}
                  </Text>
                  {/* Activity dots */}
                  <View style={styles.weekDots}>
                    {activity?.meals && <View style={[styles.weekDot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : '#F4E9A7' }]} />}
                    {activity?.workouts && <View style={[styles.weekDot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : '#E89672' }]} />}
                    {activity?.checkins && <View style={[styles.weekDot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : '#e3a7a1' }]} />}
                    {activity?.doses && <View style={[styles.weekDot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : '#BADDCB' }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected day detail */}
          <View style={[styles.activityCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <View style={styles.activityDayLabel}>
              <Text style={[styles.activityDayText, { color: t.text }]}>
                {selectedDay === todayKey() ? 'Today' : new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={[styles.activityDayCount, { color: t.textSecondary }]}>
                {timelineEvents.length} event{timelineEvents.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {timelineEvents.length === 0 ? (
              <View style={styles.activityEmpty}>
                <Ionicons name="time-outline" size={22} color={t.textSecondary} />
                <Text style={[styles.activityEmptyText, { color: t.textSecondary }]}>
                  {selectedDay === todayKey() ? 'Nothing logged yet — tap + to start!' : 'No activity this day'}
                </Text>
              </View>
            ) : (
              <>
                {/* Summary badges row */}
                <View style={styles.daySummaryRow}>
                  {selectedDayMeals.length > 0 && (
                    <View style={[styles.daySummaryBadge, { backgroundColor: '#F4E9A715' }]}>
                      <Ionicons name="nutrition" size={14} color="#F4E9A7" />
                      <Text style={[styles.daySummaryValue, { color: t.text }]}>{Math.round(selectedDayMealCals)}</Text>
                      <Text style={[styles.daySummaryUnit, { color: t.textSecondary }]}>cal</Text>
                    </View>
                  )}
                  {selectedDayWorkoutList.length > 0 && (
                    <View style={[styles.daySummaryBadge, { backgroundColor: '#8faa8b15' }]}>
                      <Ionicons name="barbell" size={14} color="#8faa8b" />
                      <Text style={[styles.daySummaryValue, { color: t.text }]}>{selectedDayWorkoutList.reduce((s, w) => s + w.durationMinutes, 0)}</Text>
                      <Text style={[styles.daySummaryUnit, { color: t.textSecondary }]}>min</Text>
                    </View>
                  )}
                  {selectedDayDoseList.length > 0 && (
                    <View style={[styles.daySummaryBadge, { backgroundColor: '#E8967215' }]}>
                      <Ionicons name="flask" size={14} color="#E89672" />
                      <Text style={[styles.daySummaryValue, { color: t.text }]}>{selectedDayDoseList.length}</Text>
                      <Text style={[styles.daySummaryUnit, { color: t.textSecondary }]}>dose{selectedDayDoseList.length !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  {selectedDayCheckin && (
                    <View style={[styles.daySummaryBadge, { backgroundColor: '#e3a7a115' }]}>
                      <Ionicons name="heart" size={14} color="#e3a7a1" />
                      <Text style={[styles.daySummaryValue, { color: t.text }]}>{selectedDayCheckin.mood}/5</Text>
                      <Text style={[styles.daySummaryUnit, { color: t.textSecondary }]}>mood</Text>
                    </View>
                  )}
                </View>

                {/* Check-in detail badges */}
                {selectedDayCheckin && (
                  <View style={styles.checkinStripRow}>
                    <View style={[styles.checkinStripBadge, { backgroundColor: `${t.primary}10` }]}>
                      <Text style={[styles.checkinStripLabel, { color: t.textSecondary }]}>Energy</Text>
                      <Text style={[styles.checkinStripVal, { color: t.text }]}>{selectedDayCheckin.energy}/5</Text>
                    </View>
                    <View style={[styles.checkinStripBadge, { backgroundColor: `${t.primary}10` }]}>
                      <Text style={[styles.checkinStripLabel, { color: t.textSecondary }]}>Sleep</Text>
                      <Text style={[styles.checkinStripVal, { color: t.text }]}>{selectedDayCheckin.sleepQuality}/5</Text>
                    </View>
                    {selectedDayCheckin.weightLbs ? (
                      <View style={[styles.checkinStripBadge, { backgroundColor: `${t.primary}10` }]}>
                        <Text style={[styles.checkinStripLabel, { color: t.textSecondary }]}>Weight</Text>
                        <Text style={[styles.checkinStripVal, { color: t.text }]}>{selectedDayCheckin.weightLbs}</Text>
                      </View>
                    ) : null}
                    {selectedDayCheckin.steps ? (
                      <View style={[styles.checkinStripBadge, { backgroundColor: `${t.primary}10` }]}>
                        <Text style={[styles.checkinStripLabel, { color: t.textSecondary }]}>Steps</Text>
                        <Text style={[styles.checkinStripVal, { color: t.text }]}>{selectedDayCheckin.steps.toLocaleString()}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Timeline events */}
                {timelineEvents.slice(0, 6).map((event, i) => (
                  <View key={event.id} style={[styles.activityRow, i < Math.min(timelineEvents.length, 6) - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }]}>
                    <View style={[styles.activityDot, { backgroundColor: event.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityTitle, { color: t.text }]}>{event.title}</Text>
                      {event.subtitle && <Text style={[styles.activitySub, { color: t.textSecondary }]}>{event.subtitle}</Text>}
                    </View>
                    <Text style={[styles.activityTime, { color: t.textSecondary }]}>{event.time}</Text>
                  </View>
                ))}
                {timelineEvents.length > 6 && (
                  <TouchableOpacity
                    style={styles.seeMoreRow}
                    onPress={() => router.push('/(tabs)/calendar')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.seeMoreText, { color: t.primary }]}>See all {timelineEvents.length} events</Text>
                    <Ionicons name="chevron-forward" size={14} color={t.primary} />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* Upgrade nudge — rotating daily prompt for free users */}
        <UpgradeNudgeCard />

        {/* ═══════════════════════════════════════════════════════════════
            TODAY'S PROGRESS — Swipeable donut chart (tinted bg band)
        ═══════════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)}
          style={[styles.surfaceBand, { backgroundColor: t.surface }]}
        >
          <View ref={progressRingsRef} style={styles.section}>
            <DailyProgressChart pages={chartPages} />
          </View>
        </Animated.View>

        {/* Cycle phase card — female users who track */}
        {cycleInfo && (
          <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.section}>
            <TouchableOpacity
              onPress={() => router.push('/cycle' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Cycle tracking — ${PHASE_LABELS[cycleInfo.phase]}, day ${cycleInfo.dayOfCycle} of ${cycleInfo.cycleLength}`}
            >
              <View style={[styles.cycleCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
                <View style={styles.cycleHeader}>
                  <View style={styles.cycleHeaderLeft}>
                    <Ionicons name="flower-outline" size={18} color={t.primary} />
                    <Text style={[styles.cycleKicker, { color: t.textSecondary }]}>CYCLE</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
                </View>

                <View style={styles.cycleBody}>
                  <Text style={[styles.cyclePhase, { color: t.text }]}>
                    {PHASE_LABELS[cycleInfo.phase]} phase
                  </Text>
                  <Text style={[styles.cycleDay, { color: t.textSecondary }]}>
                    Day {cycleInfo.dayOfCycle} of {cycleInfo.cycleLength}
                  </Text>
                </View>

                <View style={styles.cycleTimeline}>
                  {Array.from({ length: cycleInfo.cycleLength }, (_, i) => {
                    const day = i + 1;
                    const isToday = day === cycleInfo.dayOfCycle;
                    const isPeriod = day <= cycleInfo.periodLength;
                    const isOv = day === cycleInfo.ovulationDay;
                    let color = 'rgba(0,0,0,0.08)';
                    if (isPeriod) color = '#E89672';
                    else if (isOv) color = t.primary;
                    return (
                      <View
                        key={day}
                        style={[
                          styles.cycleTimelineDot,
                          { backgroundColor: color },
                          isToday && { width: 6, height: 14, borderRadius: 3 },
                        ]}
                      />
                    );
                  })}
                </View>

                <Text style={[styles.cycleBlurb, { color: t.textSecondary }]}>
                  {PHASE_BLURBS[cycleInfo.phase]}
                </Text>

                <Text style={[styles.cycleNext, { color: t.textSecondary }]}>
                  Next period in {cycleInfo.daysUntilNextPeriod} day
                  {cycleInfo.daysUntilNextPeriod !== 1 ? 's' : ''}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Cycle setup nudge — female users who haven't opted in yet */}
        {showCycleSetupNudge && (
          <Animated.View entering={FadeInDown.delay(180).duration(400)} style={styles.section}>
            <TouchableOpacity
              onPress={() => router.push('/cycle/setup' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Set up cycle tracking"
            >
              <View
                style={[
                  styles.cycleCard,
                  { backgroundColor: t.surface, borderColor: t.cardBorder },
                ]}
              >
                <View style={styles.cycleHeader}>
                  <View style={styles.cycleHeaderLeft}>
                    <Ionicons name="flower-outline" size={18} color={t.primary} />
                    <Text style={[styles.cycleKicker, { color: t.textSecondary }]}>
                      CYCLE TRACKING
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
                </View>
                <View style={styles.cycleBody}>
                  <Text style={[styles.cyclePhase, { color: t.text }]}>Set it up</Text>
                  <Text style={[styles.cycleBlurb, { color: t.textSecondary }]}>
                    A few questions about your situation — predictions and insights stay
                    accurate for your body, not generic.
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            MAX YOUR STACK — Premium CTA (non-pro users)
        ═══════════════════════════════════════════════════════════════ */}
        {!isPro && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)} style={styles.section}>
            <TouchableOpacity
              onPress={() => router.push('/subscription')}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[t.primary, t.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.maxStackCTA}
              >
                <Text style={styles.maxStackCTALabel}>UNLOCK EVERYTHING</Text>
                <Text style={styles.maxStackCTATitle}>Maximize Your Stack</Text>
                <Text style={styles.maxStackCTASub}>
                  Custom workouts, meal plans, and peptide coaching — built for your goals.
                </Text>
                <View style={styles.maxStackCTABtn}>
                  <Text style={styles.maxStackCTABtnText}>Explore Plans</Text>
                  <Ionicons name="arrow-forward" size={16} color={t.primary} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════════
          FAB — Floating Action Button with fan menu
      ═══════════════════════════════════════════════════════════════ */}
      {fabOpen && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={closeFab}
        >
          <View style={styles.fabOverlayBg} />
        </TouchableOpacity>
      )}

      {/* Vertical stack menu — stacked above the FAB */}
      {FAB_ITEMS.map((item, i) => {
        // Reverse order so first item ends up closest to FAB
        const index = FAB_ITEMS.length - 1 - i;
        const spacing = 56;
        const targetY = -(index + 1) * spacing;

        return (
          <RNAnimated.View
            key={item.label}
            style={[
              styles.fabMenuItem,
              {
                opacity: fabAnim,
                transform: [
                  {
                    translateY: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, targetY],
                    }),
                  },
                  {
                    scale: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={fabOpen ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.fabMenuRow}
              activeOpacity={0.7}
              onPress={() => {
                closeFab();
                if (item.onPress) { item.onPress(); }
                else { router.push(item.route as any); }
              }}
            >
              <View style={[styles.fabMenuLabel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                <Text style={[styles.fabMenuLabelText, { color: t.text }]}>{item.label}</Text>
              </View>
              <View style={[styles.fabMenuIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon} size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          </RNAnimated.View>
        );
      })}

      {/* FAB button — pill with "Log" label */}
      <TouchableOpacity
        ref={fabRef as any}
        style={[styles.fab, { backgroundColor: t.primary }]}
        activeOpacity={0.85}
        onPress={toggleFab}
      >
        <RNAnimated.View
          style={{
            transform: [{
              rotate: fabAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '135deg'],
              }),
            }],
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </RNAnimated.View>
        {!fabOpen && (
          <Text style={styles.fabLabel} numberOfLines={1}>
            Log
          </Text>
        )}
      </TouchableOpacity>

      {/* ── Workout Selection Sheet ── */}
      <Modal visible={showWorkoutSheet} animationType="slide" transparent onRequestClose={() => setShowWorkoutSheet(false)}>
        <View style={styles.wsOverlay}>
          <View style={[styles.wsSheet, { backgroundColor: t.bg }]}>
            <View style={styles.wsHandle}><View style={[styles.wsHandleBar, { backgroundColor: t.textMuted }]} /></View>
            <View style={styles.wsHeader}>
              <Text style={[styles.wsTitle, { color: t.text }]}>Log Workout</Text>
              <TouchableOpacity onPress={() => setShowWorkoutSheet(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={t.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.wsScroll} showsVerticalScrollIndicator={false}>
              {/* Continue Program */}
              {nextProgramDay && (
                <TouchableOpacity
                  style={[styles.wsOption, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                  activeOpacity={0.7}
                  onPress={() => { setShowWorkoutSheet(false); router.push('/workouts/player' as any); }}
                >
                  <View style={[styles.wsOptionIcon, { backgroundColor: '#D98C8620' }]}>
                    <Ionicons name="play" size={20} color="#D98C86" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wsOptionTitle, { color: t.text }]}>Continue Program</Text>
                    <Text style={[styles.wsOptionSub, { color: t.textSecondary }]}>
                      Week {nextProgramDay.weekNumber} — {nextProgramDay.dayName}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
                </TouchableOpacity>
              )}

              {/* Start Empty Workout */}
              <TouchableOpacity
                style={[styles.wsOption, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                activeOpacity={0.7}
                onPress={() => { setShowWorkoutSheet(false); router.push('/workouts/player' as any); }}
              >
                <View style={[styles.wsOptionIcon, { backgroundColor: '#D98C8620' }]}>
                  <Ionicons name="add" size={20} color="#D98C86" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wsOptionTitle, { color: t.text }]}>Start Empty Workout</Text>
                  <Text style={[styles.wsOptionSub, { color: t.textSecondary }]}>Build as you go</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>

              {/* Quick Log (manual) */}
              <TouchableOpacity
                style={[styles.wsOption, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                activeOpacity={0.7}
                onPress={() => { setShowWorkoutSheet(false); router.push('/workouts/my-workouts' as any); }}
              >
                <View style={[styles.wsOptionIcon, { backgroundColor: '#D98C8620' }]}>
                  <Ionicons name="create-outline" size={20} color="#D98C86" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wsOptionTitle, { color: t.text }]}>Quick Log</Text>
                  <Text style={[styles.wsOptionSub, { color: t.textSecondary }]}>Manually enter what you did</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>

              {/* Build New */}
              <TouchableOpacity
                style={[styles.wsOption, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                activeOpacity={0.7}
                onPress={() => { setShowWorkoutSheet(false); router.push('/workouts/build-workout' as any); }}
              >
                <View style={[styles.wsOptionIcon, { backgroundColor: '#D98C8620' }]}>
                  <Ionicons name="hammer-outline" size={20} color="#D98C86" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wsOptionTitle, { color: t.text }]}>Build Custom Workout</Text>
                  <Text style={[styles.wsOptionSub, { color: t.textSecondary }]}>Create a reusable template</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>

              {/* Saved Templates */}
              {useWorkoutTemplateStore.getState().templates.length > 0 && (
                <>
                  <Text style={[styles.wsRecentLabel, { color: t.textSecondary }]}>MY WORKOUTS</Text>
                  {useWorkoutTemplateStore.getState().templates.map((tmpl) => (
                    <TouchableOpacity
                      key={tmpl.id}
                      style={[styles.wsRecentRow, { borderBottomColor: t.cardBorder }]}
                      activeOpacity={0.7}
                      onPress={() => { setShowWorkoutSheet(false); router.push(`/workouts/player?templateId=${tmpl.id}` as any); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.wsRecentName, { color: t.text }]}>{tmpl.name}</Text>
                        <Text style={[styles.wsRecentMeta, { color: t.textMuted }]}>
                          {tmpl.exercises.length} exercises · {tmpl.exercises.reduce((s, e) => s + e.targetSets, 0)} sets
                        </Text>
                      </View>
                      <Ionicons name="play-circle-outline" size={20} color="#D98C86" />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Recent completed workouts */}
              {recentCompletedWorkouts.length > 0 && (
                <>
                  <Text style={[styles.wsRecentLabel, { color: t.textSecondary }]}>RECENTLY COMPLETED</Text>
                  {recentCompletedWorkouts.map((workout) => (
                    <TouchableOpacity
                      key={workout.id}
                      style={[styles.wsRecentRow, { borderBottomColor: t.cardBorder }]}
                      activeOpacity={0.7}
                      onPress={() => { setShowWorkoutSheet(false); router.push('/workouts/player' as any); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.wsRecentName, { color: t.text }]}>
                          {workout.workoutName || 'Workout'}
                        </Text>
                        <Text style={[styles.wsRecentMeta, { color: t.textMuted }]}>
                          {workout.sets.length} exercises · {workout.durationMinutes} min · {workout.date}
                        </Text>
                      </View>
                      <Ionicons name="repeat-outline" size={16} color="#D98C86" />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Hero Banner ───────────────────────────────────────────────────────────
  heroCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: 20,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroDecorCircle: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroDecorCircle1: {
    width: 180,
    height: 180,
    top: -60,
    right: -40,
  },
  heroDecorCircle2: {
    width: 120,
    height: 120,
    bottom: -30,
    left: -20,
  },
  heroDecorCircle3: {
    width: 80,
    height: 80,
    top: 40,
    right: 60,
  },
  heroBanner: {
    paddingTop: Spacing.lg,
    paddingBottom: 24,
    paddingHorizontal: Spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  heroGreeting: {
    fontSize: 32,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
    flex: 1,
  },
  profileAvatarWrap: {
    alignItems: 'center',
    marginLeft: 12,
    marginTop: 4,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 2,
  },
  viewProfileLink: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  profileAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
  },
  profileAvatarInitial: {
    fontSize: 26,
    fontFamily: 'DMSans-Bold',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroStatValue: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
  },
  heroStatSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginTop: 1,
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  surfaceBand: {
    paddingVertical: 4,
    marginBottom: 20,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: 20,
  },
  healthSnapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 16,
    paddingHorizontal: Spacing.lg,
    marginTop: 4,
    marginBottom: 12,
  },
  protocolBannerWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: 20,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-ExtraBold',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },

  // ── Generic card ─────────────────────────────────────────────────────────
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── Setup checklist ──────────────────────────────────────────────────────
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  setupRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  setupLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  setupLabelDone: {
    color: '#C7C7CC',
    textDecorationLine: 'line-through',
  },

  // ── Nudge Card (MFP logging progress style) ──────────────────────────────
  nudgeCard: {
    borderRadius: BorderRadius.lg,
    padding: 20,
    borderWidth: 1,
  },
  nudgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nudgeTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-ExtraBold',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  nudgeBody: {
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    lineHeight: 24,
    paddingRight: 32,
  },
  nudgeHighlight: {
    fontWeight: '700',
  },
  nudgeChevron: {
    position: 'absolute',
    right: 20,
    top: '50%',
  },

  // ── Weekly Calendar Strip ─────────────────────────────────────────────────
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weekLabel: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
  },
  calendarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarLinkText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  weekStrip: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 6,
    marginBottom: 12,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    gap: 2,
  },
  weekDayCellSelected: {
    borderRadius: 12,
  },
  weekDayLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
  },
  weekDayNumber: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
  },
  weekDots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    marginTop: 2,
  },
  weekDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  activityCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityDayLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  activityDayText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  activityDayCount: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  activityEmpty: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  activityEmptyText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
  },
  activitySub: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
  },
  daySummaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  daySummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  daySummaryValue: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
  },
  daySummaryUnit: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  checkinStripRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  checkinStripBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkinStripLabel: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  checkinStripVal: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
  },
  seeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  seeMoreText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },

  // ── Max Your Stack CTA (bottom banner) ───────────────────────────────────
  maxStackCTA: {
    borderRadius: BorderRadius.lg,
    padding: 24,
    alignItems: 'center',
  },
  maxStackCTALabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(0,0,0,0.40)',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  maxStackCTATitle: {
    fontSize: 26,
    fontFamily: 'Playfair-Black',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  maxStackCTASub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  maxStackCTABtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  maxStackCTABtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── FAB ─────────────────────────────────────────────────────────────────
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  fabOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  fabLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  fabMenuItem: {
    position: 'absolute',
    right: 20,
    bottom: 46, // just above the FAB (20 + 52/2 = 46)
    zIndex: 55,
    alignItems: 'flex-end',
  },
  fabMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabMenuLabel: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  fabMenuLabelText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  fabMenuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },

  // ── Workout Selection Sheet ──────────────────────────────────────────────
  wsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  wsSheet: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  wsHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  wsHandleBar: { width: 36, height: 4, borderRadius: 2, opacity: 0.3 },
  wsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  wsTitle: { fontSize: 20, fontFamily: 'Playfair-Bold' },
  wsScroll: { paddingHorizontal: 20 },
  wsOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  wsOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wsOptionTitle: { fontSize: 15, fontFamily: 'DMSans-SemiBold' },
  wsOptionSub: { fontSize: 12, fontFamily: 'DMSans-Regular', marginTop: 2 },
  wsRecentLabel: { fontSize: 11, fontFamily: 'DMSans-Bold', letterSpacing: 0.8, marginTop: 16, marginBottom: 10 },
  wsRecentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  wsRecentName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  wsRecentMeta: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 2 },

  // Cycle card
  cycleCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cycleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cycleKicker: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
  },
  cycleBody: {
    gap: 2,
  },
  cyclePhase: {
    fontSize: 20,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  cycleDay: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
  },
  cycleTimeline: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    paddingVertical: 4,
  },
  cycleTimelineDot: {
    width: 5,
    height: 10,
    borderRadius: 2.5,
  },
  cycleBlurb: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 17,
  },
  cycleNext: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    letterSpacing: 0.3,
    opacity: 0.8,
  },
});
