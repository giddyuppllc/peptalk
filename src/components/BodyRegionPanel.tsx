/**
 * BodyRegionPanel — slides up when a body region is tapped.
 * Shows exercises, foods, health KPIs, and peptides for that zone.
 */

import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { GlassCard } from './GlassCard';
import { AnimatedPress } from './AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../constants/theme';
import type { BodyRegion } from '../data/bodyMapData';
import { getExercisesByMuscle } from '../data/exercises';
import { useCheckinStore } from '../store/useCheckinStore';

const { height: SCREEN_H } = Dimensions.get('window');
const PANEL_H = SCREEN_H * 0.52;

interface BodyRegionPanelProps {
  region: BodyRegion | null;
}

export function BodyRegionPanel({ region }: BodyRegionPanelProps) {
  const router = useRouter();
  const translateY = useSharedValue(PANEL_H + 50);

  useEffect(() => {
    translateY.value = withSpring(region ? 0 : PANEL_H + 50, {
      damping: 20,
      stiffness: 200,
    });
  }, [region]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Grab top 5 exercises for this region's muscle groups
  const exercises = useMemo(() => {
    if (!region) return [];
    const results: { name: string; muscle: string }[] = [];
    for (const muscle of region.muscles) {
      const found = getExercisesByMuscle(muscle).slice(0, 3);
      found.forEach((e) =>
        results.push({ name: e.name, muscle })
      );
    }
    return results.slice(0, 5);
  }, [region]);

  // Latest check-in for KPI values
  const latestCheckIn = useCheckinStore((s) => {
    if (s.entries.length === 0) return null;
    return s.entries[s.entries.length - 1];
  });

  const getKpiValue = (label: string): string => {
    if (!latestCheckIn) return '--';
    const map: Record<string, string> = {
      Mood: `${latestCheckIn.mood}`,
      Focus: `${latestCheckIn.energy}`,
      'Sleep Quality': `${latestCheckIn.sleepQuality}`,
      Stress: `${latestCheckIn.stress}`,
      Recovery: `${latestCheckIn.recovery}`,
      Energy: `${latestCheckIn.energy}`,
      Weight: latestCheckIn.weightLbs ? `${latestCheckIn.weightLbs}` : '--',
      'Resting HR': latestCheckIn.restingHeartRate ? `${latestCheckIn.restingHeartRate}` : '--',
      Steps: latestCheckIn.steps ? `${latestCheckIn.steps.toLocaleString()}` : '--',
      Appetite: `${latestCheckIn.appetite}`,
    };
    return map[label] ?? '--';
  };

  if (!region) return null;

  return (
    <Animated.View style={[styles.panel, animStyle]}>
      <LinearGradient
        colors={['rgba(15,23,32,0.98)', 'rgba(26,37,53,0.99)']}
        style={styles.gradient}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: `${region.color}25` }]}>
            <Ionicons name={region.icon as any} size={22} color={region.color} />
          </View>
          <Text style={styles.title}>{region.label}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── KPIs ─────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Health Metrics</Text>
          <View style={styles.kpiRow}>
            {region.kpis.map((kpi) => (
              <GlassCard key={kpi.label} style={styles.kpiCard} variant="elevated">
                <Ionicons name={kpi.icon as any} size={18} color={region.color} />
                <Text style={styles.kpiValue}>
                  {getKpiValue(kpi.label)}
                  <Text style={styles.kpiUnit}> {kpi.unit}</Text>
                </Text>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
              </GlassCard>
            ))}
          </View>

          {/* ── Exercises ────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Exercises</Text>
            <AnimatedPress
              onPress={() =>
                router.push(
                  `/workouts/exercises?muscle=${region.muscles[0]}` as any
                )
              }
            >
              <Text style={[styles.seeAll, { color: region.color }]}>See All</Text>
            </AnimatedPress>
          </View>

          {exercises.map((ex, i) => (
            <GlassCard key={`${ex.name}-${i}`} style={styles.exerciseCard}>
              <View style={styles.exerciseRow}>
                <View style={[styles.exerciseDot, { backgroundColor: region.color }]} />
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text style={styles.exerciseMuscle}>{ex.muscle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.darkTextSecondary} />
              </View>
            </GlassCard>
          ))}

          {/* ── Top Foods ────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Best Foods</Text>
          {region.topFoods.map((food) => (
            <GlassCard key={food.name} style={styles.foodCard}>
              <View style={styles.foodRow}>
                <Text style={styles.foodEmoji}>{food.emoji}</Text>
                <View style={styles.foodInfo}>
                  <Text style={styles.foodName}>{food.name}</Text>
                  <Text style={styles.foodWhy}>{food.why}</Text>
                </View>
              </View>
            </GlassCard>
          ))}

          {/* ── Nutrition Tips ───────────────────────────── */}
          <Text style={styles.sectionTitle}>Nutrition Tips</Text>
          <GlassCard variant="accent" style={styles.tipsCard}>
            {region.nutritionTips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name="leaf-outline" size={14} color={Colors.sage} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </GlassCard>

          {/* ── Related Peptides ─────────────────────────── */}
          <Text style={styles.sectionTitle}>Related Peptides</Text>
          <View style={styles.peptideRow}>
            {region.relatedPeptides.map((name) => (
              <AnimatedPress
                key={name}
                onPress={() => router.push(`/peptide/${encodeURIComponent(name)}` as any)}
                style={[styles.peptidePill, { borderColor: `${region.color}50` }]}
              >
                <Text style={[styles.peptideName, { color: region.color }]}>{name}</Text>
              </AnimatedPress>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_H,
    zIndex: 100,
  },
  gradient: {
    flex: 1,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.darkText,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  seeAll: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginTop: Spacing.md,
  },

  // KPIs
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  kpiValue: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginTop: 4,
  },
  kpiUnit: {
    fontSize: FontSizes.xs,
    fontWeight: '400',
    color: Colors.darkTextSecondary,
  },
  kpiLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // Exercises
  exerciseCard: {
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  exerciseMuscle: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    textTransform: 'capitalize',
    marginTop: 1,
  },

  // Foods
  foodCard: {
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  foodEmoji: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  foodWhy: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 1,
  },

  // Tips
  tipsCard: {
    paddingVertical: Spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    lineHeight: 18,
  },

  // Peptides
  peptideRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  peptidePill: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  peptideName: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
});

export default BodyRegionPanel;
