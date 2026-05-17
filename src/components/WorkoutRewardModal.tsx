/**
 * WorkoutRewardModal — celebrates a heavy session with a goal-aware
 * "you earned it" snack idea.
 *
 * Trigger: a freshly-finished workout (most-recent log's completedAt
 * within the last 30s) where:
 *   - rating >= 4 OR durationMinutes >= 45
 *   - user's primaryGoals includes body_recomp / muscle_gain / weight_loss
 *
 * The reward is a hard-coded micro-recipe (high-protein dessert) keyed
 * to the user's goal so it actually fits the macro context. Free for
 * everyone — this is a delight moment, not a paywall opportunity.
 *
 * Mounted at the app root so it surfaces no matter which screen the
 * user is on when they finish a session.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import type { GoalType } from '../types';

interface RewardRecipe {
  emoji: string;
  name: string;
  blurb: string;
  macros: string;
  steps: string[];
}

const REWARDS_BY_GOAL: Partial<Record<GoalType, RewardRecipe[]>> = {
  body_recomp: [
    {
      emoji: '🍫',
      name: 'Cottage cheese chocolate mousse',
      blurb: 'Hits like a brownie, lifts like a protein shake.',
      macros: '~250 cal · 28g protein · 14g carbs · 8g fat',
      steps: [
        'Blend 1 cup full-fat cottage cheese with 2 tbsp cocoa powder',
        '1.5 tbsp honey or maple, pinch of salt, splash of vanilla',
        'Top with cocoa nibs or berries. Refrigerate 10 min for thicker mousse.',
      ],
    },
    {
      emoji: '🍦',
      name: 'Greek yogurt brookie bowl',
      blurb: 'Anabolic dessert disguised as a snack.',
      macros: '~280 cal · 32g protein · 22g carbs · 6g fat',
      steps: [
        '1 cup non-fat Greek yogurt + 1 scoop chocolate whey',
        'Top with 1 oz crushed almonds + 1 tbsp dark-chocolate chips',
        'Drizzle ½ tbsp honey if you want it sweeter.',
      ],
    },
  ],
  muscle_gain: [
    {
      emoji: '🥞',
      name: 'Post-lift protein pancakes',
      blurb: 'Real food carbs + protein for actual recovery.',
      macros: '~480 cal · 38g protein · 50g carbs · 14g fat',
      steps: [
        '½ cup oats + 1 banana + 2 eggs + 1 scoop whey, blend',
        'Cook on a non-stick pan, 4-5 small pancakes',
        'Top with 1 tbsp peanut butter + ½ cup berries.',
      ],
    },
    {
      emoji: '🥛',
      name: 'PB cookie shake',
      blurb: 'Liquid recovery for the heavy day.',
      macros: '~520 cal · 40g protein · 55g carbs · 16g fat',
      steps: [
        '1 cup whole milk + 1 frozen banana + 1 scoop chocolate whey',
        '2 tbsp PB powder + 4 ice cubes + dash of cinnamon',
        'Blend 60 sec. Drink within 30 min of finishing.',
      ],
    },
  ],
  weight_loss: [
    {
      emoji: '🍓',
      name: 'Whipped cottage berries',
      blurb: 'Sub-200 cal sweet hit that actually fills you up.',
      macros: '~190 cal · 22g protein · 16g carbs · 4g fat',
      steps: [
        'Blend ¾ cup low-fat cottage cheese until smooth',
        '½ tsp vanilla, 1 tsp honey, pinch of salt',
        'Top with ½ cup mixed berries + crushed pistachios.',
      ],
    },
    {
      emoji: '🍫',
      name: 'Hot cocoa protein cup',
      blurb: 'Dessert that fits the deficit.',
      macros: '~150 cal · 24g protein · 8g carbs · 2g fat',
      steps: [
        '1 scoop chocolate whey + ¾ cup unsweetened almond milk',
        'Microwave 60s, stir, microwave 30s more',
        'Cinnamon on top. Marshmallows are not the answer.',
      ],
    },
  ],
};

const FALLBACK_REWARD: RewardRecipe = {
  emoji: '💪',
  name: 'Earned a high-protein snack',
  blurb: 'Solid session — refuel with something real.',
  macros: '~250 cal · 30g protein',
  steps: [
    '1 cup Greek yogurt + 1 scoop whey + ½ cup berries',
    'Drizzle of honey + handful of crushed nuts',
    'Eaten within 60 min of finishing locks in recovery.',
  ],
};

const HEAVY_RATING = 4;
const HEAVY_DURATION_MIN = 45;
const RECENT_WINDOW_MS = 30 * 1000;

export function WorkoutRewardModal() {
  const t = useTheme();
  const logs = useWorkoutStore((s) => s.logs);
  const primaryGoals = useHealthProfileStore((s) => s.profile?.primaryGoals);

  const [visible, setVisible] = useState(false);
  const [reward, setReward] = useState<RewardRecipe | null>(null);
  const lastShownLogIdRef = useRef<string | null>(null);

  // Watch the newest finished workout. When a new one appears that's
  // heavy enough AND matches an applicable goal, fire once and remember
  // the id so we don't spam.
  useEffect(() => {
    const latest = logs[0];
    if (!latest || !latest.completedAt) return;
    if (lastShownLogIdRef.current === latest.id) return;

    const completedAt = new Date(latest.completedAt).getTime();
    if (Date.now() - completedAt > RECENT_WINDOW_MS) {
      // Pre-existing log from a previous session — don't replay.
      lastShownLogIdRef.current = latest.id;
      return;
    }

    const heavy =
      (latest.rating ?? 0) >= HEAVY_RATING ||
      (latest.durationMinutes ?? 0) >= HEAVY_DURATION_MIN;
    if (!heavy) {
      lastShownLogIdRef.current = latest.id;
      return;
    }

    const applicableGoal = (primaryGoals ?? []).find(
      (g) => REWARDS_BY_GOAL[g] != null,
    );
    const pool = applicableGoal ? REWARDS_BY_GOAL[applicableGoal]! : [FALLBACK_REWARD];
    const choice = pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_REWARD;

    setReward(choice);
    setVisible(true);
    lastShownLogIdRef.current = latest.id;
  }, [logs, primaryGoals]);

  if (!reward) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)} accessibilityViewIsModal={true}>
        <Pressable
          style={[styles.card, { backgroundColor: t.bg }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.headerRow}>
            <View style={[styles.headerBadge, { backgroundColor: t.primary + '22' }]}>
              <Text style={styles.headerEmoji}>{reward.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: t.primary }]}>Nice session</Text>
              <Text style={[styles.title, { color: t.text }]}>{reward.name}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setVisible(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={t.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.blurb, { color: t.textSecondary }]}>{reward.blurb}</Text>
          <Text style={[styles.macros, { color: t.text }]}>{reward.macros}</Text>

          <View style={[styles.stepsBox, { borderColor: t.cardBorder }]}>
            {reward.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={[styles.stepNum, { color: t.primary }]}>{i + 1}</Text>
                <Text style={[styles.stepText, { color: t.text }]}>{step}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: t.primary }]}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.ctaText}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    padding: Spacing.lg,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 28 },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: FontSizes.lg, fontWeight: '800', marginTop: 2 },
  blurb: { fontSize: FontSizes.sm, lineHeight: 20 },
  macros: { fontSize: FontSizes.xs, fontWeight: '700' },
  stepsBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    gap: 10,
    marginTop: 6,
  },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: FontSizes.sm, fontWeight: '800', minWidth: 16 },
  stepText: { flex: 1, fontSize: FontSizes.xs, lineHeight: 17 },
  cta: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
});
