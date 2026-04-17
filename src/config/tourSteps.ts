/**
 * Tour scripts — defines the steps for each tour variant.
 *
 * Each step has:
 *   - screen: the route the user should be on for this step
 *   - targetKey: the id that matches a useTourTarget() call in the code
 *   - title/body: the tooltip copy
 *   - icon: an Ionicons name for the tooltip badge
 *   - requiredTier: skip this step if the user's tier is below this
 */

import type { Ionicons } from '@expo/vector-icons';
import type { TourVariant } from '../store/useTutorialStore';

export interface TourStep {
  id: string;
  screen?: string;
  targetKey?: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  requiredTier: 'free' | 'plus' | 'pro';
}

// ═══════════════════════════════════════════════════════════════════════════
// Intro tour — 6 steps, runs on first launch after onboarding
// ═══════════════════════════════════════════════════════════════════════════

const INTRO_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PepTalk',
    body: "Here's a quick 30-second tour so you know where everything lives. Tap Skip anytime.",
    icon: 'sparkles',
    requiredTier: 'free',
    // No screen / targetKey → renders in the centered layout
  },
  {
    id: 'home_log',
    screen: '/(tabs)',
    targetKey: 'home_fab',
    title: 'Log anything in one tap',
    body: 'Meals, doses, workouts, check-ins — all start from the + Log button.',
    icon: 'add-circle',
    requiredTier: 'free',
  },
  {
    id: 'home_progress',
    screen: '/(tabs)',
    targetKey: 'home_progress_rings',
    title: 'See your progress',
    body: 'Swipe between Nutrition, Fitness, and Health & Wellness rings to track your day.',
    icon: 'analytics-outline',
    requiredTier: 'free',
  },
  {
    id: 'peptides_tab',
    screen: '/(tabs)/my-stacks',
    targetKey: 'peptide_tab_bar',
    title: 'Explore peptides',
    body: 'Library is the research database, Stacks are saved combinations, Calculator helps you dose and reconstitute.',
    icon: 'flask-outline',
    requiredTier: 'free',
  },
  {
    id: 'calculator_preview',
    screen: '/(tabs)/my-stacks',
    targetKey: 'peptide_tab_bar',
    title: 'Dose Calculator',
    body: 'Tap the Calculator tab to compute BAC water volume, units to draw, and doses per vial — all from the peptide strength.',
    icon: 'calculator-outline',
    requiredTier: 'free',
  },
  {
    id: 'aimee_tab',
    screen: '/(tabs)/peptalk',
    targetKey: 'aimee_chat_input',
    title: 'Meet Aimee',
    body: 'Your AI coach who understands peptides, nutrition, and workouts. Plus tier unlocks unlimited messages.',
    icon: 'chatbubble-ellipses',
    requiredTier: 'free',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Free → Plus upgrade delta tour — fires once after upgrading from free
// ═══════════════════════════════════════════════════════════════════════════

const FREE_TO_PLUS_STEPS: TourStep[] = [
  {
    id: 'plus_welcome',
    title: 'Welcome to PepTalk+',
    body: "Here are the new features you just unlocked. Let's take a quick look.",
    icon: 'sparkles',
    requiredTier: 'plus',
  },
  {
    id: 'plus_voice_log',
    screen: '/nutrition/food-search',
    targetKey: 'food_search_quick_actions',
    title: 'Voice Log unlocked',
    body: 'Just dictate what you ate — AI parses every food and macros automatically.',
    icon: 'mic',
    requiredTier: 'plus',
  },
  {
    id: 'plus_custom_foods',
    screen: '/nutrition/food-search',
    targetKey: 'food_search_tab_bar',
    title: 'Unlimited custom foods',
    body: 'Build your personal food database — homemade bars, local smoothie spots, your gym\u2019s pre-workout.',
    icon: 'add-circle-outline',
    requiredTier: 'plus',
  },
  {
    id: 'plus_stacks',
    screen: '/(tabs)/my-stacks',
    targetKey: 'peptide_tab_bar',
    title: 'Unlimited stacks',
    body: 'Save as many peptide protocols as you want — compare, switch, experiment.',
    icon: 'layers-outline',
    requiredTier: 'plus',
  },
  {
    id: 'plus_aimee',
    screen: '/(tabs)/peptalk',
    targetKey: 'aimee_chat_input',
    title: 'Aimee AI chat',
    body: 'Ask Aimee anything — peptide dosing, stacks, workouts, nutrition. 20 messages per day.',
    icon: 'chatbubble-ellipses',
    requiredTier: 'plus',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Plus → Pro upgrade delta tour
// ═══════════════════════════════════════════════════════════════════════════

const PLUS_TO_PRO_STEPS: TourStep[] = [
  {
    id: 'pro_welcome',
    title: 'Welcome to Pro',
    body: "You now have access to everything. Here's what's new in your toolkit.",
    icon: 'star',
    requiredTier: 'pro',
  },
  {
    id: 'pro_meal_scan',
    screen: '/nutrition/food-search',
    targetKey: 'food_search_quick_actions',
    title: 'Meal Scan unlocked',
    body: 'Snap a photo of your plate and AI identifies every food with estimated macros.',
    icon: 'scan',
    requiredTier: 'pro',
  },
  {
    id: 'pro_recipes',
    screen: '/nutrition/food-search',
    targetKey: 'food_search_tab_bar',
    title: 'AI Recipe Generator',
    body: 'Generate recipes that match your exact macro targets and dietary preferences.',
    icon: 'sparkles',
    requiredTier: 'pro',
  },
  {
    id: 'pro_programs',
    screen: '/workouts',
    targetKey: 'workouts_programs_section',
    title: "Jamie's Programs",
    body: '15 expert workout programs with demo videos, RPE tracking, and a custom generator.',
    icon: 'barbell',
    requiredTier: 'pro',
  },
  {
    id: 'pro_aimee_unlimited',
    screen: '/(tabs)/peptalk',
    targetKey: 'aimee_chat_input',
    title: 'Unlimited Aimee',
    body: 'No more message caps — chat with Aimee as much as you want, whenever you want.',
    icon: 'chatbubble-ellipses',
    requiredTier: 'pro',
  },
];

export const TOUR_SCRIPTS: Record<TourVariant, TourStep[]> = {
  intro: INTRO_STEPS,
  free_to_plus: FREE_TO_PLUS_STEPS,
  plus_to_pro: PLUS_TO_PRO_STEPS,
};
