import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { GlassCard } from '../../src/components/GlassCard';
import { TrendCard } from '../../src/components/TrendCard';
import { GradientButton } from '../../src/components/GradientButton';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { Disclaimer } from '../../src/components/Disclaimer';
import { selectionTick, notifySuccess } from '../../src/utils/haptics';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { computeTrend } from '../../src/utils/trends';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useMealStore } from '../../src/store/useMealStore';
import { getPeptideById } from '../../src/data/peptides';
import { trackCheckInSaved } from '../../src/services/analyticsEvents';
import {
  isHealthDataAvailable,
  requestHealthPermissions,
  syncAllWatchToCheckIn,
  getHealthSourceLabel,
  writeWeightToHealth,
  writeCheckInToHealth,
} from '../../src/services/healthDataService';
import { Colors } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import {
  EMOTION_OPTIONS,
  SIDE_EFFECT_TAGS,
  getSentimentColor,
  getSentimentBorder,
} from '../../src/constants/emotions';
import {
  CheckInRating,
  EmotionTag,
  PeptideEffect,
  EffectSentiment,
} from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ratingValues: CheckInRating[] = [1, 2, 3, 4, 5];

const ratingLabel = (value: CheckInRating) => {
  switch (value) {
    case 1:
      return 'Low';
    case 2:
      return 'Below';
    case 3:
      return 'Okay';
    case 4:
      return 'Good';
    case 5:
      return 'Great';
    default:
      return '';
  }
};

const sentimentOptions: { value: EffectSentiment; label: string; icon: string; color: string }[] = [
  { value: 'positive', label: 'Positive', icon: 'trending-up-outline', color: '#10b981' },
  { value: 'neutral', label: 'Neutral', icon: 'remove-outline', color: '#6366f1' },
  { value: 'negative', label: 'Negative', icon: 'trending-down-outline', color: '#ef4444' },
];

// ---------------------------------------------------------------------------
// RatingRow (unchanged)
// ---------------------------------------------------------------------------

