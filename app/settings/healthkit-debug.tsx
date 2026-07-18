/**
 * HealthKit debug screen — per-scope verification of HealthKit reads.
 *
 * Surfaced from Settings → Integrations → "Debug" so testers reporting
 * "Apple Health isn't syncing" can run the helper, see exactly which
 * scopes return data, and share the report. Saves us a debugging
 * round-trip when on-device behavior diverges from expectations.
 *
 * For each scope we ask the adapter for the last 7 days of samples.
 * The screen shows: scope label, sample count, latest sample value +
 * timestamp, and any error string the adapter returned.
 *
 * Tap "Copy report" to put the JSON-formatted output on the clipboard;
 * paste into a support thread or DM.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { healthKitAdapter } from '../../src/services/integrations/healthKitAdapter';
import type { BiomarkerScope } from '../../src/types/cycle';

interface ScopeResult {
  scope: BiomarkerScope;
  scalarCount: number;
  rangeCount: number;
  sleepCount: number;
  periodCount: number;
  cycleDayCount: number;
  latestSample?: {
    value?: unknown;
    unit?: string;
    timestamp?: string;
  };
  error?: string;
}

// All scopes we currently pull. Order roughly matches what users would
// triage first (vitals → activity → cycle → niche).
const PROBE_SCOPES: BiomarkerScope[] = [
  'steps',
  'active_energy',
  'resting_heart_rate',
  'hrv',
  'vo2_max',
  'spo2',
  'respiratory_rate',
  'sleep',
  'weight',
  'body_fat',
  'blood_pressure',
  'blood_glucose',
  'bbt',
  'wrist_temperature',
  'menstrual_flow',
  'ovulation_test',
  'sexual_activity',
  'workouts',
];

const SCOPE_LABEL: Record<BiomarkerScope, string> = {
  steps: 'Steps',
  active_energy: 'Active energy',
  resting_heart_rate: 'Resting heart rate',
  hrv: 'HRV',
  vo2_max: 'VO₂ max',
  spo2: 'SpO₂',
  respiratory_rate: 'Respiratory rate',
  sleep: 'Sleep',
  weight: 'Weight',
  body_fat: 'Body fat %',
  blood_pressure: 'Blood pressure',
  blood_glucose: 'Blood glucose',
  bbt: 'Basal body temp',
  wrist_temperature: 'Wrist temperature',
  menstrual_flow: 'Menstrual flow',
  ovulation_test: 'Ovulation tests',
  cervical_mucus: 'Cervical mucus',
  sexual_activity: 'Sexual activity',
  workouts: 'Workouts',
};

export default function HealthKitDebugScreen() {
  const t = useTheme();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ScopeResult[]>([]);
  const [reportTimestamp, setReportTimestamp] = useState<string | null>(null);

  // Dev/tester-only diagnostics. In a release build the route must be
  // unreachable (not just link-hidden) so a reviewer deep-linking here can't
  // land on the Health-permission Alert this screen surfaces. Hooks above run
  // unconditionally; the guard sits after them to respect rules-of-hooks.
  if (!__DEV__) return <Redirect href="/settings/integrations" />;

  const runProbe = async () => {
    if (!healthKitAdapter.available()) {
      Alert.alert(
        'iOS only',
        Platform.OS === 'ios'
          ? 'react-native-health module not loaded — rebuild with EAS to include it.'
          : 'HealthKit is iOS-only. On Android, see the Health Connect debug helper (coming).',
      );
      return;
    }

    setRunning(true);
    setResults([]);

    // Connect first — minimal scope so the prompt isn't overwhelming.
    // Real use would already have connected through Settings → Integrations.
    const connectOk = await healthKitAdapter.connect(PROBE_SCOPES);
    if (!connectOk) {
      Alert.alert('Connect failed', 'HealthKit denied access. Check iOS Settings → Privacy → Health.');
      setRunning(false);
      return;
    }

    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const out: ScopeResult[] = [];

    for (const scope of PROBE_SCOPES) {
      try {
        const r = await healthKitAdapter.sync([scope], sinceIso);
        const latestScalar = r.scalars
          .filter((s) => s.scope === scope)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
        const latestRange = r.ranges
          .filter((s) => s.scope === scope)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
        const latestSleep = r.sleeps.sort((a, b) =>
          (a.endIso < b.endIso ? 1 : -1),
        )[0];

        const latest = latestScalar
          ? { value: latestScalar.value, unit: latestScalar.unit, timestamp: latestScalar.timestamp }
          : latestRange
          ? { value: latestRange.values, unit: latestRange.unit, timestamp: latestRange.timestamp }
          : latestSleep
          ? { value: `${latestSleep.totalMinutes} min`, timestamp: latestSleep.endIso }
          : undefined;

        out.push({
          scope,
          scalarCount: r.scalars.filter((s) => s.scope === scope).length,
          rangeCount: r.ranges.filter((s) => s.scope === scope).length,
          sleepCount: scope === 'sleep' ? r.sleeps.length : 0,
          periodCount: scope === 'menstrual_flow' ? r.periods.length : 0,
          cycleDayCount:
            scope === 'ovulation_test' ||
            scope === 'sexual_activity' ||
            scope === 'cervical_mucus'
              ? r.cycleDayLogs.length
              : 0,
          latestSample: latest,
        });
      } catch (err: any) {
        out.push({
          scope,
          scalarCount: 0,
          rangeCount: 0,
          sleepCount: 0,
          periodCount: 0,
          cycleDayCount: 0,
          error: err?.message ?? String(err),
        });
      }
      setResults([...out]);
    }

    setReportTimestamp(new Date().toISOString());
    setRunning(false);
  };

  const copyReport = async () => {
    const payload = {
      generatedAt: reportTimestamp,
      platform: Platform.OS,
      results,
    };
    await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
    Alert.alert('Copied', 'HealthKit debug report copied to clipboard.');
  };

  const totalSamples = (r: ScopeResult) =>
    r.scalarCount + r.rangeCount + r.sleepCount + r.periodCount + r.cycleDayCount;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>HealthKit Debug</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: t.textSecondary }]}>
          Probes each HealthKit scope individually for the last 7 days of data.
          Use this if Apple Health data isn't showing up where you expect.
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={runProbe}
            disabled={running}
            style={[styles.actionBtn, { backgroundColor: t.primary, opacity: running ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={running ? 'Probing in progress' : 'Run HealthKit probe'}
          >
            {running ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>Run probe</Text>
            )}
          </TouchableOpacity>

          {results.length > 0 && !running && (
            <TouchableOpacity
              onPress={copyReport}
              style={[styles.actionBtn, { backgroundColor: t.glass, borderColor: t.cardBorder, borderWidth: 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Copy report to clipboard"
            >
              <Text style={[styles.actionBtnText, { color: t.text }]}>Copy report</Text>
            </TouchableOpacity>
          )}
        </View>

        {results.map((r) => {
          const samples = totalSamples(r);
          const ok = samples > 0 && !r.error;
          return (
            <GlassCard key={r.scope} style={styles.scopeCard}>
              <View style={styles.scopeHeader}>
                <Text style={[styles.scopeName, { color: t.text }]}>
                  {SCOPE_LABEL[r.scope] ?? r.scope}
                </Text>
                <View
                  style={[
                    styles.scopeBadge,
                    {
                      backgroundColor: ok
                        ? Colors.success + '22'
                        : r.error
                        ? '#ef4444' + '22'
                        : t.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeBadgeText,
                      { color: ok ? Colors.success : r.error ? '#ef4444' : t.textSecondary },
                    ]}
                  >
                    {ok ? `${samples}` : r.error ? 'error' : '0'}
                  </Text>
                </View>
              </View>
              {r.latestSample && (
                <Text style={[styles.scopeMeta, { color: t.textSecondary }]} numberOfLines={2}>
                  Latest: {typeof r.latestSample.value === 'object' ? JSON.stringify(r.latestSample.value) : String(r.latestSample.value)}
                  {r.latestSample.unit ? ` ${r.latestSample.unit}` : ''}
                  {r.latestSample.timestamp ? ` · ${new Date(r.latestSample.timestamp).toLocaleString()}` : ''}
                </Text>
              )}
              {r.error && (
                <Text style={[styles.scopeMeta, { color: '#ef4444' }]} numberOfLines={3}>
                  {r.error}
                </Text>
              )}
            </GlassCard>
          );
        })}

        {!running && results.length === 0 && (
          <Text style={[styles.empty, { color: t.textSecondary }]}>
            Tap "Run probe" to test each HealthKit category.
          </Text>
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
  title: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 60 },
  intro: { fontSize: FontSizes.xs, lineHeight: 18, marginBottom: Spacing.md },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  actionBtnText: { color: '#fff', fontWeight: '700' },
  scopeCard: { marginBottom: 8, padding: 12 },
  scopeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scopeName: { fontSize: FontSizes.sm, fontWeight: '700' },
  scopeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 36,
    alignItems: 'center',
  },
  scopeBadgeText: { fontSize: 11, fontWeight: '700' },
  scopeMeta: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  empty: { fontSize: FontSizes.sm, textAlign: 'center', marginTop: 40 },
});
