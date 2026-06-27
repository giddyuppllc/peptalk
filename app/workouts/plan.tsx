/**
 * 30-Day Plan — the Monthly Workout Programming Machine's output screen.
 *
 * Shows the active 30-day plan: a weekly-repeat calendar (same workout every
 * Monday, etc.), per-day exercise lists, swap-an-exercise, and a Start button
 * that runs a planned day in the existing tracker (logging reps + weights so
 * progressive overload shows across repeats). Weight-loss plans surface the
 * auto-added daily step goal.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing } from '../../src/constants/theme';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import {
  swapCandidates,
  workoutForPlannedDay,
  estimateDayMinutes,
  type PlannedDay,
} from '../../src/services/monthlyPlan';
import type { GeneratedDay } from '../../src/services/workoutGenerator';
import type { Exercise } from '../../src/types/fitness';
import { tapMedium, selectionTick } from '../../src/utils/haptics';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PlanScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const plan = useWorkoutStore((s) => s.monthlyPlan);
  const swapPlanExercise = useWorkoutStore((s) => s.swapPlanExercise);
  const saveGeneratedWorkout = useWorkoutStore((s) => s.saveGeneratedWorkout);

  const [expandedOffset, setExpandedOffset] = useState<number | null>(null);

  // Swap modal state: which (templateDayIndex, exerciseIndex) is being swapped.
  const [swapTarget, setSwapTarget] = useState<{
    dayIndex: number;
    exerciseIndex: number;
    current: Exercise;
  } | null>(null);

  const candidates = useMemo<Exercise[]>(() => {
    if (!plan || !swapTarget) return [];
    return swapCandidates(swapTarget.current, plan.location, plan.gender).slice(0, 40);
  }, [plan, swapTarget]);

  if (!plan) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: t.text }]}>30-Day Plan</Text>
          <View style={s.iconBtn} />
        </View>
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={40} color={t.textSecondary} />
          <Text style={[s.emptyTitle, { color: t.text }]}>No active plan</Text>
          <Text style={[s.emptyDesc, { color: t.textSecondary }]}>
            Build a 30-day plan from the generator to see it here.
          </Text>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: accent.deep }]}
            onPress={() => router.replace('/workouts/generate' as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={s.emptyBtnText}>Build a plan</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStartDay = (planned: PlannedDay, day: GeneratedDay) => {
    tapMedium();
    // Reuse the existing tracker: save this single day as a one-off workout so
    // reps + weights get logged to the store (and dated to today via finish).
    const id = saveGeneratedWorkout({
      name: `${plan.label} · ${day.name}`,
      goal: plan.goal,
      daysPerWeek: plan.workoutsPerWeek,
      location: plan.location,
      level: 'intermediate',
      workout: {
        templateId: `${plan.id}-${planned.dayOffset}`,
        templateLabel: day.name,
        goal: plan.goal,
        generatedAt: new Date().toISOString(),
        days: [day],
      },
    });
    router.push({
      pathname: '/workouts/generated-tracker' as any,
      params: { workoutId: id, dayIndex: '0' },
    });
  };

  const doSwap = (replacement: Exercise) => {
    if (!swapTarget) return;
    swapPlanExercise(swapTarget.dayIndex, swapTarget.exerciseIndex, replacement);
    setSwapTarget(null);
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>30-Day Plan</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
      >
        {/* Plan summary */}
        <View style={[s.summaryCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}>
          <Text style={[s.summaryTitle, { color: t.text }]}>{plan.label}</Text>
          <View style={s.summaryMetaRow}>
            <View style={[s.metaChip, { backgroundColor: `${accent.deep}15` }]}>
              <Ionicons name="barbell-outline" size={12} color={accent.deep} />
              <Text style={[s.metaChipText, { color: accent.deep }]}>
                {plan.workoutsPerWeek}×/week
              </Text>
            </View>
            <View style={[s.metaChip, { backgroundColor: `${accent.deep}15` }]}>
              <Ionicons name="time-outline" size={12} color={accent.deep} />
              <Text style={[s.metaChipText, { color: accent.deep }]}>
                {plan.lengthMinutes} min
              </Text>
            </View>
            <View style={[s.metaChip, { backgroundColor: `${accent.deep}15` }]}>
              <Ionicons
                name={plan.location === 'home' ? 'home-outline' : 'fitness-outline'}
                size={12}
                color={accent.deep}
              />
              <Text style={[s.metaChipText, { color: accent.deep }]}>
                {plan.location === 'home' ? 'Home' : 'Gym'}
              </Text>
            </View>
          </View>
          {plan.stepGoalAdded && plan.stepGoal ? (
            <View style={[s.stepRow, { borderTopColor: t.cardBorder }]}>
              <Ionicons name="walk" size={16} color={accent.deep} />
              <Text style={[s.stepText, { color: t.text }]}>
                Daily step goal: {plan.stepGoal.toLocaleString()} steps
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[s.sectionHint, { color: t.textSecondary }]}>
          Your week repeats — the same workout lands on the same weekday all 30
          days. Tap a day to see exercises, swap moves, and start.
        </Text>

        {/* 30-day calendar */}
        {plan.calendar.map((planned) => {
          const day = workoutForPlannedDay(plan, planned);
          const isRest = day == null;
          const expanded = expandedOffset === planned.dayOffset;
          return (
            <View
              key={planned.dayOffset}
              style={[
                s.dayCard,
                {
                  backgroundColor: t.surface,
                  borderColor: expanded ? accent.deep : t.cardBorder,
                  opacity: isRest ? 0.7 : 1,
                },
              ]}
            >
              <TouchableOpacity
                style={s.dayHeader}
                disabled={isRest}
                onPress={() => {
                  selectionTick();
                  setExpandedOffset(expanded ? null : planned.dayOffset);
                }}
                activeOpacity={0.7}
              >
                <View style={[s.dayBadge, { backgroundColor: isRest ? t.cardBorder : `${accent.deep}18` }]}>
                  <Text style={[s.dayBadgeNum, { color: isRest ? t.textSecondary : accent.deep }]}>
                    {planned.dayOffset + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.dayTitle, { color: t.text }]} numberOfLines={1}>
                    {isRest ? 'Rest day' : planned.label}
                  </Text>
                  <Text style={[s.daySub, { color: t.textSecondary }]}>
                    {WEEKDAY_SHORT[planned.weekday]} · {formatDate(planned.date)}
                    {!isRest && day ? ` · ${day.exercises.length} ex · ~${estimateDayMinutes(day)} min` : ''}
                  </Text>
                </View>
                {!isRest && (
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={t.textSecondary}
                  />
                )}
              </TouchableOpacity>

              {expanded && day && (
                <View style={[s.dayBody, { borderTopColor: t.cardBorder }]}>
                  {day.exercises.map((ex, exIdx) => (
                    <View
                      key={`${ex.exercise.id}-${exIdx}`}
                      style={[
                        s.exRow,
                        exIdx < day.exercises.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: t.cardBorder,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.exName, { color: t.text }]} numberOfLines={1}>
                          {ex.exercise.name}
                        </Text>
                        <Text style={[s.exReps, { color: t.textSecondary }]}>
                          {ex.reps}{ex.setType !== 'normal' ? ` · ${ex.setType.replace(/_/g, ' ')}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[s.swapBtn, { borderColor: `${accent.deep}60` }]}
                        onPress={() => {
                          selectionTick();
                          setSwapTarget({
                            dayIndex: planned.templateDayIndex!,
                            exerciseIndex: exIdx,
                            current: ex.exercise,
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="swap-horizontal" size={14} color={accent.deep} />
                        <Text style={[s.swapBtnText, { color: accent.deep }]}>Swap</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={s.startBtnWrap}
                    onPress={() => handleStartDay(planned, day)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[accent.deep, accent.darker ?? accent.deep]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.startBtn}
                    >
                      <Ionicons name="play" size={16} color="#fff" />
                      <Text style={s.startBtnText}>Start this workout</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Swap modal */}
      <Modal
        visible={swapTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSwapTarget(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { backgroundColor: t.bg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: t.text }]} numberOfLines={1}>
                Swap {swapTarget?.current.name}
              </Text>
              <TouchableOpacity onPress={() => setSwapTarget(null)} style={s.iconBtn}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalHint, { color: t.textSecondary }]}>
              Same muscle group · {plan.location === 'home' ? 'home' : 'gym'} · from Jamie&apos;s library
            </Text>
            {candidates.length === 0 ? (
              <Text style={[s.modalHint, { color: t.textSecondary, marginTop: 20 }]}>
                No alternatives found for this muscle and location.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {candidates.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.candidateRow, { borderBottomColor: t.cardBorder }]}
                    onPress={() => doSwap(c)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.candidateName, { color: t.text }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={[s.candidateMeta, { color: t.textSecondary }]}>
                        {c.primaryMuscle} · {c.equipment.join(', ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontFamily: 'Playfair-Black', letterSpacing: -0.3 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 40 },

  // Summary
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  summaryTitle: { fontSize: 18, fontFamily: 'DMSans-Bold' },
  summaryMetaRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  metaChipText: { fontSize: 11, fontFamily: 'DMSans-Bold', letterSpacing: 0.2 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  stepText: { fontSize: 13, fontFamily: 'DMSans-SemiBold' },

  sectionHint: { fontSize: 12, fontFamily: 'DMSans-Medium', marginBottom: 14, lineHeight: 17 },

  // Day card
  dayCard: { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeNum: { fontSize: 16, fontFamily: 'DMSans-Bold' },
  dayTitle: { fontSize: 15, fontFamily: 'DMSans-Bold' },
  daySub: { fontSize: 11, fontFamily: 'DMSans-Medium', marginTop: 2 },

  dayBody: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 14 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  exName: { fontSize: 13, fontFamily: 'DMSans-SemiBold' },
  exReps: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 2 },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  swapBtnText: { fontSize: 11, fontFamily: 'DMSans-Bold' },
  startBtnWrap: { marginTop: 12 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  startBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans-Bold' },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'DMSans-Bold' },
  emptyDesc: { fontSize: 13, fontFamily: 'DMSans-Regular', textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans-Bold' },

  // Swap modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 32,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: 'DMSans-Bold' },
  modalHint: { fontSize: 12, fontFamily: 'DMSans-Medium' },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  candidateName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  candidateMeta: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 2, textTransform: 'capitalize' },
});
