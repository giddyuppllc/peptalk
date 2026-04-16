import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PepTalkCharacter } from '../src/components/PepTalkCharacter';
import { GlassCard } from '../src/components/GlassCard';
import { GradientButton } from '../src/components/GradientButton';
import {
  Colors,
  Gradients,
  Spacing,
  BorderRadius,
  FontSizes,
} from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import { PaywallGate } from '../src/hooks/useFeatureGate';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  syncHealthDataToCheckIn,
} from '../src/services/healthKitService';

// ---------------------------------------------------------------------------
// Health Data Sources
// ---------------------------------------------------------------------------

interface HealthSource {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  platform: 'ios' | 'android' | 'both';
  description: string;
}

const HEALTH_SOURCES: HealthSource[] = [
  {
    id: 'apple-health',
    label: 'Apple Health',
    icon: 'heart-circle-outline',
    platform: 'ios',
    description:
      'Sync steps, weight, heart rate, and sleep data from Apple Health.',
  },
  {
    id: 'google-health',
    label: 'Health Connect',
    icon: 'fitness-outline',
    platform: 'android',
    description:
      'Sync steps, weight, heart rate, and sleep from Google Health Connect.',
  },
];

// ---------------------------------------------------------------------------
// Metric Config
// ---------------------------------------------------------------------------

interface HealthMetric {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}

