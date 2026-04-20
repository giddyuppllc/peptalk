/**
 * PaywallModal — Glass-style modal shown when a user tries to access a gated feature.
 *
 * Displays which tier unlocks the feature and offers upgrade navigation.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius, Gradients } from '../constants/theme';
import { TIER_FEATURES } from '../types/fitness';
import type { SubscriptionTier } from '../types/fitness';

// ---------------------------------------------------------------------------
// Feature metadata — human-readable names & descriptions
// ---------------------------------------------------------------------------

const FEATURE_META: Record<string, { name: string; description: string }> = {
  // Free tier features
  peptide_library: {
    name: 'Peptide Library',
    description: 'Browse our comprehensive library of 55+ peptides.',
  },
  peptide_info: {
    name: 'Peptide Information',
    description: 'Detailed peptide profiles with dosing and research data.',
  },
  dosing_calculator: {
    name: 'Dosing Calculator',
    description: 'Calculate precise peptide dosing based on your needs.',
  },
  reconstitution_calculator: {
    name: 'Reconstitution Calculator',
    description: 'Calculate reconstitution volumes for peptide vials.',
  },
  calorie_counter: {
    name: 'Calorie Counter',
    description: 'Track your daily calorie intake with easy meal logging.',
  },
  health_checkins: {
    name: 'Health Check-Ins',
    description: 'Log daily wellness check-ins to track your progress.',
  },
  dose_logging: {
    name: 'Dose Logging',
    description: 'Track your peptide doses on a calendar.',
  },
  calendar: {
    name: 'Calendar',
    description: 'View your doses, check-ins, and events on a calendar.',
  },
  journal: {
    name: 'Wellness Journal',
    description: 'Write journal entries to track your wellness journey.',
  },
  learn_hub: {
    name: 'Learn Hub',
    description: 'Educational articles and videos on peptides and health.',
  },
  stack_builder: {
    name: 'Stack Builder',
    description: 'Build and manage your peptide stacks.',
  },

  // Plus tier features
  aimee_ai_limited: {
    name: 'Aimee AI Assistant',
    description: 'Chat with Aimee for peptide, nutrition, and workout guidance.',
  },
  health_calendar: {
    name: 'Health Calendar',
    description: 'Track doses, meals, workouts, and check-ins on a timeline.',
  },
  manual_tracking: {
    name: 'Manual Tracking',
    description: 'Log meals, weight, and health data manually.',
  },
  health_integrations: {
    name: 'Health Integrations',
    description: 'Connect Apple Watch, Fitbit, and other health devices.',
  },
  watch_sync: {
    name: 'Watch Sync',
    description: 'Auto-sync heart rate, steps, and sleep from your watch.',
  },
  biomarker_tracking: {
    name: 'Biomarker Tracking',
    description: 'Track blood work and biomarker results over time.',
  },
  calendar_timeline: {
    name: 'Calendar Timeline',
    description: 'See all health data on a unified timeline view.',
  },

  // Pro tier features
  aimee_ai_unlimited: {
    name: 'Unlimited Aimee',
    description: 'Unlimited AI conversations with no message limits.',
  },
  aimee_meal_plans: {
    name: 'Aimee Meal Plans',
    description: 'Aimee creates personalized weekly meal plans for your goals.',
  },
  aimee_workout_plans: {
    name: 'Aimee Workout Plans',
    description: 'Aimee builds custom workout programs based on your level and equipment.',
  },
  aimee_health_scheduler: {
    name: 'Aimee Health Scheduler',
    description: 'Aimee schedules your workouts, meals, and protocols automatically.',
  },
  workout_programs: {
    name: 'Workout Programs',
    description: 'Follow structured multi-week workout programs.',
  },
  workout_videos: {
    name: 'Workout Videos',
    description: 'Exercise demo videos for every movement.',
  },
  ai_meal_plans: {
    name: 'AI Meal Plans',
    description: 'AI-generated weekly meal plans tailored to your macros.',
  },
  nutrition_planning: {
    name: 'Nutrition Planning',
    description: 'Advanced nutrition planning with macro optimization.',
  },
  grocery_from_plans: {
    name: 'Grocery Lists',
    description: 'Auto-generated shopping lists from your meal plans.',
  },
  recipe_generator: {
    name: 'AI Recipes',
    description: 'Get personalized recipes based on your macros and preferences.',
  },
  health_reports: {
    name: 'Health Reports',
    description: 'Comprehensive health reports with actionable insights.',
  },
  pdf_export: {
    name: 'PDF Export',
    description: 'Export health reports and data as professional PDFs.',
  },
  data_export: {
    name: 'Data Export',
    description: 'Export all your data for your records.',
  },
  ad_free: {
    name: 'Ad-Free',
    description: 'Remove all banner ads from the app.',
  },
  // ── New aggressive gating features ───────────────────────────────────────
  voice_log: {
    name: 'Voice Log',
    description: 'Just say what you ate — our AI parses the phrase and logs every food for you.',
  },
  meal_scan: {
    name: 'Meal Scan',
    description: 'Snap a photo of your plate and let AI vision identify every food with macros.',
  },
  ai_food_scanner: {
    name: 'AI Food Scanner',
    description: 'Camera-powered food scanning with instant macro calculation.',
  },
  custom_foods_unlimited: {
    name: 'Unlimited Custom Foods',
    description: 'Build your personal food database — homemade meals, local spots, your favorite brands.',
  },
  custom_recipes_unlimited: {
    name: 'Unlimited Recipes',
    description: 'Save all your recipes with per-serving macros and one-tap logging.',
  },
  unlimited_meal_log: {
    name: 'Unlimited Meal Logging',
    description: 'Log every meal, snack, and drink without daily caps.',
  },
  unlimited_journal: {
    name: 'Unlimited Journal',
    description: 'Write as often as you want — no weekly limits on entries.',
  },
  unlimited_stacks: {
    name: 'Unlimited Stacks',
    description: 'Save as many peptide stacks as you need. Switch protocols, compare, experiment.',
  },
  micronutrients_full: {
    name: 'Full Micronutrient Tracking',
    description: 'Track every vitamin and mineral — A, C, D, E, K, all B-complex, potassium, calcium, iron, and more.',
  },
  biomarkers_full: {
    name: 'Biomarkers',
    description: 'HRV, VO2 Max, resting heart rate, and weight trends from your Apple Watch or Wear OS device.',
  },
  weight_trends: {
    name: 'Weight Trends',
    description: 'Long-term weight analytics with moving averages and goal tracking.',
  },
  workout_csv_export: {
    name: 'Workout Export',
    description: 'Export your entire workout history as CSV for your records or coach.',
  },
  custom_workout_generator: {
    name: 'Custom Workout Generator',
    description: 'AI builds personalized workouts from Jamie\u2019s 451-exercise library based on your goal, level, and equipment.',
  },
  generated_workout_tracker: {
    name: 'Generated Workout Tracker',
    description: 'Live-track generated workouts with sets, reps, RPE, rest timers, and analytics.',
  },
  research_feed_premium: {
    name: 'Premium Research Feed',
    description: 'Unlock curated peptide research and deep-dive insights beyond the free preview.',
  },
  early_access: {
    name: 'Early Access',
    description: 'Get new features before anyone else and help shape the roadmap.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine the minimum tier that unlocks a feature. */
