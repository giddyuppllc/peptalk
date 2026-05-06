import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { getGuideBySlug } from '../../../src/data/howToGuides';
import { GuideCategory } from '../../../src/types';

// ── Helpers ──────────────────────────────────────────────────────

function getCategoryColor(category: GuideCategory): string {
  switch (category) {
    case 'reconstitution': return '#b9cbb6';
    case 'injection':      return '#e3a7a1';
    case 'storage':        return '#c7d7e6';
    case 'dosing':         return '#f0d68a';
    case 'testing':        return '#F4ECC2';
    case 'general':        return '#6B7280';
    default:               return '#6B7280';
  }
}

// ── Component ────────────────────────────────────────────────────

export default function GuideDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const guide = getGuideBySlug(slug ?? '');

  const toggleStep = (stepNumber: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) next.delete(stepNumber);
      else next.add(stepNumber);
      return next;
    });
  };

  if (!guide) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.notFoundTitle}>Guide Not Found</Text>
          <Text style={styles.notFoundSubtitle}>
            The requested guide could not be found.
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

  const categoryColor = getCategoryColor(guide.category);

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
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {/* Category Badge */}
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: `${categoryColor}20` },
          ]}
        >
          <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
            {guide.category}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{guide.title}</Text>
        <Text style={styles.summary}>{guide.summary}</Text>

        {/* Progress Indicator */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <View style={styles.stepOverview}>
              <Ionicons name="footsteps-outline" size={16} color="#b9cbb6" />
              <Text style={styles.stepOverviewText}>
                {completedSteps.size} of {guide.steps.length} steps
              </Text>
            </View>
            <Text style={styles.progressPercent}>
              {Math.round((completedSteps.size / guide.steps.length) * 100)}%
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.round((completedSteps.size / guide.steps.length) * 100)}%` as any,
                  backgroundColor: categoryColor,
                },
              ]}
            />
          </View>
        </View>

        {/* Steps */}
        {guide.steps.map((step, index) => {
          const isDone = completedSteps.has(step.stepNumber);
          return (
            <View key={step.stepNumber} style={styles.stepRow}>
              {/* Step Number Circle — tap to mark complete */}
              <View style={styles.stepNumberContainer}>
                <TouchableOpacity
                  onPress={() => toggleStep(step.stepNumber)}
                  activeOpacity={0.7}
                  style={[
                    styles.stepNumberCircle,
                    isDone && {
                      backgroundColor: `${categoryColor}40`,
                      borderColor: categoryColor,
                    },
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={16} color={categoryColor} />
                  ) : (
                    <Text style={styles.stepNumberText}>{step.stepNumber}</Text>
                  )}
                </TouchableOpacity>
                {index < guide.steps.length - 1 && (
                  <View
                    style={[
                      styles.stepConnector,
                      isDone && { backgroundColor: `${categoryColor}50` },
                    ]}
                  />
                )}
              </View>

              {/* Step Content */}
              <GlassCard style={styles.stepCard}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepContent}>{step.content}</Text>
              </GlassCard>
            </View>
          );
        })}

        {/* Safety Warnings */}
        {guide.warnings && guide.warnings.length > 0 && (
          <View style={styles.warningBox}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={20} color="#F4ECC2" />
              <Text style={styles.warningTitle}>Safety Warnings</Text>
            </View>
            {guide.warnings.map((warning, index) => (
              <View key={index} style={styles.warningRow}>
                <Text style={styles.warningBullet}>!</Text>
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Related Peptides */}
        {guide.relatedPeptideIds && guide.relatedPeptideIds.length > 0 && (
          <GlassCard style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Ionicons name="flask-outline" size={16} color="#b9cbb6" />
              <Text style={styles.relatedTitle}>Related Peptides</Text>
            </View>
            <View style={styles.pillsRow}>
              {guide.relatedPeptideIds.map((id) => (
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

        {/* Disclaimer Footer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.disclaimerText}>
            This guide is for educational purposes only and does not constitute medical advice.
            Always consult with a qualified healthcare provider before using any peptide.
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
    fontSize: 24,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: 8,
    lineHeight: 30,
  },
  summary: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 16,
  },

  // ── Progress Section ──────────────────────────────────────
  progressSection: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepOverviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b9cbb6',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // ── Steps ──────────────────────────────────────────────────
  stepRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  stepNumberContainer: {
    alignItems: 'center',
    marginRight: 14,
    width: 36,
  },
  stepNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#e3a7a1',
  },
  stepConnector: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  stepCard: {
    flex: 1,
    marginBottom: 10,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 6,
  },
  stepContent: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },

  // ── Safety Warnings ────────────────────────────────────────
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F4ECC2',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  warningBullet: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F4ECC2',
    width: 16,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 13,
    color: '#f0d68a',
    lineHeight: 20,
    flex: 1,
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

  // ── Disclaimer ─────────────────────────────────────────────
  disclaimer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 8,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 17,
    flex: 1,
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
