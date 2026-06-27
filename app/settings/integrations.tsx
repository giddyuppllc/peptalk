/**
 * Integrations settings — connect / disconnect biomarker sources.
 *
 * Shipped in 1.9.0:
 *   - Apple Health (iOS)  → real connection via react-native-health
 *   - Health Connect (Android) → live connection via react-native-health-connect
 *     (Steps, Sleep, Heart Rate, Active/Total Calories, Weight, Body Fat)
 *   - Oura, Whoop → "Coming soon" cards; we're waiting on API approvals
 *
 * Sources listed in `BiomarkerSource` but not wired (Dexcom, Libre,
 * Garmin, Withings, Tempdrop, etc.) don't appear on this screen until
 * their adapters ship.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useIntegrationsStore } from '../../src/store/useIntegrationsStore';
import { ADAPTERS } from '../../src/services/integrations/manager';
import {
  BIOMARKER_SOURCE_LABELS,
  type BiomarkerSource,
  type BiomarkerScope,
} from '../../src/types/cycle';

// Default scopes we request for each source. Users can restrict in
// the OS settings later (e.g. Apple Health toggles per category).
const DEFAULT_SCOPES: Record<BiomarkerSource, BiomarkerScope[]> = {
  manual: [],
  // Trimmed to ONLY the scopes PepTalk actually surfaces (App Review 5.1.1/2.5.1
  // minimal-data). Every type below maps to a visible feature:
  //   activity/body/heart/sleep → biometrics cache → activity, trackers,
  //     DaySummarySheet, PeptideTrendCard, weekly summary, readiness, and the
  //     daily check-in autofill (steps, active energy, weight, body fat, RHR,
  //     HRV, VO₂ max, blood oxygen, respiratory rate, sleep, workouts).
  //   cycle (menstrual_flow → periods; ovulation_test/sexual_activity →
  //     cycle day logs) → Cycle screens + Cycle log.
  // Removed (no visible feature; dedicated device rows below own them where
  // relevant): blood_pressure (Withings), blood_glucose (Dexcom/Libre),
  // bbt (Tempdrop), wrist_temperature, cervical_mucus (kegg).
  apple_health: [
    'steps', 'active_energy', 'resting_heart_rate', 'hrv', 'vo2_max',
    'spo2', 'sleep', 'weight', 'body_fat', 'menstrual_flow',
    'ovulation_test', 'sexual_activity', 'workouts', 'respiratory_rate',
  ],
  health_connect: [
    'steps', 'active_energy', 'resting_heart_rate', 'hrv', 'sleep',
    'weight', 'body_fat', 'menstrual_flow',
  ],
  google_fit: ['steps', 'active_energy', 'sleep', 'weight'],
  oura: ['sleep', 'hrv', 'resting_heart_rate', 'bbt'],
  whoop: ['sleep', 'hrv', 'resting_heart_rate'],
  garmin: ['steps', 'active_energy', 'sleep', 'hrv', 'resting_heart_rate', 'workouts'],
  fitbit: ['steps', 'sleep', 'resting_heart_rate', 'weight'],
  withings: ['weight', 'body_fat', 'blood_pressure'],
  dexcom: ['blood_glucose'],
  libre: ['blood_glucose'],
  tempdrop: ['bbt'],
  kegg: ['cervical_mucus', 'bbt'],
  mira: [],
  eight_sleep: ['sleep', 'resting_heart_rate', 'hrv'],
  inbody: ['weight', 'body_fat'],
  ai_inferred: [],
};

const ICONS: Partial<Record<BiomarkerSource, keyof typeof Ionicons.glyphMap>> = {
  apple_health: 'heart',
  health_connect: 'pulse',
  oura: 'ellipse',
  whoop: 'fitness',
  garmin: 'watch',
  fitbit: 'watch',
  dexcom: 'water',
  libre: 'water',
  tempdrop: 'thermometer',
  kegg: 'flower',
  mira: 'flask',
  withings: 'scale',
  eight_sleep: 'bed',
  inbody: 'body',
  manual: 'create',
};

export default function IntegrationsSettingsScreen() {
  const router = useRouter();
  const t = useTheme();
  const integrations = useIntegrationsStore((s) => s.integrations);
  const syncing = useIntegrationsStore((s) => s.syncingSources);
  const connectSource = useIntegrationsStore((s) => s.connectSource);
  const disconnectSource = useIntegrationsStore((s) => s.disconnectSource);
  const syncAndRoute = useIntegrationsStore((s) => s.syncAndRoute);
  const refreshStatuses = useIntegrationsStore((s) => s.refreshStatuses);

  const [connecting, setConnecting] = useState<BiomarkerSource | null>(null);

  useEffect(() => {
    refreshStatuses().catch(() => {});
  }, [refreshStatuses]);

  const handleConnect = async (source: BiomarkerSource) => {
    // InBody is manual-entry-only today (API credentials pending). The
    // Connect button routes straight to the scan-logging form instead
    // of attempting an OAuth flow that doesn't exist yet.
    if (source === 'inbody') {
      router.push('/settings/inbody-entry' as never);
      return;
    }
    setConnecting(source);
    try {
      const ok = await connectSource(source, DEFAULT_SCOPES[source]);
      if (!ok) {
        if (source === 'apple_health') {
          // App Review 5.1.1(iv): iOS owns the Health permission dialog (fired by
          // connectSource above) and deliberately hides read-access status for
          // privacy, so we can never know it "failed". We must NOT show a custom
          // prompt that pre-empts or pressures the system request. This is a
          // neutral, factual notice with a genuine choice — no "grant access",
          // no "tap allow", no funnel toward granting.
          Alert.alert(
            'Apple Health',
            "Health permissions are managed by iOS. If your data isn't syncing, you can review them in the Settings app.",
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert(
            'Could not connect',
            'Something went wrong — try again in a moment.',
          );
        }
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (source: BiomarkerSource) => {
    Alert.alert(
      'Disconnect?',
      'PepTalk will stop syncing from this source. You can reconnect any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectSource(source);
          },
        },
      ],
    );
  };

  // Partition adapters into: available + unavailable (scaffolded dark)
  const available = ADAPTERS.filter((a) => a.available());
  const darkScaffold = ADAPTERS.filter((a) => !a.available());

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Integrations</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.lead, { color: t.text }]}>
            One connection unlocks many devices
          </Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            Apple Health and Health Connect aggregate data from dozens of devices — Apple Watch,
            Oura, most scales, most CGMs, and blood pressure monitors all write to them. Start
            there; we add direct integrations as they become available.
          </Text>
          {/* App Review 2.5.1: clearly identify HealthKit functionality in the UI —
              exactly what PepTalk reads + writes, and that the user controls it. */}
          <Text style={[styles.body, { color: t.textSecondary, marginTop: 10 }]}>
            When you connect Apple Health, PepTalk reads your activity (steps, active energy,
            workouts), body metrics (weight, body composition), heart data (heart rate, HRV,
            VO₂ max, blood oxygen, respiratory rate), sleep, and cycle data so you can see trends
            alongside your protocols — and writes your check-ins and weight back so everything
            stays in sync. You choose exactly what to share in the iOS permission dialog, and you
            can change it any time in Settings.
          </Text>
        </View>

        {available.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: t.textSecondary }]}>AVAILABLE</Text>
            {available.map((adapter) => {
              const record = integrations.find((i) => i.source === adapter.source);
              const isConnected = record?.connected === true;
              const isSyncing = syncing.includes(adapter.source);
              const isConnecting = connecting === adapter.source;
              return (
                <GlassCard key={adapter.source} style={styles.integrationCard}>
                  <View style={styles.integrationRow}>
                    <View
                      style={[
                        styles.sourceIconWrap,
                        {
                          backgroundColor: isConnected
                            ? t.primary + '20'
                            : 'rgba(0,0,0,0.04)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={ICONS[adapter.source] ?? 'link'}
                        size={22}
                        color={isConnected ? t.primary : t.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sourceName, { color: t.text }]}>
                        {BIOMARKER_SOURCE_LABELS[adapter.source]}
                      </Text>
                      <Text style={[styles.sourceStatus, { color: t.textSecondary }]}>
                        {record?.statusMessage ??
                          (isConnected ? 'Connected' : 'Not connected')}
                      </Text>
                      {record?.lastSyncedAt && (
                        <Text style={[styles.sourceSub, { color: t.textSecondary }]}>
                          Last sync: {new Date(record.lastSyncedAt).toLocaleString()}
                        </Text>
                      )}
                      {record?.lastError && (
                        <Text style={[styles.errorText, { color: Colors.error }]}>
                          {record.lastError}
                        </Text>
                      )}
                    </View>
                    {isConnecting || isSyncing ? (
                      <ActivityIndicator color={t.primary} />
                    ) : isConnected ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() =>
                            syncAndRoute(adapter.source, DEFAULT_SCOPES[adapter.source])
                          }
                          style={[styles.syncBtn, { borderColor: t.primary }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Sync ${BIOMARKER_SOURCE_LABELS[adapter.source]} now`}
                        >
                          <Ionicons name="refresh" size={14} color={t.primary} />
                          <Text style={[styles.syncText, { color: t.primary }]}>Sync</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDisconnect(adapter.source)}
                          style={styles.disconnectBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Disconnect ${BIOMARKER_SOURCE_LABELS[adapter.source]}`}
                        >
                          <Text style={[styles.disconnectText, { color: t.textSecondary }]}>
                            Disconnect
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleConnect(adapter.source)}
                        style={[styles.connectBtn, { backgroundColor: t.primary }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Connect ${BIOMARKER_SOURCE_LABELS[adapter.source]}`}
                      >
                        <Text style={styles.connectText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </GlassCard>
              );
            })}
          </View>
        )}

        {darkScaffold.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: t.textSecondary }]}>COMING SOON</Text>
            {darkScaffold.map((adapter) => (
              <GlassCard key={adapter.source} style={{ ...styles.integrationCard, opacity: 0.7 }}>
                <View style={styles.integrationRow}>
                  <View style={[styles.sourceIconWrap, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                    <Ionicons
                      name={ICONS[adapter.source] ?? 'link'}
                      size={22}
                      color={t.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sourceName, { color: t.text }]}>
                      {BIOMARKER_SOURCE_LABELS[adapter.source]}
                    </Text>
                    <Text style={[styles.sourceSub, { color: t.textSecondary }]}>
                      {adapter.source === 'oura' &&
                        'Sleep, HRV, resting HR, body temperature — approval in progress.'}
                      {adapter.source === 'whoop' &&
                        'Strain, recovery, sleep — partnership in progress.'}
                      {adapter.source === 'health_connect' && Platform.OS === 'ios' &&
                        'Android only.'}
                      {adapter.source === 'apple_health' && Platform.OS === 'android' &&
                        'iOS only.'}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => router.push('/settings/healthkit-debug' as any)}
              accessibilityRole="button"
              accessibilityLabel="Run HealthKit debug helper"
            >
              <GlassCard style={styles.integrationCard}>
                <View style={styles.integrationRow}>
                  <View style={[styles.sourceIconWrap, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                    <Ionicons name="bug-outline" size={20} color={t.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sourceName, { color: t.text }]}>HealthKit debug</Text>
                    <Text style={[styles.sourceSub, { color: t.textSecondary }]}>
                      Probe each scope individually if data isn't showing up.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
                </View>
              </GlassCard>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.footer, { color: t.textSecondary }]}>
            More integrations are planned: Dexcom, FreeStyle Libre, Garmin, Withings,
            Tempdrop, and others. They'll appear here once the SDKs land.
          </Text>
        </View>
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
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  lead: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    marginBottom: 6,
    fontFamily: 'Playfair-Black',
  },
  body: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  integrationCard: {
    marginBottom: 8,
  },
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  sourceStatus: {
    fontSize: 12,
  },
  sourceSub: {
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    fontSize: 11,
    marginTop: 4,
  },
  connectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  connectText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  disconnectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  disconnectText: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
