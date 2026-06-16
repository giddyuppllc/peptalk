/**
 * Workout Generator — Pro-tier custom workout creation.
 *
 * Wave 76.44: restored entry point to the workoutGenerator service. The
 * previous Generator sheet was removed when the workouts dashboard was
 * simplified, leaving the `custom_workout_generator` feature flag with
 * no UI surface. This screen wires it back up: pick a goal, days/week,
 * and equipment access; tap Generate; the result lands in
 * "Your Workouts" and routes there to start logging.
 *
 * Backend: synchronous — uses the template-based randomizer in
 * src/services/workoutGenerator.ts (no edge function call). Future
 * Aimee-personalized version goes through aimee-chat-stream and lives
 * inside this same screen as a toggle.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import {
  GOAL_LABELS,
  getTemplatesForUser,
  generateWorkout,
  type ProgramTemplate,
} from '../../src/services/workoutGenerator';
import { generateAiWorkout, AiWorkoutError } from '../../src/services/aimeeWorkout';
import type { ExerciseGender } from '../../src/types/fitness';
import { tapMedium, selectionTick } from '../../src/utils/haptics';
import { PaywallModal } from '../../src/components/PaywallModal';

const DAY_OPTIONS = [3, 4, 5, 6] as const;
const LOCATION_OPTIONS = [
  { id: 'gym', label: 'Full gym', icon: 'barbell' as const },
  { id: 'home', label: 'Home / minimal', icon: 'home' as const },
];

// Gendered builder goals — men and women get tailored tracks; unset sex sees
// all goals. Keys are real goal keys (so AI + deterministic templates resolve);
// only the display label is gendered for the flagship goals.
const GENDERED_GOALS: Record<'men' | 'women' | 'anyone', string[]> = {
  women: ['transformation', 'weight_loss', 'circuit', 'body_recomp'],
  men: ['body_recomp', 'strength', 'hypertrophy', 'aerobic'],
  anyone: ['transformation', 'weight_loss', 'circuit', 'hypertrophy', 'strength', 'aerobic', 'body_recomp'],
};
const GENDERED_GOAL_LABEL: Record<string, Partial<Record<'men' | 'women', string>>> = {
  transformation: { women: 'Lusciously Lean' },
  body_recomp: { men: 'BUILD', women: 'Recomp' },
  circuit: { women: 'Circuit' },
};

export default function GenerateWorkoutScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const canUse = useSubscriptionStore((s) => s.hasFeature('custom_workout_generator'));
  const saveGenerated = useWorkoutStore((s) => s.saveGeneratedWorkout);
  const biologicalSex = useHealthProfileStore((s) => s.profile.biologicalSex);

  // Gender for the exercise library (filters move suitability). Unknown sex
  // maps to 'anyone' so non-male users aren't silently forced into the female
  // template set (old bug) — AI + library both handle 'anyone'.
  const aiGender: ExerciseGender =
    biologicalSex === 'male' ? 'men' : biologicalSex === 'female' ? 'women' : 'anyone';
  const templateGender: 'male' | 'female' | 'anyone' =
    biologicalSex === 'male' ? 'male' : biologicalSex === 'female' ? 'female' : 'anyone';

  // Gendered goal set (men/women tailored, unset = all).
  const availableGoals = useMemo(() => GENDERED_GOALS[aiGender], [aiGender]);
  const goalLabel = (g: string): string => {
    if (aiGender === 'men' || aiGender === 'women') {
      const override = GENDERED_GOAL_LABEL[g]?.[aiGender];
      if (override) return override;
    }
    return GOAL_LABELS[g]?.label ?? g;
  };

  const [goal, setGoal] = useState<string | null>(availableGoals[0] ?? null);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [location, setLocation] = useState<'gym' | 'home'>('gym');
  const [generating, setGenerating] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  /** Best-effort deterministic template when the AI path is unavailable. */
  const pickFallbackTemplate = (g: string, days: number): ProgramTemplate | null => {
    const nearest = (list: ProgramTemplate[]) =>
      list.length
        ? list.reduce((best, t) =>
            Math.abs(t.daysPerWeek - days) < Math.abs(best.daysPerWeek - days) ? t : best)
        : null;
    return (
      getTemplatesForUser({ gender: templateGender, goal: g, daysPerWeek: days })[0] ??
      nearest(getTemplatesForUser({ gender: templateGender, goal: g })) ??
      nearest(getTemplatesForUser({ goal: g })) ??
      nearest(getTemplatesForUser({}))
    );
  };

  const saveAndGo = (workout: ReturnType<typeof generateWorkout>) => {
    if (!workout || !goal) return false;
    const id = saveGenerated({
      name: `${goalLabel(goal)} — ${daysPerWeek}-day`,
      goal,
      daysPerWeek,
      location,
      level: 'intermediate',
      workout,
    });
    router.replace(`/workouts/my-workouts?highlight=${id}` as never);
    return true;
  };

  const generateDeterministic = (): boolean => {
    if (!goal) return false;
    const template = pickFallbackTemplate(goal, daysPerWeek);
    if (!template) return false;
    const generated = generateWorkout(template.id, { location, gender: aiGender });
    return saveAndGo(generated);
  };

  const handleGenerate = async () => {
    if (!canUse) {
      setPaywallVisible(true);
      return;
    }
    if (!goal) {
      Alert.alert('Pick a goal', 'Tap a training goal first.');
      return;
    }
    tapMedium();
    setGenerating(true);

    try {
      // Primary path: Aimee designs a targeted program, grounded in Jamie's
      // P1–P4 library + stacking rules; exercises are filled on-device.
      const aiWorkout = await generateAiWorkout({
        goal,
        daysPerWeek,
        location,
        gender: aiGender,
        level: 'intermediate',
      });
      if (saveAndGo(aiWorkout)) return;
      // AI produced an empty program — fall through to deterministic.
      if (generateDeterministic()) return;
      Alert.alert('Generation failed', 'Try a different goal or location.');
    } catch (err) {
      // Pro gate is the one case we surface instead of silently falling back.
      if (err instanceof AiWorkoutError && err.code === 'upgrade') {
        setPaywallVisible(true);
        return;
      }
      // Rate-limit or any AI/network failure → instant offline fallback so the
      // user still gets a workout.
      const ok = generateDeterministic();
      if (!ok) {
        Alert.alert(
          'Generation failed',
          err instanceof AiWorkoutError ? err.message : 'Try again in a moment.',
        );
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Generate Workout</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Pick what you want to train, how many days, and where. Aimee builds the rest.
        </Text>

        {/* Goal */}
        <Text style={[styles.sectionLabel, { color: t.text }]}>Training goal</Text>
        <View style={styles.goalGrid}>
          {availableGoals.map((g) => {
            const meta = GOAL_LABELS[g];
            const selected = goal === g;
            return (
              <TouchableOpacity
                key={g}
                onPress={() => {
                  selectionTick();
                  setGoal(g);
                }}
                style={[
                  styles.goalCard,
                  {
                    borderColor: selected ? accent.deep : t.cardBorder,
                    backgroundColor: selected ? `${accent.deep}12` : t.surface,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={(meta?.icon ?? 'barbell-outline') as any}
                  size={20}
                  color={selected ? accent.deep : t.textSecondary}
                />
                <Text
                  style={[
                    styles.goalLabel,
                    { color: selected ? accent.deep : t.text },
                  ]}
                >
                  {goalLabel(g)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Days per week */}
        <Text style={[styles.sectionLabel, { color: t.text }]}>Days per week</Text>
        <View style={styles.row}>
          {DAY_OPTIONS.map((d) => {
            const selected = daysPerWeek === d;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => {
                  selectionTick();
                  setDaysPerWeek(d);
                }}
                style={[
                  styles.pill,
                  {
                    borderColor: selected ? accent.deep : t.cardBorder,
                    backgroundColor: selected ? accent.deep : t.surface,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: selected ? '#fff' : t.text },
                  ]}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Location / equipment */}
        <Text style={[styles.sectionLabel, { color: t.text }]}>Equipment access</Text>
        <View style={styles.row}>
          {LOCATION_OPTIONS.map((opt) => {
            const selected = location === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  selectionTick();
                  setLocation(opt.id as 'gym' | 'home');
                }}
                style={[
                  styles.locationPill,
                  {
                    borderColor: selected ? accent.deep : t.cardBorder,
                    backgroundColor: selected ? `${accent.deep}12` : t.surface,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={selected ? accent.deep : t.textSecondary}
                />
                <Text
                  style={[
                    styles.locationText,
                    { color: selected ? accent.deep : t.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Generate button */}
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.85}
          style={styles.generateBtnWrap}
        >
          <LinearGradient
            colors={[accent.deep, accent.darker ?? accent.deep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.generateBtn, generating && { opacity: 0.65 }]}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="sparkles" size={18} color="#fff" />
            )}
            <Text style={styles.generateBtnText}>
              {generating ? 'Building…' : 'Generate workout'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.footnote, { color: t.textSecondary }]}>
          Saved to "Your Workouts" so you can run it any time. Re-generate
          anytime for a fresh exercise mix.
        </Text>
      </ScrollView>

      <PaywallModal
        visible={paywallVisible}
        feature="custom_workout_generator"
        onDismiss={() => setPaywallVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs, marginRight: Spacing.sm },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  subtitle: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    minWidth: '47%',
  },
  goalLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pill: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: FontSizes.lg, fontWeight: '700' },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
  },
  locationText: { fontSize: FontSizes.sm, fontWeight: '600' },
  generateBtnWrap: { marginTop: Spacing.xl },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  footnote: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.md,
    lineHeight: 18,
  },
});
