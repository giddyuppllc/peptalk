/**
 * Train tab — the unified landing for Workouts + Nutrition.
 *
 * Replaces the old separate Workouts + Nutrition bottom-bar entries.
 * Four big tiles drive every common action from one screen:
 *
 *   LOG WORKOUT       →  /workouts/new (quick logger)
 *   LOG MEAL          →  /nutrition/food-search
 *   JAMIE'S PROGRAM   →  /workouts/program/ll-body-recomp-1
 *   YOUR WORKOUTS     →  /workouts (custom + saved)
 *
 * Plus a "Today" preview at the top showing what's already scheduled
 * (next program day, target macros so far) so users know whether they
 * have work to do without thinking about it.
 *
 * Design rule: this screen should NEVER have more than ~6 tap targets.
 * If you're tempted to add a fifth row, it belongs deeper in the flow.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { getProgramById } from '../../src/data/workoutPrograms';
import { selectionTick, tapMedium } from '../../src/utils/haptics';

const JAMIE_PROGRAM_ID = 'll-body-recomp-1';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TrainScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();

  const todayDate = todayKey();
  const meals = useMealStore((s) => s.meals);
  const targets = useMealStore((s) => s.targets);
  const workoutLogs = useWorkoutStore((s) => s.logs);
  const activeProgram = useWorkoutStore((s) => s.activeProgram);

  const todayMeals = meals.filter((m) => m.date === todayDate);
  const todayWorkouts = workoutLogs.filter((w) => w.date === todayDate);

  const calsToday = todayMeals.reduce((n, m) => {
    if (m.quickLog) return n + m.quickLog.calories;
    return n + m.foods.reduce((s, f) => s + f.calories, 0);
  }, 0);
  const calsTarget = targets?.calories ?? 2000;
  const calsRemaining = Math.max(0, calsTarget - calsToday);

  const jamieProgram = activeProgram
    ? getProgramById(activeProgram.programId)
    : null;
  const isJamieActive = jamieProgram?.id === JAMIE_PROGRAM_ID;

  const go = (path: string) => {
    selectionTick();
    router.push(path as never);
  };
  const goPrimary = (path: string) => {
    tapMedium();
    router.push(path as never);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Train</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Log something. Or follow the plan.
          </Text>
        </View>

        {/* ──── TODAY snapshot ──── */}
        <View style={[styles.todayCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
          <View style={styles.todayRow}>
            <View style={styles.todayStat}>
              <Ionicons name="barbell" size={18} color={accent.deep} />
              <Text style={[styles.todayValue, { color: t.text }]}>
                {todayWorkouts.length}
              </Text>
              <Text style={[styles.todayLabel, { color: t.textSecondary }]}>
                workouts today
              </Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Ionicons name="nutrition" size={18} color="#6FA891" />
              <Text style={[styles.todayValue, { color: t.text }]}>
                {todayMeals.length}
              </Text>
              <Text style={[styles.todayLabel, { color: t.textSecondary }]}>
                meals logged
              </Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Ionicons name="flame" size={18} color="#E89672" />
              <Text style={[styles.todayValue, { color: t.text }]}>
                {Math.round(calsRemaining)}
              </Text>
              <Text style={[styles.todayLabel, { color: t.textSecondary }]}>
                cal left today
              </Text>
            </View>
          </View>
        </View>

        {/* ──── ACTION GRID — 2x2 big tiles ──── */}
        <View style={styles.grid}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => goPrimary('/workouts/new')}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel="Log a workout"
          >
            <LinearGradient
              colors={['#E89672', '#D98C86']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tileGrad}
            >
              <Ionicons name="barbell" size={36} color="#fff" />
              <Text style={styles.tileTitle}>LOG WORKOUT</Text>
              <Text style={styles.tileSub}>Did a workout? Save it.</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => goPrimary('/nutrition/food-search')}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
          >
            <LinearGradient
              colors={['#7FB58F', '#6FA891']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tileGrad}
            >
              <Ionicons name="nutrition" size={36} color="#fff" />
              <Text style={styles.tileTitle}>LOG MEAL</Text>
              <Text style={styles.tileSub}>Search · scan · quick add</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => go(`/workouts/program/${JAMIE_PROGRAM_ID}`)}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel="Jamie's program"
          >
            <LinearGradient
              colors={['#7ABED0', '#5BA9A7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tileGrad}
            >
              <Ionicons name="star" size={36} color="#fff" />
              <Text style={styles.tileTitle}>JAMIE'S PROGRAM</Text>
              <Text style={styles.tileSub}>
                {isJamieActive ? 'Continue · today\'s session' : 'Lusciously Lean'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => go('/workouts')}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel="Your workouts"
          >
            <LinearGradient
              colors={['#9B86A4', '#75627D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tileGrad}
            >
              <Ionicons name="bookmarks" size={36} color="#fff" />
              <Text style={styles.tileTitle}>YOUR WORKOUTS</Text>
              <Text style={styles.tileSub}>Build · save · replay</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ──── secondary hint row ──── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => go('/nutrition/recipe-generator')}
          style={[styles.hintRow, { borderColor: t.cardBorder }]}
        >
          <Ionicons name="sparkles" size={16} color={accent.deep} />
          <Text style={[styles.hintText, { color: t.text }]}>
            Ask Aimee for a meal idea
          </Text>
          <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
  },
  header: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    marginTop: 4,
  },
  todayCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  todayDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  todayValue: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    marginTop: 4,
  },
  todayLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'DMSans-Medium',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: Spacing.lg,
  },
  tile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tileGrad: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  tileTitle: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 14,
    letterSpacing: 0.6,
    marginTop: Spacing.sm,
  },
  tileSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    marginTop: 2,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  hintText: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
  },
});
