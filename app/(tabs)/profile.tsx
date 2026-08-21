import React, { useState, useCallback } from 'react';
// 2026-05-17 perf fix: lazy-required inside the pickAvatar handler
// instead of statically imported. expo-image-picker pulls in a
// non-trivial native bridge surface; the profile tab loads at app
// boot and only ~5% of users ever tap the avatar. Save the parse +
// bridge init for users who actually need it.
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Switch, StyleSheet, Image, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Alert } from '../../src/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useTutorialStore } from '../../src/store/useTutorialStore';
import { GlassCard } from '../../src/components/GlassCard';
import { PasswordToggle } from '../../src/components/PasswordToggle';
// The three schedule* imports went with the dead NotificationSettings block —
// app/settings/notifications.tsx owns that scheduling now.
import { notificationsAvailable } from '../../src/services/notificationService';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useJournalStore } from '../../src/store/useJournalStore';
import { useMealStore } from '../../src/store/useMealStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useChatStore } from '../../src/store/useChatStore';
import { useCycleStore } from '../../src/store/useCycleStore';
import { usePantryStore } from '../../src/store/usePantryStore';
import { useStackStore } from '../../src/store/useStackStore';
import { useBodyMapStore } from '../../src/store/useBodyMapStore';
import { useAllergyStore } from '../../src/store/useAllergyStore';
import { useLabResultsStore } from '../../src/store/useLabResultsStore';
import { useIntegrationsStore } from '../../src/store/useIntegrationsStore';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
} from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useIsAdmin } from '../../src/hooks/useIsAdmin';
import { useThemeStore } from '../../src/store/useThemeStore';
import { sendFeedback } from '../../src/services/feedback';
import { disableReviewPrompt } from '../../src/services/reviewPrompt';

// ---------------------------------------------------------------------------
// Progress Ring Component
// ---------------------------------------------------------------------------
// ProgressRing() removed — defined here, rendered nowhere (57 lines).

// ---------------------------------------------------------------------------
// Tier Badge
// ---------------------------------------------------------------------------
const TIER_CONFIG: Record<string, { label: string; colors: { dark: [string, string]; light: [string, string] }; icon: string }> = {
  free: { label: 'Free', colors: { dark: ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)'], light: ['#d1d5db', '#6B7280'] }, icon: 'person-outline' },
  starter: { label: 'Starter', colors: { dark: ['#E89672', '#E89672'], light: ['#E89672', '#E89672'] }, icon: 'rocket-outline' },
  pro: { label: 'Pro', colors: { dark: [Colors.rose, Colors.roseDark], light: [Colors.rose, Colors.roseDark] }, icon: 'star' },
  elite: { label: 'Elite', colors: { dark: ['#A4D9D1', '#EC4899'], light: ['#A4D9D1', '#EC4899'] }, icon: 'diamond' },
};

function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.free;
  const t = useTheme();
  const gradientColors = t.isDark ? config.colors.dark : config.colors.light;
  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={tierStyles.badge}
    >
      <Ionicons name={config.icon as any} size={12} color="#fff" />
      <Text style={tierStyles.text}>{config.label}</Text>
    </LinearGradient>
  );
}

const tierStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  text: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

