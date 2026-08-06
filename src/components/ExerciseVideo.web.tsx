/**
 * ExerciseVideo — WEB build.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * No video has ever played in the web app, and this is why:
 * get-workout-video returns a Cloudflare Stream **HLS** URL
 * (`https://videodelivery.net/<signedJWT>/manifest/video.m3u8`), and the native
 * component hands it to expo-av. On web, expo-av's <Video> is a plain HTML5
 * <video> element, and **Chrome, Edge, Firefox and Android cannot play HLS
 * natively** — only Safari can. The project bundles no HLS library either
 * (0 hits for hls.js / m3u8 / canPlayType in the built bundle), so the element
 * silently loaded nothing. Native iOS/Android were always fine; the web build
 * never stood a chance.
 *
 * Rather than pull in a ~400KB HLS player, this uses Cloudflare Stream's own
 * signed iframe embed, which plays the same asset in every browser and is
 * maintained by Cloudflare. Metro resolves this file on web and leaves the
 * native player untouched.
 *
 * NOTE: the CSP in public/vercel.json needs `frame-src
 * https://iframe.videodelivery.net` for this to render.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { Colors, FontSizes, BorderRadius } from '../constants/theme';
import {
  fetchExerciseVideoUrl,
  getExerciseThumbnailUrl,
  hasExerciseVideo,
} from '../services/videoService';
import { toStreamIframeUrl } from '../utils/streamUrl';

interface ExerciseVideoProps {
  exerciseId: string;
  compact?: boolean;
}

export function ExerciseVideo({ exerciseId, compact = false }: ExerciseVideoProps) {
  const hasVideo = hasExerciseVideo(exerciseId);
  const thumbnailUrl = getExerciseThumbnailUrl(exerciseId);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');

  // Same placeholder as native: an explicit "coming soon" rather than a blank
  // gap, which testers read as "videos don't load".
  if (!hasVideo) {
    return (
      <GlassCard style={compact ? styles.compactCard : styles.card}>
        <View style={styles.placeholder}>
          <Ionicons name="videocam-outline" size={28} color={Colors.darkTextSecondary} />
          <Text style={styles.placeholderText}>Video coming soon</Text>
          <Text style={styles.subText}>Follow the form cues below for now.</Text>
        </View>
      </GlassCard>
    );
  }

  const handlePlay = async () => {
    setStatus('loading');
    try {
      const r = await fetchExerciseVideoUrl(exerciseId);
      if (!r?.videoUrl) {
        setStatus('error');
        return;
      }
      setResolvedUrl(r.videoUrl);
      setStatus('playing');
    } catch {
      setStatus('error');
    }
  };

  const iframeUrl = resolvedUrl ? toStreamIframeUrl(resolvedUrl) : null;

  return (
    <GlassCard style={compact ? styles.compactCard : styles.card}>
      <View style={styles.videoContainer}>
        {resolvedUrl ? (
          iframeUrl ? (
            // react-native-web renders real DOM, so a raw iframe is valid here.
            <iframe
              src={iframeUrl}
              style={{ border: 'none', width: '100%', height: '100%', borderRadius: 12 }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              title="Exercise demonstration"
            />
          ) : (
            // Not a Stream URL (an R2-signed mp4) — a plain video element is fine.
            <video
              src={resolvedUrl}
              controls
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', borderRadius: 12, background: '#000' }}
            />
          )
        ) : (
          <TouchableOpacity
            style={styles.poster}
            onPress={handlePlay}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Play exercise demonstration"
          >
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
            ) : null}
            <View style={styles.playOverlay}>
              {status === 'loading' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="play-circle" size={54} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>

      {status === 'error' && (
        <Text style={styles.errorText}>
          Couldn&apos;t load this video. Workout videos require PepTalk Pro.
        </Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  compactCard: { padding: 0, overflow: 'hidden' },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  poster: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  thumbnail: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 6 },
  placeholderText: { color: Colors.darkTextSecondary, fontSize: FontSizes.md },
  subText: { color: Colors.darkTextSecondary, fontSize: FontSizes.sm, opacity: 0.8 },
  errorText: {
    color: Colors.darkTextSecondary,
    fontSize: FontSizes.sm,
    padding: 10,
    textAlign: 'center',
  },
});
