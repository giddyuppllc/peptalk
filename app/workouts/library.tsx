/**
 * Workout Video Library — Pro tier feature.
 *
 * Lists every reviewed (tagged) video from the manifest, grouped by
 * Jamie's categories. Tap a card → /workouts/library/[slug] plays it.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  WORKOUT_VIDEOS,
  type WorkoutVideoCategory,
} from '../../src/data/workoutVideos';
import { useVideoTaggerStore, applyEdits } from '../../src/store/useVideoTaggerStore';
import EXERCISES from '../../src/data/exercises';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { useFeatureGate } from '../../src/hooks/useFeatureGate';
import { selectionTick } from '../../src/utils/haptics';

export default function WorkoutLibraryScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent('workouts');
  const hasAccess = useFeatureGate('workout_videos');
  const edits = useVideoTaggerStore((s) => s.edits);

  const merged = useMemo(() => applyEdits(WORKOUT_VIDEOS, edits), [edits]);
  const ready = useMemo(() => merged.filter((v) => !v.needsReview && v.exerciseId), [merged]);

  const [filter, setFilter] = useState<WorkoutVideoCategory | null>(null);
  const visibleCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => ready.some((v) => v.category === c)),
    [ready]
  );
  const visible = useMemo(
    () => (filter ? ready.filter((v) => v.category === filter) : ready),
    [ready, filter]
  );

  // Pro gate — render upsell instead of the library for non-Pro users.
  if (!hasAccess) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]}>
        <Header onBack={() => router.back()} accent={accent} title="Workout Videos" t={t} />
        <View style={s.lockedWrap}>
          <View style={[s.lockedIcon, { backgroundColor: `${accent.deep}1a` }]}>
            <Ionicons name="lock-closed" size={28} color={accent.deep} />
          </View>
          <Text style={[s.lockedTitle, { color: t.text }]}>Pro feature</Text>
          <Text style={[s.lockedBody, { color: t.textSecondary }]}>
            Jamie's full video library is part of PepTalk Pro. Upgrade to unlock {WORKOUT_VIDEOS.length} guided workouts.
          </Text>
          <TouchableOpacity
            style={[s.upgradeBtn, { backgroundColor: accent.deep }]}
            onPress={() => router.push('/subscription')}
          >
            <Text style={s.upgradeBtnText}>See plans</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state — no tagged videos yet.
  if (ready.length === 0) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]}>
        <Header onBack={() => router.back()} accent={accent} title="Workout Videos" t={t} />
        <View style={s.emptyWrap}>
          <Ionicons name="videocam-outline" size={48} color={t.textSecondary} />
          <Text style={[s.emptyTitle, { color: t.text }]}>Library coming soon</Text>
          <Text style={[s.emptyBody, { color: t.textSecondary }]}>
            Jamie is in the studio. Check back soon.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      <Header onBack={() => router.back()} accent={accent} title="Workout Library" t={t} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero */}
        <LinearGradient
          colors={[`${accent.deep}30`, `${accent.pastel}10`, t.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={s.hero}
        >
          <Text style={[s.heroEyebrow, { color: accent.deep }]}>By Jamie Esposito</Text>
          <Text style={[s.heroTitle, { color: t.text }]}>Train with the form Jamie shoots in studio.</Text>
          <Text style={[s.heroBody, { color: t.textSecondary }]}>
            {ready.length} guided clip{ready.length === 1 ? '' : 's'} across {visibleCategories.length} categor{visibleCategories.length === 1 ? 'y' : 'ies'}.
          </Text>
        </LinearGradient>

        {/* Category filter */}
        {visibleCategories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 8, paddingBottom: 4 }}
          >
            <CategoryChip label="All" selected={filter === null} accent={accent} t={t} onPress={() => { selectionTick(); setFilter(null); }} />
            {visibleCategories.map((c) => (
              <CategoryChip
                key={c}
                label={CATEGORY_LABELS[c]}
                selected={filter === c}
                accent={accent}
                t={t}
                onPress={() => { selectionTick(); setFilter(c); }}
              />
            ))}
          </ScrollView>
        )}

        {/* Cards */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
          {visible.map((v) => {
            const exercise = v.exerciseId ? EXERCISES.find((e) => e.id === v.exerciseId) : null;
            return (
              <Pressable
                key={v.slug}
                onPress={() => router.push(`/workouts/library/${v.slug}` as any)}
                style={({ pressed }) => [
                  s.card,
                  { backgroundColor: t.surface, borderColor: t.cardBorder, transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <View style={[s.cardThumb, { backgroundColor: `${accent.deep}1a` }]}>
                  <Ionicons name="play-circle" size={36} color={accent.deep} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: t.text }]} numberOfLines={2}>{v.title}</Text>
                  {exercise && (
                    <Text style={[s.cardMeta, { color: t.textSecondary }]} numberOfLines={1}>
                      {exercise.name}
                    </Text>
                  )}
                  {v.category && (
                    <View style={[s.cardCat, { backgroundColor: `${accent.deep}14` }]}>
                      <Text style={[s.cardCatText, { color: accent.deep }]}>
                        {CATEGORY_LABELS[v.category]}
                      </Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, accent, title, t }: { onBack: () => void; accent: any; title: string; t: any }) {
  return (
    <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
      <TouchableOpacity onPress={onBack} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={t.text} />
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: t.text }]}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function CategoryChip({ label, selected, accent, t, onPress }: { label: string; selected: boolean; accent: any; t: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.chip,
        { backgroundColor: selected ? accent.deep : t.surface, borderColor: selected ? accent.deep : t.cardBorder },
      ]}
    >
      <Text style={[s.chipText, { color: selected ? '#fff' : t.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  hero: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  heroEyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { fontSize: 24, fontWeight: '700', marginTop: 6, lineHeight: 30 },
  heroBody: { fontSize: 13, marginTop: 8 },

  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardThumb: { width: 84, height: 84, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardMeta: { fontSize: 12, marginTop: 4 },
  cardCat: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardCatText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyBody: { fontSize: 13, textAlign: 'center', marginTop: 6 },

  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  lockedIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 22, fontWeight: '700', marginTop: 18 },
  lockedBody: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999 },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
