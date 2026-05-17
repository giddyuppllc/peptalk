/**
 * Community prefs settings — Master Refactor Plan v3.1 §12.1 + §13.5.
 *
 * Fine-tune the public-tracking opt-in chosen at intake (§11.4). Master
 * switch + per-category toggles. Progress-photo sharing stays private
 * by default; this surface exposes the master only — per-upload choice
 * lives on the photo upload screen itself.
 */

import React from 'react';
import { ScrollView, View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import {
  useCommunityPrefsStore,
  type CommunityPreset,
} from '../../src/store/useCommunityPrefsStore';
import { tapLight } from '../../src/utils/haptics';

interface CategoryRow {
  key: keyof ReturnType<typeof useCommunityPrefsStore.getState>['shareCategories'];
  label: string;
  hint: string;
}

const CATEGORIES: CategoryRow[] = [
  {
    key: 'streak',
    label: 'Streaks',
    hint: 'Days in a row you logged a dose, meal, or workout.',
  },
  {
    key: 'adherence',
    label: 'Adherence',
    hint: 'Percentage of planned doses you logged this week.',
  },
  {
    key: 'bodyCompDeltas',
    label: 'Body-comp deltas',
    hint: 'Change in lean / fat / weight. Raw values stay private.',
  },
  {
    key: 'milestones',
    label: 'Milestones',
    hint: 'Cycle completions, PRs, named achievements.',
  },
  {
    key: 'progressPhotos',
    label: 'Progress photos',
    hint: 'Stays private by default. You opt in per photo.',
  },
];

const PRESET_LABELS: Record<CommunityPreset, string> = {
  all_in: 'All in',
  picky: 'Picky',
  nothing: 'Nothing',
};

export default function CommunityPrefsScreen() {
  const t = useV3Theme();
  const publicTracking = useCommunityPrefsStore((s) => s.publicTracking);
  const shareCategories = useCommunityPrefsStore((s) => s.shareCategories);
  const setMaster = useCommunityPrefsStore((s) => s.setMaster);
  const toggleCategory = useCommunityPrefsStore((s) => s.toggleCategory);
  const applyPreset = useCommunityPrefsStore((s) => s.applyPreset);

  const enabledCount = Object.values(shareCategories).filter(Boolean).length;
  const observation = publicTracking
    ? `${enabledCount} of ${CATEGORIES.length} categories shared.`
    : 'Public sharing is off. Tap the master switch to opt in.';

  return (
    <V3DetailShell
      title="Public sharing"
      observation={observation}
      intent="profile_appearance"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Master switch */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.masterRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.masterTitle,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.isDark
                      ? t.typography.headlineMale
                      : t.typography.headlineFemale,
                  },
                ]}
              >
                Public tracking
              </Text>
              <Text
                style={[
                  styles.masterBody,
                  {
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                  },
                ]}
              >
                When on, leaderboards + reactions become available.
                Off keeps everything private.
              </Text>
            </View>
            <Switch
              value={publicTracking}
              onValueChange={(v) => {
                tapLight();
                setMaster(v);
              }}
            />
          </View>
        </GlassCard>

        {/* Preset shortcuts */}
        <View style={styles.presetRow}>
          {(Object.keys(PRESET_LABELS) as CommunityPreset[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                tapLight();
                applyPreset(p);
              }}
              style={[
                styles.presetChip,
                {
                  borderColor: t.colors.cardBorder as string,
                  backgroundColor: t.isDark
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.6)',
                },
              ]}
            >
              <Text
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.bodyBold,
                  fontSize: 12,
                }}
              >
                {PRESET_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Per-category toggles */}
        {CATEGORIES.map((c) => (
          <GlassCard key={c.key} style={styles.catCard}>
            <View style={styles.catRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.catLabel,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                      opacity: publicTracking ? 1 : 0.5,
                    },
                  ]}
                >
                  {c.label}
                </Text>
                <Text
                  style={[
                    styles.catHint,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      opacity: publicTracking ? 1 : 0.5,
                    },
                  ]}
                >
                  {c.hint}
                </Text>
              </View>
              <Switch
                value={publicTracking && shareCategories[c.key]}
                disabled={!publicTracking}
                onValueChange={() => {
                  tapLight();
                  toggleCategory(c.key);
                }}
              />
            </View>
          </GlassCard>
        ))}

        {/* Disclaimer */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.disclaimerRow}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={t.colors.textSecondary as string}
            />
            <Text
              style={{
                flex: 1,
                marginLeft: 8,
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 11,
                lineHeight: 16,
              }}
            >
              You can opt out at any time. Aimee operates on your own
              data only — no cross-user inference even when public
              tracking is on.
            </Text>
          </View>
        </GlassCard>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  masterTitle: {
    fontSize: 17,
  },
  masterBody: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  presetRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  catCard: {
    marginTop: 8,
    paddingVertical: 14,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catLabel: { fontSize: 14 },
  catHint: { fontSize: 11, marginTop: 2 },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
