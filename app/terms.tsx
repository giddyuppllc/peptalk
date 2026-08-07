import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../src/components/GlassCard';
import { Colors, FontSizes, Spacing, BorderRadius } from '../src/constants/theme';
import { TOS_SECTIONS, MASTER_DISCLAIMER } from '../src/constants/legal';

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Intro */}
        <View style={styles.introSection}>
          <View style={styles.iconCircle}>
            <Ionicons
              name="document-text-outline"
              size={28}
              color={Colors.pepBlue}
            />
          </View>
          <Text style={styles.introTitle}>Terms of Service</Text>
          <Text style={styles.introSubtitle}>
            Last updated: March 2026
          </Text>
          <Text style={styles.introText}>{MASTER_DISCLAIMER}</Text>
        </View>

        {/* Sections */}
        {TOS_SECTIONS.map((section, i) => (
          <View key={section.title} style={styles.section}>
            <GlassCard>
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: `${Colors.pepBlue}18` },
                  ]}
                >
                  <Ionicons
                    name={section.icon}
                    size={20}
                    color={Colors.pepBlue}
                  />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <Text style={styles.sectionContent}>{section.content}</Text>
            </GlassCard>
          </View>
        ))}

        {/* Contact */}
        <View style={styles.section}>
          <GlassCard variant="glow" glowColor={Colors.pepBlue}>
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIcon,
                  { backgroundColor: `${Colors.pepBlue}18` },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={Colors.pepBlue}
                />
              </View>
              <Text style={styles.sectionTitle}>Contact</Text>
            </View>
            <Text style={styles.sectionContent}>
              If you have questions about these Terms of Service, please contact
              us through the app's Profile settings or email support.
            </Text>
          </GlassCard>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using PepTalk, you agree to these Terms of Service and our
            Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Intro
  introSection: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.glassBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.darkText,
    marginBottom: 4,
  },
  introSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.md,
  },
  introText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  sectionContent: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSizes.xs,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
