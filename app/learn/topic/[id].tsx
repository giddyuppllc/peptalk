import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { GradientButton } from '../../../src/components/GradientButton';
import { getTopicById } from '../../../src/data/knowledgeTopics';
import { getGuideById } from '../../../src/data/howToGuides';
import { getArticleById } from '../../../src/data/educationalArticles';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
} from '../../../src/constants/theme';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Accordion Item ──────────────────────────────────────────────────────────

function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
  accentColor,
  index,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
  index: number;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onToggle}
      style={[
        styles.accordionItem,
        isOpen && { borderColor: `${accentColor}40` },
      ]}
    >
      <View style={styles.accordionHeader}>
        <View style={styles.accordionNumberWrap}>
          <Text
            style={[
              styles.accordionNumber,
              isOpen && { color: accentColor },
            ]}
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
        </View>
        <Text
          style={[styles.questionText, isOpen && { color: accentColor }]}
        >
          {question}
        </Text>
        <View
          style={[
            styles.accordionChevron,
            isOpen && { backgroundColor: `${accentColor}20` },
          ]}
        >
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={isOpen ? accentColor : Colors.darkTextSecondary}
          />
        </View>
      </View>
      {isOpen && (
        <View style={styles.answerContainer}>
          <View
            style={[styles.answerBar, { backgroundColor: accentColor }]}
          />
          <Text style={styles.answerText}>{answer}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function TopicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const topic = getTopicById(id as any);

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleSection = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleAskPepTalk = useCallback(() => {
    router.push({
      pathname: '/(tabs)/peptalk',
      params: { prefill: topic?.botPrompt ?? '' },
    });
  }, [router, topic]);

  // ── Not Found ───────────────────────────────────────────
  if (!topic) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={Colors.darkTextSecondary}
          />
          <Text style={styles.errorText}>Topic not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Resolve related content
  const relatedGuides = (topic.relatedGuideIds ?? [])
    .map((gid) => getGuideById(gid))
    .filter(Boolean);
  const relatedArticles = (topic.relatedArticleIds ?? [])
    .map((aid) => getArticleById(aid))
    .filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {topic.title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Section ──────────────────────────────────────── */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: `${topic.color}20` },
            ]}
          >
            <Ionicons
              name={topic.icon as any}
              size={36}
              color={topic.color}
            />
          </View>
          <Text style={styles.heroTitle}>{topic.title}</Text>
          <Text style={styles.heroSubtitle}>{topic.subtitle}</Text>
          <View style={styles.heroMeta}>
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: `${topic.color}18` },
              ]}
            >
              <Ionicons
                name="help-circle-outline"
                size={14}
                color={topic.color}
              />
              <Text style={[styles.heroBadgeText, { color: topic.color }]}>
                {topic.sections.length} Questions & Answers
              </Text>
            </View>
          </View>
        </View>

        {/* ── FAQ Accordion ─────────────────────────────────────── */}
        <View style={styles.faqSection}>
          <View style={styles.faqHeader}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={topic.color}
            />
            <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
          </View>
          <View style={styles.accordionContainer}>
            {topic.sections.map((section, index) => (
              <AccordionItem
                key={index}
                question={section.question}
                answer={section.answer}
                isOpen={openIndex === index}
                onToggle={() => toggleSection(index)}
                accentColor={topic.color}
                index={index}
              />
            ))}
          </View>
        </View>

        {/* ── Related Guides ────────────────────────────────────── */}
        {relatedGuides.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Ionicons
                name="footsteps-outline"
                size={16}
                color={Colors.sage}
              />
              <Text style={styles.relatedTitle}>Related Guides</Text>
            </View>
            {relatedGuides.map((guide) => (
              <TouchableOpacity
                key={guide!.id}
                style={styles.relatedItem}
                activeOpacity={0.7}
                onPress={() =>
                  router.push(`/learn/guides/${guide!.slug}`)
                }
              >
                <View style={styles.relatedItemIcon}>
                  <Ionicons
                    name="footsteps-outline"
                    size={16}
                    color={Colors.sage}
                  />
                </View>
                <View style={styles.relatedItemContent}>
                  <Text style={styles.relatedItemText}>
                    {guide!.title}
                  </Text>
                  <Text style={styles.relatedItemMeta}>
                    {guide!.steps.length} steps
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={Colors.darkTextSecondary}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Related Articles ──────────────────────────────────── */}
        {relatedArticles.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={Colors.rose}
              />
              <Text style={styles.relatedTitle}>Related Articles</Text>
            </View>
            {relatedArticles.map((article) => (
              <TouchableOpacity
                key={article!.id}
                style={styles.relatedItem}
                activeOpacity={0.7}
                onPress={() =>
                  router.push(`/learn/article/${article!.slug}`)
                }
              >
                <View
                  style={[
                    styles.relatedItemIcon,
                    { backgroundColor: `${Colors.rose}15` },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={Colors.rose}
                  />
                </View>
                <View style={styles.relatedItemContent}>
                  <Text style={styles.relatedItemText}>
                    {article!.title}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={Colors.darkTextSecondary}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Ask PepTalk CTA ───────────────────────────────────── */}
        <View style={styles.askSection}>
          <GlassCard
            variant="glow"
            glowColor={topic.color}
            style={styles.askCard}
          >
            <View style={styles.askCardContent}>
              <View
                style={[
                  styles.askIconWrap,
                  { backgroundColor: `${topic.color}20` },
                ]}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={24}
                  color={topic.color}
                />
              </View>
              <Text style={styles.askCardTitle}>
                Want to learn more about {topic.title.toLowerCase()}?
              </Text>
              <Text style={styles.askCardSubtitle}>
                Get personalized answers from PepTalk AI -- ask anything.
              </Text>
            </View>
            <GradientButton
              label={`Ask about ${topic.title}`}
              onPress={handleAskPepTalk}
              colors={[Colors.pepBlue, Colors.pepTeal]}
              style={styles.askGradientBtn}
            />
          </GlassCard>
        </View>

        {/* ── Back to Learn ─────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.backToLearn}
          activeOpacity={0.7}
          onPress={() => router.push('/learn')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="arrow-back"
            size={16}
            color={Colors.darkTextSecondary}
          />
          <Text style={styles.backToLearnText}>Back to Learn Hub</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerBack: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.bone,
    flex: 1,
    textAlign: 'center',
  },

  // ── Scroll ────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md + 4,
    paddingBottom: 40,
  },

  // ── Hero ──────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: FontSizes.xl + 2,
    fontWeight: '800',
    color: Colors.bone,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
  },
  heroMeta: {
    marginTop: Spacing.md,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  heroBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },

  // ── FAQ Section ───────────────────────────────────────────
  faqSection: {
    marginBottom: Spacing.lg,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  faqTitle: {
    fontSize: FontSizes.lg - 1,
    fontWeight: '700',
    color: Colors.darkText,
  },

  // ── Accordion ─────────────────────────────────────────────
  accordionContainer: {
    gap: 10,
  },
  accordionItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
    padding: Spacing.md,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  accordionNumberWrap: {
    width: 28,
    alignItems: 'center',
  },
  accordionNumber: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
  },
  questionText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
    flex: 1,
    lineHeight: 21,
  },
  accordionChevron: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerContainer: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: Spacing.md,
  },
  answerBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 20,
  },
  answerText: {
    fontSize: FontSizes.md - 1,
    color: '#bdc3ca',
    lineHeight: 23,
    flex: 1,
  },

  // ── Related Content ───────────────────────────────────────
  relatedSection: {
    marginBottom: Spacing.lg,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  relatedTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: BorderRadius.md,
    marginBottom: 6,
  },
  relatedItemIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(185, 203, 182, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedItemContent: {
    flex: 1,
  },
  relatedItemText: {
    fontSize: FontSizes.md,
    color: Colors.darkText,
    fontWeight: '500',
  },
  relatedItemMeta: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // ── Ask PepTalk CTA ──────────────────────────────────────
  askSection: {
    marginBottom: Spacing.lg,
  },
  askCard: {
    padding: Spacing.lg,
  },
  askCardContent: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  askIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  askCardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  askCardSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  askGradientBtn: {
    marginTop: Spacing.sm,
  },

  // ── Back to Learn ─────────────────────────────────────────
  backToLearn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  backToLearnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },

  // ── Error ─────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: 40,
  },
  errorText: {
    fontSize: FontSizes.lg,
    color: Colors.darkTextSecondary,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  backButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.rose,
  },
});
