import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { getVideoBySlug } from '../../../src/data/videos';
import { VideoCategory } from '../../../src/types';

// ── Helpers ──────────────────────────────────────────────────────

function getCategoryColor(category: VideoCategory): string {
  switch (category) {
    case 'success_stories': return '#b9cbb6';
    case 'how_to':          return '#e3a7a1';
    case 'research':        return '#c7d7e6';
    case 'education':       return '#f0d68a';
    default:                return '#6B7280';
  }
}

function getCategoryLabel(category: VideoCategory): string {
  switch (category) {
    case 'success_stories': return 'Success Stories';
    case 'how_to':          return 'How-To';
    case 'research':        return 'Research';
    case 'education':       return 'Education';
    default:                return category;
  }
}

// ── Component ────────────────────────────────────────────────────

export default function VideoPlayerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const video = getVideoBySlug(slug ?? '');

  if (!video) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.notFoundTitle}>Video Not Found</Text>
          <Text style={styles.notFoundSubtitle}>
            The requested video could not be found.
          </Text>
          <TouchableOpacity
            style={styles.backButtonPrimary}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonPrimaryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleOpenVideo = () => {
    Linking.openURL(video.videoUrl).catch(() => {
      Alert.alert('Error', 'Could not open the video link.');
    });
  };

  const categoryColor = getCategoryColor(video.category);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {/* Video Player Placeholder */}
        <TouchableOpacity
          style={styles.playerPlaceholder}
          onPress={handleOpenVideo}
          activeOpacity={0.8}
        >
          <View style={styles.playButtonOuter}>
            <View style={styles.playButtonInner}>
              <Ionicons name="play" size={32} color="#2D2D2D" />
            </View>
          </View>
          {video.duration && (
            <View style={styles.durationBadge}>
              <Ionicons name="time-outline" size={12} color="#2D2D2D" />
              <Text style={styles.durationText}>{video.duration}</Text>
            </View>
          )}
          <View style={styles.openInBrowserRow}>
            <Ionicons name="open-outline" size={14} color="#c7d7e6" />
            <Text style={styles.openInBrowserText}>Open in browser</Text>
          </View>
        </TouchableOpacity>

        {/* Category Badge */}
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: `${categoryColor}20` },
          ]}
        >
          <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
            {getCategoryLabel(video.category)}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{video.title}</Text>

        {/* Description */}
        <GlassCard style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>{video.description}</Text>
        </GlassCard>

        {/* Tags */}
        {video.tags.length > 0 && (
          <View style={styles.tagsSection}>
            <View style={styles.tagsSectionHeader}>
              <Ionicons name="pricetags-outline" size={14} color="#6B7280" />
              <Text style={styles.tagsSectionTitle}>Tags</Text>
            </View>
            <View style={styles.tagsRow}>
              {video.tags.map((tag, index) => (
                <View key={index} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Related Peptides */}
        {video.relatedPeptideIds && video.relatedPeptideIds.length > 0 && (
          <GlassCard style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Ionicons name="flask-outline" size={16} color="#b9cbb6" />
              <Text style={styles.relatedTitle}>Related Peptides</Text>
            </View>
            <View style={styles.pillsRow}>
              {video.relatedPeptideIds.map((id) => (
                <TouchableOpacity
                  key={id}
                  style={styles.peptidePill}
                  onPress={() => router.push(`/peptide/${id}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.peptidePillText}>{id}</Text>
                  <Ionicons name="chevron-forward" size={12} color="#b9cbb6" />
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Open in Browser Button */}
        <TouchableOpacity
          style={styles.openButton}
          onPress={handleOpenVideo}
          activeOpacity={0.8}
        >
          <Ionicons name="play-circle-outline" size={20} color="#2D2D2D" />
          <Text style={styles.openButtonText}>Watch Video</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },

  // ── Back Button ────────────────────────────────────────────
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D2D2D',
  },

  // ── Player Placeholder ─────────────────────────────────────
  playerPlaceholder: {
    height: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  playButtonOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  playButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(227, 167, 161, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  openInBrowserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openInBrowserText: {
    fontSize: 12,
    color: '#c7d7e6',
    fontWeight: '600',
  },

  // ── Category Badge ─────────────────────────────────────────
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Title ──────────────────────────────────────────────────
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: 16,
    lineHeight: 30,
  },

  // ── Description ────────────────────────────────────────────
  descriptionCard: {
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },

  // ── Tags ───────────────────────────────────────────────────
  tagsSection: {
    marginBottom: 16,
  },
  tagsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  tagsSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tagPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D2D2D',
  },

  // ── Related Peptides ───────────────────────────────────────
  relatedSection: {
    marginBottom: 16,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  relatedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  peptidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(185, 203, 182, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(185, 203, 182, 0.2)',
  },
  peptidePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b9cbb6',
  },

  // ── Open Button ────────────────────────────────────────────
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3a7a1',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── Not Found ──────────────────────────────────────────────
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
    marginTop: 16,
  },
  notFoundSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
  },
  backButtonPrimary: {
    backgroundColor: '#e3a7a1',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 20,
  },
  backButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
  },
});
