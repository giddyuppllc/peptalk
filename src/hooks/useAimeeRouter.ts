/**
 * useAimeeRouter — single entry point for opening Aimee with an intent.
 *
 * Maps the v3 intent vocabulary (used by AimeeFAB / Centerpiece / Persistent
 * Chip / chip rows) into a natural-language prompt and routes the user to
 * the existing /(tabs)/peptalk chat screen with the prompt prefilled.
 *
 * peptalk.tsx auto-sends the message on arrival, so the user's tap on a
 * chip → immediate Aimee response, no extra typing needed. The shared
 * useChatStore preserves the thread so the same conversation continues
 * across every surface (Master Refactor Plan v3.1 §9.10).
 */

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { tapMedium } from '../utils/haptics';

/** v3 intent vocabulary. Add entries as new chip/centerpiece intents land. */
export type AimeeIntent =
  // Universal
  | 'open_chat'
  | 'show_trend'
  | 'plan_tomorrow'
  | 'whats_new'
  // Doses
  | 'doses_overview'
  | 'doses_calculator'
  | 'doses_stack_builder'
  | 'doses_library'
  | 'doses_tracker'
  | 'doses_side_effects'
  // Nutrition
  | 'nutrition_overview'
  | 'log_meal'
  | 'plan_meals'
  | 'water_check'
  // Activity
  | 'activity_overview'
  | 'activity_performance'
  | 'log_workout'
  | 'build_workout'
  // Tracker
  | 'tracker_overview'
  | 'weekly_summary'
  // Profile
  | 'profile_appearance';

const INTENT_PROMPTS: Record<AimeeIntent, string> = {
  open_chat: '',
  show_trend: 'Show me my trend for the last 14 days.',
  plan_tomorrow: "What should I focus on tomorrow?",
  whats_new: "What's new in my data today?",

  doses_overview: "What's my dose situation look like right now?",
  doses_calculator:
    'Help me work the calculator for my current peptide.',
  doses_stack_builder:
    'Walk me through stacking peptides safely.',
  doses_library: 'Compare a couple of peptides for me.',
  doses_tracker: 'Summarize my dose history this week.',
  doses_side_effects: 'Any patterns in my side effects this week?',

  nutrition_overview: 'How am I doing on nutrition today?',
  log_meal: 'Log a meal for me.',
  plan_meals: 'Plan tomorrow\'s meals around my protein target.',
  water_check: 'How am I doing on water today?',

  activity_overview: 'How is my activity tracking this week?',
  activity_performance: 'What does my performance trend look like?',
  log_workout: 'Log a workout for me.',
  build_workout: 'Build me a workout for tonight.',

  tracker_overview: 'Give me a quick summary of my week.',
  weekly_summary: 'Walk me through my week so far.',

  profile_appearance: 'Show me how to switch themes.',
};

export function useAimeeRouter() {
  const router = useRouter();
  return useCallback(
    (intent: AimeeIntent | { intent: AimeeIntent; messageOverride?: string }) => {
      tapMedium();
      const id = typeof intent === 'string' ? intent : intent.intent;
      const override =
        typeof intent === 'string' ? undefined : intent.messageOverride;
      const message = override ?? INTENT_PROMPTS[id] ?? '';
      const qs = message
        ? `?message=${encodeURIComponent(message)}`
        : '';
      router.push(`/(tabs)/peptalk${qs}` as never);
    },
    [router],
  );
}