const HEALTH_METRICS: HealthMetric[] = [
  {
    id: 'steps',
    label: 'Steps',
    icon: 'footsteps-outline',
    description: 'Daily step count',
  },
  {
    id: 'weight',
    label: 'Weight',
    icon: 'scale-outline',
    description: 'Latest body weight',
  },
  {
    id: 'heart-rate',
    label: 'Heart Rate',
    icon: 'pulse-outline',
    description: 'Resting heart rate',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    icon: 'moon-outline',
    description: 'Sleep duration & quality',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthConnectSetupScreenWrapper() {
  return (
    <PaywallGate feature="health_integrations">
      <HealthConnectSetupScreen />
    </PaywallGate>
  );
}

function HealthConnectSetupScreen() {
  const t = useTheme();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncResult, setSyncResult] = useState<Record<string, any> | null>(
    null,
  );

  const isIOS = Platform.OS === 'ios';
  const platformSources = useMemo(
    () =>
      HEALTH_SOURCES.filter(
        (s) => s.platform === 'both' || s.platform === Platform.OS,
      ),
    [],
  );

  // Check if already connected on mount
  useEffect(() => {
    if (isHealthKitAvailable()) {
      setConnected(true);
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);

    try {
      if (isIOS) {
        const granted = await requestHealthKitPermissions();
        if (granted) {
          setConnected(true);
          const data = await syncHealthDataToCheckIn();
          setSyncResult(data);
        } else {
          Alert.alert(
            'Permission Required',
            'PepTalk needs access to Apple Health to sync your data. You can enable this in Settings > Privacy & Security > Health.',
          );
        }
      } else {
        // Android Health Connect — not yet implemented in native module
        Alert.alert(
          'Coming Soon',
          'Health Connect integration for Android is coming in a future update. Stay tuned!',
        );
      }
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        'Unable to connect to your health data source. Please try again later.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDone = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Connect Health Data</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Character + Intro */}
        <View style={styles.characterSection}>
          <PepTalkCharacter
            size={100}
            variant="full"
            animated
            glowColor={Colors.pepTeal}
          />
          <Text style={[styles.introTitle, { color: t.text }]}>
            Let's connect your health data
          </Text>
          <Text style={[styles.introSubtitle, { color: t.textSecondary }]}>
            PepTalk can auto-fill your check-ins with real health metrics from
            your {isIOS ? 'Apple Watch or iPhone' : 'Android device'}.
          </Text>
        </View>

        {/* What We Sync */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>What we'll sync</Text>
          <GlassCard variant="gradient">
            {HEALTH_METRICS.map((metric, i) => (
              <View
                key={metric.id}
                style={[
                  styles.metricRow,
                  i < HEALTH_METRICS.length - 1 && [styles.metricRowBorder, { borderBottomColor: t.glassBorder }],
                ]}
              >
                <View style={styles.metricIcon}>
                  <Ionicons
                    name={metric.icon}
                    size={20}
                    color={Colors.pepTeal}
                  />
                </View>
                <View style={styles.metricText}>
                  <Text style={[styles.metricLabel, { color: t.text }]}>{metric.label}</Text>
                  <Text style={[styles.metricDesc, { color: t.textSecondary }]}>{metric.description}</Text>
                </View>
                {connected && syncResult && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.success}
                  />
                )}
              </View>
            ))}
          </GlassCard>
        </View>

        {/* Platform Source */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Data Source</Text>
          {platformSources.map((source) => (
            <GlassCard key={source.id} variant="glow" glowColor={Colors.pepBlue}>
              <View style={styles.sourceRow}>
                <LinearGradient
                  colors={[...Gradients.primary]}
                  style={styles.sourceIcon}
                >
                  <Ionicons name={source.icon} size={24} color="#fff" />
                </LinearGradient>
                <View style={styles.sourceText}>
                  <Text style={[styles.sourceLabel, { color: t.text }]}>{source.label}</Text>
                  <Text style={[styles.sourceDesc, { color: t.textSecondary }]}>{source.description}</Text>
                </View>
                {connected && (
                  <View style={styles.connectedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={Colors.success}
                    />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                )}
              </View>
            </GlassCard>
          ))}
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Ionicons name="lock-closed" size={16} color={Colors.pepBlue} />
          <Text style={[styles.privacyText, { color: t.textSecondary }]}>
            Your health data stays on your device. PepTalk never uploads or
            shares your personal health information.
          </Text>
        </View>

        {/* Sync Results */}
        {connected && syncResult && Object.keys(syncResult).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Latest Sync</Text>
            <GlassCard>
              {syncResult.steps != null && (
                <View style={styles.syncRow}>
                  <Ionicons
                    name="footsteps-outline"
                    size={18}
                    color={Colors.pepTeal}
                  />
                  <Text style={[styles.syncLabel, { color: t.text }]}>Steps</Text>
                  <Text style={styles.syncValue}>
                    {syncResult.steps.toLocaleString()}
                  </Text>
                </View>
              )}
              {syncResult.weightLbs != null && (
                <View style={styles.syncRow}>
                  <Ionicons
                    name="scale-outline"
                    size={18}
                    color={Colors.pepTeal}
                  />
                  <Text style={[styles.syncLabel, { color: t.text }]}>Weight</Text>
                  <Text style={styles.syncValue}>
                    {syncResult.weightLbs} lbs
                  </Text>
                </View>
              )}
              {syncResult.restingHeartRate != null && (
                <View style={styles.syncRow}>
                  <Ionicons
                    name="pulse-outline"
                    size={18}
                    color={Colors.pepTeal}
                  />
                  <Text style={[styles.syncLabel, { color: t.text }]}>Heart Rate</Text>
                  <Text style={styles.syncValue}>
                    {syncResult.restingHeartRate} bpm
                  </Text>
                </View>
              )}
              {syncResult.sleepHours != null && (
                <View style={styles.syncRow}>
                  <Ionicons
                    name="moon-outline"
                    size={18}
                    color={Colors.pepTeal}
                  />
                  <Text style={[styles.syncLabel, { color: t.text }]}>Sleep</Text>
                  <Text style={styles.syncValue}>
                    {syncResult.sleepHours} hrs
                  </Text>
                </View>
              )}
            </GlassCard>
          </View>
        )}

        {/* Action Button */}
        <View style={styles.actionSection}>
          {connected ? (
            <GradientButton label="Done" onPress={handleDone} />
          ) : connecting ? (
            <View style={styles.connectingRow}>
              <ActivityIndicator color={Colors.pepBlue} />
              <Text style={[styles.connectingText, { color: t.textSecondary }]}>Connecting...</Text>
            </View>
          ) : (
            <GradientButton
              label={
                isIOS ? 'Connect Apple Health' : 'Connect Health Connect'
              }
              onPress={handleConnect}
              colors={[Colors.pepTeal, Colors.pepBlue]}
            />
          )}
        </View>

        {/* Skip */}
        {!connected && (
          <TouchableOpacity onPress={handleDone} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: t.textSecondary }]}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Character section
  characterSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  introTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  introSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: Spacing.sm,
  },

  // Metrics
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  metricRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricText: {
    flex: 1,
  },
  metricLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  metricDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // Source
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: {
    flex: 1,
  },
  sourceLabel: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
  },
  sourceDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: '600',
  },

  // Privacy
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  privacyText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
  },

  // Sync results
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  syncLabel: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
    fontWeight: '500',
  },
  syncValue: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.pepTeal,
  },

  // Action
  actionSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  connectingText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },

  // Skip
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  skipText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
});
