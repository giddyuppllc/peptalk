/**
 * LearnVideoCard — tappable poster + play button that opens a fullscreen
 * video player modal.
 *
 * Drops into any educational surface where the user might want to watch
 * a how-to clip. Uses `useLearnVideo(slug)` to fetch a signed R2 URL
 * from the get-learn-video edge function on first mount; the modal
 * mounts the actual <Video> only when the user taps play, so the
 * surface doesn't burn bandwidth on every screen view.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StatusBar,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useLearnVideo } from '../hooks/useLearnVideo';
import { useTheme } from '../hooks/useTheme';

interface Props {
  /** Slug from get-learn-video's manifest.json. */
  slug: string;
  /** Caption shown under the play button. */
  title: string;
  /** Optional subtitle (e.g. duration or quick description). */
  subtitle?: string;
  /** Gradient colors for the poster fallback (when no posterUrl yet). */
  gradientColors?: [string, string, ...string[]];
}

const { width: SCREEN_W } = Dimensions.get('window');

export function LearnVideoCard({
  slug,
  title,
  subtitle,
  gradientColors,
}: Props) {
  const t = useTheme();
  const { data, loading, error, refresh } = useLearnVideo(slug);
  const [open, setOpen] = useState(false);

  const fallbackGradient: [string, string, ...string[]] = gradientColors ?? [
    '#7FB3C2',
    '#3E7CB1',
  ];

  const handlePlay = () => {
    if (!data?.url) {
      // Fetch hasn't returned yet — kick a refresh and let the modal
      // wait. The modal renders a spinner while data is null.
      refresh();
    }
    setOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePlay}
        style={[styles.card, { borderColor: t.glassBorder }]}
        accessibilityRole="button"
        accessibilityLabel={`Play ${title} video`}
        accessibilityHint="Opens the video in fullscreen"
      >
        <LinearGradient
          colors={fallbackGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.poster}
        >
          <View style={styles.playButton}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
          <View style={styles.captionRow}>
            <Ionicons name="videocam" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.captionText}>Video</Text>
          </View>
        </LinearGradient>
        <View style={styles.meta}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
          {error ? (
            <Text style={[styles.errorText, { color: '#D43A3A' }]}>{error}</Text>
          ) : null}
        </View>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <StatusBar hidden />
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalDim}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close video"
            accessibilityRole="button"
          />
          <View style={styles.modalContent}>
            {data?.url ? (
              <Video
                source={{ uri: data.url }}
                style={styles.videoPlayer}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping={false}
              />
            ) : loading || !error ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.modalLoadingText}>Loading…</Text>
              </View>
            ) : (
              <View style={styles.modalLoading}>
                <Ionicons name="alert-circle-outline" size={32} color="#fff" />
                <Text style={styles.modalLoadingText}>{error}</Text>
                <TouchableOpacity
                  onPress={refresh}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading video"
                >
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={styles.modalClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 8,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  poster: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  captionRow: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  captionText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  meta: {
    padding: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 11,
    marginTop: 6,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayer: {
    width: SCREEN_W,
    aspectRatio: 16 / 9,
  },
  modalLoading: {
    alignItems: 'center',
    gap: 12,
  },
  modalLoadingText: {
    color: '#fff',
    fontSize: 14,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
