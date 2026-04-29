/**
 * Video Tagger — admin-only screen for Jamie.
 *
 * Walks through every untagged video in the manifest. For each one:
 *   1. Plays the video (uses the same Pro-gated resolver; admin emails
 *      bypass the gate via ALLOW_TAGGER_FREE on the edge function).
 *   2. Lets the user pick an exercise from the 289-exercise library
 *      (search-as-you-type) and a category.
 *   3. Saves to local edits store on "Save & Next" — advances to the
 *      next untagged video automatically.
 *
 * Edits accumulate in AsyncStorage. When Jamie's done a session, Edward
 * taps "Export updated manifest" — copies the merged JSON to the
 * clipboard so he can paste it into src/data/workoutVideos.json on the
 * next release. (One-line migration to a Supabase overrides table later.)
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {
  WORKOUT_VIDEOS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type WorkoutVideoCategory,
} from '../../src/data/workoutVideos';
import { useVideoTaggerStore, applyEdits } from '../../src/store/useVideoTaggerStore';
import { resolveVideoUrl } from '../../src/services/r2VideoResolver';
import EXERCISES from '../../src/data/exercises';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { selectionTick, notifySuccess as successTick } from '../../src/utils/haptics';
import { useAuthStore } from '../../src/store/useAuthStore';

// Mirrors ALLOW_TAGGER_FREE / ADMIN_EMAILS on the get-workout-video edge
// function. The server still enforces — this is just to stop the screen
// from rendering the manifest of every R2 object key to a curious user
// who deep-links here. Kept lowercase for case-insensitive comparison.
const TAGGER_ADMIN_EMAILS = new Set(['edward@giddyupp.com']);

export default function VideoTaggerScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent('workouts');
  const userEmail = useAuthStore((s) => s.user?.email?.toLowerCase() ?? '');
  const isAdmin = TAGGER_ADMIN_EMAILS.has(userEmail);

  // Email guard — production users get bounced. Server still refuses to sign
  // URLs without ALLOW_TAGGER_FREE+ADMIN_EMAILS, but we don't want to leak
  // the manifest UI either. Effect runs unconditionally to keep hook order
  // stable across renders (rules of hooks).
  React.useEffect(() => {
    if (!isAdmin) router.replace('/(tabs)');
  }, [isAdmin, router]);

  const edits = useVideoTaggerStore((s) => s.edits);
  const setEdit = useVideoTaggerStore((s) => s.setEdit);
  const resetAll = useVideoTaggerStore((s) => s.resetAll);

  // Apply edits to the static manifest, then queue up videos still flagged needsReview.
  const merged = useMemo(() => applyEdits(WORKOUT_VIDEOS, edits), [edits]);
  const queue = useMemo(() => merged.filter((v) => v.needsReview), [merged]);
  const taggedCount = WORKOUT_VIDEOS.length - queue.length;

  const [index, setIndex] = useState(0);
  const current = queue[index];

  const [title, setTitle] = useState(current?.title ?? '');
  const [exerciseId, setExerciseId] = useState<string | null>(current?.exerciseId ?? null);
  const [category, setCategory] = useState<WorkoutVideoCategory | null>(current?.category ?? null);
  const [search, setSearch] = useState('');

  // Video URL resolution
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const videoRef = useRef<Video>(null);

  // Reset form when current video changes
  React.useEffect(() => {
    if (!current) return;
    setTitle(current.title);
    setExerciseId(current.exerciseId);
    setCategory(current.category);
    setSearch('');
    setVideoUrl(null);
    setResolveError(null);
    setResolvingUrl(true);
    resolveVideoUrl(current.slug).then((res) => {
      setResolvingUrl(false);
      if (res.ok) setVideoUrl(res.url);
      else setResolveError(
        res.reason === 'not_pro'
          ? 'Set ALLOW_TAGGER_FREE=true and ADMIN_EMAILS in the edge function secrets to preview.'
          : res.reason === 'not_signed_in'
            ? 'Sign in to preview videos.'
            : res.reason === 'not_found'
              ? 'Video not found in bucket.'
              : 'Network error — try again.'
      );
    });
  }, [current?.slug]);

  const filteredExercises = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return EXERCISES.slice(0, 60);
    const norm = (s: string) => s.toLowerCase().replace(/[-\s]/g, '');
    const nq = norm(q);
    return EXERCISES.filter((e) => norm(e.name).includes(nq) || norm(e.id).includes(nq)).slice(0, 60);
  }, [search]);

  const selectedExercise = exerciseId ? EXERCISES.find((e) => e.id === exerciseId) : null;

  const handleSaveNext = () => {
    if (!current) return;
    successTick();
    setEdit(current.slug, {
      title: title.trim() || current.title,
      exerciseId,
      category,
      needsReview: false,
    });
    // Don't increment index — the queue shrinks because needsReview becomes false.
    setIndex(0);
  };

  const handleSkip = () => {
    if (!current) return;
    selectionTick();
    if (index + 1 < queue.length) setIndex(index + 1);
    else setIndex(0);
  };

  const handleExport = async () => {
    const exported = WORKOUT_VIDEOS.map((v) => ({
      ...v,
      ...(edits[v.slug] ?? {}),
    }));
    const json = JSON.stringify(exported, null, 2);
    await Clipboard.setStringAsync(json);
    Alert.alert(
      'Manifest copied',
      `${exported.length} entries on the clipboard. Paste into src/data/workoutVideos.json and commit. Then run "Reset edits" to clear the local store.`,
    );
  };

  // ── Non-admin bail (effect above triggers the redirect) ──
  if (!isAdmin) return null;

  // ── Empty state ────────────────────────────────────────────────
  if (queue.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-circle" size={64} color={accent.deep} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>All done!</Text>
          <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
            Every video has been tagged. Tap export to copy the updated manifest.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accent.deep }]}
            onPress={handleExport}
          >
            <Ionicons name="copy-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Export updated manifest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Reset edits?', 'This clears your local tagging session. Use only after exporting.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => resetAll() },
            ])}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>Reset local edits</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Tagger ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Tag Videos</Text>
          <Text style={[styles.headerSub, { color: t.textSecondary }]}>
            {taggedCount} / {WORKOUT_VIDEOS.length} tagged
          </Text>
        </View>
        <TouchableOpacity onPress={handleExport} hitSlop={12}>
          <Ionicons name="cloud-upload-outline" size={22} color={accent.deep} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Video preview */}
        <View style={[styles.videoFrame, { backgroundColor: '#000' }]}>
          {resolvingUrl && (
            <View style={styles.videoOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          {resolveError && (
            <View style={styles.videoOverlay}>
              <Ionicons name="alert-circle-outline" size={28} color="#fff" />
              <Text style={styles.videoOverlayText}>{resolveError}</Text>
            </View>
          )}
          {videoUrl && (
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay={false}
            />
          )}
        </View>

        {/* Filename pill */}
        <View style={styles.filenameRow}>
          <View style={[styles.pill, { backgroundColor: `${accent.deep}1a` }]}>
            <Text style={[styles.pillText, { color: accent.deep }]} numberOfLines={1}>
              {current.objectKey}
            </Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: t.textSecondary }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Barbell Back Squat — 3 angles"
            placeholderTextColor={t.placeholder}
            style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.cardBorder }]}
          />
        </View>

        {/* Exercise picker */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: t.textSecondary }]}>
            Match to exercise {selectedExercise && '✓'}
          </Text>
          {selectedExercise && (
            <View style={[styles.selectedExercise, { backgroundColor: `${accent.deep}14`, borderColor: `${accent.deep}40` }]}>
              <Text style={[styles.selectedExerciseText, { color: accent.deep }]}>
                {selectedExercise.name}
              </Text>
              <TouchableOpacity onPress={() => setExerciseId(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={accent.deep} />
              </TouchableOpacity>
            </View>
          )}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search 289 exercises…"
            placeholderTextColor={t.placeholder}
            style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.cardBorder }]}
          />
          <View style={styles.exerciseList}>
            {filteredExercises.map((e) => {
              const selected = exerciseId === e.id;
              return (
                <TouchableOpacity
                  key={e.id}
                  onPress={() => { selectionTick(); setExerciseId(e.id); }}
                  style={[
                    styles.exerciseRow,
                    { borderBottomColor: t.cardBorder },
                    selected && { backgroundColor: `${accent.deep}10` },
                  ]}
                >
                  <Text style={[styles.exerciseName, { color: t.text }]} numberOfLines={1}>{e.name}</Text>
                  {e.primaryMuscle && (
                    <Text style={[styles.exerciseMuscle, { color: t.textSecondary }]}>{e.primaryMuscle}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Category */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: t.textSecondary }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {CATEGORY_ORDER.map((c) => {
              const selected = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => { selectionTick(); setCategory(selected ? null : c); }}
                  style={[
                    styles.catChip,
                    { backgroundColor: selected ? accent.deep : t.surface, borderColor: selected ? accent.deep : t.cardBorder },
                  ]}
                >
                  <Text style={[styles.catChipText, { color: selected ? '#fff' : t.text }]}>
                    {CATEGORY_LABELS[c]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
        <TouchableOpacity onPress={handleSkip} style={[styles.skipBtn, { backgroundColor: t.surface }]}>
          <Text style={[styles.skipBtnText, { color: t.text }]}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSaveNext}
          disabled={!exerciseId}
          style={[
            styles.saveBtn,
            { backgroundColor: accent.deep, opacity: exerciseId ? 1 : 0.4 },
          ]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save &amp; Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 11, marginTop: 2 },

  videoFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  videoOverlayText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },

  filenameRow: { paddingHorizontal: 16, paddingTop: 14 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillText: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 11 },

  formGroup: { paddingTop: 18, paddingHorizontal: 16 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },

  selectedExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  selectedExerciseText: { fontSize: 14, fontWeight: '600' },

  exerciseList: { marginTop: 10, maxHeight: 240 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseName: { fontSize: 14, flex: 1 },
  exerciseMuscle: { fontSize: 11, marginLeft: 8 },

  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontWeight: '600' },

  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  skipBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  emptyBody: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
