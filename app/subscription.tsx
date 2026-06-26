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
  Linking,
  Platform,
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
  waitForPendingValidations,
  type ProductId,
} from '../src/services/iapService';
import {
  trackPaywallViewed,
  trackUpgradeInitiated,
  trackUpgradeFailed,
  trackRestoreAttempted,
  trackRestoreSucceeded,
  trackRestoreFailed,
} from '../src/services/analyticsEvents';

// ---------------------------------------------------------------------------
// Tier data
// ---------------------------------------------------------------------------

interface PricedPlan {
  price: string;
  period: string;
  productId?: ProductId;
}

interface TierInfo {
  tier: SubscriptionTier;
  name: string;
  description: string;
  features: string[];
  colors: [string, string];
  icon: string;
  badge?: string;
  /** Monthly pricing only. Yearly plans not yet launched. */
  pricing: PricedPlan;
}

const TIERS: TierInfo[] = [
  {
    tier: 'free',
    name: 'Free',
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
    pricing: { price: '$0', period: '' },
  },
  {
    tier: 'plus',
    name: 'PepTalk+',
    description: 'Early access to the upgraded version',
    features: [
      'Stack Builder — unlimited peptide stacks with interaction & synergy analysis',
      'Aimee — 20 personalized chats/day on dosing, timing, and side effects',
      'Food Scanner — snap a plate, get every food + macros',
      'Voice Log — say what you ate, get the macros logged',
      'Unlimited meal & food logging + full micronutrient tracking',
      'Apple Watch + Google Fit sync (HRV, VO2, weight trends)',
      'Live community group chat — ask the team during events',
      'First in line for new features as they ship',
      'Everything in Free, ad-free',
    ],
    colors: ['#E89672', '#F2D8D5'],
    icon: 'pulse-outline',
    badge: 'EARLY ACCESS',
    pricing: { price: '$9.99', period: '/mo', productId: PRODUCT_IDS.plusMonthly },
  },
  {
    tier: 'pro',
    name: 'PepTalk Pro',
    description: 'Full coaching + programs',
    features: [
      'Everything in Plus',
      'Unlimited Aimee chat',
      'Recipe Generator — personalized to your goals + allergens',
      'Multi-week training programs — progressive sets, reps, and rest',
      'Custom Workout Generator + tracker',
      'Weekly Health Reports — PDF export to share with your provider',
      'Searchable research source library — every claim cited',
      'Early access to new features as they ship',
    ],
    colors: ['#7FB3D8', '#3E7CB1'],
    icon: 'star',
    badge: 'Best Value',
    pricing: { price: '$49.99', period: '/mo', productId: PRODUCT_IDS.proMonthly },
  },
];

// Honest, verifiable claims only — Apple 5.6 (Developer Code of Conduct)
// prohibits misleading metadata. Numbers below are pulled from the actual
// shipped data and architecture, so anything a reviewer cross-checks is
// real.
const SOCIAL_PROOF = [
  {
    icon: 'flask-outline' as const,
    title: '55+ peptides',
    body: 'cited research library, fully offline',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'Private by default',
    body: 'health data encrypted on-device',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Cancel anytime',
    body: 'manage your subscription from your Apple ID at any time',
  },
];

// ---------------------------------------------------------------------------
// Tier Card
// ---------------------------------------------------------------------------

