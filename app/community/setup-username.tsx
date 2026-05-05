/**
 * Setup community username — one-time pick + display-name entry.
 *
 * Validates client-side via the same regex the edge function enforces
 * so users get instant feedback on bad inputs. Edge function does the
 * authoritative profanity + uniqueness check.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useCommunityStore } from '../../src/store/useCommunityStore';
import {
  isValidUsername,
  isOffensiveHandle,
  USERNAME_RULES_HINT,
} from '../../src/types/community';

export default function SetupUsernameScreen() {
  const t = useTheme();
  const router = useRouter();
  const setUsername = useCommunityStore((s) => s.setUsername);

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validation = useMemo(() => {
    const trimmed = handle.trim();
    if (!trimmed) return { ok: false, msg: '' };
    if (!isValidUsername(trimmed)) {
      return { ok: false, msg: USERNAME_RULES_HINT };
    }
    if (isOffensiveHandle(trimmed)) {
      return { ok: false, msg: 'That handle isn\'t allowed.' };
    }
    return { ok: true, msg: 'Looks good' };
  }, [handle]);

  const handleSubmit = async () => {
    if (!validation.ok || submitting) return;
    setSubmitting(true);
    const res = await setUsername({
      username: handle.trim(),
      displayName: displayName.trim() || undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      Alert.alert('Set!', 'Your community handle is ready.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
      return;
    }
    Alert.alert('Could not save', res.error);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Pick a handle</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.intro, { color: t.text }]}>
          Choose how you'll appear in the community. You can change this later in
          your profile settings.
        </Text>

        <Text style={[styles.label, { color: t.textSecondary }]}>Handle</Text>
        <GlassCard style={styles.inputCard}>
          <View style={styles.handleRow}>
            <Text style={[styles.atSign, { color: t.textSecondary }]}>@</Text>
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="petalk_user"
              placeholderTextColor={t.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              style={[styles.input, { color: t.text }]}
            />
          </View>
        </GlassCard>
        {handle.length > 0 && (
          <Text style={[styles.validationMsg, { color: validation.ok ? '#6FA891' : '#B45309' }]}>
            {validation.msg}
          </Text>
        )}
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          {USERNAME_RULES_HINT}
        </Text>

        <Text style={[styles.label, { color: t.textSecondary, marginTop: Spacing.md }]}>
          Display name (optional)
        </Text>
        <GlassCard style={styles.inputCard}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Real name or anything you like"
            placeholderTextColor={t.textSecondary}
            maxLength={60}
            style={[styles.input, { color: t.text }]}
          />
        </GlassCard>

        <View style={{ height: 24 }} />
        <GradientButton
          label={submitting ? 'Saving…' : 'Save handle'}
          onPress={handleSubmit}
          disabled={!validation.ok || submitting}
        />
      </View>
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
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  body: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  intro: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputCard: { paddingHorizontal: 12 },
  handleRow: { flexDirection: 'row', alignItems: 'center' },
  atSign: { fontSize: FontSizes.md, marginRight: 4 },
  input: { fontSize: FontSizes.md, paddingVertical: 12, flex: 1 },
  validationMsg: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  hint: { fontSize: 11, marginTop: 4 },
});
