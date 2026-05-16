import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useJournalStore } from '../../src/store/useJournalStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useMealStore } from '../../src/store/useMealStore';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { DaySummarySheet } from '../../src/components/DaySummarySheet';
import { WeeklySummaryCard } from '../../src/components/WeeklySummaryCard';
import { DoseHeatmap } from '../../src/components/DoseHeatmap';
import { DOSE_LOG_GATE_DISCLAIMER } from '../../src/constants/legal';
import { checkDoseSafety } from '../../src/services/doseSafety';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { computeCyclePhase } from '../../src/services/cycleService';
import { PROTOCOL_TEMPLATES } from '../../src/data/protocols';
import {
  DoseLogEntry,
  DoseUnit,
  AdministrationRoute,
  ActiveProtocol,
  HealthAlert,
  JournalCategory,
} from '../../src/types';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
  Gradients,
} from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';

// ---------------------------------------------------------------------------
// Dosing tips — contextual timing/protocol reminders after logging
// ---------------------------------------------------------------------------

const DOSING_TIPS: Record<string, string> = {
  'bpc-157': 'BPC-157 works best on an empty stomach. Allow 20-30 min before eating.',
  'bpc 157': 'BPC-157 works best on an empty stomach. Allow 20-30 min before eating.',
  'tb-500': 'TB-500 can be taken any time. Many users dose before bed to support overnight repair.',
  'tb500': 'TB-500 can be taken any time. Many users dose before bed to support overnight repair.',
  'ipamorelin': 'GH peptides like Ipamorelin work best fasted. Avoid eating 30 min before and after.',
  'cjc-1295': 'CJC-1295 + Ipamorelin combo is best taken before bed, fasted, to maximize GH pulse.',
  'cjc 1295': 'CJC-1295 + Ipamorelin combo is best taken before bed, fasted, to maximize GH pulse.',
  'sermorelin': 'Sermorelin is best dosed before bed on an empty stomach for peak GH release.',
  'mk-677': 'MK-677 can cause hunger — many take it before bed. Stay hydrated throughout the day.',
  'mk677': 'MK-677 can cause hunger — many take it before bed. Stay hydrated throughout the day.',
  'semaglutide': 'Semaglutide is typically dosed once weekly. Note any GI side effects in your check-in.',
  'tirzepatide': 'Tirzepatide is dosed once weekly. Start low and titrate. Log side effects carefully.',
  'pt-141': 'PT-141 takes 2-4 hours to take effect. Plan accordingly and note response.',
  'pt141': 'PT-141 takes 2-4 hours to take effect. Plan accordingly and note response.',
  'ghk-cu': 'GHK-Cu is great for skin/hair. Track visual changes in your journal over weeks.',
  'thymosin alpha': 'Thymosin Alpha-1 boosts immune function. Best taken subcutaneously.',
  'mots-c': 'MOTS-c supports metabolic function. Track energy and workout performance.',
  'ss-31': 'SS-31 supports mitochondrial health. Note energy levels in check-ins.',
  'nad+': 'NAD+ is best administered in a fasted state for optimal absorption.',
  'epithalon': 'Epithalon is typically run in 10-20 day cycles. Track sleep quality changes.',
};