function TierCard({
  info,
  isActive,
  highlighted,
}: {
  info: TierInfo;
  isActive: boolean;
  highlighted?: boolean;
}) {
  const [purchasing, setPurchasing] = React.useState(false);
  const plan = info.pricing;

  const handleUpgrade = async () => {
    if (info.tier === 'free' || !plan?.productId) return;
    // Re-entry guard — label flips to "Processing…" but the button stays
    // pressable; a double-tap would otherwise fire the native purchase
    // sheet twice.
    if (purchasing) return;
    // Don't trigger a real App Store purchase for users who already have
    // entitlement equal-or-better than the target tier. This includes:
    //   - Beta-grant users (preview build / BETA_TESTER_EMAILS) whose
    //     productId is `beta_tester_grant`. Without this guard, tapping
    //     "Subscribe" on Plus while already on a beta Pro grant fires a
    //     REAL App Store purchase sheet. P0 from Wave 76.7 IAP audit.
    //   - Real Pro users tapping the Plus card — same problem.
    const { useSubscriptionStore: subStore } = await import(
      '../src/store/useSubscriptionStore'
    );
    const currentTier = subStore.getState().tier;
    const currentProductId = subStore.getState().productId;
    const tierRank: Record<string, number> = { free: 0, plus: 1, pro: 2 };
    if (currentProductId === 'beta_tester_grant') {
      // Complimentary/beta grant — no App Store purchase to make. Tell the
      // user instead of leaving the button looking unresponsive (App Review
      // 2.1a: a tap must always do something visible).
      Alert.alert(
        'You already have access',
        "You're on a complimentary PepTalk grant, so there's nothing to buy. Manage your access from your Profile.",
      );
      return;
    }
    if ((tierRank[currentTier] ?? 0) >= (tierRank[info.tier] ?? 0)) {
      // Already on an equal-or-higher tier — acknowledge the tap rather than
      // silently returning.
      Alert.alert(
        'Already subscribed',
        currentTier === 'pro'
          ? "You're on PepTalk Pro, which already includes everything in this plan."
          : `You're already on ${currentTier === 'plus' ? 'PepTalk+' : 'this plan'}.`,
      );
      return;
    }
    trackUpgradeInitiated(plan.productId, info.tier);
    try {
      setPurchasing(true);
      // Pass the Supabase user id to Apple (appAccountToken) / Google
      // (obfuscatedAccountIdAndroid) so server-to-server notifications
      // for this subscription (renewal, refund, cancel, etc.) echo it
      // back — that's how the webhook maps events to the right user
      // without fuzzy-matching on receipt blobs. Lazy-imported to avoid
      // pulling the auth store into the module graph at boot.
      const { useAuthStore } = await import('../src/store/useAuthStore');
      const appAccountToken = useAuthStore.getState().user?.id ?? null;

      // If the user previously redeemed a referral code, look up the
      // associated Apple Offer Code (set on the referral_codes row at
      // catalog time) and pass it to StoreKit so Apple applies the
      // configured discount on this purchase. Best-effort — failure
      // here just means full-price; we don't block the purchase.
      let appleOfferCode: string | null = null;
      if (Platform.OS === 'ios' && appAccountToken) {
        try {
          const { supabase } = await import('../src/services/supabase');
          const { data } = await (supabase as any)
            .from('referral_redemptions')
            .select('attribution_state, code:code_id ( apple_offer_code )')
            .eq('user_id', appAccountToken)
            .maybeSingle();
          // Only apply the offer code if this redemption hasn't been
          // attributed yet — discounts are intended for first paid month,
          // not every renewal.
          if (data?.attribution_state === 'pending') {
            appleOfferCode = data.code?.apple_offer_code ?? null;
          }
        } catch { /* ignore */ }
      }

      // Triggers native purchase sheet. Validation happens in the
      // purchaseUpdatedListener registered in _layout.tsx, which emits
      // the upgrade_succeeded event on actual server-side validation.
      await purchaseProduct(plan.productId, { appAccountToken, appleOfferCode });
    } catch (err: any) {
      const msg = err?.message ?? 'Purchase could not be completed.';
      const lower = msg.toLowerCase();
      const cancelled = lower.includes('cancelled') || lower.includes('canceled');
      trackUpgradeFailed(plan.productId, cancelled ? 'user_cancelled' : msg);
      if (!cancelled) {
        // Map "product not available" (StoreKit can't find the SKU — e.g. the
        // IAP isn't approved yet, or a transient store hiccup) to a clear
        // message instead of a raw error code, so the button never appears
        // broken.
        const unavailable =
          lower.includes('unavailable') ||
          lower.includes('not available') ||
          lower.includes('invalid product') ||
          lower.includes('e_item_unavailable') ||
          lower.includes('not initialized');
        Alert.alert(
          unavailable ? 'Subscriptions unavailable' : 'Purchase Failed',
          unavailable
            ? "We couldn't reach the App Store for this subscription. Please try again in a moment."
            : msg,
        );
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
            <Text style={styles.tierPrice}>{plan?.price ?? ''}</Text>
            {plan?.period ? (
              <Text style={styles.tierPeriod}>{plan.period}</Text>
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

      {/* CTA — Apple Guideline 3.1.2(a) requires the auto-renew price,
          billing period, and cancellation pathway to be visible BEFORE
          the user taps Subscribe. This line carries all three. */}
      {!isActive && info.tier !== 'free' && (
        <View style={styles.tierCta}>
          <Text style={styles.renewDisclosure}>
            {plan?.price}{plan?.period} · auto-renews monthly until cancelled.
            Cancel anytime in your Apple ID Subscriptions.
          </Text>
          <GradientButton
            label={purchasing ? 'Processing…' : `Subscribe to ${info.name}`}
            onPress={handleUpgrade}
            colors={info.colors}
            accessibilityLabel={`Subscribe to ${info.name} for ${plan?.price}${plan?.period ?? ''}, auto-renews monthly`}
            accessibilityState={{ disabled: purchasing, busy: purchasing }}
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
    // Pro-tier exclusives — kept tight so Plus has the AI vision food
    // scanner (moved out per pricing call) without giving away the
    // workout-program library or recipe generator.
    'recipe_generator',
    'workout_programs',
    'workout_videos',
    'custom_workout_generator',
    'generated_workout_tracker',
    'health_reports',
    'aimee_ai_unlimited',
    'research_feed_premium',
  ];
  if (proOnly.includes(feature)) return 'pro';
  return 'plus';
}

/** Deep-link to the OS's native Manage Subscriptions screen so users can
 *  cancel, change plans, or see renewal dates. Required by Apple's App
 *  Store Review Guideline 3.1.2 for auto-renewing subs. */
// Must match `android.package` in app.json — gets used in the Play Store
// deep link so users land on the correct subscription page.
const ANDROID_PACKAGE_NAME = 'com.peptalkapp.peptalk';

async function openManageSubscriptions(productId?: string | null) {
  const url = Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : productId
      ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${ANDROID_PACKAGE_NAME}`
      : 'https://play.google.com/store/account/subscriptions';
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Could not open',
      Platform.OS === 'ios'
        ? 'Open Settings → Apple ID → Subscriptions to manage PepTalk.'
        : 'Open Google Play Store → Payments & subscriptions to manage PepTalk.',
    );
  }
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const productId = useSubscriptionStore((s) => s.productId);
  const pendingPurchase = useSubscriptionStore((s) => s.pendingPurchase);
  const [restoring, setRestoring] = React.useState(false);
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const highlightedTier = tierForFeature(highlight);
  const hasPaidTier = tier === 'plus' || tier === 'pro';
  // Beta grants don't route through the stores, so skip the "manage" link.
  const showManageLink = hasPaidTier && productId !== 'beta_tester_grant';

  // Funnel analytics: fire once per mount, tagged with the feature the user
  // hit (if any) so we can measure which gates are the highest-intent.
  React.useEffect(() => {
    trackPaywallViewed(highlight ?? 'direct', highlightedTier ?? 'plus');
  }, [highlight, highlightedTier]);

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

        {/* Pending-purchase banner (Ask to Buy / SCA / parental consent). */}
        {pendingPurchase && (
          <View style={styles.pendingBanner}>
            <Ionicons name="hourglass-outline" size={18} color="#B45309" />
            <Text style={styles.pendingBannerText}>
              Waiting for approval on your purchase. You'll get access once it's
              confirmed — no need to buy again.
            </Text>
          </View>
        )}

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
          disabled={restoring}
          onPress={async () => {
            if (restoring) return;
            setRestoring(true);
            trackRestoreAttempted();
            const tierBefore = useSubscriptionStore.getState().tier;
            try {
              const count = await restorePurchases();
              // Each restored purchase fires the purchaseUpdatedListener,
              // which calls validatePurchase server-side. Block here until
              // those background validations settle so the subsequent
              // syncFromServer sees the fresh rows — otherwise the user
              // sees "Restore Complete" while still on the free tier.
              if (count > 0) {
                await waitForPendingValidations(10_000);
              }
              await useSubscriptionStore.getState().syncFromServer();
              const tierAfter = useSubscriptionStore.getState().tier;
              const upgraded = tierAfter !== 'free' && tierAfter !== tierBefore;
              trackRestoreSucceeded(count);
              Alert.alert(
                'Restore Complete',
                count === 0
                  ? 'No previous purchases found on this account.'
                  : upgraded
                    ? `Your ${tierAfter === 'pro' ? 'Pro' : 'Plus'} subscription has been restored.`
                    : `Found ${count} previous purchase${count === 1 ? '' : 's'}. If your plan doesn't show as active, try again in a moment.`,
              );
            } catch (err: any) {
              trackRestoreFailed(err?.message ?? 'unknown');
              Alert.alert('Restore Failed', err?.message ?? 'Could not restore purchases. Please try again.');
            } finally {
              setRestoring(false);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
        >
          <Text style={styles.restoreBtnText}>{restoring ? 'Restoring…' : 'Restore Purchases'}</Text>
        </TouchableOpacity>

        {/* Manage Subscription (paid users only). Required by Apple for
            auto-renewing subscriptions — deep-links to the native manage
            screen so users can cancel, change plans, or see renewal dates. */}
        {showManageLink && (
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={() => openManageSubscriptions(productId)}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription in the App Store"
          >
            <Text style={styles.restoreBtnText}>Manage Subscription</Text>
          </TouchableOpacity>
        )}

        {/* Footer — Apple 3.1.2(a) requires Terms + Privacy to be
            tappable from the paywall itself, not buried in app settings. */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions auto-renew unless cancelled at least 24 hours before
            the renewal date. Payment is charged to your Apple ID account at
            confirmation. Manage or cancel in your Apple ID Subscriptions.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity
              onPress={() => router.push('/terms' as any)}
              accessibilityRole="link"
              accessibilityLabel="Open Terms of Use (EULA)"
              hitSlop={6}
            >
              <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalDivider}>·</Text>
            <TouchableOpacity
              onPress={() => router.push('/privacy' as any)}
              accessibilityRole="link"
              accessibilityLabel="Open Privacy Policy"
              hitSlop={6}
            >
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
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
  // Auto-renew disclosure font bumped to 13/lh18 for Apple 3.1.2 prominence.
  // Color #4B5563 (Gray-600) gives ~7:1 contrast on white surface — well
  // above WCAG AA 4.5:1, well above what reviewers expect for "clear and prominent."
  renewDisclosure: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'DMSans-Regular',
    color: '#4B5563',
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
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  legalLink: {
    fontSize: FontSizes.xs,
    color: '#3E7CB1',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  legalDivider: { color: '#9CA3AF', fontSize: FontSizes.xs },
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

  // Billing period toggle
  billingToggleWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  billingToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  billingToggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  billingToggleOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  billingToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  billingToggleTextActive: {
    color: Colors.darkText,
    fontWeight: '700',
  },
  billingToggleBadge: {
    backgroundColor: 'rgba(232, 150, 114, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  billingToggleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C85A2E',
    letterSpacing: 0.3,
  },

  // Savings pill on the tier price row
  savingsPill: {
    marginLeft: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savingsPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.3,
  },

  // Pending purchase banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#92400E',
  },
});
