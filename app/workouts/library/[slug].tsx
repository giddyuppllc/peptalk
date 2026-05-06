/**
 * Workout video player — fetches signed URL via the Pro-gated resolver
 * and plays the video full-width.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_LABELS, getVideoBySlug } from '../../../src/data/workoutVideos';
import { useVideoTaggerStore, applyEdits } from '../../../src/store/useVideoTaggerStore';
import { resolveVideoUrl } from '../../../src/services/r2VideoResolver';
import EXERCISES from '../../../src/data/exercises';
import { useTheme } from '../../../src/hooks/useTheme';
import { useSectionAccent } from '../../../src/hooks/useSectionAccent';

export default function LibraryPlayerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent('workouts');
  const edits = useVideoTaggerStore((s) => s.edits);

  const baseVideo = getVideoBySlug(slug ?? '');
  const video = baseVideo ? { ...baseVideo, ...(edits[baseVideo.slug] ?? {}) } : null;
  const exercise = video?.exerciseId ? EXERCISES.find((e) => e.id === video.exerciseId) : null;

  const [url, setUrl] = useState<string | null>(null);
  const [captionUrl, setCaptionUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    setUrl(null);
    setCaptionUrl(null);
    setError(null);
    resolveVideoUrl(video.slug).then((res) => {
      if (res.ok) {
        setUrl(res.url);
        setCaptionUrl(res.captionUrl ?? null);
      } else {
        setError(
          res.reason === 'not_pro'
            ? 'Workout videos require PepTalk Pro.'
            : res.reason === 'not_signed_in'
              ? 'Sign in to play workout videos.'
              : res.reason === 'not_found'
                ? 'This video is no longer available.'
                : 'Network error — try again.'
        );
      }
    });
  }, [video?.slug]);

  if (!video) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={s.errorWrap}>
          <Ionicons name="alert-circle-outline" size={48} color={t.textSecondary} />
          <Text style={[s.errorTitle, { color: t.text }]}>Video not found</Text>
          <TouchableOpacity onPress={() => router.replace('/workouts/library')} style={[s.backBtn, { backgroundColor: accent.deep }]}>
            <Text style={s.backBtnText}>Back to library</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <View style={[s.header, { borderBottomColor: t.cardBorder }]}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/workouts/library'); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]} numberOfLines={1}>
          {video.title}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={[s.videoFrame, { backgroundColor: '#000' }]}>
        {!url && !error && (
          <View style={s.overlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {error && (
          <View style={s.overlay}>
            <Ionicons name="alert-circle-outline" size={28} color="#fff" />
            <Text style={s.overlayText}>{error}</Text>
          </View>
        )}
        {url && (
          <Video
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
          />
        )}
        {captionUrl && (
          <View style={s.ccBadge}>
            <Ionicons name="text" size={12} color="#fff" />
            <Text style={s.ccBadgeText}>CC</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Text style={[s.title, { color: t.text }]}>{video.title}</Text>
        {exercise && (
          <View style={s.metaRow}>
            <View style={[s.metaPill, { backgroundColor: `${accent.deep}1a` }]}>
              <Ionicons name="barbell-outline" size={13} color={accent.deep} />
              <Text style={[s.metaPillText, { color: accent.deep }]}>{exercise.name}</Text>
            </View>
            {video.category && (
              <View style={[s.metaPill, { backgroundColor: `${accent.deep}1a` }]}>
                <Text style={[s.metaPillText, { color: accent.deep }]}>{CATEGORY_LABELS[video.category]}</Text>
              </View>
            )}
          </View>
        )}
        {video.description && (
          <Text style={[s.body, { color: t.textSecondary }]}>{video.description}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'center', marginHorizontal: 12 },
  videoFrame: { width: '100%', aspectRatio: 16 / 9 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  overlayText: { color: '#fff', fontSize: 13, marginTop: 8, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  metaPillText: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 21 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  backBtn: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  backBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ccBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  ccBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
