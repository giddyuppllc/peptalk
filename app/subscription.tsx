/**
 * Subscription / Paywall screen — 4-tier plan comparison with upgrade CTAs.
 */

import React, { useEffect, useRef } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../src/components/GlassCard';
import { GradientButton } from '../src/components/GradientButton';
import { Colors, Gradients, Spacing, FontSizes, BorderRadius } from '../src/constants/theme';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import type { SubscriptionTier } from '../src/types/fitness';
import {
  PRODUCT_IDS,
  purchaseProduct,
  restorePurchases,
  type ProductId,
} from '../src/services/iapService';

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
  productId?: ProductId;
}

const TIERS: TierInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Try PepTalk at your own pace',
    features: [
      'Full peptide research library',
      'Dosing & reconstitution calculators',
      'Learn Hub (articles, guides, videos)',
      '3 meals / day logging',
      'Basic manual workout log',
      '1 saved peptide stack',
      'Daily check-in & basic journal',
    ],
    colors: ['#9CA3AF', '#6B7280'],
    icon: 'leaf-outline',
  },
  {
    tier: 'plus',
    name: 'PepTalk+',
    price: '$9.99',
    period: '/mo',
    description: 'For the serious tracker',
    features: [
      'Everything in Free',
      'Aimee AI chat (20 msgs/day)',
      'Voice Log — AI meal parser',
      'Unlimited meal logging',
      'Unlimited custom foods & recipes',
      'Full micronutrient tracking',
      'Apple Watch & Google Fit sync',
      'HRV, VO2, weight trends',
      'Unlimited peptide stacks',
      'Ad-free experience',
    ],
    colors: ['#E89672', '#F5DAD6'],
    icon: 'pulse-outline',
    badge: 'Most Popular',
    productId: PRODUCT_IDS.plusMonthly,
  },
  {
    tier: 'pro',
    name: 'PepTalk Pro',
    price: '$49.99',
    period: '/mo',
    description: 'Full AI coaching + programs',
    features: [
      'Everything in Plus',
      'Unlimited Aimee AI',
      'Meal Scan — AI plate recognition',
      'AI Recipe Generator',
      "Jamie's 15 workout programs + videos",
      'Custom Workout Generator + tracker',
      'Weekly Health Reports + PDF export',
      'Premium research feed',
      'Aimee Health Scheduler',
      'Early access to new features',
    ],
    colors: ['#E9B45C', '#C98E3E'],
    icon: 'star',
    badge: 'Best Value',
    productId: PRODUCT_IDS.proMonthly,
  },
];

const SOCIAL_PROOF = [
  {
    icon: 'people' as const,
    title: '10,000+',
    body: 'peptide researchers tracking with PepTalk',
  },
  {
    icon: 'timer-outline' as const,
    title: '15 min/day',
    body: 'saved on tracking with AI features',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: '7-day trial',
    body: 'try anything risk-free, cancel anytime',
  },
];

// ---------------------------------------------------------------------------
// Tier Card
// ---------------------------------------------------------------------------

function TierCard({ info, isActive, highlighted }: { info: TierInfo; isActive: boolean; highlighted?: boolean }) {
  const [purchasing, setPurchasing] = React.useState(false);

  const handleUpgrade = async () => {
    if (info.tier === 'free' || !info.productId) return;
    try {
      setPurchasing(true);
      // Triggers native purchase sheet. Validation happens in the
      // purchaseUpdatedListener registered in _layout.tsx.
      await purchaseProduct(info.productId);
    } catch (err: any) {
      const msg = err?.message ?? 'Purchase could not be completed.';
      // User cancellation is not an error we need to surface
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('canceled')) {
        Alert.alert('Purchase Failed', msg);
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <GlassCard
      variant={isActive || highlighted ? 'glow' : info.badge ? 'elevated' : 'default'}
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
          <Text style={styles.trialText}>✨ Start with a 7-day free trial</Text>
          <GradientButton
            label={purchasing ? 'Processing…' : `Upgrade to ${info.name}`}
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

/** Map a feature key to the minimum tier that unlocks it. */
function tierForFeature(feature: string | undefined): SubscriptionTier | null {
  if (!feature) return null;
  const proOnly = [
    'meal_scan',
    'recipe_generator',
    'workout_programs',
    'workout_videos',
    'custom_workout_generator',
    'generated_workout_tracker',
    'health_reports',
    'aimee_ai_unlimited',
    'aimee_health_scheduler',
    'research_feed_premium',
  ];
  if (proOnly.includes(feature)) return 'pro';
  return 'plus';
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { tier } = useSubscriptionStore();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const highlightedTier = tierForFeature(highlight);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
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

        {/* Why upgrade — social proof */}
        <View style={styles.socialProofRow}>
          {SOCIAL_PROOF.map((item, i) => (
            <View key={i} style={styles.socialProofItem}>
              <View style={styles.socialProofIcon}>
                <Ionicons name={item.icon} size={18} color={Colors.pepTeal} />
              </View>
              <Text style={styles.socialProofTitle}>{item.title}</Text>
              <Text style={styles.socialProofBody} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
          ))}
        </View>

        {/* Tiers */}
        {TIERS.map((info) => (
          <View key={info.tier} style={styles.tierWrap}>
            <TierCard
              info={info}
              isActive={tier === info.tier}
              highlighted={highlightedTier === info.tier && tier !== info.tier}
            />
          </View>
        ))}

        {/* Restore purchases */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={async () => {
            try {
              const count = await restorePurchases();
              // syncFromServer is called in the purchase listener for each restored item
              await useSubscriptionStore.getState().syncFromServer();
              Alert.alert(
                'Restore Complete',
                count > 0
                  ? `Found ${count} previous purchase${count === 1 ? '' : 's'}. Your subscription has been restored.`
                  : 'No previous purchases found on this Apple ID.',
              );
            } catch (err: any) {
              Alert.alert('Restore Failed', err?.message ?? 'Could not restore purchases. Please try again.');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
        >
          <Text style={styles.restoreBtnText}>Restore Purchases</Text>
        </TouchableOpacity>

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
  tierCta: { marginTop: 14, gap: 8 },
  trialText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: Colors.pepTeal,
    textAlign: 'center',
  },

  // Social proof
  socialProofRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  socialProofItem: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(232, 150, 114, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232, 150, 114, 0.25)',
    gap: 4,
  },
  socialProofIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(232, 150, 114, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  socialProofTitle: {
    fontSize: 14,
    fontFamily: 'Playfair-Black',
    color: Colors.darkText,
    letterSpacing: -0.2,
  },
  socialProofBody: {
    fontSize: 10,
    fontFamily: 'DMSans-Regular',
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 14,
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
  restoreBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  restoreBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: '#6b7280',
    textDecorationLine: 'underline',
  },
});
