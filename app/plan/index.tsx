/**
 * Health Plan — the screen the plan feature never had.
 *
 * WHY THIS FILE DID NOT EXIST UNTIL NOW
 * Everything else did. src/store/usePlanStore has full CRUD for plans —
 * createPlan, createPlanFromAI, completeItem, uncompleteItem, addItem,
 * removeItem, archivePlan, deletePlan, getTodayItems, getItemsByDay,
 * getWeeklyProgress. `HealthPlan` and `HealthPlanItem` are defined in
 * src/types. `generateHealthPlan` sits in llmService, fully written, prompt and
 * all.
 *
 * Nine of the store's twelve actions had no caller anywhere in the app.
 * generateHealthPlan had no caller either. The store's ONLY consumer was the
 * logout handler clearing it. There was no route, no screen, no way in.
 *
 * Meanwhile Aimee tells users, in her own words: "Once your profile is set, I
 * can create a plan combining: Weekly workout schedule · Meal plan framework
 * with macro targets · Peptide protocol timing · Daily check-in reminders."
 *
 * So the app promised a plan, held a store to keep one in, shipped a generator
 * to write one — and gave nobody a way to see it. This screen is the missing
 * quarter.
 *
 * It invents no product behaviour: the schedule shape, the AI prompt, and the
 * progress maths all come from code that was already here. What was missing was
 * a surface.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../../src/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { tapLight, tapMedium, notifySuccess } from '../../src/utils/haptics';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { generateHealthPlan } from '../../src/services/llmService';
import { getGoalLabel } from '../../src/constants/goals';
import { getProgramById } from '../../src/data/workoutPrograms';
import {
  DAY_LABELS,
  ITEM_TYPE_META,
  todayDayOfWeek,
  sortItemsByTime,
  planSummary,
} from '../../src/lib/healthPlan';
import type { HealthPlanItem } from '../../src/types';

export default function PlanScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const activePlan = usePlanStore((s) => s.activePlan);
  const createPlanFromAI = usePlanStore((s) => s.createPlanFromAI);
  const completeItem = usePlanStore((s) => s.completeItem);
  const uncompleteItem = usePlanStore((s) => s.uncompleteItem);
  const archivePlan = usePlanStore((s) => s.archivePlan);

  const profile = useHealthProfileStore((s) => s.profile);
  const activeProgram = useWorkoutStore((s) => s.activeProgram);

  const [generating, setGenerating] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

  // Memoised because `?? []` builds a fresh array every render, which would
  // change handleGenerate's dependency on every pass and rebuild the callback
  // continuously.
  const goals = useMemo(() => profile?.primaryGoals ?? [], [profile?.primaryGoals]);
  const dayOfWeek = todayDayOfWeek();

  // Derived from `activePlan` rather than calling the store getters in a
  // selector: getTodayItems() builds a new array per call, which Zustand's
  // reference check reads as a change on every render — the same loop the
  // nutrition screen documents.
  const todayItems = useMemo(
    () => sortItemsByTime((activePlan?.schedule ?? []).filter((i) => i.dayOfWeek === dayOfWeek)),
    [activePlan, dayOfWeek],
  );
  const summary = useMemo(() => planSummary(activePlan?.schedule ?? []), [activePlan]);

  const handleGenerate = useCallback(async () => {
    if (goals.length === 0) {
      Alert.alert(
        'Set your goals first',
        'A plan is built around what you are working toward. Add your goals in Health Profile and come back.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open profile', onPress: () => router.push('/health-profile' as never) },
        ],
      );
      return;
    }

    setGenerating(true);
    try {
      const profileBits = [
        profile?.bodyMetrics?.weightLbs ? `${profile.bodyMetrics.weightLbs} lb` : null,
        profile?.bodyMetrics?.heightInches ? `${profile.bodyMetrics.heightInches} in` : null,
        profile?.lifestyle?.activityLevel
          ? `activity: ${profile.lifestyle.activityLevel}`
          : null,
      ].filter(Boolean);

      const programName = activeProgram?.programId
        ? (getProgramById(activeProgram.programId)?.name ?? activeProgram.programId)
        : null;

      const text = await generateHealthPlan({
        goals: goals.map(getGoalLabel),
        profile: profileBits.join(', ') || 'No profile details provided',
        currentPrograms: programName ? [programName] : [],
        duration: '4-week',
      });

      // generateHealthPlan returns null when the user declines AI consent or
      // no key is configured. Both are ordinary outcomes, not errors, and both
      // must say something — a spinner that stops with nothing on screen is
      // how a working feature reads as broken.
      if (!text) {
        Alert.alert(
          'Could not build a plan',
          'Aimee needs your consent to use your health profile, and a connection. Nothing was saved.',
        );
        return;
      }

      createPlanFromAI({
        name: `${goals.map(getGoalLabel).join(' + ')} plan`,
        goals,
        durationWeeks: 4,
        rawPlanText: text,
      });
      notifySuccess();
    } catch {
      Alert.alert('Could not build a plan', 'Something went wrong. Nothing was saved.');
    } finally {
      setGenerating(false);
    }
  }, [goals, profile, activeProgram, createPlanFromAI, router]);

  const handleToggle = (item: HealthPlanItem) => {
    tapLight();
    if (item.completed) uncompleteItem(item.id);
    else completeItem(item.id);
  };

  const handleArchive = () => {
    Alert.alert(
      'Finish this plan?',
      'It moves to your plan history. Your logged workouts, meals and doses are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          style: 'destructive',
          onPress: () => {
            tapMedium();
            archivePlan();
          },
        },
      ],
    );
  };

  // ── No plan yet ──────────────────────────────────────────────────────────
  if (!activePlan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <Header t={t} onBack={() => router.back()} title="Your plan" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <GlassCard style={styles.card}>
            <Ionicons name="calendar-outline" size={40} color={accent.deep} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No plan yet</Text>
            <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
              A plan pulls your goals, training and check-ins into one weekly
              schedule you can tick off. Aimee drafts it from your profile —
              you can change anything afterwards.
            </Text>

            {goals.length > 0 ? (
              <Text style={[styles.goalsLine, { color: t.textSecondary }]}>
                Building around: {goals.map(getGoalLabel).join(', ')}
              </Text>
            ) : (
              <Text style={[styles.goalsLine, { color: t.textSecondary }]}>
                Add your goals in Health Profile first — the plan is built around them.
              </Text>
            )}

            <Pressable
              onPress={handleGenerate}
              disabled={generating}
              accessibilityRole="button"
              accessibilityLabel="Build my plan with Aimee"
              style={[
                styles.primaryBtn,
                { backgroundColor: accent.deep, opacity: generating ? 0.6 : 1 },
              ]}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Build my plan</Text>
                </>
              )}
            </Pressable>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Active plan ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <Header t={t} onBack={() => router.back()} title="Your plan" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Progress */}
        <GlassCard style={styles.card}>
          <Text style={[styles.planName, { color: t.text }]}>{activePlan.name}</Text>
          <Text style={[styles.planDates, { color: t.textSecondary }]}>
            {activePlan.startDate} → {activePlan.endDate}
          </Text>

          <View style={[styles.progressTrack, { backgroundColor: `${accent.deep}22` }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: accent.deep, width: `${summary.percent}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: t.textSecondary }]}>
            {summary.completed} of {summary.total} done · {summary.percent}%
          </Text>
        </GlassCard>

        {/* Today */}
        <GlassCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>
            Today — {DAY_LABELS[dayOfWeek]}
          </Text>
          {todayItems.length === 0 ? (
            <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
              Nothing scheduled today. Rest is part of the plan.
            </Text>
          ) : (
            todayItems.map((item) => {
              const meta = ITEM_TYPE_META[item.type];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleToggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                  accessibilityLabel={`${item.title} at ${item.time}. ${
                    item.completed ? 'Done' : 'Not done'
                  }. Tap to toggle.`}
                  style={[styles.itemRow, { borderTopColor: t.cardBorder }]}
                >
                  <Ionicons
                    name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={item.completed ? '#10b981' : t.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.itemTitle,
                        {
                          color: t.text,
                          textDecorationLine: item.completed ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.itemMeta, { color: t.textSecondary }]}>
                      {item.time} · {meta.label}
                    </Text>
                  </View>
                  <Ionicons name={meta.icon as any} size={16} color={t.textSecondary} />
                </Pressable>
              );
            })
          )}
        </GlassCard>

        {/* The AI's own plan text — this is the substance of an AI plan, and
            storing it while never showing it is what rawPlanText was doing. */}
        {activePlan.rawPlanText ? (
          <GlassCard style={styles.card}>
            <Pressable
              onPress={() => setShowFullText((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showFullText ? 'Collapse full plan' : 'Read the full plan'}
              style={styles.disclosureRow}
            >
              <Text style={[styles.sectionTitle, { color: t.text }]}>The full plan</Text>
              <Ionicons
                name={showFullText ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={t.textSecondary}
              />
            </Pressable>
            <Text
              numberOfLines={showFullText ? undefined : 6}
              style={[styles.planText, { color: t.textSecondary }]}
            >
              {activePlan.rawPlanText}
            </Text>
          </GlassCard>
        ) : null}

        <Pressable
          onPress={handleArchive}
          accessibilityRole="button"
          accessibilityLabel="Finish this plan and move it to history"
          style={[styles.secondaryBtn, { borderColor: t.cardBorder }]}
        >
          <Ionicons name="archive-outline" size={16} color={t.textSecondary} />
          <Text style={[styles.secondaryBtnText, { color: t.textSecondary }]}>
            Finish this plan
          </Text>
        </Pressable>

        <Text style={[styles.disclaimer, { color: t.textMuted }]}>
          Educational planning only. Confirm anything clinical with your provider.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  t,
  onBack,
  title,
}: {
  t: ReturnType<typeof useTheme>;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={t.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: t.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { padding: Spacing.md, paddingBottom: 80 },
  card: { padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'stretch' },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', marginTop: 10 },
  emptyBody: { fontSize: FontSizes.sm, lineHeight: 20, marginTop: 6 },
  goalsLine: { fontSize: FontSizes.sm, marginTop: 12, fontStyle: 'italic' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  planName: { fontSize: FontSizes.lg, fontWeight: '700' },
  planDates: { fontSize: FontSizes.xs, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: FontSizes.xs, marginTop: 6 },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '700' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  itemTitle: { fontSize: FontSizes.sm, fontWeight: '600' },
  itemMeta: { fontSize: FontSizes.xs, marginTop: 2 },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planText: { fontSize: FontSizes.sm, lineHeight: 20, marginTop: 8 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: FontSizes.sm, fontWeight: '600' },
  disclaimer: { fontSize: FontSizes.xs, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
