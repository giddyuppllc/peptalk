/**
 * Workout History — list of completed workouts with stats.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import type { WorkoutLog } from '../../src/types/fitness';

function LogItem({ log }: { log: WorkoutLog }) {
  const date = new Date(log.date);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const completedSets = log.sets.filter((s) => s.completed).length;

  return (
    <View style={styles.logRow}>
      <View style={styles.logDate}>
        <Text style={styles.logDay}>{dayName}</Text>
        <Text style={styles.logDateStr}>{dateStr}</Text>
      </View>
      <View style={styles.logInfo}>
        <Text style={styles.logTitle}>
          {log.dayId
            ? `Week ${log.weekNumber} · ${log.dayId}`
            : 'Freestyle Workout'}
        </Text>
        <View style={styles.logMeta}>
          <View style={styles.logMetaItem}>
            <Ionicons name="time-outline" size={12} color={Colors.pepTeal} />
            <Text style={styles.logMetaText}>{log.durationMinutes} min</Text>
          </View>
          <View style={styles.logMetaItem}>
            <Ionicons
              name="checkmark-circle-outline"
              size={12}
              color={Colors.pepTeal}
            />
            <Text style={styles.logMetaText}>{log.sets.length} sets</Text>
          </View>
          {log.rating && (
            <View style={styles.logMetaItem}>
              <Ionicons name="star" size={12} color="#FFBF82" />
              <Text style={styles.logMetaText}>{log.rating}/5</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function WorkoutHistoryScreen() {
  const router = useRouter();
  const { logs } = useWorkoutStore();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout History</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LogItem log={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="barbell-outline"
              size={40}
              color={Colors.darkTextSecondary}
            />
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyDesc}>
              Start a program to begin tracking your workouts.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  sep: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  logDate: {
    alignItems: 'center',
    width: 50,
  },
  logDay: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.pepTeal,
    textTransform: 'uppercase',
  },
  logDateStr: {
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    fontWeight: '700',
    marginTop: 2,
  },
  logInfo: { flex: 1 },
  logTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  logMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  logMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  logMetaText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
