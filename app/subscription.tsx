/**
 * Subscription / Paywall screen — 4-tier plan comparison with upgrade CTAs.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../src/components/GlassCard';
import { GradientButton } from '../src/components/GradientButton';
import { Colors, Gradients, Spacing, FontSizes, BorderRadius } from '../src/constants/theme';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import type { SubscriptionTier } from '../src/types/fitness';

// ---------------------------------------------------------------------------
// Tier data
// ---------------------------------------------------------------------------

interface TierInfo {
  tier: SubscriptionTier;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  colors: [string, string];
  icon: string;
  badge?: string;
}

const TIERS: TierInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Essential peptide tools',
    features: [
      'Peptide dosing calculator',
      'Reconstitution & weight-based calculator',
      'Macro & calorie counter',
      'Food nutritional info',
      'Learn hub (articles & guides)',
    ],
    colors: ['#6b7280', '#6B7280'],
    icon: 'flask-outline',
  },
  {
    tier: 'plus',
    name: 'PepTalk+',
    price: '$9.99',
    period: '/mo',
    description: 'AI assistant, tracking & health integrations',
    features: [
      'Everything in Free',
      'Aimee AI assistant (limited)',
      'Peptide stack builder',
      'Health calendar & manual tracking',
      'Daily check-ins & journal',
      'Dose logging & timeline',
      'Apple Watch & health device sync',
      'Biomarker auto-tracking',
    ],
    colors: [Colors.pepBlue, Colors.pepCyan],
    icon: 'pulse-outline',
    badge: 'Most Popular',
  },
  {
    tier: 'pro',
    name: 'PepTalk Pro',
    price: '$49.99',
    period: '/mo',
    description: 'Full trainer experience with Aimee',
    features: [
      'Everything in Plus',
      'Unlimited Aimee AI',
      'Aimee workout & meal planning',
      'Aimee health scheduling',
      'Workout programs & videos',
      'AI recipe generator',
      'Grocery lists from meal plans',
      'Health reports & PDF export',
      'Ad-free experience',
      'Book consults with Jamie ($500/session)',
    ],
    colors: ['#FFBF82', '#ef4444'],
    icon: 'star-outline',
    badge: 'All Access',
  },
];

// ---------------------------------------------------------------------------
// Tier Card
// ---------------------------------------------------------------------------

function TierCard({ info, isActive }: { info: TierInfo; isActive: boolean }) {
  const handleUpgrade = () => {
    if (info.tier === 'free') return;
    Alert.alert(
      'Coming Soon',
      `${info.name} plan will be available when the app launches on the App Store. Your interest has been noted!`,
    );
  };

  return (
    <GlassCard
      variant={isActive ? 'glow' : info.badge ? 'elevated' : 'default'}
      glowColor={info.colors[0]}
    >
      {/* Badge */}
      {info.badge && !isActive && (
        <View style={styles.badgeWrap}>
          <LinearGradient
            colors={info.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.badge}
          >
            <Text style={styles.badgeText}>{info.badge}</Text>
          </LinearGradient>
        </View>
      )}

      {/* Header */}
      <View style={styles.tierHeader}>
        <LinearGradient colors={info.colors} style={styles.tierIcon}>
          <Ionicons name={info.icon as any} size={22} color="#fff" />
        </LinearGradient>
        <View style={styles.tierHeaderText}>
          <View style={styles.tierNameRow}>
            <Text style={styles.tierName}>{info.name}</Text>
            {isActive && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentText}>Current Plan</Text>
              </View>
            )}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.tierPrice}>{info.price}</Text>
            {info.period ? (
              <Text style={styles.tierPeriod}>{info.period}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <Text style={styles.tierDesc}>{info.description}</Text>

      {/* Features */}
      <View style={styles.featureList}>
        {info.features.map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={info.colors[0]}
            />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      {!isActive && info.tier !== 'free' && (
        <View style={styles.tierCta}>
          <GradientButton
            label={`Upgrade to ${info.name}`}
            onPress={handleUpgrade}
            colors={info.colors}
          />
        </View>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function SubscriptionScreen() {
  const router = useRouter();
  const { tier } = useSubscriptionStore();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plans</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Hero banner image */}
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80' }}
          style={styles.heroBanner}
        />

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Choose Your Plan</Text>
          <Text style={styles.heroDesc}>
            Unlock AI-powered tools, unlimited access, and professional health features.
          </Text>
        </View>

        {/* Tiers */}
        {TIERS.map((info) => (
          <View key={info.tier} style={styles.tierWrap}>
            <TierCard info={info} isActive={tier === info.tier} />
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions auto-renew unless cancelled 24 hours before the
            renewal date. You can manage subscriptions in your device settings.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  scroll: { paddingBottom: 40 },

  // Hero banner
  heroBanner: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    opacity: 0.8,
    marginHorizontal: Spacing.lg,
    alignSelf: 'center',
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.darkText,
  },
  heroDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Badge
  badgeWrap: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: -4,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Tier cards
  tierWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  tierIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierHeaderText: { flex: 1 },
  tierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierName: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    color: Colors.darkText,
  },
  currentBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  tierPrice: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.pepTeal,
  },
  tierPeriod: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.darkTextSecondary,
    marginLeft: 2,
  },
  tierDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginBottom: 12,
  },
  featureList: { gap: 6 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    flex: 1,
  },
  tierCta: { marginTop: 14 },

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
