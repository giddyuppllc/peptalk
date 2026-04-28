/**
 * UpgradeNudgeCard — contextual upgrade card shown on home dashboard for
 * free-tier users. Rotates between 5 messages based on day-of-week so the
 * user sees different feature teases over time.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTier } from '../hooks/useFeatureGate';

interface NudgeContent {
  feature: string;
  tier: 'plus' | 'pro';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const NUDGES: NudgeContent[] = [
  {
    feature: 'aimee_ai_limited',
    tier: 'plus',
    icon: 'chatbubble-ellipses',
    title: 'Unlock Aimee',
    body: 'Your AI coach who knows peptides. Answers in seconds.',
  },
  {
    feature: 'meal_scan',
    tier: 'pro',
    icon: 'scan',
    title: 'Meal Scan AI',
    body: 'Snap a plate. Log dinner in 3 seconds flat.',
  },
  {
    feature: 'voice_log',
    tier: 'plus',
    icon: 'mic',
    title: 'Voice Log',
    body: 'Just say what you ate — AI parses the rest.',
  },
  {
    feature: 'workout_programs',
    tier: 'pro',
    icon: 'barbell',
    title: "Jamie's Programs",
    body: '15 expert workouts with demo videos and RPE tracking.',
  },
  {
    feature: 'health_reports',
    tier: 'pro',
    icon: 'analytics',
    title: 'Weekly Reports',
    body: 'Export PDF insights your doctor can actually read.',
  },
];

function UpgradeNudgeCardImpl() {
  const router = useRouter();
  const tier = useTier();

  // Only show to free users
  if (tier !== 'free') return null;

  // Rotate by day-of-year so everyone sees a different nudge each day
  const dayIdx = Math.floor(Date.now() / 86400000) % NUDGES.length;
  const nudge = NUDGES[dayIdx];

  const colors: readonly [string, string] =
    nudge.tier === 'pro' ? (['#7FB3D8', '#3E7CB1'] as const) : (['#E89672', '#F5DAD6'] as const);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push(`/subscription?highlight=${nudge.feature}` as any)}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Decorative circles */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />

        <View style={styles.iconWrap}>
          <Ionicons name={nudge.icon} size={22} color="#fff" />
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{nudge.title}</Text>
            <View style={styles.tierPill}>
              <Ionicons name="lock-closed" size={9} color="#fff" />
              <Text style={styles.tierPillText}>{nudge.tier === 'pro' ? 'PRO' : 'PLUS'}</Text>
            </View>
          </View>
          <Text style={styles.body}>{nudge.body}</Text>
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>Try it free for 7 days</Text>
            <Ionicons name="arrow-forward" size={12} color="#fff" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#E89672',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circle2: {
    position: 'absolute',
    bottom: -40,
    right: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Playfair-Black',
    color: '#fff',
    letterSpacing: -0.2,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tierPillText: {
    fontSize: 9,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.6,
  },
  body: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 6,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ctaText: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

// Self-contained (its own tier hook, day-of-year calc from Date.now()) so
// parent re-renders don't need to ripple in.
export const UpgradeNudgeCard = React.memo(UpgradeNudgeCardImpl);
export default UpgradeNudgeCard;
