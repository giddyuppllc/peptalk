/**
 * Weekly Tracker hub — Master Refactor Plan v3.1 §5.
 *
 * Seven drill cards: Doses, InBody, Weight, Sleep, Blood work,
 * Progress photos, Mood. Each card surfaces a one-line "what you have
 * today" status pulled from its backing store.
 *
 * A `+` FAB-style CTA at the top opens an action sheet to add any of
 * the seven without leaving Tracker. Calendar on home stays small
 * (§5.1 / §18 — Jamie's call); the actual log lives under each drill.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';
import { useBiometricsStore } from '../../src/store/useBiometricsStore';
import { useLabResultsStore } from '../../src/store/useLabResultsStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useProgressPhotosStore } from '../../src/store/useProgressPhotosStore';

type TileIcon = React.ComponentProps<typeof Ionicons>['name'];

interface TileMeta {
  key: string;
  title: string;
  status: string;
  icon: TileIcon;
  href: string;
}

export default function TrackerHubScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const doses = useDoseLogStore((s) => s.doses);
  const scans = useBodyCompositionStore((s) => s.scans);
  const latestScan = useBodyCompositionStore((s) => s.latestScan());
  const biometrics = useBiometricsStore((s) => s.readings);
  const labs = useLabResultsStore((s) => s.results);
  const checkIns = useCheckinStore((s) => s.entries);
  const photos = useProgressPhotosStore((s) => s.photos);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const tiles = useMemo<TileMeta[]>(() => {
    const recentDoses = doses.filter(
      (d) => new Date(d.date).getTime() > Date.now() - 7 * 86400_000,
    );
    const plannedToday = doses.filter(
      (d) => d.date === today && d.planned,
    ).length;
    const sleepReading = biometrics.find(
      (r) => r.date === today && r.scope === 'sleep_minutes',
    );
    const weightReading =
      latestScan?.weightLb ??
      biometrics.find((r) => r.scope === 'weight')?.value;
    const latestCheckIn = checkIns[0];

    return [
      {
        key: 'doses',
        title: 'Doses',
        status: plannedToday
          ? `${plannedToday} planned today · ${recentDoses.length} logged this week`
          : `${recentDoses.length} this week`,
        icon: 'medkit-outline',
        href: '/doses/tracker',
      },
      {
        key: 'inbody',
        title: 'InBody',
        status: scans.length === 0 ? 'No scans yet' : `${scans.length} on file`,
        icon: 'scan-outline',
        href: '/body-composition',
      },
      {
        key: 'weight',
        title: 'Weight',
        status:
          weightReading != null
            ? `${weightReading.toFixed(1)} lb most recent`
            : 'No weight logged',
        icon: 'speedometer-outline',
        href: '/tracker/weight',
      },
      {
        key: 'sleep',
        title: 'Sleep',
        status:
          sleepReading != null
            ? `${(Math.round((sleepReading.value / 60) * 10) / 10).toFixed(1)} hr last night`
            : 'No sleep data today',
        icon: 'moon-outline',
        href: '/tracker/sleep',
      },
      {
        key: 'bloodwork',
        title: 'Blood work',
        status:
          labs.length === 0
            ? 'No labs yet'
            : `${labs.length} result${labs.length === 1 ? '' : 's'}`,
        icon: 'flask-outline',
        href: '/labs',
      },
      {
        key: 'photos',
        title: 'Progress photos',
        status:
          photos.length === 0
            ? 'No photos yet · private by default'
            : `${photos.length} photo${photos.length === 1 ? '' : 's'} · private by default`,
        icon: 'images-outline',
        href: '/tracker/photos',
      },
      {
        key: 'mood',
        title: 'Mood & wellness',
        status: latestCheckIn
          ? `Last check-in: ${latestCheckIn.date}`
          : 'No check-ins yet',
        icon: 'heart-outline',
        href: '/tracker/mood',
      },
    ];
  }, [doses, scans.length, latestScan, biometrics, labs.length, checkIns, photos.length, today]);

  const observation = useMemo(() => {
    const plannedToday = doses.filter(
      (d) => d.date === today && d.planned,
    ).length;
    if (plannedToday > 0)
      return `${plannedToday} planned dose${plannedToday === 1 ? '' : 's'} for today. Confirm as you take them.`;
    const recentDoses = doses.filter(
      (d) => new Date(d.date).getTime() > Date.now() - 7 * 86400_000,
    );
    if (recentDoses.length === 0 && scans.length === 0 && labs.length === 0) {
      return 'Your week shows up here as you log entries from any vertical.';
    }
    return 'Tap any row to drill in, or use + to add an entry.';
  }, [doses, scans.length, labs.length, today]);

  const handleTile = (href: string) => {
    tapLight();
    router.push(href as never);
  };

  const handleAdd = (action: 'dose' | 'meal' | 'workout' | 'scan' | 'lab' | 'photo' | 'checkin') => {
    setAddOpen(false);
    tapMedium();
    const route = (() => {
      switch (action) {
        case 'dose':    return '/doses/calculator';
        case 'meal':    return '/nutrition/food-search';
        case 'workout': return '/workouts/new';
        case 'scan':    return '/body-composition/entry';
        case 'lab':     return '/labs/entry';
        case 'photo':   return '/tracker/photos';
        case 'checkin': return '/(tabs)/check-in';
      }
    })();
    router.push(route as never);
  };

  return (
    <V3DetailShell
      title="Weekly Tracker"
      observation={observation}
      intent="tracker_overview"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Pressable
          onPress={() => {
            tapMedium();
            setAddOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add an entry to the Weekly Tracker"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.addRow}>
              <View
                style={[
                  styles.iconBubble,
                  {
                    backgroundColor: t.isDark
                      ? 'rgba(201,136,90,0.18)'
                      : 'rgba(229,146,141,0.22)',
                  },
                ]}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={
                    t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.addTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Add an entry
                </Text>
                <Text
                  style={[
                    styles.addBody,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  Dose · meal · workout · scan · lab · photo · check-in.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={() => handleTile(tile.href)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${tile.title}. ${tile.status}`}
          >
            <GlassCard style={styles.tile}>
              <View style={styles.tileRow}>
                <View
                  style={[
                    styles.tileIconBubble,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(42,26,79,0.06)',
                    },
                  ]}
                >
                  <Ionicons
                    name={tile.icon}
                    size={20}
                    color={t.colors.textPrimary as string}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.tileTitle,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    {tile.title}
                  </Text>
                  <Text
                    style={[
                      styles.tileStatus,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    {tile.status}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={t.colors.textSecondary as string}
                />
              </View>
            </GlassCard>
          </Pressable>
        ))}
      </ScrollView>

      {/* Add-entry action sheet */}
      <Modal
        visible={addOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setAddOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close add-entry sheet"
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: t.colors.bgBase2 as string,
                borderTopLeftRadius: t.radius.card,
                borderTopRightRadius: t.radius.card,
              },
            ]}
            onPress={() => {}}
          >
            <View
              style={[
                styles.sheetHandle,
                {
                  backgroundColor: t.isDark
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(42,26,79,0.18)',
                },
              ]}
            />
            <Text
              style={[
                styles.sheetTitle,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              What are you adding?
            </Text>
            {(
              [
                { key: 'dose', label: 'Dose', icon: 'medkit-outline' },
                { key: 'meal', label: 'Meal', icon: 'restaurant-outline' },
                { key: 'workout', label: 'Workout', icon: 'barbell-outline' },
                { key: 'scan', label: 'Body comp scan', icon: 'scan-outline' },
                { key: 'lab', label: 'Lab result', icon: 'flask-outline' },
                { key: 'photo', label: 'Progress photo', icon: 'images-outline' },
                { key: 'checkin', label: 'Daily check-in', icon: 'heart-outline' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => handleAdd(opt.key)}
                style={styles.sheetRow}
                accessibilityRole="button"
                accessibilityLabel={`Add ${opt.label}`}
              >
                <Ionicons
                  name={opt.icon as TileIcon}
                  size={18}
                  color={t.colors.textPrimary as string}
                />
                <Text
                  style={[
                    styles.sheetRowText,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 4 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addTitle: { fontSize: 17 },
  addBody: { fontSize: 12, marginTop: 2 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: { marginTop: 10 },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tileIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { fontSize: 15 },
  tileStatus: { fontSize: 12, marginTop: 2 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  sheetRowText: {
    fontSize: 15,
  },
});
