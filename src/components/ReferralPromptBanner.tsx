/**
 * ReferralPromptBanner — quiet "Have a referral code?" nudge on home.
 *
 * Shows at most ONCE per user lifetime. Auto-hides:
 *   - User has already redeemed a code (referral_redemptions row exists)
 *   - User dismissed it locally (persisted flag)
 *
 * Tap → /settings/referral. The settings screen handles the actual
 * redemption flow + success state.
 *
 * Why a banner instead of an onboarding step: every onboarding step
 * we add costs conversion. Referral codes are an opt-in optimization;
 * surfacing it on home post-signup lets users redeem when they have
 * the code, without delaying the first-run experience.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { secureStorage } from '../services/secureStorage';
import { useAuthStore } from '../store/useAuthStore';

const DISMISS_KEY = 'peptalk-referral-prompt-dismissed';

export function ReferralPromptBanner() {
  const t = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // 1. Local dismiss flag wins immediately.
      const dismissed = await secureStorage.getItem(DISMISS_KEY);
      if (dismissed === '1') return;
      if (!userId) return;

      // 2. Check if a redemption already exists. If yes, don't bother
      //    surfacing the banner — they're already attributed.
      try {
        const { supabase } = await import('../services/supabase');
        const { data } = await (supabase as any)
          .from('referral_redemptions')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (data) {
          if (mounted) {
            // Persist dismissal so we don't re-query on every home render.
            await secureStorage.setItem(DISMISS_KEY, '1');
          }
          return;
        }
      } catch {
        // Network blip — show the banner anyway; the redemption screen
        // will tell them if they've already redeemed.
      }

      if (mounted) setVisible(true);
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleDismiss = async () => {
    setVisible(false);
    try { await secureStorage.setItem(DISMISS_KEY, '1'); } catch {}
  };

  const handleTap = () => {
    router.push('/settings/referral' as any);
  };

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <GlassCard style={{ ...styles.card, borderColor: `${t.primary}40`, backgroundColor: `${t.primary}10` }}>
        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open referral code redemption"
          style={styles.row}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${t.primary}22` }]}>
            <Ionicons name="gift-outline" size={16} color={t.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]}>Have a referral code?</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Tap to apply it for a first-month discount.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss referral prompt"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.dismissBtn}
        >
          <Ionicons name="close" size={14} color={t.textSecondary} />
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  card: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  body: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  dismissBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
});

export default ReferralPromptBanner;