// ---------------------------------------------------------------------------
// Login Form
// ---------------------------------------------------------------------------
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, isLoading } = useAuthStore();
  const t = useTheme();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setError(null);
    try {
      await login(email.trim(), password.trim());
    } catch (err: any) {
      // Supabase throws readable errors — surface them so the user
      // isn't stuck on a silent spinner wondering what happened.
      const msg = String(err?.message ?? err ?? '').trim();
      if (/invalid\s*login\s*credentials/i.test(msg)) {
        setError('Email or password is wrong. Try again.');
      } else if (/email\s*not\s*confirmed/i.test(msg)) {
        setError('Check your inbox — you need to confirm your email first.');
      } else if (/rate|too\s*many/i.test(msg)) {
        setError('Too many attempts. Wait a minute and try again.');
      } else if (/network|fetch|offline/i.test(msg)) {
        setError('Can\'t reach the server. Check your connection.');
      } else {
        setError(msg || 'Login failed. Try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
    <ScrollView
      contentContainerStyle={styles.loginContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Branding */}
      <View style={styles.brandingSection}>
        <LinearGradient
          colors={[Colors.rose, Colors.roseDark]}
          style={styles.brandIconGradient}
        >
          <View style={[styles.brandIconInner, { backgroundColor: t.bg }]}>
            <Ionicons name="flask" size={36} color={Colors.rose} />
          </View>
        </LinearGradient>
        <Text style={[styles.brandTitle, { color: t.text }]}>PepTalk</Text>
        <Text style={[styles.brandSubtitle, { color: t.textSecondary }]}>
          Sign in to save your stacks, sync favorites, and access Pro features
        </Text>
      </View>

      {/* Login Form */}
      <GlassCard variant="elevated" style={styles.formCard}>
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: t.textSecondary }]}>Email</Text>
          <View style={[styles.inputContainer, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            <Ionicons name="mail-outline" size={18} color={t.textSecondary} />
            <TextInput
              style={[styles.input, { color: t.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={t.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#e3a7a1"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: t.textSecondary }]}>Password</Text>
          <View style={[styles.inputContainer, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={18} color={t.textSecondary} />
            <TextInput
              style={[styles.input, { color: t.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={t.placeholder}
              secureTextEntry={!showPw}
              autoComplete="current-password"
              textContentType="password"
              selectionColor="#e3a7a1"
            />
            <PasswordToggle
              visible={showPw}
              onToggle={() => setShowPw(!showPw)}
              color={t.textSecondary}
            />
          </View>
        </View>

        {error && (
          <View style={styles.loginErrorBox}>
            <Ionicons name="alert-circle" size={14} color="#B91C1C" />
            <Text style={styles.loginErrorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading || !email.trim() || !password.trim()}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={
              (!email.trim() || !password.trim())
                ? ['rgba(227, 167, 161, 0.3)', 'rgba(201, 138, 132, 0.3)']
                : [Colors.rose, Colors.roseDark]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.loginButton}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </GlassCard>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------
function UserProfile() {
  const { user, logout, setAvatar } = useAuthStore();
  const { tier } = useSubscriptionStore();
  // Single source of truth for Pro status: the subscription store's `tier`
  // (what the badge, the Pro-Active banner, and feature gating all use).
  // Previously the Plan stat + Pro-Status row read `user.isPro` from the auth
  // store, which can drift from `tier` (e.g. when the subscription store
  // rehydrates a tier the auth profile mirror hasn't caught up to) — that's
  // what produced the "PRO badge + Pro-Active banner but Plan: Free" mismatch.
  const isPro = tier === 'pro';
  const t = useTheme();
  const router = useRouter();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const darkMode = t.isDark;

  const pickAvatar = useCallback(async () => {
    // Lazy-load the native module so boot doesn't pay for it.
    const ImagePicker = await import('expo-image-picker');
    Alert.alert('Profile Photo', 'Choose a photo', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            // 5.1.1(iv): neutral notice + genuine choice, never a coercive "required".
            Alert.alert('Camera is off', 'Taking a profile photo uses the camera. You can turn it on in Settings whenever you like.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ]);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setAvatar(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          // Android uses the system Photo Picker (no permission needed),
          // so a non-granted result must NOT block the picker there. iOS
          // still requires the library permission.
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted && Platform.OS !== 'android') {
            Alert.alert('Photos are off', 'Choosing a profile photo uses your photo library. You can turn it on in Settings whenever you like.', [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ]);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setAvatar(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [setAvatar]);

  if (!user) return null;

  return (
    <View>
      {/* User Info Card */}
      <GlassCard variant="elevated" style={styles.profileCard}>
        {/* Avatar with gradient border — tappable to change photo */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={pickAvatar}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityHint="Opens your photo library"
        >
          <LinearGradient
            colors={[t.primary, t.secondary, t.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradientRing}
          >
            {user.avatarUri ? (
              <Image source={{ uri: user.avatarUri }} style={[styles.avatar, { backgroundColor: t.bg }]} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={36} color={t.primary} />
              </View>
            )}
          </LinearGradient>
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </TouchableOpacity>

        <Text style={[styles.userName, { color: t.text }]}>{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Researcher'}</Text>
        <Text style={[styles.userEmail, { color: t.textSecondary }]}>{user.email}</Text>

        {/* Subscription Badge */}
        <View style={{ marginTop: Spacing.sm }}>
          <TierBadge tier={tier} />
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { borderTopColor: t.glassBorder }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: t.text }]}>
              {user.favoritePeptides.length}
            </Text>
            <Text style={[styles.statLabel, { color: t.textSecondary }]}>Favorites</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: t.glassBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: t.text }]}>
              {user.savedStacks.length}
            </Text>
            <Text style={[styles.statLabel, { color: t.textSecondary }]}>Stacks</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: t.glassBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: t.text }, isPro && styles.proActive]}>
              {isPro ? 'Active' : 'Free'}
            </Text>
            <Text style={[styles.statLabel, { color: t.textSecondary }]}>Plan</Text>
          </View>
        </View>
      </GlassCard>

      {/* Upgrade hero row — only for non-pro tiers */}
      {tier !== 'pro' && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/subscription')}
          style={styles.upgradeRowWrap}
        >
          <LinearGradient
            colors={tier === 'free' ? ['#E89672', '#F2D8D5'] : ['#7FB3D8', '#3E7CB1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.upgradeRowGradient}
          >
            <View style={styles.upgradeRowIcon}>
              <Ionicons
                name={tier === 'free' ? 'sparkles' : 'star'}
                size={22}
                color="#fff"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeRowTitle}>
                {tier === 'free' ? 'Upgrade to PepTalk+' : 'Upgrade to PepTalk Pro'}
              </Text>
              <Text style={styles.upgradeRowBody}>
                {tier === 'free'
                  ? 'Unlimited tracking, Aimee chat, Food Scanner & more'
                  : 'Workout programs, recipes, health reports & more'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {tier === 'pro' && (
        <View style={styles.upgradeRowWrap}>
          <LinearGradient
            colors={['#7FB3D8', '#3E7CB1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.upgradeRowGradient}
          >
            <View style={styles.upgradeRowIcon}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeRowTitle}>PepTalk Pro Active</Text>
              <Text style={styles.upgradeRowBody}>
                You have access to every feature. Thanks for supporting PepTalk.
              </Text>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Settings Section */}
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsSectionTitle, { color: t.text }]}>Settings</Text>

        {/* Pro Status — read-only badge.
            Previously a Switch with onValueChange={() => {}}. Visually
            looked interactive but did nothing — confusing UX and an
            accessibility violation (announced as a togglable switch
            but had no effect). Tap routes to the paywall for free
            users; for Pro users it's a static "Active" badge. */}
        <TouchableOpacity
          activeOpacity={isPro ? 1 : 0.8}
          disabled={isPro}
          onPress={() => router.push('/subscription' as never)}
          accessibilityRole={isPro ? 'text' : 'button'}
          accessibilityLabel={
            isPro
              ? 'Pro plan active'
              : 'Upgrade to Pro for advanced analysis features'
          }
        >
          <GlassCard style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(227, 167, 161, 0.12)' }]}>
                  <Ionicons name="star-outline" size={18} color="#e3a7a1" />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: t.text }]}>Pro Status</Text>
                  <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                    {isPro
                      ? 'Pro plan is active — all features unlocked'
                      : 'Tap to upgrade and unlock advanced analysis'}
                  </Text>
                </View>
              </View>
              {isPro ? (
                <View style={[styles.proPill, { backgroundColor: 'rgba(227, 167, 161, 0.2)' }]}>
                  <Text style={[styles.proPillText, { color: '#e3a7a1' }]}>Active</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
              )}
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Advanced fitness inputs — RPE, tempo, %1RM, rest intervals.
            Off by default; the custom workout builder shows just sets ×
            reps. Power users can flip this on for the full prescription
            form. */}
        <AdvancedFitnessToggle t={t} />

        {/* Dark Mode removed — app uses gender-based light themes only */}
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Advanced Fitness Toggle
// ---------------------------------------------------------------------------
function AdvancedFitnessToggle({ t }: { t: ReturnType<typeof useTheme> }) {
  const showAdvancedFitness = useOnboardingStore((st) => st.showAdvancedFitness);
  const setShowAdvancedFitness = useOnboardingStore((st) => st.setShowAdvancedFitness);

  return (
    <GlassCard style={styles.settingCard}>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(122, 190, 208, 0.14)' }]}>
            <Ionicons name="options-outline" size={18} color="#5BA9A7" />
          </View>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.settingTitle, { color: t.text }]}>Advanced fitness inputs</Text>
            <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
              Show RPE, tempo, and rest intervals in the workout builder
            </Text>
          </View>
        </View>
        <Switch
          value={showAdvancedFitness}
          onValueChange={setShowAdvancedFitness}
          trackColor={{
            false: 'rgba(0,0,0,0.08)',
            true: 'rgba(122, 190, 208, 0.5)',
          }}
          thumbColor={showAdvancedFitness ? '#5BA9A7' : '#6B7280'}
        />
      </View>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Research Profile Card
// ---------------------------------------------------------------------------
// ResearchProfileCard() removed — defined here, rendered nowhere (150 lines).

// ---------------------------------------------------------------------------
// Health Profile Card
// ---------------------------------------------------------------------------
// HealthProfileCard() removed — defined here, rendered nowhere (123 lines).

// ---------------------------------------------------------------------------
// Quick Links Section
// ---------------------------------------------------------------------------
// QuickLinksSection() removed — defined here, rendered nowhere (61 lines).
// Its two links were Health Report (already a live row) and My Journal, which
// had NO other route into it anywhere in the app. A live Journal row was added
// before this deletion, or the app would have lost its only path to /journal.

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  btn: { flex: 1 },
  gradient: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    height: 100,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
  },
});

// ---------------------------------------------------------------------------
// Notification Settings
// ---------------------------------------------------------------------------
// WEEKDAY_NUMBERS and weekdayNumberToLabel went with NotificationSettings —
// they existed only to render its workout-reminder day picker. DAY_LABELS stays;
// it is still used below.
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// NotificationSettings() lived here — ~340 lines defining the whole
// notification preferences UI, referenced by nothing. It was superseded by
// app/settings/notifications.tsx (reachable from the Settings row below), and
// the dead copy stayed behind looking authoritative.
//
// Found by grepping the exported web bundle: "Enable Notifications" and every
// other string in it was absent, because the bundler tree-shook a component
// nothing renders. A Workout-sounds toggle added to this copy earlier today
// type-checked, linted and could never be reached — which is the whole reason
// to check the built artifact rather than the source.

/** Schedule workout reminders for the given days. */


/** Schedule meal reminders for all meal types. */


/**
 * Re-schedule dose reminders for every active protocol. Mirrors the auto-
 * scheduling useDoseLogStore does on protocol activation (08:00 default,
 * anchored to the protocol start date). scheduleDoseReminder sweeps the
 * peptide's existing identifiers first, so this is idempotent.
 */


// ---------------------------------------------------------------------------
// Legal Links
// ---------------------------------------------------------------------------
// LegalLinks() removed — defined here, rendered nowhere (41 lines).

const linkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: { flex: 1 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },
  desc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  legalSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  legalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legalDivider: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.10)',
  },
  privacyText: {
    fontSize: 12,
    color: '#6B7280',
  },
  versionText: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.12)',
    marginTop: 10,
    letterSpacing: 0.5,
  },
});

// ---------------------------------------------------------------------------
// Delete Data Section
// ---------------------------------------------------------------------------
// DeleteDataSection() removed — defined here, rendered nowhere (38 lines).

const deleteStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  hint: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const profileStyles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  pageTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, color: '#2D2D2D', marginTop: 12, marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  divider: { height: 1, marginLeft: 48 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8 },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  version: { fontSize: 12, textAlign: 'center', marginTop: 16 },
});

// Simple row component for profile menu items
function ProfileRow({ icon, label, onPress, color }: { icon: string; label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity style={profileStyles.row} onPress={onPress} activeOpacity={0.6} accessibilityRole="button">
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[profileStyles.rowLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#6b7280" />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { isAuthenticated, logout, user } = useAuthStore();
  const t = useTheme();
  const router = useRouter();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const isAdmin = useIsAdmin();

  const handleDelete = () => {
    Alert.alert(
      'Delete My Data',
      'This will permanently remove all health data, dose logs, check-ins, and chat history from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Local data wipe — clear EVERY user-data store on this device.
            // (Server-side account deletion is handled separately via the
            // delete-user edge function in handleDeleteAccount; this path is
            // device-local only and must not leave orphaned data behind.)
            useOnboardingStore.getState().reset();
            useHealthProfileStore.getState().resetProfile();
            useDoseLogStore.getState().clearAll();
            useCheckinStore.getState().clearAll();
            useJournalStore.getState().clearAll();
            useMealStore.getState().clearAll();
            useWorkoutStore.getState().clearAll();
            useChatStore.getState().resetForLogout(); // no clearAll; wipes all threads + queued syncs
            useCycleStore.getState().clearAll();
            usePantryStore.getState().clearAll();
            useStackStore.getState().clearAll();
            useBodyMapStore.getState().clearAll();
            useAllergyStore.getState().clearAll();
            useLabResultsStore.getState().clearAll();
            useIntegrationsStore.getState().clearAll();
            Alert.alert('Done', 'All data has been deleted.');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    // Subscription warning is shown FIRST when the user has an active
    // Plus/Pro subscription, because deleting the PepTalk account doesn't
    // automatically cancel the Apple/Google subscription — the user
    // would keep getting charged until they manually cancel in iOS
    // Settings. We want to surface that clearly so we don't end up with
    // a refund-request support ticket.
    //
    // Use getStatus() rather than raw tier, so we don't fire the
    // "will keep renewing" scare on users whose subscription is
    // already expired/cancelled. P1 from Wave 76.7 IAP audit.
    const subState = useSubscriptionStore.getState();
    const tier = subState.tier;
    const status = typeof subState.getStatus === 'function'
      ? subState.getStatus()
      : (tier === 'free' ? 'none' : 'active');
    // Only the states where Apple will keep billing show the warning.
    const willKeepBilling = status === 'active' || status === 'expiring' || status === 'trial';
    const hasActiveSubscription =
      (tier === 'plus' || tier === 'pro') && willKeepBilling;

    const runDestructiveConfirm = () => {
      Alert.alert(
        'Delete Account',
        'This will permanently delete your account and ALL data from our servers. This cannot be undone. You will be signed out immediately.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Account',
            style: 'destructive',
            onPress: async () => {
              try {
                // All server + local teardown lives behind this single
                // store action so a future change (additional cleanup,
                // analytics event, etc.) has one place to update.
                await useAuthStore.getState().deleteAccount();
                Alert.alert('Account Deleted', 'Your account and all data have been permanently removed.');
              } catch (err: any) {
                if (__DEV__) console.warn('[profile] delete account failed:', err);
                Alert.alert(
                  'Deletion Failed',
                  err?.message ?? "We couldn't delete your account right now. Please try again or contact support.",
                );
              }
            },
          },
        ],
      );
    };

    if (hasActiveSubscription) {
      const tierName = tier === 'pro' ? 'PepTalk Pro' : 'PepTalk+';
      const message = status === 'expiring'
        ? `Your ${tierName} subscription is set to renew soon through your Apple ID. Deleting your PepTalk account does NOT cancel that renewal — Apple owns billing.\n\nTap "Manage subscription" first to turn off auto-renew, then come back to delete.`
        : `Your ${tierName} subscription will keep renewing through your Apple ID unless you cancel it FIRST.\n\nDeleting your PepTalk account does NOT cancel your Apple subscription — Apple owns billing.\n\nWe recommend you tap "Manage subscription" first to cancel through Apple, then come back to delete the account.`;
      Alert.alert(
        'Subscription still active',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Manage subscription first',
            onPress: () => router.push('/subscription' as any),
          },
          {
            text: 'Delete account anyway',
            style: 'destructive',
            onPress: runDestructiveConfirm,
          },
        ],
      );
      return;
    }

    runDestructiveConfirm();
  };


  return (
    <SafeAreaView style={[profileStyles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={profileStyles.scroll}
      >
        {/* ── Header ── */}
        {/* Tab bar is hidden on this screen, so give users an explicit way
            back to Home. Same target as HomeFab: router.push('/(tabs)'). */}
        <View style={profileStyles.headerRow}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)' as never)}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[profileStyles.backBtn, { backgroundColor: t.card, borderColor: t.cardBorder }]}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color={t.text} />
          </TouchableOpacity>
          <Text style={[profileStyles.pageTitle, { color: t.text }]}>Profile</Text>
        </View>

        {/* ── Auth: Login or User Card ── */}
        {isAuthenticated ? <UserProfile /> : <LoginForm />}

        {/* ── Account Section ── */}
        {isAuthenticated && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>ACCOUNT</Text>
            <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <ProfileRow icon="person-outline" label="Edit Profile" onPress={() => router.push('/onboarding?edit=true' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="body-outline" label="Health Profile" onPress={() => router.push('/health-profile')} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="flask-outline" label="Lab Results" onPress={() => router.push('/health-report/labs' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="flower-outline" label="Cycle tracking" onPress={() => router.push('/cycle' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="basket-outline" label="My Pantry" onPress={() => router.push('/pantry' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="diamond-outline" label="Subscription" onPress={() => router.push('/subscription')} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="calendar-outline" label="My Plan" onPress={() => router.push('/plan' as any)} color={t.text} />
              <ProfileRow icon="analytics-outline" label="Insights" onPress={() => router.push('/insights' as any)} color={t.text} />
              {/* Journal — restoring a door that only existed inside dead code.
                  app/journal has two working screens and health-report reads
                  its entries, but the ONLY navigation to '/journal' anywhere in
                  the app was the route string inside QuickLinksSection, a
                  component defined here and rendered nowhere.

                  verify:routes did not catch it because that check counts any
                  path-shaped string as a link — a limitation its own header
                  documents. A string in dead code satisfied it. */}
              <ProfileRow icon="book-outline" label="My Journal" onPress={() => router.push('/journal' as any)} color={t.text} />
              <ProfileRow icon="document-text-outline" label="Health Report" onPress={() => router.push('/health-report' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="library-outline" label="Sources & references" onPress={() => router.push('/resources' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="people-outline" label="Community" onPress={() => router.push('/community' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              {/* §4.6 — manually pin a v3 theme variant regardless of sex. */}
              <ProfileRow icon="color-palette-outline" label="Appearance" onPress={() => router.push('/profile/appearance' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              {/* §12 + §13.5 — opt-in public-tracking categories. */}
              <ProfileRow icon="people-circle-outline" label="Public sharing" onPress={() => router.push('/profile/community-prefs' as any)} color={t.text} />
            </View>
          </View>
        )}

        {/* ── Admin Section (visible only to admin emails) ── */}
        {isAdmin && (
          <View style={profileStyles.section}>
            <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>ADMIN</Text>
            <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <ProfileRow
                icon="radio-outline"
                label="Start a live event"
                onPress={() => router.push('/admin/start-live' as any)}
                color={t.text}
              />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow
                icon="shield-checkmark-outline"
                label="Moderation queue"
                onPress={() => router.push('/admin/community-queue' as any)}
                color={t.text}
              />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow
                icon="film-outline"
                label="Workout video tagger"
                onPress={() => router.push('/admin/video-tagger' as any)}
                color={t.text}
              />
            </View>
          </View>
        )}

        {/* ── Settings Section ── */}
        <View style={profileStyles.section}>
          <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>SETTINGS</Text>
          <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <ProfileRow icon="heart-outline" label={Platform.OS === 'ios' ? 'Apple Health & Integrations' : 'Health Connect & Integrations'} onPress={() => router.push('/settings/integrations' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="gift-outline" label="Referral code" onPress={() => router.push('/settings/referral' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="ban-outline" label="Blocked users" onPress={() => router.push('/community/blocked-users' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="lock-closed-outline" label="Privacy" onPress={() => router.push('/settings/privacy' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="snow-outline" label="Food safety windows" onPress={() => router.push('/settings/food-safety' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow
              icon="notifications-outline"
              label={notificationsAvailable() ? 'Notifications' : 'Notifications · Off'}
              onPress={() => {
                if (notificationsAvailable()) {
                  router.push('/settings/notifications' as any);
                  return;
                }
                Alert.alert(
                  'Notifications currently off',
                  "Push notifications are disabled in this build while we sort out a native compatibility issue. In-app banners still show for urgent items like expiring meal preps. We'll re-enable push in a later update.",
                );
              }}
              color={t.text}
            />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow
              icon="help-circle-outline"
              label="Replay intro tour"
              onPress={() => {
                useTutorialStore.getState().resetTour();
                useTutorialStore.getState().startTour();
                router.push('/(tabs)' as any);
              }}
              color={t.text}
            />
          </View>
        </View>

        {/* ── Support Section ── */}
        <View style={profileStyles.section}>
          <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>SUPPORT</Text>
          <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <ProfileRow
              icon="chatbubble-ellipses-outline"
              label="Send feedback"
              onPress={() => sendFeedback({ kind: 'feedback', userEmail: user?.email, userId: user?.id })}
              color={t.text}
            />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow
              icon="bug-outline"
              label="Report a bug"
              onPress={() => sendFeedback({ kind: 'bug', userEmail: user?.email, userId: user?.id })}
              color={t.text}
            />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow
              icon="star-outline"
              label="Don't ask me to review PepTalk"
              onPress={() => {
                disableReviewPrompt();
                Alert.alert('Got it', "We won't prompt you for an App Store review again. You can still leave one anytime from the App Store listing.");
              }}
              color={t.text}
            />
          </View>
        </View>

        {/* ── Data Section ── */}
        <View style={profileStyles.section}>
          <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>DATA</Text>
          <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <ProfileRow icon="download-outline" label="Export My Data" onPress={() => router.push('/health-report' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="trash-outline" label="Delete My Data" onPress={handleDelete} color="#ef4444" />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="close-circle-outline" label="Delete Account" onPress={handleDeleteAccount} color="#ef4444" />
          </View>
        </View>

        {/* ── Legal ── */}
        <View style={profileStyles.section}>
          <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <ProfileRow icon="shield-outline" label="Privacy Policy" onPress={() => router.push('/privacy')} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="document-outline" label="Terms of Service" onPress={() => router.push('/terms')} color={t.text} />
          </View>
        </View>

        {/* ── Sign Out ── */}
        {isAuthenticated && (
          <TouchableOpacity style={profileStyles.signOutBtn} onPress={logout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={profileStyles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}

        <Text style={[profileStyles.version, { color: t.textSecondary }]}>PepTalk v{Constants.expoConfig?.version ?? '1.9.8'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: '800',
    color: Colors.bone,
    letterSpacing: -0.5,
  },

  // -- Login Form
  loginContainer: {
    marginTop: Spacing.md,
    paddingBottom: 40,
    flexGrow: 1,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  brandIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  brandIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.darkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.bone,
    marginBottom: 6,
  },
  brandSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  formCard: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
    padding: 0,
  },
  loginButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: '#fff',
  },
  loginErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  loginErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
    fontWeight: '600',
  },

  // -- User Profile
  profileCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginTop: Spacing.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarGradientRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.darkBg,
    borderWidth: 2,
    borderColor: Colors.pepTeal,
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.rose,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0EEE9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  proBadgeWrap: {
    position: 'absolute',
    bottom: 0,
    right: -2,
  },
  proBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  proText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.bone,
  },
  userEmail: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.bone,
  },
  proActive: {
    color: Colors.sage,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // -- Upgrade row (hero)
  upgradeRowWrap: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#E89672',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  upgradeRowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  upgradeRowIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeRowTitle: {
    fontSize: 16,
    fontFamily: 'Playfair-Black',
    color: '#fff',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  upgradeRowBody: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    color: 'rgba(255,255,255,0.92)',
  },

  // -- Settings
  settingsSection: {
    marginTop: Spacing.xl,
  },
  settingsSectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    color: Colors.darkText,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  researchSection: {
    marginTop: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  incompleteBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(240, 214, 138, 0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
  },
  incompleteBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f0d68a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  researchCard: {
    paddingVertical: Spacing.sm,
  },
  consentDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: Spacing.sm,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  profileLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  profileValue: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  profileActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(199, 215, 230, 0.2)',
    paddingVertical: 10,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  profileActionText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: '#c7d7e6',
  },
  settingCard: {
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  proPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 4,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkText,
  },
  settingDescription: {
    fontSize: 11,
    color: Colors.darkTextSecondary,
    marginTop: 1,
  },

  // -- Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.25)',
    backgroundColor: 'rgba(227, 167, 161, 0.06)',
    paddingVertical: 14,
    marginTop: Spacing.xl,
    gap: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e3a7a1',
  },

  // -- Footer
  footerBranding: {
    marginTop: Spacing.xl,
  },
  brandFooterCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  brandFooterIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  brandFooterName: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    color: Colors.bone,
    letterSpacing: -0.3,
  },
  brandFooterTagline: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Health Profile Styles
// ---------------------------------------------------------------------------
const healthStyles = StyleSheet.create({
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  progressInfo: {
    flex: 1,
  },
  progressTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    gap: 6,
    marginTop: 12,
  },
  editButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: '#c7d7e6',
  },
});

// ---------------------------------------------------------------------------
// Notification Styles
// ---------------------------------------------------------------------------
const notifStyles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.sm,
    marginTop: 10,
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginTop: 4,
  },
  dayChip: {
    width: 40,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  dayChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  dayChipTextActive: {
    color: '#F4ECC2',
  },
  mealList: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    gap: 6,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  mealLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.darkText,
  },
  mealTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    minWidth: 46,
    textAlign: 'right',
  },
});


