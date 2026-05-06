/**
 * MaxYourStackCard — coming-soon tease for the next-gen Pro+ feature.
 *
 * Sits at the top of the Workouts hub and (when the user lands on
 * fitness gates they can't access) promises:
 *   1. Custom fitness programming dialed to the peptides in their stack
 *   2. Custom nutrition programming that flexes with cycle phase + lifts
 *   3. Adaptive — re-plans weekly from check-ins, doses, sleep, soreness
 *
 * Interaction model: "Get notified" toggles a per-user flag in the
 * waitlist store. Tap once → opt-in confirmed. We don't email yet
 * (no email pipeline) — the flag tells us at launch who to push first.
 *
 * Visual: gradient card, sparkle icon, "COMING SOON" pill, two-line
 * pitch + 3 bulleted promises.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { notifySuccess, tapLight } from '../utils/haptics';
import { useFeatureWaitlistStore } from '../store/useFeatureWaitlistStore';

interface MaxYourStackCardProps {
  /** Compact variant for embedding inside other lists. */
  compact?: boolean;
}

const FEATURE_KEY = 'max_your_stack';

export function MaxYourStackCard({ compact = false }: MaxYourStackCardProps) {
  const t = useTheme();
  const onWaitlist = useFeatureWaitlistStore((s) => !!s.signups[FEATURE_KEY]);
  const join = useFeatureWaitlistStore((s) => s.join);
  const [pulse, setPulse] = useState(false);

  const handleJoin = () => {
    if (onWaitlist) {
      tapLight();
      return;
    }
    join(FEATURE_KEY);
    notifySuccess();
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  };

  const promises = [
    'Custom fitness programming tuned to the peptides in your stack',
    'Nutrition that flexes with your cycle phase, training load, and dose week',
    'Re-plans weekly from your check-ins, doses, soreness, and sleep',
  ];

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <LinearGradient
        colors={['#7B5CD9', '#3E7CB1', '#6FA891']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={styles.title}>Max Your Stack</Text>
          </View>
          <View style={styles.comingSoonPill}>
            <Text style={styles.comingSoonText}>COMING SOON</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          Custom fitness + nutrition programming, tuned to the peptides you're on.
        </Text>

        {!compact && (
          <View style={styles.promiseList}>
            {promises.map((p) => (
              <View key={p} style={styles.promiseRow}>
                <View style={styles.promiseDot} />
                <Text style={styles.promiseText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={handleJoin}
          activeOpacity={0.85}
          style={[
            styles.cta,
            { backgroundColor: onWaitlist ? 'rgba(255,255,255,0.15)' : '#fff' },
            pulse && styles.ctaPulse,
          ]}
          accessibilityRole="button"
          accessibilityLabel={onWaitlist ? "You're on the waitlist" : 'Join the waitlist'}
        >
          <Ionicons
            name={onWaitlist ? 'checkmark-circle' : 'notifications-outline'}
            size={16}
            color={onWaitlist ? '#fff' : '#3E7CB1'}
          />
          <Text style={[styles.ctaText, { color: onWaitlist ? '#fff' : '#3E7CB1' }]}>
            {onWaitlist ? "You're in — we'll ping you" : 'Get early access'}
          </Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#7B5CD9',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  wrapCompact: {
    marginVertical: 4,
  },
  gradient: {
    padding: Spacing.md,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  comingSoonPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  comingSoonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  promiseList: {
    gap: 6,
    marginTop: 4,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  promiseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    marginTop: 7,
  },
  promiseText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginTop: 6,
  },
  ctaPulse: {
    transform: [{ scale: 1.02 }],
  },
  ctaText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
});

export default MaxYourStackCard;
