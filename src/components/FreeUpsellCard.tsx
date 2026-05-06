/**
 * FreeUpsellCard — rotating value-prop nudge for free-tier users.
 *
 * Rotates daily through the Plus value props (stack builder, Aimee, voice
 * log, health sync) so a returning user sees a different angle each day —
 * less ad-fatigue than a single static pitch, more chances to land on a
 * feature they care about.
 *
 * Hidden when:
 *   - tier !== 'free' (paying users never see upsell nudges)
 *   - dismissed for the session (in-memory only — resets on next launch
 *     so users see another rotation, but doesn't pester them inside a
 *     single session)
 *
 * Wire this in any free-tier-visible surface (Home, Profile, peptide
 * detail). Component handles its own gating.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { Spacing, FontSizes } from '../constants/theme';

interface ValueProp {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  title: string;
  body: string;
  /** Feature key passed to /subscription?highlight= for analytics + scrolling. */
  highlight: string;
}

const VALUE_PROPS: ValueProp[] = [
  {
    icon: 'flask-outline',
    accent: '#E89672',
    title: 'Stack smarter with PepTalk+',
    body: 'Unlimited peptide stacks, instant interaction & synergy analysis.',
    highlight: 'unlimited_stacks',
  },
  {
    icon: 'chatbubbles-outline',
    accent: '#7FB3D8',
    title: 'Ask Aimee anything',
    body: '20 personalized chats/day on dosing, timing, and side effects.',
    highlight: 'aimee_ai',
  },
  {
    icon: 'mic-outline',
    accent: '#A4D9D1',
    title: 'Log meals by voice',
    body: 'Say what you ate — Aimee parses macros and adds it to your day.',
    highlight: 'voice_log',
  },
  {
    icon: 'pulse-outline',
    accent: '#F4ECC2',
    title: 'Sync your wearable',
    body: 'Apple Watch + Google Fit: HRV, VO₂, sleep, weight all in one place.',
    highlight: 'health_sync',
  },
];

/**
 * Day-of-year index → stable rotation. Two visits same day get the same
 * card; a returning user the next day sees a different angle.
 */
function todaysIndex(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (24 * 3600 * 1000));
  return dayOfYear % VALUE_PROPS.length;
}

export function FreeUpsellCard() {
  const t = useTheme();
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const [dismissed, setDismissed] = useState(false);

  // Hooks must run before any conditional return.
  const prop = useMemo(() => VALUE_PROPS[todaysIndex()], []);

  if (tier !== 'free' || dismissed) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: prop.accent + '22' }]}>
        <Ionicons name={prop.icon} size={20} color={prop.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {prop.title}
        </Text>
        <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
          {prop.body}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: prop.accent }]}
            onPress={() => router.push(`/subscription?highlight=${prop.highlight}` as any)}
            accessibilityRole="button"
            accessibilityLabel="See PepTalk+ plans"
          >
            <Text style={styles.ctaText}>See plans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss upgrade prompt"
            hitSlop={10}
          >
            <Text style={[styles.dismiss, { color: t.textSecondary }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.sm, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: FontSizes.xs, lineHeight: 16, marginBottom: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cta: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  ctaText: { color: '#fff', fontSize: FontSizes.xs, fontWeight: '700' },
  dismiss: { fontSize: FontSizes.xs, fontWeight: '600' },
});