function getRequiredTier(feature: string): SubscriptionTier {
  const tiers: SubscriptionTier[] = ['pro', 'plus', 'free'];
  for (const tier of tiers) {
    if (TIER_FEATURES[tier].includes(feature)) return tier;
  }
  return 'free';
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'PepTalk+',
  pro: 'PepTalk Pro',
};

const TIER_PRICES: Record<SubscriptionTier, string> = {
  free: '$0',
  plus: '$9.99/mo',
  pro: '$49.99/mo',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PaywallModalProps {
  visible: boolean;
  feature: string;
  onDismiss: () => void;
}

export function PaywallModal({ visible, feature, onDismiss }: PaywallModalProps) {
  const router = useRouter();
  const requiredTier = getRequiredTier(feature);
  const meta = FEATURE_META[feature] ?? {
    name: feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: 'This feature requires an upgraded plan.',
  };

  const handleUpgrade = () => {
    onDismiss();
    router.push('/subscription');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Lock icon */}
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={Gradients.primary}
              style={styles.iconGradient}
            >
              <Ionicons name="lock-closed" size={28} color="#fff" />
            </LinearGradient>
          </View>

          {/* Feature info */}
          <Text style={styles.title}>{meta.name}</Text>
          <Text style={styles.description}>{meta.description}</Text>

          {/* Required tier badge */}
          <View style={styles.tierBadge}>
            <Text style={styles.tierBadgeText}>
              Available with {TIER_LABELS[requiredTier]} ({TIER_PRICES[requiredTier]})
            </Text>
          </View>

          {/* Upgrade button */}
          <TouchableOpacity onPress={handleUpgrade} activeOpacity={0.85}>
            <LinearGradient
              colors={Gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradeBtn}
            >
              <Text style={styles.upgradeBtnText}>
                Upgrade to {TIER_LABELS[requiredTier]}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Dismiss */}
          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  iconWrap: {
    marginBottom: Spacing.md,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  tierBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tierBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.pepBlue,
  },
  upgradeBtn: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  upgradeBtnText: {
    color: '#ffffff',
    fontSize: FontSizes.md,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dismissBtn: {
    paddingVertical: Spacing.sm,
  },
  dismissText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },
});

export default PaywallModal;
