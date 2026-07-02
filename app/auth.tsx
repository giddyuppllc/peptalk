/**
 * Auth Screen — Clean login/signup matching the onboarding aesthetic.
 * Includes legal disclaimer toggle for new signups.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PasswordToggle } from '../src/components/PasswordToggle';
import { useAuthStore } from '../src/store/useAuthStore';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { isValidEmail, validatePassword, PASSWORD_MIN_LENGTH } from '../src/utils/validation';

const ACCENT = '#E89672';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const isLoading = useAuthStore((s) => s.isLoading);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    // On login we don't enforce the full password strength rule — existing
    // accounts may have been created under the old 6-char rule, and the
    // server is the authoritative validator. We just want to catch empty
    // fields and obvious typos.
    if (!isValidEmail(normalizedEmail) || password.length === 0) {
      setError('Enter a valid email and password.');
      return;
    }
    setError('');
    try {
      await login(normalizedEmail, password);
      completeOnboarding();
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'Invalid email or password');
    }
  };

  const handleSignup = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!firstName.trim()) { setError('Enter your first name'); return; }
    if (!lastName.trim()) { setError('Enter your last name'); return; }
    if (!isValidEmail(normalizedEmail)) { setError('Enter a valid email'); return; }
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) { setError(pwCheck.message); return; }
    if (!acceptedTerms) { setError('You must accept the terms to continue'); return; }
    setError('');
    try {
      const result = await signup(firstName.trim(), lastName.trim(), normalizedEmail, password);
      if (result.requiresEmailConfirmation) {
        // Email-confirmation mode: Supabase returned the user but no
        // session. We can't drop them into tabs (authed calls would
        // 401). Surface a friendly note + switch this screen back to
        // the login mode so they can sign in once they tap the link.
        Alert.alert(
          'Check your email',
          `We sent a confirmation link to ${normalizedEmail}. Tap the link, then sign in here.`,
          [{ text: 'OK', onPress: () => switchMode('login') }],
        );
        return;
      }
      completeOnboarding();
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Try again.');
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError('Enter the email on your account above, then tap Forgot password again.');
      return;
    }
    if (resetting) return;
    setResetting(true);
    try {
      // Deep-link the reset back into the app. Without redirectTo the link
      // uses the dashboard "Site URL" (a web page) and can't complete in-app.
      // The app/_layout.tsx Linking handler picks up peptalk://auth/callback
      // and sets a session (verifyOtp for ?token_hash=...&type=recovery, or
      // setSession for the implicit #access_token fragment), dropping the
      // user in so they can set a new password. The redirect URL must also be
      // whitelisted in Supabase: Auth → URL Configuration → Redirect URLs.
      const { supabase } = await import('../src/services/supabase');
      const { error: resetErr } = await (supabase as any).auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: 'peptalk://auth/callback' },
      );
      if (resetErr) throw resetErr;
      Alert.alert(
        'Reset email sent',
        `If an account exists for ${normalizedEmail}, we sent a password-reset link. Open it on this device and follow the link to pick a new password.`,
      );
    } catch (err: any) {
      // Don't leak whether the email exists — return the same friendly
      // message on any error so scrapers can't enumerate accounts.
      Alert.alert(
        'Reset email sent',
        `If an account exists for ${normalizedEmail}, we sent a password-reset link. Check your inbox (and spam) and follow the link to pick a new password.`,
      );
      if (__DEV__) console.warn('[auth] resetPasswordForEmail threw:', err);
    } finally {
      setResetting(false);
    }
  };

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setError('');
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color="#2D2D2D" />
          </TouchableOpacity>

          {/* Logo */}
          <View style={s.logoWrap}>
            <Text style={s.logo}>PepTalk</Text>
            <View style={s.accentBar} />
            <Text style={s.logoSub}>Welcome back</Text>
          </View>

          {/* Tab switcher */}
          <View style={s.tabs} accessibilityRole="tablist">
            <TouchableOpacity
              style={[s.tab, mode === 'login' && s.tabActive]}
              onPress={() => switchMode('login')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'login' }}
              accessibilityLabel="Log in tab"
            >
              <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, mode === 'signup' && s.tabActive]}
              onPress={() => switchMode('signup')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signup' }}
              accessibilityLabel="Sign up tab"
            >
              <Text style={[s.tabText, mode === 'signup' && s.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <View style={s.form}>
              <Text style={s.inputLabel}>Email</Text>
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={s.input}
                  placeholder="you@email.com"
                  placeholderTextColor="#C7C7CC"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  accessibilityLabel="Email address"
                />
              </View>

              <Text style={s.inputLabel}>Password</Text>
              <View style={s.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={s.input}
                  placeholder="Enter password"
                  placeholderTextColor="#C7C7CC"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  autoComplete="current-password"
                  textContentType="password"
                  accessibilityLabel="Password"
                />
                <PasswordToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />
              </View>

              {!!error && <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}

              <TouchableOpacity
                onPress={handleLogin}
                activeOpacity={0.85}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Log in"
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
              >
                <View style={s.primaryBtn}>
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={s.primaryBtnText}>Log In</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.forgotBtn}
                onPress={handleForgotPassword}
                disabled={resetting}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                accessibilityState={{ disabled: resetting, busy: resetting }}
              >
                <Text style={s.forgotText}>
                  {resetting ? 'Sending reset email…' : 'Forgot password?'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── SIGNUP ── */}
          {mode === 'signup' && (
            <View style={s.form}>
              <View style={s.nameRow}>
                <View style={s.nameField}>
                  <Text style={s.inputLabel}>First Name</Text>
                  <View style={s.inputWrap}>
                    <Ionicons name="person-outline" size={18} color="#9CA3AF" />
                    <TextInput
                      style={s.input}
                      placeholder="First"
                      placeholderTextColor="#C7C7CC"
                      value={firstName}
                      onChangeText={setFirstName}
                      autoComplete="given-name"
                      textContentType="givenName"
                      accessibilityLabel="First name"
                    />
                  </View>
                </View>
                <View style={s.nameField}>
                  <Text style={s.inputLabel}>Last Name</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      placeholder="Last"
                      placeholderTextColor="#C7C7CC"
                      value={lastName}
                      onChangeText={setLastName}
                      autoComplete="family-name"
                      textContentType="familyName"
                      accessibilityLabel="Last name"
                    />
                  </View>
                </View>
              </View>

              <Text style={s.inputLabel}>Email</Text>
              <View style={s.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={s.input}
                  placeholder="you@email.com"
                  placeholderTextColor="#C7C7CC"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  accessibilityLabel="Email address"
                />
              </View>

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
                />
                <PasswordToggle visible={showPw} onToggle={() => setShowPw(!showPw)} />
              </View>

              {/* Legal disclaimer */}
              <View style={s.disclaimerCard}>
                <View style={s.disclaimerHeader}>
                  <Ionicons name="shield-checkmark" size={18} color={ACCENT} />
                  <Text style={s.disclaimerTitle}>Important Disclaimer</Text>
                </View>
                <Text style={s.disclaimerText}>
                  PepTalk is an educational tool only — it does not provide medical advice, diagnose conditions, or recommend treatments. Peptide information, dosing calculators, and health tracking features are for personal research and educational purposes only. Always consult a licensed healthcare provider before making any medical decisions. You accept full responsibility for how you use this information.
                </Text>
                <View style={s.disclaimerToggle}>
                  <Text style={s.disclaimerToggleText}>I understand and agree</Text>
                  <Switch
                    value={acceptedTerms}
                    onValueChange={setAcceptedTerms}
                    trackColor={{ false: 'rgba(0,0,0,0.10)', true: `${ACCENT}55` }}
                    thumbColor={acceptedTerms ? ACCENT : '#D1D5DB'}
                    accessibilityLabel="Accept terms and disclaimer"
                  />
                </View>
              </View>

              {!!error && <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}

              <TouchableOpacity
                onPress={handleSignup}
                activeOpacity={0.85}
                disabled={isLoading || !acceptedTerms}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                accessibilityState={{ disabled: isLoading || !acceptedTerms, busy: isLoading }}
              >
                <View style={[s.primaryBtn, (!acceptedTerms) && { opacity: 0.4 }]}>
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={s.primaryBtnText}>Create Account</Text>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <Text style={s.legalLinks}>
                By creating an account you agree to our{' '}
                <Text
                  style={s.legalLink}
                  onPress={() => router.push('/terms' as any)}
                  accessibilityRole="link"
                  accessibilityLabel="Open Terms of Service"
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={s.legalLink}
                  onPress={() => router.push('/privacy' as any)}
                  accessibilityRole="link"
                  accessibilityLabel="Open Privacy Policy"
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // Back
  backBtn: {
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  logo: {
    fontSize: 40,
    fontFamily: 'Playfair-Black',
    color: '#2D2D2D',
    letterSpacing: -1,
  },
  accentBar: {
    width: 36,
    height: 3,
    backgroundColor: ACCENT,
    borderRadius: 2,
    marginVertical: 10,
  },
  logoSub: {
    fontSize: 16,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#2D2D2D',
  },

  // Name row
  nameRow: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  nameField: {
    flex: 1,
  },

  // Form
  form: {
    gap: 0,
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

  // Primary button
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E89672',
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

  // Forgot
  forgotBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
    color: '#6B7280',
  },

  // Disclaimer
  disclaimerCard: {
    backgroundColor: '#FAF5EF',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: `${ACCENT}25`,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#2D2D2D',
  },
  disclaimerText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 14,
  },
  disclaimerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  disclaimerToggleText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    color: '#2D2D2D',
  },

  // Legal links
  legalLinks: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  legalLink: {
    color: ACCENT,
    fontFamily: 'DMSans-SemiBold',
  },
});
