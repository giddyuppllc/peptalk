/**
 * Referral code entry screen — Settings → Have a referral code?
 *
 * Lets users redeem a sales-agent or partner code post-signup. The
 * onboarding flow also asks for one inline; this is the recovery
 * path for users who skipped the question or got the code after the
 * fact.
 *
 * Server-side validation enforces:
 *   - One redemption per account lifetime
 *   - Code must be active + within validity window + under max_uses
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { redeemReferralCode } from '../../src/services/referralService';

export default function ReferralCodeScreen() {
  const router = useRouter();
  const t = useTheme();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState<{
    discount: number;
    appleOfferCode: string | null;
  } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    const res = await redeemReferralCode(code);
    setSubmitting(false);
    if (!res.ok) {
      Alert.alert('Code not accepted', res.error);
      return;
    }
    setRedeemed({
      discount: res.discount_percent,
      appleOfferCode: res.apple_offer_code,
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>Referral Code</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: t.textSecondary }]}>
          Got a code from a PepTalk partner? Enter it below for a discount on your first
          subscription month — and so we can credit the right person.
        </Text>

        {redeemed ? (
          <GlassCard style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={28} color={t.primary} />
            <Text style={[styles.successTitle, { color: t.text }]}>Code applied</Text>
            <Text style={[styles.successBody, { color: t.textSecondary }]}>
              {redeemed.discount > 0
                ? `${redeemed.discount}% off your first month is locked in.`
                : 'Your sales partner has been credited.'}
              {redeemed.appleOfferCode
                ? ' The discount applies automatically when you upgrade.'
                : ''}
            </Text>
          </GlassCard>
        ) : (
          <GlassCard style={styles.formCard}>
            <Text style={[styles.label, { color: t.textSecondary }]}>YOUR CODE</Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="ABCD1234"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              style={[
                styles.input,
                { backgroundColor: t.glass, color: t.text, borderColor: t.cardBorder },
              ]}
              accessibilityLabel="Referral code"
            />
            <TouchableOpacity
              onPress={handleRedeem}
              disabled={!code.trim() || submitting}
              style={[
                styles.btn,
                {
                  backgroundColor: t.primary,
                  opacity: !code.trim() || submitting ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={submitting ? 'Redeeming code' : 'Redeem code'}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Redeem code</Text>
              )}
            </TouchableOpacity>
          </GlassCard>
        )}

        <Text style={[styles.fineprint, { color: t.textSecondary }]}>
          One code per account. Codes can be used at any time, but the discount only
          applies to your next paid month — not retroactively.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  title: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 40 },
  intro: { fontSize: FontSizes.sm, lineHeight: 20, marginBottom: Spacing.md },
  formCard: { padding: 16, gap: 10 },
  successCard: { padding: 20, alignItems: 'center', gap: 10 },
  successTitle: { fontSize: FontSizes.md, fontWeight: '800' },
  successBody: { fontSize: FontSizes.sm, lineHeight: 20, textAlign: 'center' },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  input: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    textAlign: 'center',
  },
  btn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  fineprint: { fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
});