const RatingRow: React.FC<{
  label: string;
  value: CheckInRating;
  onChange: (value: CheckInRating) => void;
  // Optional endpoint labels — when provided, overrides the default
  // "higher is better" wording (Low/Below/Okay/Good/Great). Useful for
  // metrics like Stress where higher is WORSE.
  lowLabel?: string;
  highLabel?: string;
}> = ({ label, value, onChange, lowLabel, highLabel }) => {
  const t = useTheme();
  const useEndpoints = !!(lowLabel && highLabel);
  const endpointHint = useEndpoints ? `, 1 is ${lowLabel}, 5 is ${highLabel}` : '';
  return (
    <View style={styles.ratingRow}>
      <Text style={[styles.ratingLabel, { color: t.tint }]} accessibilityRole="header">{label}</Text>
      <View
        style={styles.ratingPills}
        accessibilityRole="radiogroup"
        accessibilityLabel={`${label} rating, 1 to 5${endpointHint}`}
      >
        {ratingValues.map((rating) => (
          <AnimatedPress
            key={rating}
            style={[
              styles.ratingPill,
              { borderColor: t.glassBorder },
              value === rating && styles.ratingPillActive,
            ]}
            onPress={() => { selectionTick(); onChange(rating); }}
            scaleTo={0.85}
            accessibilityRole="radio"
            accessibilityLabel={`${rating} out of 5`}
            accessibilityState={{ selected: value === rating, checked: value === rating }}
          >
            <Text
              style={[
                styles.ratingText,
                { color: t.textSecondary },
                value === rating && styles.ratingTextActive,
              ]}
            >
              {rating}
            </Text>
          </AnimatedPress>
        ))}
      </View>
      {useEndpoints ? (
        <View style={styles.ratingEndpoints}>
          <Text style={[styles.ratingHint, { color: t.textMuted }]}>1 — {lowLabel}</Text>
          <Text style={[styles.ratingHint, { color: t.textMuted }]}>5 — {highLabel}</Text>
        </View>
      ) : (
        <Text style={[styles.ratingHint, { color: t.textMuted }]}>{ratingLabel(value)}</Text>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// SeverityPicker
// ---------------------------------------------------------------------------

const SeverityPicker: React.FC<{
  value: CheckInRating;
  onChange: (v: CheckInRating) => void;
}> = ({ value, onChange }) => {
  const t = useTheme();
  return (
    <View style={styles.severityRow}>
      <Text style={[styles.severityLabel, { color: t.textSecondary }]}>Severity</Text>
      <View
        style={styles.severityPills}
        accessibilityRole="radiogroup"
        accessibilityLabel="Severity, 1 to 5"
      >
        {ratingValues.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={[
              styles.severityPill,
              { borderColor: t.glassBorder },
              value === v && styles.severityPillActive,
            ]}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityLabel={`Severity ${v} out of 5`}
            accessibilityState={{ selected: value === v, checked: value === v }}
          >
            <Text
              style={[
                styles.severityText,
                { color: t.textSecondary },
                value === v && styles.severityTextActive,
              ]}
            >
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function CheckInScreen() {
  const t = useTheme();
  const { entries, saveCheckIn, getCheckInByDate, getStreak, getEmotionFrequency } =
    useCheckinStore();
  const { getActiveProtocols } = useDoseLogStore();

  // Accept optional ?date=YYYY-MM-DD search param (e.g. from calendar)
  const params = useLocalSearchParams<{ date?: string }>();

  const dateKey = useMemo(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return params.date;
    }
    return toDateKey(new Date());
  }, [params.date]);

  const isToday = dateKey === toDateKey(new Date());
  const existingEntry = getCheckInByDate(dateKey);

  // ── Existing rating state ─────────────────────────────────────────────────
  const [mood, setMood] = useState<CheckInRating>(3);
  const [energy, setEnergy] = useState<CheckInRating>(3);
  const [stress, setStress] = useState<CheckInRating>(3);
  const [sleepQuality, setSleepQuality] = useState<CheckInRating>(3);
  const [recovery, setRecovery] = useState<CheckInRating>(3);
  const [appetite, setAppetite] = useState<CheckInRating>(3);
  const [weight, setWeight] = useState('');
  const [restingHeartRate, setRestingHeartRate] = useState('');
  const [steps, setSteps] = useState('');
  // Apple Watch metrics
  const [hrvMs, setHrvMs] = useState('');
  const [vo2Max, setVo2Max] = useState('');
  const [spo2, setSpo2] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [activeCalories, setActiveCalories] = useState('');
  const [sleepStagesData, setSleepStagesData] = useState<import('../../src/types').SleepStageData | undefined>();
  const [notes, setNotes] = useState('');

  // Body measurements for muscle-growth tracking. All optional, all in
  // inches. Stored as strings while the form is open so blank fields
  // round-trip cleanly.
  const [chestIn, setChestIn] = useState('');
  const [leftArmIn, setLeftArmIn] = useState('');
  const [rightArmIn, setRightArmIn] = useState('');
  const [waistIn, setWaistIn] = useState('');
  const [hipsIn, setHipsIn] = useState('');
  const [leftThighIn, setLeftThighIn] = useState('');
  const [rightThighIn, setRightThighIn] = useState('');
  const [leftCalfIn, setLeftCalfIn] = useState('');
  const [rightCalfIn, setRightCalfIn] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [showBodyMeasurements, setShowBodyMeasurements] = useState(false);

  // ── Health sync state ────────────────────────────────────────────────────
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [healthSynced, setHealthSynced] = useState(false);

  // ── New state ─────────────────────────────────────────────────────────────
  const [emotionTags, setEmotionTags] = useState<EmotionTag[]>([]);
  const [overallFeeling, setOverallFeeling] = useState('');
  const [peptideEffects, setPeptideEffects] = useState<PeptideEffect[]>([]);
  const [sideEffectTags, setSideEffectTags] = useState<string[]>([]);

  // ── Active protocols for Peptide Effects section ──────────────────────────
  const activeProtocols = getActiveProtocols();

  // Initialise peptideEffects array whenever active protocols change
  useEffect(() => {
    if (activeProtocols.length === 0) return;

    setPeptideEffects((prev) => {
      const existing = new Map(prev.map((pe) => [pe.peptideId, pe]));
      return activeProtocols.map((p) =>
        existing.get(p.peptideId) ?? {
          peptideId: p.peptideId,
          effect: '',
          sentiment: 'neutral' as EffectSentiment,
          severity: 3 as CheckInRating,
        }
      );
    });
  }, [activeProtocols.length]);

  // ── Hydrate from existing entry ───────────────────────────────────────────
  useEffect(() => {
    if (!existingEntry) return;
    setMood(existingEntry.mood);
    setEnergy(existingEntry.energy);
    setStress(existingEntry.stress);
    setSleepQuality(existingEntry.sleepQuality);
    setRecovery(existingEntry.recovery);
    setAppetite(existingEntry.appetite);
    setWeight(existingEntry.weightLbs ? String(existingEntry.weightLbs) : '');
    setRestingHeartRate(
      existingEntry.restingHeartRate ? String(existingEntry.restingHeartRate) : ''
    );
    setSteps(existingEntry.steps ? String(existingEntry.steps) : '');
    setHrvMs(existingEntry.hrvMs ? String(existingEntry.hrvMs) : '');
    setVo2Max(existingEntry.vo2Max ? String(existingEntry.vo2Max) : '');
    setSpo2(existingEntry.spo2 ? String(existingEntry.spo2) : '');
    setRespiratoryRate(existingEntry.respiratoryRate ? String(existingEntry.respiratoryRate) : '');
    setActiveCalories(existingEntry.activeCalories ? String(existingEntry.activeCalories) : '');
    setSleepStagesData(existingEntry.sleepStages);
    setNotes(existingEntry.notes ?? '');
    setEmotionTags(existingEntry.emotionTags ?? []);
    setOverallFeeling(existingEntry.overallFeeling ?? '');
    setSideEffectTags(existingEntry.sideEffectTags ?? []);

    if (existingEntry.peptideEffects?.length) {
      setPeptideEffects(existingEntry.peptideEffects);
    }

    const m = existingEntry.bodyMeasurements;
    if (m) {
      setChestIn(m.chestIn != null ? String(m.chestIn) : '');
      setLeftArmIn(m.leftArmIn != null ? String(m.leftArmIn) : '');
      setRightArmIn(m.rightArmIn != null ? String(m.rightArmIn) : '');
      setWaistIn(m.waistIn != null ? String(m.waistIn) : '');
      setHipsIn(m.hipsIn != null ? String(m.hipsIn) : '');
      setLeftThighIn(m.leftThighIn != null ? String(m.leftThighIn) : '');
      setRightThighIn(m.rightThighIn != null ? String(m.rightThighIn) : '');
      setLeftCalfIn(m.leftCalfIn != null ? String(m.leftCalfIn) : '');
      setRightCalfIn(m.rightCalfIn != null ? String(m.rightCalfIn) : '');
      setBodyFatPct(m.bodyFatPct != null ? String(m.bodyFatPct) : '');
      setShowBodyMeasurements(true);
    }
  }, [existingEntry]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleEmotion = (tag: EmotionTag) => {
    setEmotionTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleSideEffect = (tag: string) => {
    setSideEffectTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const updatePeptideEffect = (
    peptideId: string,
    field: keyof PeptideEffect,
    value: string | EffectSentiment | CheckInRating
  ) => {
    setPeptideEffects((prev) =>
      prev.map((pe) =>
        pe.peptideId === peptideId ? { ...pe, [field]: value } : pe
      )
    );
  };

  // ── Health Sync ────────────────────────────────────────────────────────────
  const handleHealthSync = async () => {
    setHealthSyncing(true);
    try {
      const granted = await requestHealthPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          `PepTalk needs access to ${getHealthSourceLabel()} to sync your data. Please enable it in your device settings.`,
        );
        return;
      }

      const data = await syncAllWatchToCheckIn();
      const filled: string[] = [];

      if (data.steps != null) {
        setSteps(String(data.steps));
        filled.push('steps');
      }
      if (data.weightLbs != null) {
        setWeight(String(data.weightLbs));
        filled.push('weight');
      }
      if (data.restingHeartRate != null) {
        setRestingHeartRate(String(data.restingHeartRate));
        filled.push('heart rate');
      }
      if (data.sleepHours != null) {
        const hrs = data.sleepHours;
        const quality: CheckInRating =
          hrs >= 8 ? 5 : hrs >= 7 ? 4 : hrs >= 6 ? 3 : hrs >= 5 ? 2 : 1;
        setSleepQuality(quality);
        filled.push('sleep');
      }
      // Apple Watch metrics
      if (data.hrvMs != null) {
        setHrvMs(String(data.hrvMs));
        filled.push('HRV');
      }
      if (data.vo2Max != null) {
        setVo2Max(String(data.vo2Max));
        filled.push('VO2 max');
      }
      if (data.spo2 != null) {
        setSpo2(String(data.spo2));
        filled.push('blood oxygen');
      }
      if (data.respiratoryRate != null) {
        setRespiratoryRate(String(data.respiratoryRate));
        filled.push('respiratory rate');
      }
      if (data.activeCalories != null) {
        setActiveCalories(String(data.activeCalories));
        filled.push('active calories');
      }
      if (data.sleepStages != null) {
        setSleepStagesData(data.sleepStages);
        filled.push('sleep stages');
      }

      setHealthSynced(true);
      notifySuccess();

      if (filled.length > 0) {
        Alert.alert(
          'Health Data Synced',
          `Pre-filled: ${filled.join(', ')}. Review and save your check-in.`,
        );
      } else {
        Alert.alert(
          'No Data Available',
          `No recent health data found in ${getHealthSourceLabel()}. You can enter your metrics manually.`,
        );
      }
    } catch (error) {
      Alert.alert(
        'Sync Failed',
        'Unable to fetch health data. Please try again later.',
      );
    } finally {
      setHealthSyncing(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const toNumber = (value: string) => {
      if (!value) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    // 2026-05-17 P1 fix: numeric inputs were unclamped — a stray
    // "5e10" in the weight field would persist 50,000,000,000 lb and
    // permanently break the weight trend chart's auto-scaling. Use
    // sane physical maxes per field. Below zero is also blocked.
    // Clamp into [min, max]. Ranges for the cloud-constrained fields MUST
    // match the check_ins DB CHECK constraints (migration 20260517000002),
    // or an out-of-range value makes the entire check-in row fail to sync.
    const clamp = (n: number | undefined, max: number, min = 0) => {
      if (n == null) return undefined;
      if (n < min) return min;
      if (n > max) return max;
      return n;
    };

    const entry = saveCheckIn({
      date: dateKey,
      mood,
      energy,
      stress,
      sleepQuality,
      recovery,
      appetite,
      // Caps below MATCH the check_ins DB CHECK constraints exactly, so an
      // out-of-range typo can't make the whole check-in fail to cloud-sync.
      weightLbs: clamp(toNumber(weight), 800, 40),
      restingHeartRate: clamp(toNumber(restingHeartRate), 200, 30),
      steps: clamp(toNumber(steps), 100_000),
      hrvMs: clamp(toNumber(hrvMs), 500),
      vo2Max: clamp(toNumber(vo2Max), 100),
      spo2: clamp(toNumber(spo2), 100, 50),
      respiratoryRate: clamp(toNumber(respiratoryRate), 80),
      activeCalories: clamp(toNumber(activeCalories), 10_000),
      sleepStages: sleepStagesData,
      notes,
      emotionTags,
      overallFeeling,
      peptideEffects: peptideEffects.filter((pe) => pe.effect.trim().length > 0),
      sideEffectTags,
      bodyMeasurements: (() => {
        const m = {
          chestIn: toNumber(chestIn),
          leftArmIn: toNumber(leftArmIn),
          rightArmIn: toNumber(rightArmIn),
          waistIn: toNumber(waistIn),
          hipsIn: toNumber(hipsIn),
          leftThighIn: toNumber(leftThighIn),
          rightThighIn: toNumber(rightThighIn),
          leftCalfIn: toNumber(leftCalfIn),
          rightCalfIn: toNumber(rightCalfIn),
          bodyFatPct: toNumber(bodyFatPct),
        };
        // Drop the entry entirely if no measurement was filled in — keeps
        // the entry shape clean rather than persisting a row of undefineds.
        return Object.values(m).some((v) => v != null) ? m : undefined;
      })(),
    });

    trackCheckInSaved(entry.date, Boolean(entry.notes));
    notifySuccess();

    // Write-back to Apple Health (iOS) — backs the NSHealthUpdateUsageDescription
    // claim that PepTalk writes check-ins + weight back to Health. Guarded on
    // availability + permission inside the service; fire-and-forget so a write
    // failure never blocks the local save. Timestamp the entry's own date.
    if (isHealthDataAvailable()) {
      const entryDate = entry.date ? new Date(`${entry.date}T12:00:00`) : new Date();
      void writeCheckInToHealth(entryDate);
      if (typeof entry.weightLbs === 'number' && entry.weightLbs > 0) {
        void writeWeightToHealth(entry.weightLbs, entryDate);
      }
    }

    // Streak celebration + smart next actions
    const newStreak = getStreak();
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365];
    const hitMilestone = milestones.includes(newStreak);

    // Build contextual next-action buttons.
    // Defensive: stores may not be hydrated yet on very first boot.
    const todayKey = toDateKey(new Date());
    const todayDoses = (useDoseLogStore.getState().doses ?? []).filter((d: { date: string }) => d.date === todayKey);
    const todayWorkouts = (useWorkoutStore.getState().logs ?? []).filter((w) => w.date === todayKey);
    const todayMeals = (useMealStore.getState().meals ?? []).filter((m) => m.date === todayKey);

    const actions: { text: string; onPress: () => void }[] = [];

    if (todayDoses.length === 0) {
      actions.push({
        text: 'Log a Dose',
        onPress: () => router.push('/(tabs)/calendar'),
      });
    }
    if (todayWorkouts.length === 0) {
      actions.push({
        text: 'Start Workout',
        onPress: () => router.push('/workouts' as any),
      });
    }
    if (todayMeals.length === 0) {
      actions.push({
        text: 'Log a Meal',
        onPress: () => router.push('/nutrition' as any),
      });
    }
    actions.push({ text: 'Done', onPress: () => {} });

    const title = hitMilestone
      ? `🔥 ${newStreak}-Day Streak!`
      : newStreak > 1
        ? `Check-in Saved — ${newStreak} day streak!`
        : 'Check-in Saved';

    const message = hitMilestone
      ? `Amazing consistency! You've checked in ${newStreak} days in a row. Keep it going!`
      : 'Your daily metrics are updated. What would you like to do next?';

    Alert.alert(title, message, actions);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const streak = getStreak();
  const recentEntries = entries.slice(0, 7);

  const trendData = useMemo(() => {
    const recent = entries.slice(0, 14).reverse(); // oldest first for sparkline
    return {
      mood: recent.map(e => e.mood),
      energy: recent.map(e => e.energy),
      sleep: recent.map(e => e.sleepQuality),
      stress: recent.map(e => e.stress),
      recovery: recent.map(e => e.recovery),
      appetite: recent.map(e => e.appetite),
    };
  }, [entries]);

  const weightData = useMemo(() => {
    return entries
      .slice(0, 30)
      .filter(e => e.weightLbs != null)
      .reverse()
      .map(e => e.weightLbs!);
  }, [entries]);

  const emotionFreq = useMemo(() => {
    const freq = getEmotionFrequency(14);
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [entries]);

  // ── Step-by-step flow ─────────────────────────────────────────────────────
  const ACCENT = '#E89672'; // Home peach — matches FAB "Daily Log" color
  const ACCENT_LIGHT = '#F0CFB1';

  const STEPS = [
    { key: 'mood', title: 'How are you feeling?', subtitle: 'Rate your overall mood right now' },
    { key: 'body', title: 'Body & Energy', subtitle: 'How does your body feel today?' },
    { key: 'sleep', title: 'Sleep & Stress', subtitle: 'How did you rest and recover?' },
    { key: 'vitals', title: 'Vitals', subtitle: 'Track your key metrics' },
    ...(activeProtocols.length > 0 ? [{ key: 'peptides', title: 'Peptide Effects', subtitle: 'How are your protocols affecting you?' }] : []),
    { key: 'journal', title: 'Journal', subtitle: 'Any thoughts or observations?' },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;
  const step = STEPS[currentStep];

  const goNext = () => {
    if (isLastStep) {
      handleSave();
    } else {
      selectionTick();
      setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const goBack = () => {
    selectionTick();
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Wave 76.53: weight / metric inputs were getting covered by
        // the soft keyboard on Android; 76.50's softwareKeyboardLayoutMode
        // resize handles most cases but the bottom nav (Back / Next)
        // wasn't lifting above the keyboard, leaving inputs hidden.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      {/* ── Top bar: X + progress ── */}
      <View style={styles.stepTopBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.stepCloseBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel check-in"
        >
          <Ionicons name="close" size={24} color={t.text} />
        </TouchableOpacity>
        <View style={styles.stepProgressRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.stepDot,
                { backgroundColor: i <= currentStep ? ACCENT : `${ACCENT}30` },
              ]}
            />
          ))}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step header ── */}
        <View style={styles.stepHeader}>
          <Text style={[styles.stepTitle, { color: t.text }]}>{step.title}</Text>
          <Text style={[styles.stepSubtitle, { color: t.textSecondary }]}>{step.subtitle}</Text>
        </View>


        {/* ══════ STEP CONTENT ══════ */}

        {/* Step 1: Mood */}
        {step.key === 'mood' && (
          <>
            <RatingRow label="Mood" value={mood} onChange={setMood} lowLabel="Low" highLabel="Great" />
            <View style={styles.chipWrap}>
              {EMOTION_OPTIONS.map((opt) => {
                const selected = emotionTags.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => toggleEmotion(opt.value)}
                    activeOpacity={0.7}
                    style={[
                      styles.chip,
                      { borderColor: t.glassBorder, backgroundColor: t.glass },
                      selected && {
                        backgroundColor: getSentimentColor(opt.sentiment),
                        borderColor: getSentimentBorder(opt.sentiment),
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={14}
                      color={selected ? getSentimentBorder(opt.sentiment) : t.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: t.textSecondary },
                        selected && { color: getSentimentBorder(opt.sentiment), fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[styles.feelingInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder, marginTop: 16 }]}
              value={overallFeeling}
              onChangeText={setOverallFeeling}
              placeholder="Describe how you're feeling in your own words..."
              placeholderTextColor={t.placeholder}
              multiline
            />
          </>
        )}

        {/* Step 2: Body & Energy */}
        {step.key === 'body' && (
          <>
            <RatingRow label="Energy" value={energy} onChange={setEnergy} lowLabel="Drained" highLabel="High" />
            <RatingRow label="Recovery" value={recovery} onChange={setRecovery} lowLabel="Sore" highLabel="Recovered" />
            <RatingRow label="Appetite" value={appetite} onChange={setAppetite} lowLabel="Suppressed" highLabel="Hungry" />
          </>
        )}

        {/* Step 3: Sleep & Stress */}
        {step.key === 'sleep' && (
          <>
            <RatingRow label="Sleep Quality" value={sleepQuality} onChange={setSleepQuality} lowLabel="Poor" highLabel="Great" />
            <RatingRow
              label="Stress"
              value={stress}
              onChange={setStress}
              lowLabel="Calm"
              highLabel="Overwhelmed"
            />
          </>
        )}

        {/* Step 4: Vitals */}
        {step.key === 'vitals' && (
          <>
            <TouchableOpacity
              style={[styles.stepSyncBtn, { borderColor: `${ACCENT}55`, backgroundColor: healthSynced ? `${ACCENT}12` : 'transparent' }]}
              onPress={handleHealthSync}
              disabled={healthSyncing || healthSynced}
              activeOpacity={0.7}
            >
              {healthSyncing ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                <>
                  <Ionicons
                    name={healthSynced ? 'checkmark-circle' : 'sync-outline'}
                    size={16}
                    color={healthSynced ? Colors.success : ACCENT}
                  />
                  <Text style={[styles.stepSyncText, { color: healthSynced ? Colors.success : ACCENT }]}>
                    {healthSynced ? 'Synced' : Platform.OS === 'ios' ? 'Sync from Apple Health' : 'Sync from Health Connect'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.metricGrid}>
              {[
                { label: 'Weight (lbs)', value: weight, setter: setWeight },
                { label: 'Resting HR', value: restingHeartRate, setter: setRestingHeartRate },
                { label: 'Steps', value: steps, setter: setSteps },
              ].map((m) => (
                <View key={m.label} style={styles.metricInput}>
                  <Text style={[styles.metricLabel, { color: t.textSecondary }]}>{m.label}</Text>
                  <TextInput
                    style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                    value={m.value}
                    onChangeText={m.setter}
                    keyboardType="numeric"
                    placeholder="--"
                    placeholderTextColor={t.placeholder}
                  />
                </View>
              ))}
            </View>

            {/* Body measurements — optional muscle-growth tracking. Hidden
                behind a toggle so daily check-ins stay quick for users who
                don't track them. Once expanded the value persists across
                sessions if any field is filled in. */}
            <TouchableOpacity
              onPress={() => setShowBodyMeasurements((v) => !v)}
              style={[
                styles.measureToggle,
                { borderColor: t.cardBorder, backgroundColor: showBodyMeasurements ? `${ACCENT}10` : 'transparent' },
              ]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showBodyMeasurements ? 'Hide body measurements' : 'Show body measurements'}
            >
              <Ionicons
                name="body-outline"
                size={16}
                color={showBodyMeasurements ? ACCENT : t.textSecondary}
              />
              <Text style={[styles.measureToggleText, { color: showBodyMeasurements ? ACCENT : t.text }]}>
                Body measurements{showBodyMeasurements ? '' : ' (track muscle growth)'}
              </Text>
              <Ionicons
                name={showBodyMeasurements ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={t.textSecondary}
              />
            </TouchableOpacity>

            {showBodyMeasurements && (
              <View style={styles.measureGrid}>
                {[
                  { label: 'Chest (in)', value: chestIn, setter: setChestIn },
                  { label: 'Waist (in)', value: waistIn, setter: setWaistIn },
                  { label: 'Hips (in)', value: hipsIn, setter: setHipsIn },
                  { label: 'L Arm (in)', value: leftArmIn, setter: setLeftArmIn },
                  { label: 'R Arm (in)', value: rightArmIn, setter: setRightArmIn },
                  { label: 'L Thigh (in)', value: leftThighIn, setter: setLeftThighIn },
                  { label: 'R Thigh (in)', value: rightThighIn, setter: setRightThighIn },
                  { label: 'L Calf (in)', value: leftCalfIn, setter: setLeftCalfIn },
                  { label: 'R Calf (in)', value: rightCalfIn, setter: setRightCalfIn },
                  { label: 'Body fat %', value: bodyFatPct, setter: setBodyFatPct },
                ].map((m) => (
                  <View key={m.label} style={styles.measureCell}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>{m.label}</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={m.value}
                      onChangeText={m.setter}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Step 5: Peptide Effects (conditional) */}
        {step.key === 'peptides' && activeProtocols.length > 0 && (
          <>
            {activeProtocols.map((protocol) => {
              const peptide = getPeptideById(protocol.peptideId);
              const pepName = peptide?.name ?? protocol.peptideId;
              const pe = peptideEffects.find((e) => e.peptideId === protocol.peptideId) ?? {
                peptideId: protocol.peptideId, effect: '', sentiment: 'neutral' as EffectSentiment, severity: 3 as CheckInRating,
              };
              return (
                <View key={protocol.peptideId} style={[styles.pepEffectBlock, { borderBottomColor: t.glassBorder }]}>
                  <Text style={[styles.pepEffectName, { color: ACCENT }]}>{pepName}</Text>
                  <View style={styles.sentimentRow}>
                    {sentimentOptions.map((so) => {
                      const active = pe.sentiment === so.value;
                      return (
                        <TouchableOpacity
                          key={so.value}
                          onPress={() => updatePeptideEffect(protocol.peptideId, 'sentiment', so.value)}
                          activeOpacity={0.7}
                          style={[
                            styles.sentimentChip,
                            { borderColor: t.glassBorder, backgroundColor: t.glass },
                            active && { backgroundColor: `${so.color}33`, borderColor: so.color },
                          ]}
                        >
                          <Ionicons name={so.icon as any} size={14} color={active ? so.color : t.textSecondary} style={{ marginRight: 4 }} />
                          <Text style={[styles.sentimentChipText, { color: t.textSecondary }, active && { color: so.color, fontWeight: '700' }]}>
                            {so.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={[styles.pepEffectInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                    value={pe.effect}
                    onChangeText={(text) => updatePeptideEffect(protocol.peptideId, 'effect', text)}
                    placeholder={`Effects noticed from ${pepName}...`}
                    placeholderTextColor={t.placeholder}
                  />
                  <SeverityPicker value={pe.severity ?? (3 as CheckInRating)} onChange={(v) => updatePeptideEffect(protocol.peptideId, 'severity', v)} />
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { color: t.text, marginTop: 20 }]}>Side Effects</Text>
            <View style={styles.chipWrap}>
              {SIDE_EFFECT_TAGS.map((tag) => {
                const selected = sideEffectTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => toggleSideEffect(tag)}
                    activeOpacity={0.7}
                    style={[
                      styles.chip,
                      { borderColor: t.glassBorder, backgroundColor: t.glass },
                      selected && styles.sideEffectChipActive,
                    ]}
                  >
                    <Text style={[styles.chipText, { color: t.textSecondary }, selected && styles.sideEffectChipTextActive]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Step 6: Journal */}
        {step.key === 'journal' && (
          <>
            <Text style={[styles.journalTimestamp, { color: t.textMuted, marginBottom: 12 }]}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <TextInput
              style={[styles.journalInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any thoughts, observations, or notes about your day..."
              placeholderTextColor={t.placeholder}
              multiline
              textAlignVertical="top"
            />
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom nav: Back / Next */}
      <View style={[styles.stepBottomBar, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
        {!isFirstStep ? (
          <TouchableOpacity onPress={goBack} style={[styles.stepBackBtn, { borderColor: `${ACCENT}55` }]} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={18} color={ACCENT} />
            <Text style={[styles.stepBackText, { color: ACCENT }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <TouchableOpacity onPress={goNext} style={[styles.stepNextBtn, { backgroundColor: ACCENT }]} activeOpacity={0.85}>
          <Text style={styles.stepNextText}>{isLastStep ? (existingEntry ? 'Update' : 'Save') : 'Next'}</Text>
          {!isLastStep && <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />}
          {isLastStep && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0EEE9',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 18,
  },

  // ── Header banner ──────────────────────────────────────────────────────
  headerBanner: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    marginBottom: 16,
    opacity: 0.75,
  },

  // ── Summary Card ────────────────────────────────────────────────────────
  summaryCard: {
    marginTop: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ── Trends ─────────────────────────────────────────────────────────────
  trendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  emotionBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  emotionBarLabel: {
    width: 80,
    fontSize: 12,
    color: '#6B7280',
  },
  emotionBar: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  emotionBarFill: {
    borderRadius: 4,
  },
  emotionBarCount: {
    width: 24,
    fontSize: 12,
    fontWeight: '600',
    color: '#2D2D2D',
    textAlign: 'right',
  },

  // ── Form Cards ──────────────────────────────────────────────────────────
  formCard: {
    marginBottom: 16,
  },

  // ── Step flow ───────────────────────────────────────────────────────────
  stepTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stepCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepProgressRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  stepContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  stepHeader: {
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    marginTop: 6,
  },
  stepBottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  stepBackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  stepBackText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  stepNextBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  stepNextText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  stepSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 16,
  },
  stepSyncText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },

  // ── Section helpers ─────────────────────────────────────────────────────
  sectionHeader: {
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },

  // ── Rating Row ──────────────────────────────────────────────────────────
  ratingRow: {
    marginBottom: 14,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#c7d7e6',
    marginBottom: 8,
  },
  ratingPills: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingPillActive: {
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    borderColor: 'rgba(227, 167, 161, 0.6)',
  },
  ratingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  ratingTextActive: {
    color: '#e3a7a1',
    fontWeight: '700',
  },
  ratingHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
  },
  ratingEndpoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 6,
    paddingHorizontal: 4,
  },

  // ── Chip Wrap (Emotion Tags & Side Effects) ─────────────────────────────
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  chipText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // ── Side Effect chip active state ───────────────────────────────────────
  sideEffectChipActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  sideEffectChipTextActive: {
    color: '#f87171',
    fontWeight: '700',
  },

  // ── Overall Feeling ─────────────────────────────────────────────────────
  feelingInput: {
    minHeight: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#2D2D2D',
    textAlignVertical: 'top',
    marginTop: 4,
  },

  // ── Peptide Effects ─────────────────────────────────────────────────────
  pepEffectBlock: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 14,
  },
  pepEffectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e3a7a1',
    marginBottom: 8,
  },
  sentimentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sentimentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  sentimentChipText: {
    fontSize: 12,
    color: '#6B7280',
  },
  pepEffectInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2D2D2D',
    fontSize: 13,
    marginBottom: 10,
  },

  // ── Severity ────────────────────────────────────────────────────────────
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  severityLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  severityPills: {
    flexDirection: 'row',
    gap: 6,
  },
  severityPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityPillActive: {
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    borderColor: 'rgba(227, 167, 161, 0.6)',
  },
  severityText: {
    fontSize: 12,
    color: '#6B7280',
  },
  severityTextActive: {
    color: '#e3a7a1',
    fontWeight: '700',
  },

  // ── Metrics ─────────────────────────────────────────────────────────────
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  healthSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  healthSyncButtonDone: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  healthSyncText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E89672',
  },
  healthSyncTextDone: {
    color: '#22c55e',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  metricInput: {
    flex: 1,
  },
  measureToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  measureToggleText: { flex: 1, fontSize: 13, fontWeight: '600' },
  measureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  measureCell: { width: '47%' },
  metricLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 6,
  },
  metricField: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2D2D2D',
  },

  // ── Journal ──────────────────────────────────────────────────────────────
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  journalTimestamp: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  journalInput: {
    minHeight: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#2D2D2D',
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 22,
  },

  // ── Save Button ─────────────────────────────────────────────────────────
  saveButton: {
    marginTop: 4,
    marginBottom: 20,
    backgroundColor: '#e3a7a1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── Recent Daily Logs ───────────────────────────────────────────────────
  recentCard: {
    marginBottom: 10,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  recentMood: {
    fontSize: 12,
    color: '#e3a7a1',
  },
  recentMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
  },
  recentEmotions: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 4,
  },
  recentSideEffects: {
    fontSize: 11,
    color: '#f87171',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
