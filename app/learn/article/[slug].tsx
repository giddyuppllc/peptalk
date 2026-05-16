import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { getArticleBySlug } from '../../../src/data/educationalArticles';
import { useAchievementStore } from '../../../src/store/useAchievementStore';
import { ArticleCategory } from '../../../src/types';

// ── Helpers ──────────────────────────────────────────────────────

function getCategoryColor(category: ArticleCategory): string {
  switch (category) {
    case 'fundamentals': return '#b9cbb6';
    case 'safety':       return '#e3a7a1';
    case 'production':   return '#c7d7e6';
    case 'testing':      return '#f0d68a';
    case 'regulation':   return '#F4ECC2';
    case 'delivery':     return '#06b6d4';
    default:             return '#6B7280';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────

export default function ArticleDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const article = getArticleBySlug(slug ?? '');
  const tracked = useRef(false);
  const trackArticleRead = useAchievementStore((s) => s.trackArticleRead);

  useEffect(() => {
    if (article && !tracked.current) {
      tracked.current = true;
      trackArticleRead();
    }
  }, [article, trackArticleRead]);

  if (!article) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.notFoundTitle}>Article Not Found</Text>
          <Text style={styles.notFoundSubtitle}>
            The requested article could not be found.
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

  const handleOpenUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open the link.');
    });
  };

  const categoryColor = getCategoryColor(article.category);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button — falls back to the Learn index when there's no nav
            stack (deep link or push notification cold-start), otherwise the
            tap is a no-op and looks like a frozen screen. */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/learn');
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {/* Hero Image */}
        {article.imageUrl && (
          <Image
            source={{ uri: article.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        )}

        {/* Category Badge */}
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: `${categoryColor}20` },
          ]}
        >
          <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
            {article.category}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{article.title}</Text>

        {/* Summary */}
        <Text style={styles.summary}>{article.summary}</Text>

        {/* Sections */}
        {article.sections.map((section, index) => (
          <GlassCard key={index} style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </GlassCard>
        ))}

        {/* Related Peptides */}
        {article.relatedPeptideIds && article.relatedPeptideIds.length > 0 && (
          <GlassCard style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Ionicons name="flask-outline" size={16} color="#b9cbb6" />
              <Text style={styles.relatedTitle}>Related Peptides</Text>
            </View>
            <View style={styles.pillsRow}>
              {article.relatedPeptideIds.map((id) => (
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

        {/* Citations */}
        {article.citations.length > 0 && (
          <GlassCard style={styles.citationsSection}>
            <View style={styles.relatedHeader}>
              <Ionicons name="bookmark-outline" size={16} color="#c7d7e6" />
              <Text style={styles.relatedTitle}>Citations</Text>
            </View>
            {article.citations.map((citation, index) => (
              <View key={index} style={styles.citationRow}>
                <Text style={styles.citationNumber}>{index + 1}.</Text>
                <View style={styles.citationContent}>
                  <Text style={styles.citationText}>{citation.text}</Text>
                  {citation.url && (
                    <TouchableOpacity
                      onPress={() => handleOpenUrl(citation.url!)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.citationLink}>{citation.url}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </GlassCard>
        )}

        {/* Last Updated */}
        <View style={styles.updatedRow}>
          <Ionicons name="time-outline" size={14} color="#6B7280" />
          <Text style={styles.updatedText}>
            Last updated {formatDate(article.lastUpdated)}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0EEE9',
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

  // ── Hero Image ───────────────────────────────────────────────
  heroImage: {
    width: '100%' as const,
    height: 200,
    borderRadius: 16,
    marginBottom: 16,
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
    textTransform: 'capitalize',
  },

  // ── Title & Summary ────────────────────────────────────────
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: 10,
    lineHeight: 32,
  },
  summary: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 24,
  },

  // ── Section Cards ──────────────────────────────────────────
  sectionCard: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },

  // ── Related Peptides ───────────────────────────────────────
  relatedSection: {
    marginBottom: 14,
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

  // ── Citations ──────────────────────────────────────────────
  citationsSection: {
    marginBottom: 14,
  },
  citationRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  citationNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    minWidth: 20,
  },
  citationContent: {
    flex: 1,
  },
  citationText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  citationLink: {
    fontSize: 12,
    color: '#c7d7e6',
    textDecorationLine: 'underline',
    marginTop: 4,
  },

  // ── Last Updated ───────────────────────────────────────────
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 12,
  },
  updatedText: {
    fontSize: 12,
    color: '#6B7280',
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
