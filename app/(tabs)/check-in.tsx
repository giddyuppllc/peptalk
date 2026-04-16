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
}> = ({ label, value, onChange }) => {
  const t = useTheme();
  return (
    <View style={styles.ratingRow}>
      <Text style={[styles.ratingLabel, { color: t.tint }]}>{label}</Text>
      <View style={styles.ratingPills}>
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
      <Text style={[styles.ratingHint, { color: t.textMuted }]}>{ratingLabel(value)}</Text>
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
      <View style={styles.severityPills}>
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

    const entry = saveCheckIn({
      date: dateKey,
      mood,
      energy,
      stress,
      sleepQuality,
      recovery,
      appetite,
      weightLbs: toNumber(weight),
      restingHeartRate: toNumber(restingHeartRate),
      steps: toNumber(steps),
      hrvMs: toNumber(hrvMs),
      vo2Max: toNumber(vo2Max),
      spo2: toNumber(spo2),
      respiratoryRate: toNumber(respiratoryRate),
      activeCalories: toNumber(activeCalories),
      sleepStages: sleepStagesData,
      notes,
      emotionTags,
      overallFeeling,
      peptideEffects: peptideEffects.filter((pe) => pe.effect.trim().length > 0),
      sideEffectTags,
    });

    trackCheckInSaved(entry.date, Boolean(entry.notes));
    notifySuccess();

    // Streak celebration + smart next actions
    const newStreak = getStreak();
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365];
    const hitMilestone = milestones.includes(newStreak);

    // Build contextual next-action buttons
    const todayKey = toDateKey(new Date());
    const todayDoses = useDoseLogStore.getState().doses.filter((d: { date: string }) => d.date === todayKey);
    const todayWorkouts = useWorkoutStore.getState().logs.filter(w => w.date === todayKey);
    const todayMeals = useMealStore.getState().meals.filter(m => m.date === todayKey);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Daily Check-In</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            {isToday
              ? 'Log how you feel, track your metrics, and build a research profile.'
              : `Checking in for ${dateKey}`}
          </Text>
        </View>

        {/* ── Motivational header image ────────────────────────────────────── */}
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80' }}
          style={styles.headerBanner}
        />

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <GlassCard style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: t.textSecondary }]}>Streak</Text>
              <Text style={[styles.summaryValue, { color: t.text }]}>{streak} day(s)</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: t.glassBorder }]} />
            <View>
              <Text style={[styles.summaryLabel, { color: t.textSecondary }]}>
                {isToday ? 'Today' : dateKey}
              </Text>
              <Text style={[styles.summaryValue, { color: t.text }]}>
                {existingEntry ? 'Completed' : 'Pending'}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Trends ────────────────────────────────────────────────────────── */}
        {entries.length >= 3 && (
          <>
            <GlassCard style={styles.formCard}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>14-Day Trends</Text>
              <View style={styles.trendGrid}>
                <TrendCard label="Mood" data={trendData.mood} color="#e3a7a1" unit="/5" />
                <TrendCard label="Energy" data={trendData.energy} color="#eab308" unit="/5" />
                <TrendCard label="Sleep" data={trendData.sleep} color="#6366f1" unit="/5" />
                <TrendCard label="Stress" data={trendData.stress} color="#ef4444" unit="/5" />
                <TrendCard label="Recovery" data={trendData.recovery} color="#10b981" unit="/5" />
                <TrendCard label="Appetite" data={trendData.appetite} color="#FFBF82" unit="/5" />
              </View>
            </GlassCard>

            {emotionFreq.length > 0 && (
              <GlassCard style={styles.formCard}>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Top Emotions (14 days)</Text>
                {emotionFreq.map(([tag, count]) => {
                  const opt = EMOTION_OPTIONS.find(o => o.value === tag);
                  return (
                    <View key={tag} style={styles.emotionBarRow}>
                      <Text style={[styles.emotionBarLabel, { color: t.textSecondary }]}>{opt?.label ?? tag}</Text>
                      <View style={[styles.emotionBar, { backgroundColor: t.glass }]}>
                        <View style={[styles.emotionBarFill, { flex: count, backgroundColor: getSentimentColor(opt?.sentiment ?? 'neutral') }]} />
                        <View style={{ flex: Math.max(0, 14 - count) }} />
                      </View>
                      <Text style={[styles.emotionBarCount, { color: t.text }]}>{count}</Text>
                    </View>
                  );
                })}
              </GlassCard>
            )}

            {weightData.length >= 3 && (
              <TrendCard label="Weight" data={weightData} color="#F8A97A" unit=" lbs" />
            )}
          </>
        )}

        {/* ── Ratings ──────────────────────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>How are you today?</Text>

          <RatingRow label="Mood" value={mood} onChange={setMood} />
          <RatingRow label="Energy" value={energy} onChange={setEnergy} />
          <RatingRow label="Stress" value={stress} onChange={setStress} />
          <RatingRow
            label="Sleep Quality"
            value={sleepQuality}
            onChange={setSleepQuality}
          />
          <RatingRow label="Recovery" value={recovery} onChange={setRecovery} />
          <RatingRow label="Appetite" value={appetite} onChange={setAppetite} />
        </GlassCard>

        {/* ── Emotion Tags ─────────────────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Emotion Tags</Text>
          <Text style={[styles.sectionHint, { color: t.textMuted }]}>
            Tap to toggle -- select all that apply
          </Text>

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
                      selected && {
                        color: getSentimentBorder(opt.sentiment),
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>

        {/* ── Overall Feeling ──────────────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>How are you feeling overall?</Text>
          <TextInput
            style={[styles.feelingInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
            value={overallFeeling}
            onChangeText={setOverallFeeling}
            placeholder="Describe how you're feeling in your own words..."
            placeholderTextColor={t.placeholder}
            multiline
          />
        </GlassCard>

        {/* ── Peptide Effects (only if active protocols) ───────────────────── */}
        {activeProtocols.length > 0 && (
          <GlassCard style={styles.formCard}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide Effects</Text>
            <Text style={[styles.sectionHint, { color: t.textMuted }]}>
              Track how each peptide in your active protocols is affecting you
            </Text>

            {activeProtocols.map((protocol) => {
              const peptide = getPeptideById(protocol.peptideId);
              const pepName = peptide?.name ?? protocol.peptideId;
              const pe = peptideEffects.find(
                (e) => e.peptideId === protocol.peptideId
              ) ?? {
                peptideId: protocol.peptideId,
                effect: '',
                sentiment: 'neutral' as EffectSentiment,
                severity: 3 as CheckInRating,
              };

              return (
                <View key={protocol.peptideId} style={[styles.pepEffectBlock, { borderBottomColor: t.glassBorder }]}>
                  <Text style={[styles.pepEffectName, { color: t.isDark ? '#e3a7a1' : '#b5736b' }]}>{pepName}</Text>

                  {/* Sentiment selector */}
                  <View style={styles.sentimentRow}>
                    {sentimentOptions.map((so) => {
                      const active = pe.sentiment === so.value;
                      return (
                        <TouchableOpacity
                          key={so.value}
                          onPress={() =>
                            updatePeptideEffect(
                              protocol.peptideId,
                              'sentiment',
                              so.value
                            )
                          }
                          activeOpacity={0.7}
                          style={[
                            styles.sentimentChip,
                            { borderColor: t.glassBorder, backgroundColor: t.glass },
                            active && {
                              backgroundColor: `${so.color}33`,
                              borderColor: so.color,
                            },
                          ]}
                        >
                          <Ionicons
                            name={so.icon as any}
                            size={14}
                            color={active ? so.color : t.textSecondary}
                            style={{ marginRight: 4 }}
                          />
                          <Text
                            style={[
                              styles.sentimentChipText,
                              { color: t.textSecondary },
                              active && { color: so.color, fontWeight: '700' },
                            ]}
                          >
                            {so.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Effect text input */}
                  <TextInput
                    style={[styles.pepEffectInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                    value={pe.effect}
                    onChangeText={(text) =>
                      updatePeptideEffect(protocol.peptideId, 'effect', text)
                    }
                    placeholder={`Effects noticed from ${pepName}...`}
                    placeholderTextColor={t.placeholder}
                  />

                  {/* Severity 1-5 */}
                  <SeverityPicker
                    value={pe.severity ?? (3 as CheckInRating)}
                    onChange={(v) =>
                      updatePeptideEffect(protocol.peptideId, 'severity', v)
                    }
                  />
                </View>
              );
            })}
          </GlassCard>
        )}

        {/* ── Side Effects Quick-Tags ──────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Side Effects</Text>
          <Text style={[styles.sectionHint, { color: t.textMuted }]}>
            Tap any side effects you experienced
          </Text>

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
                  <Text
                    style={[
                      styles.chipText,
                      { color: t.textSecondary },
                      selected && styles.sideEffectChipTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>

        {/* ── Metrics ──────────────────────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <View style={styles.metricHeaderRow}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Metrics</Text>
            <TouchableOpacity
              style={[
                styles.healthSyncButton,
                healthSynced && styles.healthSyncButtonDone,
              ]}
              onPress={handleHealthSync}
              disabled={healthSyncing || healthSynced}
              activeOpacity={0.7}
            >
              {healthSyncing ? (
                <ActivityIndicator size="small" color={Colors.pepTeal} />
              ) : (
                <>
                  <Ionicons
                    name={healthSynced ? 'checkmark-circle' : 'sync-outline'}
                    size={14}
                    color={healthSynced ? Colors.success : Colors.pepTeal}
                  />
                  <Text
                    style={[
                      styles.healthSyncText,
                      healthSynced && styles.healthSyncTextDone,
                    ]}
                  >
                    {healthSynced
                      ? 'Synced'
                      : Platform.OS === 'ios'
                        ? 'Sync from Apple Health'
                        : 'Sync from Health Connect'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricInput}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Weight (lbs)</Text>
              <TextInput
                style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder="--"
                placeholderTextColor={t.placeholder}
              />
            </View>
            <View style={styles.metricInput}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Resting HR</Text>
              <TextInput
                style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                value={restingHeartRate}
                onChangeText={setRestingHeartRate}
                keyboardType="numeric"
                placeholder="--"
                placeholderTextColor={t.placeholder}
              />
            </View>
            <View style={styles.metricInput}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Steps</Text>
              <TextInput
                style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                value={steps}
                onChangeText={setSteps}
                keyboardType="numeric"
                placeholder="--"
                placeholderTextColor={t.placeholder}
              />
            </View>
          </View>

          {/* ── Apple Watch Metrics ─────────────────────────────────────── */}
          {(hrvMs || vo2Max || spo2 || respiratoryRate || activeCalories || sleepStagesData) && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8, fontSize: 14, color: Colors.pepTeal }]}>
                ⌚ Apple Watch Data
              </Text>
              <View style={styles.metricGrid}>
                {hrvMs !== '' && (
                  <View style={styles.metricInput}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>HRV (ms)</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={hrvMs}
                      onChangeText={setHrvMs}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                )}
                {vo2Max !== '' && (
                  <View style={styles.metricInput}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>VO2 Max</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={vo2Max}
                      onChangeText={setVo2Max}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                )}
                {spo2 !== '' && (
                  <View style={styles.metricInput}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>SpO2 (%)</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={spo2}
                      onChangeText={setSpo2}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                )}
                {respiratoryRate !== '' && (
                  <View style={styles.metricInput}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Resp Rate</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={respiratoryRate}
                      onChangeText={setRespiratoryRate}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                )}
                {activeCalories !== '' && (
                  <View style={styles.metricInput}>
                    <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Active Cal</Text>
                    <TextInput
                      style={[styles.metricField, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
                      value={activeCalories}
                      onChangeText={setActiveCalories}
                      keyboardType="numeric"
                      placeholder="--"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                )}
              </View>
              {sleepStagesData && (
                <View style={{ marginTop: 8, padding: 12, backgroundColor: t.glass, borderRadius: 12 }}>
                  <Text style={[styles.metricLabel, { marginBottom: 8, color: t.textSecondary }]}>Sleep Stages</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#818cf8', fontSize: 16, fontWeight: '700' }}>{sleepStagesData.deep}h</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 11 }}>Deep</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#60a5fa', fontSize: 16, fontWeight: '700' }}>{sleepStagesData.core}h</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 11 }}>Core</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#a78bfa', fontSize: 16, fontWeight: '700' }}>{sleepStagesData.rem}h</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 11 }}>REM</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '700' }}>{sleepStagesData.awake}h</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 11 }}>Awake</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: Colors.pepTeal, fontSize: 16, fontWeight: '700' }}>{sleepStagesData.total}h</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 11 }}>Total</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </GlassCard>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <GlassCard style={styles.formCard}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Notes</Text>
          <TextInput
            style={[styles.notesInput, { backgroundColor: t.inputBg, color: t.text, borderColor: t.inputBorder }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="How are you feeling? Anything notable?"
            placeholderTextColor={t.placeholder}
            multiline
          />
        </GlassCard>

        {/* ── Save Button ──────────────────────────────────────────────────── */}
        <View style={{ marginTop: 4, marginBottom: 20 }}>
          <GradientButton
            label={existingEntry ? 'Update Check-In' : 'Save Check-In'}
            onPress={handleSave}
          />
        </View>

        {/* ── Recent Check-Ins ─────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Recent Check-Ins</Text>
        </View>
        {recentEntries.length > 0 ? (
          recentEntries.map((entry) => (
            <GlassCard key={entry.id} style={styles.recentCard}>
              <View style={styles.recentRow}>
                <Text style={[styles.recentDate, { color: t.text }]}>{entry.date}</Text>
                <Text style={[styles.recentMood, { color: t.isDark ? '#e3a7a1' : '#b5736b' }]}>Mood {entry.mood}/5</Text>
              </View>
              <Text style={[styles.recentMeta, { color: t.textSecondary }]}>
                Energy {entry.energy}/5 · Sleep {entry.sleepQuality}/5 · Stress{' '}
                {entry.stress}/5
              </Text>
              {entry.emotionTags && entry.emotionTags.length > 0 && (
                <Text style={[styles.recentEmotions, { color: t.isDark ? '#10b981' : '#047857' }]}>
                  {entry.emotionTags
                    .map((t) => {
                      const opt = EMOTION_OPTIONS.find((o) => o.value === t);
                      return opt?.label ?? t;
                    })
                    .join(', ')}
                </Text>
              )}
              {entry.sideEffectTags && entry.sideEffectTags.length > 0 && (
                <Text style={[styles.recentSideEffects, { color: t.isDark ? '#f87171' : '#dc2626' }]}>
                  Side effects: {entry.sideEffectTags.join(', ')}
                </Text>
              )}
            </GlassCard>
          ))
        ) : (
          <GlassCard style={styles.recentCard}>
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              No check-ins yet. Start with today.
            </Text>
          </GlassCard>
        )}

        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
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
    color: '#F8A97A',
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

  // ── Notes ───────────────────────────────────────────────────────────────
  notesInput: {
    minHeight: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#2D2D2D',
    textAlignVertical: 'top',
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

  // ── Recent Check-Ins ───────────────────────────────────────────────────
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
