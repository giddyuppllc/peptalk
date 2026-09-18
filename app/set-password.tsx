/**
 * Set a new password — the step the reset email has always promised.
 *
 * app/auth.tsx tells the user "follow the link to pick a new password" on both
 * the success and the error path of Forgot password. The link established a
 * session and routed on; `auth.updateUser({ password })` appeared nowhere in
 * the repo. This is the missing end of that flow.
 *
 * Reached only from app/_layout.tsx's deep-link handler, when the link's
 * `type` is `recovery`, and from Supabase's PASSWORD_RECOVERY event on web.
 * It is not in navMap and must not be: it is a step inside a flow, not a
 * destination.
 *
 * COPY: every string here already existed in app/auth.tsx or
 * src/utils/validation.ts — the field label, its placeholder, its
 * accessibility label and hint, the validation messages, and the button label
 * ("Continue", the neutral forward label CLAUDE.md prescribes). The screen
 * heading reuses the field label. Two of those are almost certainly not the
 * words Edward wants; they are listed for him rather than invented here.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PasswordToggle } from '../src/components/PasswordToggle';
import { validatePassword } from '../src/utils/validation';
import { describeAuthError } from '../src/lib/errorMessages';
import { captureException } from '../src/services/telemetry';
import { useAuthStore } from '../src/store/useAuthStore';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { postAuthLinkRoute } from '../src/lib/passwordRecovery';

const ACCENT = '#E89672';

export default function SetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  // The recovery link is what grants the session. Without one there is nothing
  // to update, and updateUser would fail with a confusing auth error — send
  // them back to sign in instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('../src/services/supabase');
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data?.session) {
          router.replace('/auth');
          return;
        }
        setChecking(false);
      } catch (err) {
        if (cancelled) return;
        captureException(err, { source: 'setPassword.session' });
        router.replace('/auth');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSave = async () => {
    const check = validatePassword(password);
    if (!check.valid) {
      setError(check.message);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { supabase } = await import('../src/services/supabase');
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      // Same rule as every other post-auth landing: respect completion, never
      // grant it. Never leave isComplete and isAuthenticated disagreeing.
      const ob = useOnboardingStore.getState();
      await useAuthStore.getState().restoreSession();
      router.replace(
        postAuthLinkRoute({
          recovery: false,
          onboardingComplete: ob.isComplete,
          hasGender: !!ob.profile?.gender,
        }) as never,
      );
    } catch (err) {
      captureException(err, { source: 'setPassword.update' });
      setError(describeAuthError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centre}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.heading} accessibilityRole="header">
            Password
          </Text>

          <Text style={s.inputLabel}>Password</Text>
          <View style={s.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
            <TextInput
              style={s.input}
              placeholder="8+ characters with a number"
              placeholderTextColor="#C7C7CC"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoComplete="password-new"
              textContentType="newPassword"
              accessibilityLabel="Password"
              accessibilityHint="Minimum 8 characters including at least one letter and one number"
              autoFocus
            />
            <PasswordToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />
          </View>

          {!!error && (
            <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <View style={s.primaryBtn}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={s.primaryBtnText}>Continue</Text>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </>
              )}
            </View>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 32 },
  heading: {
    fontSize: 26,
    fontFamily: 'DMSans-Bold',
    color: '#2D2D2D',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: '#2D2D2D',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    fontFamily: 'DMSans-Regular',
    color: '#2D2D2D',
  },
  error: {
    color: '#DC2626',
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
    marginTop: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
    color: '#FFFFFF',
  },
});
