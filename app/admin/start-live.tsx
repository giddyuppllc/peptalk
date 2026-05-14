/**
 * Admin: Start Live Event — opens a new community live chat.
 *
 * Server-side enforces ADMIN_EMAILS auth — this screen is a UI for the
 * trigger. We don't tier-gate the screen itself; non-admins who somehow
 * land here just get a 403 from the edge function.
 *
 * On success the user is sent to the live chat screen, where they can
 * post the first message + later end the event.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';

// Live chat is paying-members-only by product policy (Edward, 2026-05-14).
// "Everyone" / free tier option intentionally removed — admins can't open
// an event up to free users. Both options below are paywalled tiers.
const TIER_OPTIONS: Array<{ value: 'plus' | 'pro'; label: string; sub: string }> = [
  { value: 'plus', label: 'Plus + Pro', sub: 'Default · all paying members' },
  { value: 'pro', label: 'Pro only', sub: 'Restricted to Pro tier' },
];

export default function StartLiveScreen() {
  const t = useTheme();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requiredTier, setRequiredTier] = useState<'free' | 'plus' | 'pro'>('plus');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length >= 3 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { supabase } = await import('../../src/services/supabase');
      const { data, error } = await supabase.functions.invoke('community-live-start', {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          requiredTier,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let parsed: any = null;
        try {
          const text = ctx?.body ? await ctx.body : null;
          parsed = text ? JSON.parse(text) : null;
        } catch { /* ignore */ }
        Alert.alert(
          'Could not start',
          parsed?.error ?? error.message ?? 'Try again.',
        );
        return;
      }
      const payload = data as { ok?: boolean; eventId?: string; error?: string };
      if (payload?.error) {
        Alert.alert('Could not start', payload.error);
        return;
      }
      if (!payload?.eventId) {
        Alert.alert('Could not start', 'Server did not return an event id.');
        return;
      }
      router.replace(`/community/live/${payload.eventId}` as any);
    } catch (err: any) {
      Alert.alert('Could not start', err?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>Start a live event</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: t.textSecondary }]}>
            When you tap "Go Live" we send a push to every eligible member's
            devices. The chat opens immediately and stays open until you end it.
          </Text>

          <GlassCard style={styles.card}>
            <Text style={[styles.label, { color: t.textSecondary }]}>EVENT TITLE</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What's the event about?"
              placeholderTextColor={t.textSecondary}
              maxLength={140}
              style={[styles.input, { color: t.text, backgroundColor: t.glass }]}
              accessibilityLabel="Event title"
            />
            <Text style={[styles.charCount, { color: t.textSecondary }]}>{title.length}/140</Text>

            <Text style={[styles.label, { color: t.textSecondary, marginTop: 12 }]}>
              DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="A short blurb members see on the join screen"
              placeholderTextColor={t.textSecondary}
              maxLength={600}
              multiline
              style={[styles.input, styles.textarea, { color: t.text, backgroundColor: t.glass }]}
              accessibilityLabel="Event description"
            />
            <Text style={[styles.charCount, { color: t.textSecondary }]}>{description.length}/600</Text>
          </GlassCard>

          <Text style={[styles.label, { color: t.textSecondary, marginTop: 16, marginLeft: 4 }]}>
            WHO GETS THE PUSH
          </Text>
          <View style={styles.tierGroup}>
            {TIER_OPTIONS.map((opt) => {
              const active = requiredTier === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setRequiredTier(opt.value)}
                  style={[
                    styles.tierRow,
                    {
                      borderColor: active ? t.primary : t.cardBorder,
                      backgroundColor: active ? `${t.primary}10` : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${opt.label}: ${opt.sub}`}
                >
                  <View
                    style={[
                      styles.radio,
                      { borderColor: active ? t.primary : t.cardBorder },
                    ]}
                  >
                    {active && <View style={[styles.radioInner, { backgroundColor: t.primary }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierLabel, { color: t.text }]}>{opt.label}</Text>
                    <Text style={[styles.tierSub, { color: t.textSecondary }]}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[
              styles.submitBtn,
              { backgroundColor: t.primary, opacity: canSubmit ? 1 : 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={submitting ? 'Starting…' : 'Go Live'}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="radio" size={18} color="#fff" />
                <Text style={styles.submitText}>Go Live · Notify members</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.fineprint, { color: t.textSecondary }]}>
            Members on Plus or Pro who have notifications enabled will get a
            silent-style banner — no email, no SMS. The chat link stays in the
            push payload so a single tap drops them straight into the room.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 60 },
  intro: { fontSize: FontSizes.sm, lineHeight: 20, marginBottom: Spacing.md },
  card: { padding: 14, gap: 4 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  input: {
    fontSize: FontSizes.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    marginTop: 6,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  tierGroup: { gap: 6, marginTop: 6 },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  tierLabel: { fontSize: FontSizes.sm, fontWeight: '700' },
  tierSub: { fontSize: 11, marginTop: 2 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    marginTop: 16,
  },
  submitText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '800' },
  fineprint: { fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' },
});