function getDosingTip(substanceName: string): string | null {
  const lower = substanceName.toLowerCase().trim();
  // Direct match
  if (DOSING_TIPS[lower]) return DOSING_TIPS[lower];
  // Partial match
  for (const [key, tip] of Object.entries(DOSING_TIPS)) {
    if (lower.includes(key) || key.includes(lower)) return tip;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getMonthDays = (year: number, month: number): Date[] => {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad start to align with day of week
  const startPad = firstDay.getDay();
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Pad end to fill last row
  const endPad = 7 - (days.length % 7);
  if (endPad < 7) {
    for (let i = 1; i <= endPad; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }

  return days;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROUTES: AdministrationRoute[] = [
  'subcutaneous', 'intramuscular', 'oral', 'nasal', 'topical', 'sublingual',
];

const UNITS: DoseUnit[] = ['mcg', 'mg', 'IU', 'ml'];

const JOURNAL_CATEGORY_COLORS: Record<JournalCategory, string> = {
  protocol_notes: '#E89672',
  side_effects: '#ef4444',
  mood: '#10b981',
  progress: '#A4D9D1',
  research: '#06b6d4',
  questions: '#F4ECC2',
  goals: '#ec4899',
  general: '#6b7280',
};

const JOURNAL_CATEGORY_LABELS: Record<JournalCategory, string> = {
  protocol_notes: 'Protocol Notes',
  side_effects: 'Side Effects',
  mood: 'Mood',
  progress: 'Progress',
  research: 'Research',
  questions: 'Questions',
  goals: 'Goals',
  general: 'General',
};

const ratingLabel = (v: number): string => {
  switch (v) {
    case 1: return 'Very Low';
    case 2: return 'Low';
    case 3: return 'Moderate';
    case 4: return 'Good';
    case 5: return 'Excellent';
    default: return `${v}/5`;
  }
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_CELL_SIZE = (SCREEN_WIDTH - Spacing.md * 4) / 7;

// ---------------------------------------------------------------------------
// Animated Day Detail Panel
// ---------------------------------------------------------------------------
function DayDetailPanel({ children, selectedDate }: { children: React.ReactNode; selectedDate: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const prevDate = useRef(selectedDate);

  useEffect(() => {
    if (prevDate.current !== selectedDate) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      prevDate.current = selectedDate;
    } else {
      anim.setValue(1);
    }
  }, [selectedDate]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Today Glow Cell
// ---------------------------------------------------------------------------
function TodayGlow() {
  const glow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Stop the animation on unmount — earlier this leaked an
    // infinite loop on every remount of the Calendar tab. Mirrors
    // the cleanup pattern in app/(tabs)/index.tsx and
    // src/components/LiveEventBanner.tsx.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: BorderRadius.md,
          backgroundColor: 'rgba(227, 167, 161, 0.15)',
          opacity: glow,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ openLog?: string }>();
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(toDateKey(now));
  const [daySummaryOpen, setDaySummaryOpen] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  // Auto-open the dose log modal when arriving with ?openLog=1 (from Home FAB)
  const openLogHandled = useRef(false);
  useEffect(() => {
    if (params.openLog === '1' && !openLogHandled.current) {
      openLogHandled.current = true;
      setShowLogModal(true);
    }
  }, [params.openLog]);

  // Log form state -- free-text substance name for plausible deniability
  const [logSubstanceName, setLogSubstanceName] = useState('');
  const [logAmount, setLogAmount] = useState('');
  const [logUnit, setLogUnit] = useState<DoseUnit>('mcg');
  const [logRoute, setLogRoute] = useState<AdministrationRoute>('subcutaneous');
  const [logSite, setLogSite] = useState('');
  const [logNotes, setLogNotes] = useState('');

  const {
    doses,
    protocols,
    alerts,
    logDose,
    deleteDose,
    dismissAlert,
    getDosesByDate,
    getActiveProtocols,
    getDatesWithDoses,
    hasAcceptedDoseDisclaimer,
    acceptDoseDisclaimer,
  } = useDoseLogStore();

  const checkins = useCheckinStore((s) => s.entries);
  const journalEntries = useJournalStore((s) => s.entries);
  const getJournalByDate = useJournalStore((s) => s.getEntriesByDate);
  const workoutLogs = useWorkoutStore((s) => s.logs);
  const getWorkoutLogsByDate = useWorkoutStore((s) => s.getLogsByDate);
  const meals = useMealStore((s) => s.meals);
  const getMealsByDate = useMealStore((s) => s.getMealsByDate);

  const datesWithDoses = useMemo(() => getDatesWithDoses(), [doses]);
  const checkinDates = useMemo(
    () => new Set((checkins ?? []).map((c) => c.date)),
    [checkins]
  );
  const journalDates = useMemo(
    () => new Set(journalEntries.map((j) => j.date)),
    [journalEntries]
  );
  const workoutDates = useMemo(
    () => new Set(workoutLogs.map((l) => l.date)),
    [workoutLogs]
  );
  const mealDates = useMemo(
    () => new Set(meals.map((m) => m.date)),
    [meals]
  );

  const selectedDayDoses = useMemo(
    () => getDosesByDate(selectedDate),
    [selectedDate, doses]
  );

  const selectedDayCheckin = useMemo(
    () => checkins.find((c) => c.date === selectedDate) ?? null,
    [selectedDate, checkins]
  );

  const selectedDayJournal = useMemo(
    () => getJournalByDate(selectedDate),
    [selectedDate, journalEntries]
  );

  const selectedDayWorkouts = useMemo(
    () => getWorkoutLogsByDate(selectedDate),
    [selectedDate, workoutLogs]
  );

  const selectedDayMeals = useMemo(
    () => getMealsByDate(selectedDate),
    [selectedDate, meals]
  );

  const activeProtocols = useMemo(() => getActiveProtocols(), [protocols]);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => !a.dismissed),
    [alerts]
  );

  const monthDays = useMemo(
    () => getMonthDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  // ── Cycle prediction overlay ──
  // For female users with cycle tracking enabled, compute the phase per
  // visible day so the calendar grid can tint period / fertile / ovulation
  // cells. Computed once per (lastPeriodStartDate, monthDays) — phase math
  // is cheap but no point doing it 42 times if we can map it once.
  const healthProfile = useHealthProfileStore((s) => s.profile);
  const cycleEnabled =
    healthProfile?.biologicalSex === 'female' &&
    healthProfile?.cycle?.trackingEnabled === true &&
    !!healthProfile?.cycle?.lastPeriodStartDate;

  const cyclePhaseByDate = useMemo(() => {
    if (!cycleEnabled) return new Map<string, 'menstrual' | 'follicular' | 'ovulatory' | 'luteal'>();
    const map = new Map<string, 'menstrual' | 'follicular' | 'ovulatory' | 'luteal'>();
    for (const d of monthDays) {
      const key = toDateKey(d);
      const info = computeCyclePhase(
        healthProfile.cycle?.lastPeriodStartDate,
        healthProfile.cycle?.typicalCycleLength,
        healthProfile.cycle?.typicalPeriodLength,
        d,
      );
      if (info) map.set(key, info.phase);
    }
    return map;
  }, [
    cycleEnabled,
    monthDays,
    healthProfile?.cycle?.lastPeriodStartDate,
    healthProfile?.cycle?.typicalCycleLength,
    healthProfile?.cycle?.typicalPeriodLength,
  ]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleLogEntry = () => {
    if (!logSubstanceName.trim() || !logAmount) {
      Alert.alert('Missing Info', 'Enter a substance name and amount.');
      return;
    }

    const amount = parseFloat(logAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    // Magnitude sanity check — peptide doses don't legitimately
    // exceed ~50,000 (in any unit). A 9,999,999 entry is a
    // copy-paste fat-finger or unit slip. Refuse so the dose log
    // doesn't store implausible values that poison the detect-alerts
    // engine + Aimee context. P0 from input validation audit.
    if (
      (logUnit === 'mcg' && amount > 100000) ||
      (logUnit === 'mg' && amount > 100) ||
      (logUnit === 'IU' && amount > 10000)
    ) {
      Alert.alert(
        'Dose too large',
        `${amount} ${logUnit} is outside the plausible range for any peptide. Did you mean a different unit? Re-enter to confirm.`,
      );
      return;
    }

    // Substance name length cap so a paste-bomb doesn't bloat the row.
    const trimmedName = logSubstanceName.trim().slice(0, 80);

    const safety = checkDoseSafety(trimmedName, amount, logUnit);

    // Pregnancy contraindication check — lookup the peptide's protocol and
    // if its `contraindications` mentions pregnancy/nursing and the user
    // has flagged themselves as such in their health profile, warn.
    const isPregnantOrNursing =
      useHealthProfileStore.getState().profile?.medical?.pregnantOrNursing === true;
    const substanceLower = logSubstanceName.trim().toLowerCase();
    const matchedProtocols = PROTOCOL_TEMPLATES.filter(
      (p) =>
        p.peptideId.toLowerCase() === substanceLower ||
        p.name.toLowerCase().includes(substanceLower) ||
        substanceLower.includes(p.peptideId.toLowerCase()),
    );
    const pregnancyContra =
      isPregnantOrNursing &&
      matchedProtocols.some((p) =>
        (p.contraindications ?? []).some((c) => /pregnan|nursing|breastfeed/i.test(c)),
      );

    const persist = () => {
      logDose({
        peptideId: trimmedName,
        amount,
        unit: logUnit,
        route: logRoute,
        date: selectedDate,
        injectionSite: logSite ? logSite.slice(0, 60) : undefined,
        notes: logNotes ? logNotes.slice(0, 500) : undefined,
      });
    };

    const continueAfterLog = () => {
      // Protocol-specific timing tip after logging
      const name = logSubstanceName.trim().toLowerCase();
      const timingTip = getDosingTip(name);

      // Reset form
      setLogSubstanceName('');
      setLogAmount('');
      setLogSite('');
      setLogNotes('');
      setShowLogModal(false);

      // Build alert buttons based on today's activity
      const todayStr = toDateKey(new Date());
      const hasCheckinToday = checkins.some((c) => c.date === todayStr);

      if (timingTip) {
        const buttons: { text: string; onPress?: () => void }[] = [
          { text: 'Got It' },
        ];
        if (!hasCheckinToday) {
          buttons.push({
            text: 'Check In',
            onPress: () => router.push('/(tabs)/check-in'),
          });
        }
        buttons.push({
          text: 'Ask Aimee',
          onPress: () => router.push('/(tabs)/peptalk'),
        });
        Alert.alert('Dose Logged', timingTip, buttons);
      } else {
        const buttons: { text: string; onPress?: () => void }[] = [
          { text: 'OK' },
        ];
        if (!hasCheckinToday) {
          buttons.push({
            text: 'Check In',
            onPress: () => router.push('/(tabs)/check-in'),
          });
        }
        buttons.push({
          text: 'Ask Aimee',
          onPress: () => router.push('/(tabs)/peptalk'),
        });
        Alert.alert(
          'Dose Logged',
          'Entry saved. Track how you feel with a check-in.',
          buttons,
        );
      }
    };

    if (pregnancyContra) {
      Alert.alert(
        'Not recommended during pregnancy / nursing',
        `Your profile indicates you're pregnant or nursing, and this substance is contraindicated in that scenario per research protocols. Please consult a licensed provider before continuing.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log anyway',
            style: 'destructive',
            onPress: () => {
              if (!safety.safe) {
                // Chain to the dose-safety confirm next
                Alert.alert(
                  'Double-check this dose',
                  safety.message ?? 'This dose looks unusual.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Log anyway',
                      style: 'destructive',
                      onPress: () => {
                        persist();
                        continueAfterLog();
                      },
                    },
                  ],
                );
                return;
              }
              persist();
              continueAfterLog();
            },
          },
        ],
      );
      return;
    }

    if (!safety.safe) {
      Alert.alert(
        'Double-check this dose',
        safety.message ?? 'This dose looks unusual.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log anyway',
            style: 'destructive',
            onPress: () => {
              persist();
              continueAfterLog();
            },
          },
        ],
      );
      return;
    }

    persist();
    continueAfterLog();
  };

  const alertLevelColor = (level: HealthAlert['level']) => {
    switch (level) {
      case 'info': return Colors.powder;
      case 'caution': return Colors.warning;
      case 'warning': return Colors.rose;
      case 'urgent': return Colors.error;
    }
  };

  const hasAnyEvents =
    selectedDayDoses.length > 0 ||
    selectedDayCheckin !== null ||
    selectedDayJournal.length > 0 ||
    selectedDayWorkouts.length > 0 ||
    selectedDayMeals.length > 0;

  // -- Dose Disclaimer Gate
  if (!hasAcceptedDoseDisclaimer) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.disclaimerGate}>
          <Ionicons name="journal-outline" size={48} color={Colors.pepBlue} />
          <Text style={[styles.disclaimerGateTitle, { color: t.text }]}>Wellness Journal</Text>
          <Text style={[styles.disclaimerGateSubtitle, { color: t.textSecondary }]}>
            Before you begin, please read and acknowledge the following:
          </Text>
          <GlassCard variant="glow" glowColor={Colors.pepBlue}>
            <Text style={[styles.disclaimerGateText, { color: t.textSecondary }]}>
              {DOSE_LOG_GATE_DISCLAIMER}
            </Text>
          </GlassCard>
          <GradientButton
            label="I Understand & Accept"
            onPress={acceptDoseDisclaimer}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.headerTitle, { color: t.text }]}>My Calendar</Text>
              <Text style={[styles.headerSub, { color: t.textSecondary }]}>Wellness journal & personal tracking</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerAddBtn, { backgroundColor: t.primary }]}
              onPress={() => setShowAddSheet(true)}
              accessibilityRole="button"
              accessibilityLabel="Add to calendar"
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* This-week summary — meals + workouts + doses + check-ins + biometrics */}
        <View style={styles.weeklyWrap}>
          <WeeklySummaryCard />
        </View>

        {/* Dose consistency — 90-day heatmap. Hides itself for users
            with no doses + no active protocols. */}
        <View style={styles.weeklyWrap}>
          <DoseHeatmap />
        </View>

        {/* Health Alerts */}
        {activeAlerts.length > 0 && (
          <View style={styles.alertSection}>
            {activeAlerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  styles.alertCard,
                  { borderLeftColor: alertLevelColor(alert.level), backgroundColor: t.card },
                ]}
              >
                <View style={styles.alertHeader}>
                  <Text style={[styles.alertTitle, { color: t.text }]}>{alert.title}</Text>
                  <TouchableOpacity onPress={() => dismissAlert(alert.id)}>
                    <Ionicons name="close" size={18} color={t.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.alertMessage, { color: t.textSecondary }]}>{alert.message}</Text>
                <Text style={styles.alertAction}>{alert.actionLabel}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Calendar Grid */}
        <GlassCard variant="elevated" style={styles.calendarCard}>
          {/* Month Navigation */}
          <View style={styles.calendarNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Previous month">
              <LinearGradient
                colors={t.isDark ? ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)'] : ['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.03)']}
                style={[styles.navBtnGradient, { borderColor: t.glassBorder }]}
              >
                <Ionicons name="chevron-back" size={18} color={t.text} />
              </LinearGradient>
            </TouchableOpacity>
            <View style={styles.monthYearWrap}>
              <Text style={[styles.calendarMonth, { color: t.text }]}>{MONTHS[viewMonth]}</Text>
              <Text style={[styles.calendarYear, { color: t.textSecondary }]}>{viewYear}</Text>
            </View>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Next month">
              <LinearGradient
                colors={t.isDark ? ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)'] : ['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.03)']}
                style={[styles.navBtnGradient, { borderColor: t.glassBorder }]}
              >
                <Ionicons name="chevron-forward" size={18} color={t.text} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Day of week headers */}
          <View style={styles.dowRow}>
            {DOW.map((d) => (
              <Text key={d} style={styles.dowText}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.daysGrid}>
            {monthDays.map((date, idx) => {
              const key = toDateKey(date);
              const isCurrentMonth = date.getMonth() === viewMonth;
              const isToday = key === toDateKey(now);
              const isSelected = key === selectedDate;
              const hasDose = datesWithDoses.has(key);
              const hasCheckin = checkinDates.has(key);
              const hasJournal = journalDates.has(key);
              const hasWorkout = workoutDates.has(key);
              const hasMeal = mealDates.has(key);
              const cyclePhase = cyclePhaseByDate.get(key);
              // Light-blue palette for cycle phase tints. Period = strongest,
              // ovulation = mid, fertile-window-adjacent = soft. Other days
              // get nothing so the grid doesn't look noisy.
              const phaseTint =
                cyclePhase === 'menstrual'  ? 'rgba(217, 140, 134, 0.18)' :  // soft rose for period
                cyclePhase === 'ovulatory'  ? 'rgba(127, 179, 216, 0.22)' :  // light blue for ovulation
                cyclePhase === 'follicular' ? 'rgba(127, 179, 216, 0.10)' :  // very light blue for fertile-side follicular
                undefined;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    phaseTint && isCurrentMonth ? { backgroundColor: phaseTint, borderRadius: 10 } : null,
                  ]}
                  onPress={() => setSelectedDate(key)}
                  onLongPress={() => { setSelectedDate(key); setDaySummaryOpen(true); }}
                  activeOpacity={0.7}
                >
                  {/* Today pulsing glow */}
                  {isToday && !isSelected && <TodayGlow />}

                  {/* Selected gradient ring */}
                  {isSelected && (
                    <LinearGradient
                      colors={[Colors.rose, '#c98a84']}
                      style={styles.selectedRing}
                    >
                      <View style={[styles.selectedInner, { backgroundColor: t.bg }]}>
                        <Text style={styles.dayTextSelected}>
                          {date.getDate()}
                        </Text>
                      </View>
                    </LinearGradient>
                  )}

                  {/* Today (not selected) ring */}
                  {isToday && !isSelected && (
                    <View style={styles.todayRing}>
                      <Text style={styles.dayTextToday}>
                        {date.getDate()}
                      </Text>
                    </View>
                  )}

                  {/* Normal day text */}
                  {!isSelected && !isToday && (
                    <Text
                      style={[
                        styles.dayText,
                        { color: t.text },
                        !isCurrentMonth && [styles.dayTextMuted, { color: t.textSecondary }],
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  )}

                  {/* Dot indicators */}
                  <View style={styles.dotRow}>
                    {hasDose && <View style={[styles.dot, styles.dotDose]} />}
                    {hasCheckin && <View style={[styles.dot, styles.dotCheckin]} />}
                    {hasJournal && <View style={[styles.dot, styles.dotJournal]} />}
                    {hasWorkout && <View style={[styles.dot, styles.dotWorkout]} />}
                    {hasMeal && <View style={[styles.dot, styles.dotMeal]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={[styles.legend, { borderTopColor: t.glassBorder }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotDose]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Doses</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotCheckin]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Check-in</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotJournal]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Journal</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotWorkout]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Workout</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotMeal]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Meal</Text>
            </View>
          </View>

          {/* Cycle-phase legend — only when tracking is on */}
          {cycleEnabled && (
            <View style={[styles.legend, { borderTopColor: t.glassBorder, marginTop: 8, paddingTop: 8 }]}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: 'rgba(217, 140, 134, 0.55)' }]} />
                <Text style={[styles.legendText, { color: t.textSecondary }]}>Period</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: 'rgba(127, 179, 216, 0.7)' }]} />
                <Text style={[styles.legendText, { color: t.textSecondary }]}>Ovulation</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: 'rgba(127, 179, 216, 0.35)' }]} />
                <Text style={[styles.legendText, { color: t.textSecondary }]}>Follicular</Text>
              </View>
            </View>
          )}
        </GlassCard>

        {/* Selected Day Detail -- Unified Timeline */}
        <DayDetailPanel selectedDate={selectedDate}>
          <View style={styles.dayDetail}>
            <View style={styles.dayDetailHeader}>
              <Text style={[styles.dayDetailTitle, { color: t.text }]}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {hasAnyEvents && (
                  <View style={styles.eventCountBadge}>
                    <Text style={styles.eventCountText}>
                      {selectedDayDoses.length +
                        (selectedDayCheckin ? 1 : 0) +
                        selectedDayJournal.length +
                        selectedDayWorkouts.length +
                        selectedDayMeals.length}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setDaySummaryOpen(true)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: t.primary }}
                  accessibilityRole="button"
                  accessibilityLabel="Full day summary"
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.primary }}>Full view</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Empty state */}
            {!hasAnyEvents && (
              <GlassCard style={styles.emptyStateCard}>
                <View style={styles.emptyStateInner}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: t.glass }]}>
                    <Ionicons name="calendar-outline" size={36} color={t.textSecondary} />
                  </View>
                  <Text style={[styles.emptyStateTitle, { color: t.text }]}>No events yet</Text>
                  <Text style={[styles.emptyStateText, { color: t.textSecondary }]}>
                    Tap a quick-add button below to log your first entry for this day.
                  </Text>
                </View>
              </GlassCard>
            )}

            {/* -- Check-in Summary */}
            {selectedDayCheckin && (
              <GlassCard variant="glow" glowColor={Colors.powder} style={styles.eventCard}>
                <View style={styles.eventCardHeader}>
                  <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(199, 215, 230, 0.15)' }]}>
                    <Ionicons name="heart-circle" size={20} color={Colors.powder} />
                  </View>
                  <View style={styles.eventCardHeaderText}>
                    <Text style={[styles.eventCardTitle, { color: t.text }]}>Check-in</Text>
                    <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>Daily wellness check</Text>
                  </View>
                </View>
                <View style={styles.checkinBadgeRow}>
                  <LinearGradient
                    colors={['rgba(199, 215, 230, 0.15)', 'rgba(199, 215, 230, 0.05)']}
                    style={styles.checkinBadge}
                  >
                    <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Mood</Text>
                    <Text style={[styles.checkinBadgeValue, { color: t.tint }]}>{ratingLabel(selectedDayCheckin.mood)}</Text>
                  </LinearGradient>
                  <LinearGradient
                    colors={['rgba(199, 215, 230, 0.15)', 'rgba(199, 215, 230, 0.05)']}
                    style={styles.checkinBadge}
                  >
                    <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Energy</Text>
                    <Text style={[styles.checkinBadgeValue, { color: t.tint }]}>{ratingLabel(selectedDayCheckin.energy)}</Text>
                  </LinearGradient>
                  <LinearGradient
                    colors={['rgba(199, 215, 230, 0.15)', 'rgba(199, 215, 230, 0.05)']}
                    style={styles.checkinBadge}
                  >
                    <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Sleep</Text>
                    <Text style={[styles.checkinBadgeValue, { color: t.tint }]}>{ratingLabel(selectedDayCheckin.sleepQuality)}</Text>
                  </LinearGradient>
                </View>
                {selectedDayCheckin.emotionTags && selectedDayCheckin.emotionTags.length > 0 && (
                  <View style={styles.emotionTagRow}>
                    {selectedDayCheckin.emotionTags.map((tag) => (
                      <View key={tag} style={styles.emotionTag}>
                        <Text style={[styles.emotionTagText, { color: t.tint }]}>
                          {tag.replace('_', ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {/* Health metrics from check-in or watch */}
                {(selectedDayCheckin.weightLbs || selectedDayCheckin.restingHeartRate || selectedDayCheckin.steps || selectedDayCheckin.hrvMs) && (
                  <View style={styles.checkinBadgeRow}>
                    {selectedDayCheckin.weightLbs ? (
                      <LinearGradient colors={['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.05)']} style={styles.checkinBadge}>
                        <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Weight</Text>
                        <Text style={[styles.checkinBadgeValue, { color: '#F4ECC2' }]}>{selectedDayCheckin.weightLbs} lbs</Text>
                      </LinearGradient>
                    ) : null}
                    {selectedDayCheckin.restingHeartRate ? (
                      <LinearGradient colors={['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)']} style={styles.checkinBadge}>
                        <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>HR</Text>
                        <Text style={[styles.checkinBadgeValue, { color: '#ef4444' }]}>{selectedDayCheckin.restingHeartRate} bpm</Text>
                      </LinearGradient>
                    ) : null}
                    {selectedDayCheckin.steps ? (
                      <LinearGradient colors={['rgba(34,197,94,0.15)', 'rgba(34,197,94,0.05)']} style={styles.checkinBadge}>
                        <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Steps</Text>
                        <Text style={[styles.checkinBadgeValue, { color: '#22c55e' }]}>{selectedDayCheckin.steps.toLocaleString()}</Text>
                      </LinearGradient>
                    ) : null}
                    {selectedDayCheckin.hrvMs ? (
                      <LinearGradient colors={['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.05)']} style={styles.checkinBadge}>
                        <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>HRV</Text>
                        <Text style={[styles.checkinBadgeValue, { color: '#A4D9D1' }]}>{Math.round(selectedDayCheckin.hrvMs)} ms</Text>
                      </LinearGradient>
                    ) : null}
                  </View>
                )}
                {/* Sleep data */}
                {selectedDayCheckin.sleepStages && (
                  <View style={styles.checkinBadgeRow}>
                    <LinearGradient colors={['rgba(99,102,241,0.15)', 'rgba(99,102,241,0.05)']} style={styles.checkinBadge}>
                      <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Sleep</Text>
                      <Text style={[styles.checkinBadgeValue, { color: '#6366f1' }]}>{selectedDayCheckin.sleepStages.total}h</Text>
                    </LinearGradient>
                    <LinearGradient colors={['rgba(30,64,175,0.15)', 'rgba(30,64,175,0.05)']} style={styles.checkinBadge}>
                      <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Deep</Text>
                      <Text style={[styles.checkinBadgeValue, { color: '#1e40af' }]}>{selectedDayCheckin.sleepStages.deep}h</Text>
                    </LinearGradient>
                    <LinearGradient colors={['rgba(124,58,237,0.15)', 'rgba(124,58,237,0.05)']} style={styles.checkinBadge}>
                      <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>REM</Text>
                      <Text style={[styles.checkinBadgeValue, { color: '#B8913D' }]}>{selectedDayCheckin.sleepStages.rem}h</Text>
                    </LinearGradient>
                    {selectedDayCheckin.sleepStages.qualityScore != null && (
                      <LinearGradient colors={['rgba(6,182,212,0.15)', 'rgba(6,182,212,0.05)']} style={styles.checkinBadge}>
                        <Text style={[styles.checkinBadgeLabel, { color: t.textSecondary }]}>Quality</Text>
                        <Text style={[styles.checkinBadgeValue, { color: Colors.pepTeal }]}>{selectedDayCheckin.sleepStages.qualityScore}%</Text>
                      </LinearGradient>
                    )}
                  </View>
                )}
                {selectedDayCheckin.overallFeeling ? (
                  <Text style={[styles.checkinFeeling, { color: t.textSecondary }]}>
                    "{selectedDayCheckin.overallFeeling}"
                  </Text>
                ) : null}
              </GlassCard>
            )}

            {/* -- Workout Logs */}
            {selectedDayWorkouts.length > 0 && (
              <View style={styles.timelineSection}>
                {selectedDayWorkouts.map((wlog) => {
                  const completedSets = wlog.sets.filter((s) => s.completed).length;
                  return (
                    <TouchableOpacity
                      key={wlog.id}
                      activeOpacity={0.8}
                      onPress={() => router.push('/workouts/history')}
                    >
                      <GlassCard variant="glow" glowColor={Colors.pepTeal} style={styles.eventCard}>
                        <View style={styles.eventCardHeader}>
                          <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                            <Ionicons name="barbell" size={20} color={Colors.pepTeal} />
                          </View>
                          <View style={styles.eventCardHeaderText}>
                            <Text style={[styles.eventCardTitle, { color: t.text }]}>
                              {wlog.dayId
                                ? `Week ${wlog.weekNumber} · ${wlog.dayId}`
                                : 'Freestyle Workout'}
                            </Text>
                            <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>Workout</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
                        </View>
                        <View style={styles.workoutMetaRow}>
                          <View style={styles.workoutMetaItem}>
                            <Ionicons name="time-outline" size={14} color={Colors.pepTeal} />
                            <Text style={[styles.workoutMetaText, { color: t.textSecondary }]}>{wlog.durationMinutes} min</Text>
                          </View>
                          <View style={styles.workoutMetaItem}>
                            <Ionicons name="checkmark-circle-outline" size={14} color={Colors.pepTeal} />
                            <Text style={[styles.workoutMetaText, { color: t.textSecondary }]}>{completedSets} sets</Text>
                          </View>
                          {wlog.rating && (
                            <View style={styles.workoutMetaItem}>
                              <Ionicons name="star" size={14} color="#F4ECC2" />
                              <Text style={[styles.workoutMetaText, { color: t.textSecondary }]}>{wlog.rating}/5</Text>
                            </View>
                          )}
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* -- Meal Logs */}
            {selectedDayMeals.length > 0 && (
              <View style={styles.timelineSection}>
                {selectedDayMeals.map((meal) => {
                  const totalCal =
                    meal.foods.reduce((sum, f) => sum + f.calories, 0) +
                    (meal.quickLog?.calories ?? 0);
                  return (
                    <TouchableOpacity
                      key={meal.id}
                      activeOpacity={0.8}
                      onPress={() => router.push('/nutrition')}
                    >
                      <GlassCard variant="glow" glowColor="#F4ECC2" style={styles.eventCard}>
                        <View style={styles.eventCardHeader}>
                          <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                            <Ionicons name="nutrition" size={20} color="#F4ECC2" />
                          </View>
                          <View style={styles.eventCardHeaderText}>
                            <Text style={[styles.eventCardTitle, { color: t.text }]}>
                              {meal.mealType.charAt(0).toUpperCase() +
                                meal.mealType.slice(1)}
                            </Text>
                            <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>
                              {totalCal} cal
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* -- Supplement Entries */}
            {selectedDayDoses.length > 0 && (
              <View style={styles.timelineSection}>
                {selectedDayDoses.map((dose) => {
                  return (
                    <GlassCard key={dose.id} variant="glow" glowColor={Colors.rose} style={styles.eventCard}>
                      <View style={styles.eventCardHeader}>
                        <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(227, 167, 161, 0.15)' }]}>
                          <Ionicons name="flask" size={20} color={Colors.rose} />
                        </View>
                        <View style={styles.eventCardHeaderText}>
                          <Text style={[styles.eventCardTitle, { color: t.text }]}>
                            {dose.peptideId}
                          </Text>
                          <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>{dose.time}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            Alert.alert('Delete Entry', 'Remove this journal entry?', [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: () => deleteDose(dose.id),
                              },
                            ])
                          }
                          style={styles.deleteBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Delete dose entry"
                        >
                          <Ionicons name="trash-outline" size={16} color={t.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.doseInfo, { color: t.textSecondary }]}>
                        {dose.amount} {dose.unit} · {dose.route}
                        {dose.injectionSite ? ` · ${dose.injectionSite}` : ''}
                      </Text>
                      {dose.notes && (
                        <Text style={[styles.doseNotes]}>{dose.notes}</Text>
                      )}
                    </GlassCard>
                  );
                })}
              </View>
            )}

            {/* -- Journal Entries */}
            {selectedDayJournal.length > 0 && (
              <View style={styles.timelineSection}>
                {selectedDayJournal.map((entry) => (
                  <GlassCard key={entry.id} variant="glow" glowColor="#A4D9D1" style={styles.eventCard}>
                    <View style={styles.eventCardHeader}>
                      <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                        <Ionicons name="journal" size={20} color="#A4D9D1" />
                      </View>
                      <View style={styles.eventCardHeaderText}>
                        <Text style={[styles.eventCardTitle, { color: t.text }]}>{entry.title}</Text>
                        <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>{entry.time}</Text>
                      </View>
                    </View>
                    <View style={styles.journalCardHeader}>
                      <View
                        style={[
                          styles.journalCategoryBadge,
                          { backgroundColor: `${JOURNAL_CATEGORY_COLORS[entry.category]}20` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.journalCategoryText,
                            { color: JOURNAL_CATEGORY_COLORS[entry.category] },
                          ]}
                        >
                          {JOURNAL_CATEGORY_LABELS[entry.category]}
                        </Text>
                      </View>
                    </View>
                    {entry.content.length > 0 && (
                      <Text style={[styles.journalPreview, { color: t.textSecondary }]} numberOfLines={2}>
                        {entry.content}
                      </Text>
                    )}
                    {entry.tags.length > 0 && (
                      <View style={styles.journalTagRow}>
                        {entry.tags.slice(0, 4).map((tag) => (
                          <View key={tag} style={styles.journalTag}>
                            <Text style={styles.journalTagText}>{tag}</Text>
                          </View>
                        ))}
                        {entry.tags.length > 4 && (
                          <Text style={[styles.journalTagMore, { color: t.textSecondary }]}>+{entry.tags.length - 4}</Text>
                        )}
                      </View>
                    )}
                  </GlassCard>
                ))}
              </View>
            )}

            {/* -- Side Effects (from check-in) */}
            {selectedDayCheckin?.sideEffectTags && selectedDayCheckin.sideEffectTags.length > 0 && (
              <GlassCard variant="glow" glowColor={Colors.error} style={styles.eventCard}>
                <View style={styles.eventCardHeader}>
                  <View style={[styles.eventIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="warning" size={20} color={Colors.error} />
                  </View>
                  <View style={styles.eventCardHeaderText}>
                    <Text style={[styles.eventCardTitle, { color: t.text }]}>Side Effects</Text>
                    <Text style={[styles.eventCardTime, { color: t.textSecondary }]}>Reported today</Text>
                  </View>
                </View>
                <View style={styles.sideEffectRow}>
                  {selectedDayCheckin.sideEffectTags.map((se) => (
                    <View key={se} style={styles.sideEffectChip}>
                      <Text style={styles.sideEffectChipText}>
                        {se.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  ))}
                </View>
              </GlassCard>
            )}

            {/* Quick-add buttons moved to Home page FAB */}
          </View>
        </DayDetailPanel>

        {/* Schedules moved to Peptides tab */}

        {/* Journal disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="shield-checkmark" size={16} color={Colors.pepBlue} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            This is your personal wellness journal. Entries are private and
            stored only on your device. PepTalk does not recommend, prescribe,
            or endorse any substances. Consult your healthcare provider for
            medical decisions.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* -- Add Entry Modal */}
      <Modal
        visible={showLogModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLogModal(false)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: t.bg }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          >
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Add Entry</Text>
              <TouchableOpacity
                onPress={() => setShowLogModal(false)}
                style={[styles.modalCloseBtn, { backgroundColor: t.glass }]}
                accessibilityRole="button"
                accessibilityLabel="Close add entry"
              >
                <Ionicons name="close" size={22} color={t.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDate, { color: t.textSecondary }]}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>

            {/* Substance / supplement -- free text */}
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Substance / Supplement</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: t.card, color: t.text }]}
              value={logSubstanceName}
              onChangeText={setLogSubstanceName}
              placeholder="Type what you took..."
              placeholderTextColor={t.textSecondary}
              autoCapitalize="words"
            />

            {/* Amount + Unit */}
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Amount Noted</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: t.card, color: t.text }]}
                value={logAmount}
                onChangeText={setLogAmount}
                placeholder="e.g. 250"
                placeholderTextColor={t.textSecondary}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitRow}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitChip,
                      { backgroundColor: t.card },
                      logUnit === u && styles.unitChipActive,
                    ]}
                    onPress={() => setLogUnit(u)}
                  >
                    {logUnit === u ? (
                      <LinearGradient
                        colors={[Colors.rose, Colors.roseDark]}
                        style={styles.unitChipGradient}
                      >
                        <Text style={styles.unitChipTextActive}>{u}</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={[styles.unitChipText, { color: t.textSecondary }]}>{u}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Route */}
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Route</Text>
            <View style={styles.routeRow}>
              {ROUTES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.routeChip,
                    { backgroundColor: t.card },
                    logRoute === r && styles.routeChipActive,
                  ]}
                  onPress={() => setLogRoute(r)}
                >
                  <Text
                    style={[
                      styles.routeChipText,
                      { color: t.textSecondary },
                      logRoute === r && styles.routeChipTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Injection site */}
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Injection Site (optional)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: t.card, color: t.text }]}
              value={logSite}
              onChangeText={setLogSite}
              placeholder="e.g. abdomen left, deltoid right"
              placeholderTextColor={t.textSecondary}
            />

            {/* Notes */}
            <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 60, backgroundColor: t.card, color: t.text }]}
              value={logNotes}
              onChangeText={setLogNotes}
              placeholder="How did you feel? Any effects?"
              placeholderTextColor={t.textSecondary}
              multiline
            />

            {/* Journal disclaimer in modal */}
            <View style={styles.modalDisclaimer}>
              <Ionicons name="shield-checkmark-outline" size={14} color={Colors.pepBlue} />
              <Text style={[styles.modalDisclaimerText, { color: t.textSecondary }]}>
                This is your personal record. PepTalk does not recommend or
                endorse any substance.
              </Text>
            </View>

            <TouchableOpacity onPress={handleLogEntry} activeOpacity={0.8}>
              <LinearGradient
                colors={[Colors.rose, Colors.roseDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtn}
              >
                <Text style={styles.saveBtnText}>Save Entry</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Full day summary sheet — opens from Full view button or long-press on a day */}
      <DaySummarySheet
        visible={daySummaryOpen}
        dateKey={selectedDate}
        onClose={() => setDaySummaryOpen(false)}
      />

      {/* Quick-add picker — covers Workouts / Meals / Doses / Cycle.
          Free + Pro both have access to manual logging from this entry. */}
      <Modal
        visible={showAddSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddSheet(false)}
      >
        <TouchableOpacity
          style={styles.addSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowAddSheet(false)}
        >
          <View style={[styles.addSheet, { backgroundColor: t.bg }]}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.addSheetHandle}>
                <View style={[styles.addSheetHandleBar, { backgroundColor: t.textMuted }]} />
              </View>
              <Text style={[styles.addSheetTitle, { color: t.text }]}>Add to {selectedDate === toDateKey(now) ? 'today' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              <Text style={[styles.addSheetSub, { color: t.textSecondary }]}>What would you like to log?</Text>
              {[
                { label: 'Meal', icon: 'restaurant-outline' as const, color: '#6FA891', route: '/nutrition' },
                { label: 'Peptide dose', icon: 'flask-outline' as const, color: '#3E7CB1', route: `/(tabs)/calendar?openLog=1&date=${selectedDate}` },
                { label: 'Workout', icon: 'barbell-outline' as const, color: '#D98C86', route: '/workouts' },
                { label: 'Daily check-in', icon: 'clipboard-outline' as const, color: '#E89672', route: `/(tabs)/check-in?date=${selectedDate}` },
                { label: 'Stack', icon: 'layers-outline' as const, color: '#9B86A4', route: '/(tabs)/my-stacks' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.addSheetRow, { borderBottomColor: t.cardBorder }]}
                  onPress={() => {
                    setShowAddSheet(false);
                    // Defer routing so the sheet animation isn't thrashed
                    setTimeout(() => router.push(opt.route as any), 80);
                  }}
                  accessibilityRole="button"
                >
                  <View style={[styles.addSheetIcon, { backgroundColor: `${opt.color}20` }]}>
                    <Ionicons name={opt.icon} size={20} color={opt.color} />
                  </View>
                  <Text style={[styles.addSheetLabel, { color: t.text }]}>{opt.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
                </TouchableOpacity>
              ))}
            </SafeAreaView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.darkBg },

  // Header
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontSize: 32, fontWeight: '900', color: Colors.darkText, letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: Colors.darkTextSecondary, marginTop: 4 },
  headerIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(232, 150, 114, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Weekly summary card
  weeklyWrap: { paddingHorizontal: Spacing.md, marginTop: Spacing.md },

  // Calendar header add button
  headerAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add-to-calendar bottom sheet
  addSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  addSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  addSheetHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  addSheetHandleBar: { width: 36, height: 4, borderRadius: 2, opacity: 0.3 },
  addSheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  addSheetSub: { fontSize: 13, marginBottom: 12 },
  addSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  addSheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSheetLabel: { flex: 1, fontSize: 15, fontWeight: '600' },

  // Alerts
  alertSection: { paddingHorizontal: Spacing.md, marginTop: Spacing.md, gap: Spacing.sm },
  alertCard: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderLeftWidth: 4,
  },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  alertMessage: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, marginTop: 6, lineHeight: 20 },
  alertAction: { fontSize: FontSizes.sm, color: Colors.rose, fontWeight: '600', marginTop: 8 },

  // Calendar Card
  calendarCard: {
    margin: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  calendarNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md, paddingHorizontal: Spacing.sm,
  },
  navBtn: {},
  navBtnGradient: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  monthYearWrap: { alignItems: 'center' },
  calendarMonth: {
    fontSize: FontSizes.xl, fontWeight: '800', color: Colors.darkText, letterSpacing: -0.3,
  },
  calendarYear: {
    fontSize: FontSizes.xs, fontWeight: '600', color: Colors.darkTextSecondary, marginTop: 1,
  },

  // Day of week
  dowRow: { flexDirection: 'row', marginBottom: Spacing.xs, paddingHorizontal: 2 },
  dowText: {
    flex: 1, textAlign: 'center', fontSize: FontSizes.xs,
    fontWeight: '700', color: Colors.rose, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Days grid
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 2 },
  dayCell: {
    width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.md, position: 'relative',
  },

  // Selected day gradient ring
  selectedRing: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedInner: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.darkBg,
    alignItems: 'center', justifyContent: 'center',
  },
  dayTextSelected: { fontSize: FontSizes.sm, color: Colors.rose, fontWeight: '800' },

  // Today ring
  todayRing: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: 'rgba(227, 167, 161, 0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  dayTextToday: { fontSize: FontSizes.sm, color: Colors.rose, fontWeight: '700' },

  // Normal day
  dayText: { fontSize: FontSizes.sm, color: Colors.darkText, fontWeight: '500' },
  dayTextMuted: { color: Colors.darkTextSecondary, opacity: 0.35 },

  // Dot indicators
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 2, height: 6, position: 'absolute', bottom: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dotDose: { backgroundColor: Colors.rose },
  dotCheckin: { backgroundColor: '#22c55e' },
  dotJournal: { backgroundColor: '#A4D9D1' },
  dotWorkout: { backgroundColor: Colors.pepTeal },
  dotMeal: { backgroundColor: '#F4ECC2' },

  // Legend
  legend: {
    flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md,
    justifyContent: 'center', paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '500' },

  // Day detail
  dayDetail: { paddingHorizontal: Spacing.md, marginTop: Spacing.sm },
  dayDetailHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dayDetailTitle: {
    fontSize: FontSizes.lg, fontWeight: '800', color: Colors.darkText, letterSpacing: -0.3,
  },
  eventCountBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  eventCountText: { fontSize: FontSizes.sm, fontWeight: '800', color: Colors.rose },

  // Empty state
  emptyStateCard: { paddingVertical: Spacing.xl },
  emptyStateInner: { alignItems: 'center', gap: Spacing.sm },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs,
  },
  emptyStateTitle: {
    fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText,
  },
  emptyStateText: {
    fontSize: FontSizes.sm, color: Colors.darkTextSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: Spacing.lg,
  },

  // Event cards (glass cards in detail)
  eventCard: { marginBottom: Spacing.sm },
  eventCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  eventIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  eventCardHeaderText: { flex: 1 },
  eventCardTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  eventCardTime: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 1 },

  deleteBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Dose info
  doseInfo: {
    fontSize: FontSizes.sm, color: Colors.darkTextSecondary, marginTop: 2,
    paddingLeft: 48,
  },
  doseNotes: {
    fontSize: FontSizes.xs, color: Colors.sage, fontStyle: 'italic', marginTop: 4,
    paddingLeft: 48,
  },

  // Timeline sections
  timelineSection: { marginTop: Spacing.xs },

  // Check-in summary
  checkinBadgeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  checkinBadge: {
    borderRadius: BorderRadius.sm,
    paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center',
    flex: 1, minWidth: 80,
  },
  checkinBadgeLabel: {
    fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '600',
  },
  checkinBadgeValue: {
    fontSize: FontSizes.sm, color: Colors.powder, fontWeight: '800', marginTop: 2,
  },
  emotionTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  emotionTag: {
    backgroundColor: 'rgba(199, 215, 230, 0.12)', borderRadius: BorderRadius.full,
    paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(199, 215, 230, 0.2)',
  },
  emotionTagText: {
    fontSize: FontSizes.xs, color: Colors.powder, fontWeight: '600', textTransform: 'capitalize',
  },
  checkinFeeling: {
    fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontStyle: 'italic',
    marginTop: Spacing.sm, lineHeight: 20,
  },

  // Workout meta
  workoutMetaRow: {
    flexDirection: 'row', gap: Spacing.md, marginTop: 2, paddingLeft: 48,
  },
  workoutMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  workoutMetaText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '500' },

  // Journal entries
  journalCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  journalCategoryBadge: {
    borderRadius: BorderRadius.full, paddingVertical: 3, paddingHorizontal: 10,
  },
  journalCategoryText: { fontSize: FontSizes.xs, fontWeight: '700' },
  journalPreview: {
    fontSize: FontSizes.sm, color: Colors.darkTextSecondary, marginTop: 4, lineHeight: 20,
  },
  journalTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  journalTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: BorderRadius.full,
    paddingVertical: 3, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  journalTagText: { fontSize: FontSizes.xs, color: '#F4ECC2', fontWeight: '600' },
  journalTagMore: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, alignSelf: 'center' },

  // Side effects
  sideEffectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.xs },
  sideEffectChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: BorderRadius.full,
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  sideEffectChipText: {
    fontSize: FontSizes.xs, color: Colors.error, fontWeight: '700', textTransform: 'capitalize',
  },

  // Quick add buttons
  quickAddRow: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm,
  },
  quickAddBtn: { flex: 1 },
  quickAddGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: BorderRadius.full,
    paddingVertical: 12,
  },
  quickAddBtnText: { fontSize: FontSizes.sm, fontWeight: '700', color: '#fff' },

  // Protocols
  protocolSection: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg },
  sectionTitle: {
    fontSize: FontSizes.lg, fontWeight: '800', color: Colors.darkText,
    marginBottom: Spacing.sm, letterSpacing: -0.3,
  },
  protocolCard: { marginBottom: Spacing.sm },
  protocolHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  protocolName: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  protocolInfo: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, marginTop: 2 },
  protocolDates: {
    fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: Spacing.xs,
    paddingLeft: 48,
  },
  emptyProtocolCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  noDoses: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontStyle: 'italic', flex: 1 },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: BorderRadius.md,
    padding: Spacing.md, marginHorizontal: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.15)',
  },
  disclaimerText: { flex: 1, fontSize: FontSizes.xs, color: Colors.darkTextSecondary, lineHeight: 18 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.darkBg },
  modalContent: { padding: Spacing.md, paddingBottom: 40 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.darkCardBorder,
  },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.darkText },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDate: {
    fontSize: FontSizes.md, color: Colors.darkTextSecondary, marginBottom: Spacing.lg, marginTop: Spacing.sm,
  },
  fieldLabel: {
    fontSize: FontSizes.xs, fontWeight: '700', color: Colors.darkTextSecondary,
    marginBottom: 6, marginTop: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, color: Colors.darkText, fontSize: FontSizes.md,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  amountRow: { gap: Spacing.sm },
  unitRow: { flexDirection: 'row', gap: Spacing.xs },
  unitChip: {
    flex: 1, alignItems: 'center',
    borderRadius: BorderRadius.md, backgroundColor: Colors.darkCard,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
    overflow: 'hidden',
  },
  unitChipActive: { borderColor: Colors.rose, borderWidth: 0 },
  unitChipGradient: {
    width: '100%', alignItems: 'center', paddingVertical: 8,
  },
  unitChipText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontWeight: '600', paddingVertical: 8 },
  unitChipTextActive: { fontSize: FontSizes.sm, color: '#fff', fontWeight: '700' },
  routeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  routeChip: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: BorderRadius.full, backgroundColor: Colors.darkCard,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  routeChipActive: { backgroundColor: Colors.sage, borderColor: Colors.sage },
  routeChipText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary },
  routeChipTextActive: { color: Colors.darkBg, fontWeight: '700' },
  saveBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.lg,
  },
  saveBtnText: { fontSize: FontSizes.lg, fontWeight: '800', color: '#fff' },

  // Modal disclaimer
  modalDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.15)',
  },
  modalDisclaimerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    lineHeight: 16,
  },

  // Disclaimer gate
  disclaimerGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 16,
  },
  disclaimerGateTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.darkText,
  },
  disclaimerGateSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
  },
  disclaimerGateText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },
});
