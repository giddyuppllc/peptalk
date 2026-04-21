/**
 * Privacy settings — anonymized-data opt-in and data source controls.
 *
 * The opt-in flag lives on `profiles.share_anonymized_data`. When true,
 * a future analytics pipeline is allowed to include the user's hashed
 * identifier + aggregate stats in correlation studies. Nothing
 * identifying — no email, no medical history strings, no dose notes.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { supabase } from '../../src/services/supabase';
import { useAuthStore } from '../../src/store/useAuthStore';

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const t = useTheme();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareAnonData, setShareAnonData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('share_anonymized_data')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled && data) {
          setShareAnonData(Boolean(data.share_anonymized_data));
        }
      } catch {
        // silent — default to off
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggle = async (next: boolean) => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Log in first to change privacy settings.');
      return;
    }
    setShareAnonData(next);
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ share_anonymized_data: next })
        .eq('id', user.id);
      if (error) throw error;
    } catch (err: any) {
      // Revert on failure
      setShareAnonData(!next);
      Alert.alert('Save failed', err?.message ?? 'Could not update. Try again.');
    } finally {
      setSaving(false);
    }
  };

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
        <Text style={[styles.headerTitle, { color: t.text }]}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <GlassCard>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: t.text }]}>
                  Help improve PepTalk
                </Text>
                <Text style={[styles.toggleBody, { color: t.textSecondary }]}>
                  Share anonymized data to help us turn regenerative-medicine
                  tracking into a better tool for everyone.
                </Text>
              </View>
              {loading ? (
                <ActivityIndicator color={t.primary} />
              ) : (
                <Switch
                  value={shareAnonData}
                  onValueChange={handleToggle}
                  disabled={saving}
                  trackColor={{ false: 'rgba(0,0,0,0.12)', true: t.primary }}
                  accessibilityLabel="Share anonymized data"
                />
              )}
            </View>
          </GlassCard>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: t.textSecondary }]}>
            WHAT WE SHARE WHEN THIS IS ON
          </Text>
          <GlassCard>
            <Row
              icon="checkmark-circle"
              iconColor="#15803D"
              title="Hashed user ID"
              body="A one-way hash — we cannot reverse it back to your email or name."
              t={t}
            />
            <Row
              icon="checkmark-circle"
              iconColor="#15803D"
              title="Aggregate metrics"
              body="Dose counts, check-in frequency, trend directions. Never specific numbers tied to you."
              t={t}
            />
            <Row
              icon="checkmark-circle"
              iconColor="#15803D"
              title="Peptide usage patterns"
              body="Which peptides you're using. Helps us improve interaction and stacking guidance."
              t={t}
              last
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: t.textSecondary }]}>
            WHAT WE NEVER SHARE
          </Text>
          <GlassCard>
            <Row
              icon="close-circle"
              iconColor="#B91C1C"
              title="Your identity"
              body="No email, no name, no profile photo, no device ID."
              t={t}
            />
            <Row
              icon="close-circle"
              iconColor="#B91C1C"
              title="Free-text notes"
              body="Journal entries, dose notes, check-in descriptions — all stay on your device + your private Supabase row."
              t={t}
            />
            <Row
              icon="close-circle"
              iconColor="#B91C1C"
              title="Medical details"
              body="Health profile text fields (conditions, medications, provider notes) are never exported."
              t={t}
              last
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <Text style={[styles.footer, { color: t.textSecondary }]}>
            You can turn this off anytime. Turning it off removes your aggregate data
            from future studies. Already-aggregated data is irreversibly anonymized and
            cannot be traced back to you even before opt-out.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  iconColor,
  title,
  body,
  t,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  t: ReturnType<typeof useTheme>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
      ]}
    >
      <Ionicons name={icon} size={18} color={iconColor} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
        <Text style={[styles.rowBody, { color: t.textSecondary }]}>{body}</Text>
      </View>
    </View>
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
    fontSize: 24,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleBody: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  rowTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowBody: {
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  footer: {
    fontSize: FontSizes.xs,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
