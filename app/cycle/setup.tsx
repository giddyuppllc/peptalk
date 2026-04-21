/**
 * Cycle setup — three-step first-class flow:
 *   1. Contraception method (12 options, drives prediction mode)
 *   2. Last period start date (only when cyclical or scheduled_cycle mode)
 *   3. Typical cycle + period lengths (skippable, defaults 28/5)
 *
 * After setup, the user lands on the cycle dashboard. Setup can be
 * re-run from Settings to update the method after a change.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useCycleStore } from '../../src/store/useCycleStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import {
  CONTRACEPTION_OPTIONS,
  CONTRACEPTION_LABELS,
  predictionModeFor,
  type ContraceptionMethod,
} from '../../src/types/cycle';

type Step = 'method' | 'period_start' | 'lengths' | 'done';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CycleSetupScreen() {
  const router = useRouter();
  const t = useTheme();
  const setCurrentContraception = useCycleStore((s) => s.setCurrentContraception);
  const startPeriod = useCycleStore((s) => s.startPeriod);
  const setCycleTracking = useHealthProfileStore((s) => s.setCycleTracking);

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<ContraceptionMethod | null>(null);
  const [lastPeriod, setLastPeriod] = useState('');
  const [cycleLength, setCycleLength] = useState('28');
  const [periodLength, setPeriodLength] = useState('5');
  // Double-tap guard — setting tracking + navigating on two rapid taps
  // could stack router.replace calls and flash the previous screen.
  const [finishing, setFinishing] = useState(false);

  const mode = useMemo(() => (method ? predictionModeFor(method) : null), [method]);
  const needsPeriodStep = mode === 'cyclical' || mode === 'scheduled_cycle';

  const handleMethodNext = () => {
    if (finishing) return;
    if (!method) {
      Alert.alert('Pick one', 'Select what best describes your situation.');
      return;
    }
    // Persist method immediately — if the user bails we still have their answer.
    setCurrentContraception(method);
    setStep(needsPeriodStep ? 'period_start' : 'done');
  };

  const handlePeriodNext = () => {
    // Validate a YYYY-MM-DD
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(lastPeriod) && !isNaN(Date.parse(lastPeriod));
    if (!dateOk) {
      Alert.alert('Enter a date', 'Format: YYYY-MM-DD. Tap "I\'m not sure" if you don\'t remember.');
      return;
    }
    startPeriod({ startDate: lastPeriod, source: 'manual' });
    setStep('lengths');
  };

  const handleNoIdea = () => {
    // Skip period date — just enable tracking with defaults
    setStep('lengths');
  };

  const handleFinish = () => {
    if (finishing) return;
    setFinishing(true);
    const cLen = Math.max(21, Math.min(45, parseInt(cycleLength, 10) || 28));
    const pLen = Math.max(2, Math.min(10, parseInt(periodLength, 10) || 5));
    setCycleTracking({
      trackingEnabled: true,
      typicalCycleLength: cLen,
      typicalPeriodLength: pLen,
      lastPeriodStartDate: lastPeriod || undefined,
    });
    router.replace('/cycle' as any);
  };

  const handleContinuousFinish = () => {
    if (finishing) return;
    setFinishing(true);
    // Continuous / irregular / pregnancy / returning — no period date, no lengths.
    setCycleTracking({ trackingEnabled: true });
    router.replace('/cycle' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (step === 'method' ? router.back() : setStep('method'))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Cycle setup</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'method' && (
          <>
            <View style={styles.section}>
              <Text style={[styles.stepKicker, { color: t.textSecondary }]}>STEP 1 OF 3</Text>
              <Text style={[styles.stepTitle, { color: t.text }]}>What's your situation?</Text>
              <Text style={[styles.stepBody, { color: t.textSecondary }]}>
                This tells us how to interpret your cycle data and what to predict. Every
                option is valid — there's no default and no judgment.
              </Text>
            </View>

            <View style={styles.section}>
              <GlassCard>
                {CONTRACEPTION_OPTIONS.map((opt, idx) => {
                  const active = method === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setMethod(opt)}
                      style={[
                        styles.optionRow,
                        idx < CONTRACEPTION_OPTIONS.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: 'rgba(0,0,0,0.06)',
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={CONTRACEPTION_LABELS[opt]}
                    >
                      <View
                        style={[
                          styles.radioOuter,
                          { borderColor: active ? t.primary : 'rgba(0,0,0,0.25)' },
                        ]}
                      >
                        {active && <View style={[styles.radioInner, { backgroundColor: t.primary }]} />}
                      </View>
                      <Text style={[styles.optionLabel, { color: t.text }]}>
                        {CONTRACEPTION_LABELS[opt]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>
            </View>

            <View style={styles.section}>
              <GradientButton label="Continue" onPress={handleMethodNext} />
            </View>
          </>
        )}

        {step === 'period_start' && (
          <>
            <View style={styles.section}>
              <Text style={[styles.stepKicker, { color: t.textSecondary }]}>STEP 2 OF 3</Text>
              <Text style={[styles.stepTitle, { color: t.text }]}>
                When did your last period start?
              </Text>
              <Text style={[styles.stepBody, { color: t.textSecondary }]}>
                The first day of bleeding. Ballpark is fine — you can fix it later in the log.
              </Text>
            </View>

            <View style={styles.section}>
              <GlassCard>
                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Date</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                  value={lastPeriod}
                  onChangeText={setLastPeriod}
                  placeholder={todayKey()}
                  placeholderTextColor={t.placeholder}
                  autoCapitalize="none"
                  accessibilityLabel="Last period start date, YYYY-MM-DD"
                />
                <Text style={[styles.hint, { color: t.textSecondary }]}>
                  Format: YYYY-MM-DD
                </Text>
              </GlassCard>
            </View>

            <View style={styles.section}>
              <GradientButton label="Continue" onPress={handlePeriodNext} />
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleNoIdea}
                accessibilityRole="button"
                accessibilityLabel="I'm not sure when my last period started"
              >
                <Text style={[styles.skipText, { color: t.textSecondary }]}>
                  I'm not sure
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'lengths' && (
          <>
            <View style={styles.section}>
              <Text style={[styles.stepKicker, { color: t.textSecondary }]}>STEP 3 OF 3</Text>
              <Text style={[styles.stepTitle, { color: t.text }]}>
                Your typical cycle
              </Text>
              <Text style={[styles.stepBody, { color: t.textSecondary }]}>
                Defaults are fine if you don't track — we'll refine predictions over time as
                you log periods.
              </Text>
            </View>

            <View style={styles.section}>
              <GlassCard>
                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>
                      Cycle length (days)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={cycleLength}
                      onChangeText={setCycleLength}
                      keyboardType="number-pad"
                      placeholder="28"
                      placeholderTextColor={t.placeholder}
                    />
                    <Text style={[styles.hint, { color: t.textSecondary }]}>21–45</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>
                      Period length (days)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={periodLength}
                      onChangeText={setPeriodLength}
                      keyboardType="number-pad"
                      placeholder="5"
                      placeholderTextColor={t.placeholder}
                    />
                    <Text style={[styles.hint, { color: t.textSecondary }]}>2–10</Text>
                  </View>
                </View>
              </GlassCard>
            </View>

            <View style={styles.section}>
              <GradientButton label="Finish setup" onPress={handleFinish} />
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.section}>
              <Text style={[styles.stepKicker, { color: t.textSecondary }]}>ALL SET</Text>
              <Text style={[styles.stepTitle, { color: t.text }]}>
                You're using {method ? CONTRACEPTION_LABELS[method].toLowerCase() : '—'}.
              </Text>
              <Text style={[styles.stepBody, { color: t.textSecondary }]}>
                Based on this, PepTalk won't try to predict a cycle you don't biologically
                have. You'll still track symptoms, mood, bleeding, and BBT — all the signal
                your body gives you — without numbers that'd be guesswork.
              </Text>
            </View>

            <View style={styles.section}>
              <GradientButton label="Continue" onPress={handleContinuousFinish} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  stepKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 8,
    fontFamily: 'Playfair-Black',
  },
  stepBody: {
    fontSize: FontSizes.sm,
    lineHeight: 21,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  optionLabel: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    height: 48,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  hint: {
    fontSize: 11,
    marginTop: 4,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  skipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
