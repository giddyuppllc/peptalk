/**
 * Aimee Tool Result Card
 *
 * Renders below a chat message for read-only tool calls:
 *   - suggest_workout    → list of exercise rows from exercises_library
 *   - summarize_pattern  → structured summary of recent log activity
 *
 * Write tools (draft_meal_template, propose_log_field) render through
 * AimeePendingActionCard instead because they need a Confirm flow.
 *
 * Tap a workout row → navigate to /workouts/exercises (placeholder route
 * surface; the tab handles further filtering). Keeps the card non-modal
 * and quick to dismiss by scrolling.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../constants/theme';
import { tapMedium } from '../utils/haptics';
import type { AimeeToolResult } from '../types';

interface Props {
  result: AimeeToolResult;
}

export const AimeeToolResultCard: React.FC<Props> = ({ result }) => {
  if (result.tool === 'suggest_workout') return <WorkoutResult result={result} />;
  if (result.tool === 'summarize_pattern') return <PatternResult result={result} />;
  return null;
};

// ─── suggest_workout ─────────────────────────────────────────────────────

interface ExerciseRow {
  id: string;
  name: string;
  muscles?: string[];
  level?: string;
  location?: string;
  metrics?: string[];
  priority?: string;
}

const WorkoutResult: React.FC<{ result: AimeeToolResult }> = ({ result }) => {
  const router = useRouter();
  const results = Array.isArray((result.output as any)?.results)
    ? ((result.output as any).results as ExerciseRow[])
    : [];
  const note = (result.output as any)?.message as string | undefined;

  if (results.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="barbell-outline" size={16} color={Colors.almostAquaDeep} />
          <Text style={styles.headerText}>Aimee searched the workout library</Text>
        </View>
        <Text style={styles.body}>{note ?? 'No exercises matched.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="barbell-outline" size={16} color={Colors.almostAquaDeep} />
        <Text style={styles.headerText}>
          {results.length} exercise{results.length === 1 ? '' : 's'} from the library
        </Text>
      </View>
      {results.map((ex) => (
        <TouchableOpacity
          key={ex.id}
          style={styles.exerciseRow}
          onPress={() => {
            tapMedium();
            router.push('/workouts/exercises');
          }}
          accessibilityLabel={`Open ${ex.name}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.exerciseName}>{titleCase(ex.name)}</Text>
            <Text style={styles.exerciseMeta}>
              {(ex.muscles ?? []).slice(0, 3).join(' · ')}
              {ex.level ? `  •  ${ex.level}` : ''}
              {ex.location && ex.location !== 'any' ? `  •  ${ex.location}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={Colors.darkTextSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

function titleCase(s: string): string {
  return s.replace(/(^|\s)(\w)/g, (_m, sp, c) => sp + c.toUpperCase());
}

// ─── summarize_pattern ───────────────────────────────────────────────────

const PatternResult: React.FC<{ result: AimeeToolResult }> = ({ result }) => {
  const out = (result.output as any) ?? {};
  const days = out.timeframeDays ?? 14;

  const rows: { label: string; value: string }[] = [];

  if (out.checkins) {
    const c = out.checkins;
    if (c.count > 0) {
      const parts: string[] = [`${c.count} check-in${c.count === 1 ? '' : 's'}`];
      if (c.avgMood != null) parts.push(`mood ${c.avgMood}/5`);
      if (c.avgEnergy != null) parts.push(`energy ${c.avgEnergy}/5`);
      if (c.avgSleepHours != null) parts.push(`sleep ${c.avgSleepHours}h avg`);
      rows.push({ label: 'Check-ins', value: parts.join(' · ') });
    } else {
      rows.push({ label: 'Check-ins', value: 'none' });
    }
  }
  if (out.workouts) {
    const w = out.workouts;
    if (w.count > 0) {
      rows.push({
        label: 'Workouts',
        value: `${w.count} session${w.count === 1 ? '' : 's'}${w.avgDurationMin ? `, ${w.avgDurationMin} min avg` : ''}`,
      });
    } else {
      rows.push({ label: 'Workouts', value: 'none' });
    }
  }
  if (out.nutrition) {
    const n = out.nutrition;
    if (n.mealCount > 0) {
      rows.push({
        label: 'Nutrition',
        value: `${n.mealCount} meals over ${n.daysLogged}d · ~${n.avgDailyCalories} cal/day · ~${n.avgDailyProteinGrams}g protein/day`,
      });
    } else {
      rows.push({ label: 'Nutrition', value: 'none' });
    }
  }
  if (out.doses) {
    const d = out.doses;
    if (d.count > 0) {
      const top = Object.entries(d.peptideHistogram ?? {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([k, v]) => `${k} (${v})`)
        .join(', ');
      rows.push({ label: 'Doses', value: `${d.count} logged · ${top}` });
    } else {
      rows.push({ label: 'Doses', value: 'none' });
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="analytics-outline" size={16} color={Colors.iceMeltDeep} />
        <Text style={styles.headerText}>Pattern across the last {days} days</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.patternRow}>
          <Text style={styles.patternLabel}>{r.label}</Text>
          <Text style={styles.patternValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(127, 179, 194, 0.06)',
    borderColor: 'rgba(127, 179, 194, 0.25)',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  headerText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.iceMeltDarker,
  },
  body: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  exerciseName: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
  },
  exerciseMeta: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  patternRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  patternLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.darkText,
    width: 88,
  },
  patternValue: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
    flex: 1,
  },
});
