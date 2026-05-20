/**
 * DaySummarySheet — bottom sheet showing all tracked data for a given day.
 *
 * Shows: meals, water, workouts, doses, check-in, journal notes.
 * Displayed when user taps a day on the calendar.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDaySummary } from '../hooks/useDaySummary';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { getPeptideById } from '../data/peptides';
import { Colors, FontSizes } from '../constants/theme';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { computeCyclePhase, PHASE_LABELS } from '../services/cycleService';
import { useBiometricsStore } from '../store/useBiometricsStore';

interface DaySummarySheetProps {
  visible: boolean;
  dateKey: string;
  onClose: () => void;
}

function formatDate(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function DaySummarySheet({ visible, dateKey, onClose }: DaySummarySheetProps) {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const summary = useDaySummary(dateKey);
  const healthProfile = useHealthProfileStore((s) => s.profile);
  // Select readings array and filter via useMemo. Inline .filter() in the
  // selector returned a fresh array every render → Zustand triggered an
  // infinite re-render loop here once a day with biometrics opened.
  const allReadings = useBiometricsStore((s) => s.readings);
  const biometrics = useMemo(
    () => allReadings.filter((r) => r.date === dateKey),
    [allReadings, dateKey],
  );

  const stepsReading = biometrics.find((r) => r.scope === 'steps');
  const hrvReading = biometrics.find((r) => r.scope === 'hrv');
  const rhrReading = biometrics.find((r) => r.scope === 'resting_heart_rate');
  const sleepReading = biometrics.find((r) => r.scope === 'sleep_minutes');
  const activeCalReading = biometrics.find((r) => r.scope === 'active_calories');
  const hasBiometrics = biometrics.length > 0;

  const navigateAndClose = (path: string) => {
    onClose();
    // Defer to let the close animation start before navigation thrashes
    // the modal stack on slow devices.
    setTimeout(() => router.push(path as any), 80);
  };

  const isToday = dateKey === new Date().toISOString().slice(0, 10);
  // Past dates can still be logged into (back-fill use case) but the
  // routes default to "today" so we pass the date as a query param when
  // we have one wired up.
  const dateParam = isToday ? '' : `?date=${dateKey}`;

  // Cycle phase — female users who opted in. Computed for THIS dateKey,
  // not just today, so historical days show the correct phase.
  const cycleForDate = React.useMemo(() => {
    if (healthProfile?.biologicalSex !== 'female') return null;
    if (!healthProfile?.cycle?.trackingEnabled) return null;
    if (!healthProfile.cycle.lastPeriodStartDate) return null;
    const dateObj = new Date(dateKey + 'T12:00:00');
    if (isNaN(dateObj.getTime())) return null;
    return computeCyclePhase(
      healthProfile.cycle.lastPeriodStartDate,
      healthProfile.cycle.typicalCycleLength,
      healthProfile.cycle.typicalPeriodLength,
      dateObj,
    );
  }, [dateKey, healthProfile?.biologicalSex, healthProfile?.cycle]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <View style={styles.overlay} accessibilityViewIsModal={true}>
        <View style={[styles.sheet, { backgroundColor: t.bg }]}>
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
            {/* Handle + header */}
            <View style={styles.handleWrap}>
              <View style={[styles.handle, { backgroundColor: t.textMuted }]} />
            </View>
            <View style={styles.header}>
              <View>
                <Text style={[styles.headerDate, { color: t.text }]}>{formatDate(dateKey)}</Text>
                {!summary.hasData && (
                  <Text style={[styles.headerEmpty, { color: t.textMuted }]}>Nothing logged</Text>
                )}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={t.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Quick-Add row ── always visible, lets user log new entries
                   for THIS date without leaving the calendar context. ── */}
              <View style={[styles.quickAddRow, { borderBottomColor: t.cardBorder }]}>
                <TouchableOpacity
                  onPress={() => navigateAndClose(`/nutrition${dateParam}`)}
                  style={[styles.quickAddBtn, { borderColor: t.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel="Log a meal"
                >
                  <Ionicons name="restaurant-outline" size={18} color="#6FA891" />
                  <Text style={[styles.quickAddText, { color: t.text }]}>Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigateAndClose(`/(tabs)/calendar${dateParam}`)}
                  style={[styles.quickAddBtn, { borderColor: t.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel="Log a dose"
                >
                  <Ionicons name="flask-outline" size={18} color="#3E7CB1" />
                  <Text style={[styles.quickAddText, { color: t.text }]}>Dose</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigateAndClose(`/(tabs)/workouts${dateParam}`)}
                  style={[styles.quickAddBtn, { borderColor: t.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel="Log a workout"
                >
                  <Ionicons name="barbell-outline" size={18} color="#D98C86" />
                  <Text style={[styles.quickAddText, { color: t.text }]}>Workout</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigateAndClose(`/(tabs)/check-in${dateParam}`)}
                  style={[styles.quickAddBtn, { borderColor: t.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel="Daily check-in"
                >
                  <Ionicons name="clipboard-outline" size={18} color="#E89672" />
                  <Text style={[styles.quickAddText, { color: t.text }]}>Check-in</Text>
                </TouchableOpacity>
              </View>

              {/* ── Biometrics (HealthKit / Health Connect / wearable readings) ── */}
              {hasBiometrics && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="pulse-outline" size={16} color="#3E7CB1" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Biometrics</Text>
                  </View>
                  <View style={styles.biometricsGrid}>
                    {stepsReading && (
                      <View style={[styles.bioCell, { backgroundColor: t.surface }]}>
                        <Text style={[styles.bioValue, { color: t.text }]}>
                          {Math.round(stepsReading.value).toLocaleString()}
                        </Text>
                        <Text style={[styles.bioLabel, { color: t.textSecondary }]}>steps</Text>
                      </View>
                    )}
                    {activeCalReading && (
                      <View style={[styles.bioCell, { backgroundColor: t.surface }]}>
                        <Text style={[styles.bioValue, { color: t.text }]}>
                          {Math.round(activeCalReading.value)}
                        </Text>
                        <Text style={[styles.bioLabel, { color: t.textSecondary }]}>active cal</Text>
                      </View>
                    )}
                    {sleepReading && (
                      <View style={[styles.bioCell, { backgroundColor: t.surface }]}>
                        <Text style={[styles.bioValue, { color: t.text }]}>
                          {Math.floor(sleepReading.value / 60)}h{Math.round(sleepReading.value % 60)}m
                        </Text>
                        <Text style={[styles.bioLabel, { color: t.textSecondary }]}>sleep</Text>
                      </View>
                    )}
                    {rhrReading && (
                      <View style={[styles.bioCell, { backgroundColor: t.surface }]}>
                        <Text style={[styles.bioValue, { color: t.text }]}>
                          {Math.round(rhrReading.value)}
                        </Text>
                        <Text style={[styles.bioLabel, { color: t.textSecondary }]}>resting HR</Text>
                      </View>
                    )}
                    {hrvReading && (
                      <View style={[styles.bioCell, { backgroundColor: t.surface }]}>
                        <Text style={[styles.bioValue, { color: t.text }]}>
                          {Math.round(hrvReading.value)}
                        </Text>
                        <Text style={[styles.bioLabel, { color: t.textSecondary }]}>HRV ms</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* ── Cycle phase (female users who opted in) ── */}
              {cycleForDate && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="flower-outline" size={16} color={t.primary} />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Cycle</Text>
                  </View>
                  <View style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                    <Text style={[styles.itemTitle, { color: t.text }]}>
                      {PHASE_LABELS[cycleForDate.phase]} phase
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textSecondary }]}>
                      Day {cycleForDate.dayOfCycle} of {cycleForDate.cycleLength}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── Nutrition ── */}
              {(summary.hasMeals || summary.waterOz > 0) && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="nutrition-outline" size={16} color="#6FA891" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Nutrition</Text>
                  </View>

                  {summary.hasMeals && (
                    <>
                      <View style={styles.macroRow}>
                        <View style={styles.macroItem}>
                          <Text style={[styles.macroValue, { color: t.text }]}>{summary.totalCalories}</Text>
                          <Text style={[styles.macroLabel, { color: t.textSecondary }]}>cal</Text>
                        </View>
                        <View style={styles.macroItem}>
                          <Text style={[styles.macroValue, { color: t.text }]}>{summary.totalProtein}g</Text>
                          <Text style={[styles.macroLabel, { color: t.textSecondary }]}>protein</Text>
                        </View>
                        <View style={styles.macroItem}>
                          <Text style={[styles.macroValue, { color: t.text }]}>{summary.totalCarbs}g</Text>
                          <Text style={[styles.macroLabel, { color: t.textSecondary }]}>carbs</Text>
                        </View>
                        <View style={styles.macroItem}>
                          <Text style={[styles.macroValue, { color: t.text }]}>{summary.totalFat}g</Text>
                          <Text style={[styles.macroLabel, { color: t.textSecondary }]}>fat</Text>
                        </View>
                      </View>
                      {summary.meals.map((meal) => (
                        <View key={meal.id} style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                          <Text style={[styles.itemTitle, { color: t.text }]}>
                            {meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}
                          </Text>
                          <Text style={[styles.itemSub, { color: t.textSecondary }]}>
                            {meal.foods.map((f) => f.name).join(', ')}
                          </Text>
                          <Text style={[styles.itemMeta, { color: t.textMuted }]}>
                            {meal.totalCalories} cal
                          </Text>
                        </View>
                      ))}
                    </>
                  )}

                  {summary.waterOz > 0 && (
                    <View style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                      <View style={styles.itemInline}>
                        <Ionicons name="water-outline" size={14} color="#6FA891" />
                        <Text style={[styles.itemTitle, { color: t.text }]}>Water</Text>
                      </View>
                      <Text style={[styles.itemMeta, { color: t.textMuted }]}>{summary.waterOz} oz</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── Workouts ── */}
              {summary.hasWorkout && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="barbell-outline" size={16} color="#D98C86" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Workouts</Text>
                  </View>
                  {summary.workouts.map((w) => (
                    <View key={w.id} style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                      <Text style={[styles.itemTitle, { color: t.text }]}>
                        {w.programName || 'Workout'}
                      </Text>
                      <Text style={[styles.itemSub, { color: t.textSecondary }]}>
                        {w.exerciseCount} exercises{w.duration ? ` · ${w.duration} min` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Doses ── */}
              {summary.hasDose && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="flask-outline" size={16} color="#C9A84A" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Peptide Doses</Text>
                  </View>
                  {summary.doses.map((d) => {
                    const peptide = getPeptideById(d.peptideId);
                    return (
                      <View key={d.id} style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                        <Text style={[styles.itemTitle, { color: t.text }]}>
                          {peptide?.name ?? d.peptideId}
                        </Text>
                        <Text style={[styles.itemSub, { color: t.textSecondary }]}>
                          {d.dose} {d.unit}{d.route ? ` · ${d.route}` : ''}{d.time ? ` · ${d.time}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Daily Log ── */}
              {summary.hasCheckIn && summary.checkIn && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="clipboard-outline" size={16} color="#E89672" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Daily Log</Text>
                  </View>
                  <View style={styles.checkInGrid}>
                    {summary.checkIn.mood != null && (
                      <View style={[styles.checkInItem, { backgroundColor: t.surface }]}>
                        <Text style={[styles.checkInValue, { color: t.text }]}>{summary.checkIn.mood}/5</Text>
                        <Text style={[styles.checkInLabel, { color: t.textSecondary }]}>Mood</Text>
                      </View>
                    )}
                    {summary.checkIn.energy != null && (
                      <View style={[styles.checkInItem, { backgroundColor: t.surface }]}>
                        <Text style={[styles.checkInValue, { color: t.text }]}>{summary.checkIn.energy}/5</Text>
                        <Text style={[styles.checkInLabel, { color: t.textSecondary }]}>Energy</Text>
                      </View>
                    )}
                    {summary.checkIn.sleep != null && (
                      <View style={[styles.checkInItem, { backgroundColor: t.surface }]}>
                        <Text style={[styles.checkInValue, { color: t.text }]}>{summary.checkIn.sleep}h</Text>
                        <Text style={[styles.checkInLabel, { color: t.textSecondary }]}>Sleep</Text>
                      </View>
                    )}
                    {summary.checkIn.weight != null && (
                      <View style={[styles.checkInItem, { backgroundColor: t.surface }]}>
                        <Text style={[styles.checkInValue, { color: t.text }]}>{summary.checkIn.weight}</Text>
                        <Text style={[styles.checkInLabel, { color: t.textSecondary }]}>Weight</Text>
                      </View>
                    )}
                  </View>
                  {summary.checkIn.notes && (
                    <Text style={[styles.journalText, { color: t.textSecondary }]}>
                      {summary.checkIn.notes}
                    </Text>
                  )}
                </View>
              )}

              {/* ── Journal Entries ── */}
              {summary.journalEntries.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="book-outline" size={16} color="#9B86A4" />
                    <Text style={[styles.sectionLabel, { color: t.text }]}>Journal</Text>
                  </View>
                  {summary.journalEntries.map((j) => (
                    <View key={j.id} style={[styles.itemRow, { borderBottomColor: t.cardBorder }]}>
                      <Text style={[styles.itemTitle, { color: t.text }]}>{j.title}</Text>
                      <Text style={[styles.itemSub, { color: t.textSecondary }]} numberOfLines={2}>
                        {j.content}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Empty state */}
              {!summary.hasData && (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={32} color={t.textMuted} />
                  <Text style={[styles.emptyText, { color: t.textMuted }]}>
                    No activity logged for this day
                  </Text>
                </View>
              )}

              <View style={{ height: 30 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerDate: {
    fontSize: 18,
    fontFamily: 'Playfair-Bold',
  },
  headerEmpty: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Quick-add row
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  quickAddBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickAddText: { fontSize: 11, fontFamily: 'DMSans-SemiBold' },

  // Biometrics grid
  biometricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bioCell: {
    minWidth: 80,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  bioValue: { fontSize: 16, fontFamily: 'DMSans-Bold' },
  bioLabel: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 2 },

  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  macroLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  itemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  itemInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  itemSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 4,
  },
  checkInGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  checkInItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  checkInValue: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  checkInLabel: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  journalText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
});
