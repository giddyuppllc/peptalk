import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useTutorialStore } from '../../src/store/useTutorialStore';
import { GlassCard } from '../../src/components/GlassCard';
import { Disclaimer } from '../../src/components/Disclaimer';
import { trackConsentUpdated } from '../../src/services/analyticsEvents';
import { useNotificationStore } from '../../src/store/useNotificationStore';
import { notificationsAvailable } from '../../src/services/notificationService';
import {
  scheduleDailyCheckInReminder,
  cancelAllReminders,
  scheduleWorkoutReminder,
  scheduleMealReminder,
  scheduleWeeklyReport,
  cancelRemindersByTag,
} from '../../src/services/notificationService';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
  Gradients,
} from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useThemeStore } from '../../src/store/useThemeStore';
import { getTestProfile } from '../../src/constants/testProfiles';
import { sendFeedback } from '../../src/services/feedback';
import { disableReviewPrompt } from '../../src/services/reviewPrompt';

// ---------------------------------------------------------------------------
// Progress Ring Component
// ---------------------------------------------------------------------------
function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 5,
  color = Colors.sage,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: progress / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'rgba(0,0,0,0.05)',
        }}
      />
      {/* Filled portion - simplified arc using border trick */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          borderTopColor: progress > 75 ? color : 'transparent',
          borderRightColor: progress > 50 ? color : 'transparent',
          borderBottomColor: progress > 25 ? color : 'transparent',
          borderLeftColor: progress > 0 ? color : 'transparent',
          transform: [{ rotate: '-90deg' }],
          opacity: 0.8,
        }}
      />
      <Text style={{ fontSize: FontSizes.sm, fontWeight: '800', color }}>{progress}%</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tier Badge
// ---------------------------------------------------------------------------
const TIER_CONFIG: Record<string, { label: string; colors: { dark: [string, string]; light: [string, string] }; icon: string }> = {
  free: { label: 'Free', colors: { dark: ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.04)'], light: ['#d1d5db', '#6B7280'] }, icon: 'person-outline' },
  starter: { label: 'Starter', colors: { dark: ['#E89672', '#E89672'], light: ['#E89672', '#E89672'] }, icon: 'rocket-outline' },
  pro: { label: 'Pro', colors: { dark: [Colors.rose, Colors.roseDark], light: [Colors.rose, Colors.roseDark] }, icon: 'star' },
  elite: { label: 'Elite', colors: { dark: ['#BADDCB', '#EC4899'], light: ['#BADDCB', '#EC4899'] }, icon: 'diamond' },
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
    <View style={styles.loginContainer}>
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
              secureTextEntry
              selectionColor="#e3a7a1"
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------
function UserProfile() {
  const { user, logout, setAvatar } = useAuthStore();
  const { tier } = useSubscriptionStore();
  const t = useTheme();
  const router = useRouter();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const darkMode = t.isDark;

  const pickAvatar = useCallback(async () => {
    Alert.alert('Profile Photo', 'Choose a photo', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Camera permission required'); return; }
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
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Photo library permission required'); return; }
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
        <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar} activeOpacity={0.8}>
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
            <Text style={[styles.statValue, { color: t.text }, user.isPro && styles.proActive]}>
              {user.isPro ? 'Active' : 'Free'}
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
            colors={tier === 'free' ? ['#E89672', '#F5DAD6'] : ['#7FB3D8', '#3E7CB1']}
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

        {/* Pro Status Toggle */}
        <GlassCard style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(227, 167, 161, 0.12)' }]}>
                <Ionicons name="star-outline" size={18} color="#e3a7a1" />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: t.text }]}>Pro Status</Text>
                <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                  Access advanced analysis features
                </Text>
              </View>
            </View>
            <Switch
              value={user.isPro}
              onValueChange={() => {}}
              trackColor={{
                false: 'rgba(0,0,0,0.08)',
                true: 'rgba(227, 167, 161, 0.4)',
              }}
              thumbColor={user.isPro ? '#e3a7a1' : '#6B7280'}
            />
          </View>
        </GlassCard>

        {/* Dark Mode removed — app uses gender-based light themes only */}
      </View>

    </View>
  );
}

// ---------------------------------------------------------------------------
// Research Profile Card
// ---------------------------------------------------------------------------
function ResearchProfileCard() {
  const router = useRouter();
  const {
    profile,
    isComplete,
    setAcceptedSafety,
    setDataShareConsent,
    reset,
  } = useOnboardingStore();
  const { user } = useAuthStore();
  const t = useTheme();

  // Use hardcoded data for test accounts, fall back to onboarding store
  const testProfile = getTestProfile(user?.email);
  const displayGender = testProfile?.gender ?? profile.gender ?? 'Not set';
  const displayAgeRange = testProfile?.ageRange ?? profile.ageRange ?? 'Not set';
  const displayInterests = testProfile?.interests ?? (profile.interestCategories.length > 0 ? profile.interestCategories : null);
  const displayGoals = testProfile?.goals ?? (profile.healthGoals.length > 0 ? profile.healthGoals : null);

  const handleSafetyToggle = (value: boolean) => {
    setAcceptedSafety(value);
    trackConsentUpdated(value, profile.dataShareConsent);
  };

  const handleShareToggle = (value: boolean) => {
    setDataShareConsent(value);
    trackConsentUpdated(profile.acceptedSafety, value);
  };

  const handleReset = () => {
    Alert.alert(
      'Restart Onboarding',
      'This will clear your research profile selections.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: () => {
            reset();
            router.push('/onboarding');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.researchSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.settingsSectionTitle, { color: t.text }]}>Research Profile</Text>
        {!isComplete && (
          <View style={styles.incompleteBadgeWrap}>
            <Ionicons name="alert-circle" size={12} color="#f0d68a" />
            <Text style={styles.incompleteBadge}>Incomplete</Text>
          </View>
        )}
      </View>
      <GlassCard variant="elevated" style={styles.researchCard}>
        <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
          <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Gender</Text>
          <Text style={[styles.profileValue, { color: t.text }]}>
            {displayGender}
          </Text>
        </View>
        <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
          <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Age Range</Text>
          <Text style={[styles.profileValue, { color: t.text }]}>
            {displayAgeRange}
          </Text>
        </View>
        <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
          <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Goals</Text>
          <Text style={[styles.profileValue, { color: t.text }]}>
            {displayGoals
              ? displayGoals.map((g) => g.replace(/_/g, ' ')).join(', ')
              : 'Not set'}
          </Text>
        </View>
        <View style={[styles.profileRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Interests</Text>
          <Text style={[styles.profileValue, { color: t.text }]}>
            {displayInterests
              ? displayInterests.join(', ')
              : 'Not set'}
          </Text>
        </View>

        <View style={[styles.consentDivider, { backgroundColor: t.glassBorder }]} />

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(240, 214, 138, 0.12)' }]}>
              <Ionicons name="shield-outline" size={18} color="#f0d68a" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Safety Acknowledgement</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Research-only usage confirmed
              </Text>
            </View>
          </View>
          <Switch
            value={profile.acceptedSafety}
            onValueChange={handleSafetyToggle}
            trackColor={{
              false: 'rgba(0,0,0,0.08)',
              true: 'rgba(240, 214, 138, 0.4)',
            }}
            thumbColor={profile.acceptedSafety ? '#f0d68a' : '#6B7280'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(199, 215, 230, 0.12)' }]}>
              <Ionicons name="analytics-outline" size={18} color="#c7d7e6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Data Sharing</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Share anonymous usage insights
              </Text>
            </View>
          </View>
          <Switch
            value={profile.dataShareConsent}
            onValueChange={handleShareToggle}
            trackColor={{
              false: 'rgba(0,0,0,0.08)',
              true: 'rgba(199, 215, 230, 0.4)',
            }}
            thumbColor={profile.dataShareConsent ? '#c7d7e6' : '#6B7280'}
          />
        </View>
      </GlassCard>

      <View style={styles.profileActions}>
        <TouchableOpacity
          style={[styles.profileActionButton, { backgroundColor: t.glass, borderColor: t.glassBorder, flex: 1 }]}
          onPress={() => router.push('/onboarding?edit=true')}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={16} color={t.tint} />
          <Text style={[styles.profileActionText, { color: t.tint }]}>Edit Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Health Profile Card
// ---------------------------------------------------------------------------
function HealthProfileCard() {
  const router = useRouter();
  const { profile, getBMI } = useHealthProfileStore();
  const bmi = getBMI();
  const completeness = profile.profileCompleteness;
  const t = useTheme();

  return (
    <View style={styles.researchSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.settingsSectionTitle, { color: t.text }]}>Health Profile</Text>
        {!profile.setupComplete && (
          <View style={styles.incompleteBadgeWrap}>
            <Ionicons name="alert-circle" size={12} color="#f0d68a" />
            <Text style={styles.incompleteBadge}>
              {completeness > 0 ? `${completeness}%` : 'Not Started'}
            </Text>
          </View>
        )}
      </View>
      <GlassCard variant="elevated" style={styles.researchCard}>
        {/* Completeness Ring + Progress */}
        <View style={[healthStyles.progressSection, { borderBottomColor: t.glassBorder }]}>
          <ProgressRing progress={completeness} size={60} strokeWidth={4} color={Colors.sage} />
          <View style={healthStyles.progressInfo}>
            <Text style={[healthStyles.progressTitle, { color: t.text }]}>Profile Completion</Text>
            <View style={[healthStyles.progressTrack, { backgroundColor: t.glass }]}>
              <LinearGradient
                colors={[Colors.sage, Colors.sageDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  healthStyles.progressFill,
                  { width: `${Math.max(completeness, 2)}%` },
                ]}
              />
            </View>
            <Text style={[healthStyles.progressHint, { color: t.textSecondary }]}>
              {completeness === 100
                ? 'Your health profile is complete'
                : `${100 - completeness}% remaining to complete`}
            </Text>
          </View>
        </View>

        {/* Quick stats */}
        {(profile.bodyMetrics.weightLbs || bmi !== null) && (
          <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
            <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Body</Text>
            <Text style={[styles.profileValue, { color: t.text }]}>
              {[
                profile.bodyMetrics.weightLbs
                  ? `${profile.bodyMetrics.weightLbs} lbs`
                  : null,
                bmi !== null ? `BMI ${bmi.toFixed(1)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        )}

        {(profile.primaryGoals?.length ?? 0) > 0 && (
          <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
            <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Goals</Text>
            <Text style={[styles.profileValue, { color: t.text }]} numberOfLines={2}>
              {profile.primaryGoals?.slice(0, 3).join(', ')}
            </Text>
          </View>
        )}

        {(profile.medical?.conditions?.length ?? 0) > 0 && (
          <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
            <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Conditions</Text>
            <Text style={[styles.profileValue, { color: t.text }]} numberOfLines={2}>
              {profile.medical.conditions.join(', ')}
            </Text>
          </View>
        )}

        {(profile.medical?.allergies?.length ?? 0) > 0 && (
          <View style={[styles.profileRow, { borderBottomColor: t.glassBorder }]}>
            <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Allergies</Text>
            <Text style={[styles.profileValue, { color: t.text }]} numberOfLines={2}>
              {profile.medical.allergies.join(', ')}
            </Text>
          </View>
        )}

        {profile.peptideExperience && profile.peptideExperience !== 'none' && (
          <View style={[styles.profileRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.profileLabel, { color: t.textSecondary }]}>Experience</Text>
            <Text style={[styles.profileValue, { color: t.text }]}>
              {profile.peptideExperience.charAt(0).toUpperCase() +
                profile.peptideExperience.slice(1)}
            </Text>
          </View>
        )}
      </GlassCard>

      <TouchableOpacity
        onPress={() => router.push('/health-profile')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={profile.setupComplete ? ['rgba(199, 215, 230, 0.15)', 'rgba(199, 215, 230, 0.05)'] : Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={healthStyles.editButton}
        >
          <Ionicons
            name={profile.setupComplete ? 'create-outline' : 'add-circle-outline'}
            size={16}
            color={profile.setupComplete ? t.tint : '#fff'}
          />
          <Text style={[healthStyles.editButtonText, { color: t.tint }, !profile.setupComplete && { color: '#fff' }]}>
            {profile.setupComplete ? 'Edit Health Profile' : 'Set Up Health Profile'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick Links Section
// ---------------------------------------------------------------------------
function QuickLinksSection() {
  const router = useRouter();
  const t = useTheme();

  const links = [
    { icon: 'document-text-outline' as const, label: 'Share Health Report', route: '/health-report' as const, color: '#E89672', desc: 'Generate and share with your provider' },
    { icon: 'download-outline' as const, label: 'Export My Data', route: '/health-report' as const, color: Colors.pepTeal, desc: 'Download your wellness journal' },
    { icon: 'book-outline' as const, label: 'My Journal', route: '/journal' as const, color: '#F4E9A7', desc: 'View and manage journal entries' },
  ];

  return (
    <View style={styles.researchSection}>
      <Text style={[styles.settingsSectionTitle, { color: t.text }]}>Quick Actions</Text>

      {/* Gradient action buttons for share/export */}
      <View style={actionStyles.row}>
        <TouchableOpacity
          style={actionStyles.btn}
          activeOpacity={0.8}
          onPress={() => router.push(links[0].route)}
        >
          <LinearGradient
            colors={['#E89672', '#C76B45']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={actionStyles.gradient}
          >
            <Ionicons name="share-outline" size={22} color="#fff" />
            <Text style={actionStyles.label}>Share Health{'\n'}Report</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={actionStyles.btn}
          activeOpacity={0.8}
          onPress={() => router.push(links[1].route)}
        >
          <LinearGradient
            colors={[Colors.pepTeal, '#0891b2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={actionStyles.gradient}
          >
            <Ionicons name="download-outline" size={22} color="#fff" />
            <Text style={actionStyles.label}>Export{'\n'}My Data</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Link rows */}
      {links.slice(2).map((link) => (
        <TouchableOpacity
          key={link.route + link.label}
          activeOpacity={0.7}
          onPress={() => router.push(link.route)}
        >
          <GlassCard style={linkStyles.row}>
            <View style={[linkStyles.iconWrap, { backgroundColor: `${link.color}15` }]}>
              <Ionicons name={link.icon} size={18} color={link.color} />
            </View>
            <View style={linkStyles.textWrap}>
              <Text style={[linkStyles.label, { color: t.text }]}>{link.label}</Text>
              <Text style={[linkStyles.desc, { color: t.textSecondary }]}>{link.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
          </GlassCard>
        </TouchableOpacity>
      ))}
    </View>
  );
}

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
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

function weekdayNumberToLabel(n: number): string {
  return DAY_LABELS[n - 1] ?? '';
}

function NotificationSettings() {
  const {
    preferences,
    setDailyCheckInReminder,
    setDoseReminders,
    setEnabled,
    setWorkoutReminderEnabled,
    setWorkoutReminder,
    setMealRemindersEnabled,
    setMealReminderTime,
    toggleWeeklyReport,
  } = useNotificationStore();
  const t = useTheme();

  const notifEnabled = preferences.enabled;

  const handleToggleEnabled = async (value: boolean) => {
    setEnabled(value);
    if (!value) {
      await cancelAllReminders();
    } else {
      if (preferences.dailyCheckInReminder) {
        await scheduleDailyCheckInReminder(preferences.checkInReminderTime);
      }
      if (preferences.workoutReminderEnabled) {
        await rescheduleWorkouts(preferences.workoutReminderTime, preferences.workoutReminderDays);
      }
      if (preferences.mealRemindersEnabled) {
        await rescheduleAllMeals(preferences.mealReminderTimes);
      }
      if (preferences.weeklyReportEnabled) {
        await scheduleWeeklyReport();
      }
    }
  };

  const handleToggleCheckIn = async (value: boolean) => {
    setDailyCheckInReminder(value);
    if (value && notifEnabled) {
      await scheduleDailyCheckInReminder(preferences.checkInReminderTime);
    } else {
      await cancelRemindersByTag('checkin');
    }
  };

  const handleToggleWorkout = async (value: boolean) => {
    setWorkoutReminderEnabled(value);
    if (value && notifEnabled) {
      await rescheduleWorkouts(preferences.workoutReminderTime, preferences.workoutReminderDays);
    } else {
      await cancelRemindersByTag('workout');
    }
  };

  const handleToggleWorkoutDay = async (day: number) => {
    const days = preferences.workoutReminderDays.includes(day)
      ? preferences.workoutReminderDays.filter((d) => d !== day)
      : [...preferences.workoutReminderDays, day].sort();
    setWorkoutReminder(preferences.workoutReminderTime, days);
    if (preferences.workoutReminderEnabled && notifEnabled) {
      await cancelRemindersByTag('workout');
      await rescheduleWorkouts(preferences.workoutReminderTime, days);
    }
  };

  const handleToggleMeals = async (value: boolean) => {
    setMealRemindersEnabled(value);
    if (value && notifEnabled) {
      await rescheduleAllMeals(preferences.mealReminderTimes);
    } else {
      await cancelRemindersByTag('meal');
    }
  };

  const handleToggleWeeklyReport = async () => {
    const willEnable = !preferences.weeklyReportEnabled;
    toggleWeeklyReport();
    if (willEnable && notifEnabled) {
      await scheduleWeeklyReport();
    } else {
      await cancelRemindersByTag('weekly-report');
    }
  };

  return (
    <View style={styles.researchSection}>
      <Text style={[styles.settingsSectionTitle, { color: t.text }]}>Notifications</Text>

      {/* Master + Check-in + Dose */}
      <GlassCard variant="elevated" style={notifStyles.card}>
        {/* Master toggle */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(199, 215, 230, 0.12)' }]}>
              <Ionicons name="notifications-outline" size={18} color="#c7d7e6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Enable Notifications</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>Reminders and alerts</Text>
            </View>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={handleToggleEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(199, 215, 230, 0.4)' }}
            thumbColor={notifEnabled ? '#c7d7e6' : '#6B7280'}
          />
        </View>

        {/* Daily check-in */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(185, 203, 182, 0.12)' }]}>
              <Ionicons name="today-outline" size={18} color="#b9cbb6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Daily Check-In Reminder</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Remind at {preferences.checkInReminderTime}
              </Text>
            </View>
          </View>
          <Switch
            value={preferences.dailyCheckInReminder && notifEnabled}
            onValueChange={handleToggleCheckIn}
            disabled={!notifEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(185, 203, 182, 0.4)' }}
            thumbColor={
              preferences.dailyCheckInReminder && notifEnabled ? '#b9cbb6' : '#6B7280'
            }
          />
        </View>

        {/* Dose reminders */}
        <View style={[styles.settingRow, { marginBottom: 0 }]}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(227, 167, 161, 0.12)' }]}>
              <Ionicons name="alarm-outline" size={18} color="#e3a7a1" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Dose Reminders</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Reminders for active protocols
              </Text>
            </View>
          </View>
          <Switch
            value={preferences.doseReminders && notifEnabled}
            onValueChange={setDoseReminders}
            disabled={!notifEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(227, 167, 161, 0.4)' }}
            thumbColor={
              preferences.doseReminders && notifEnabled ? '#e3a7a1' : '#6B7280'
            }
          />
        </View>
      </GlassCard>

      {/* Workout Reminders */}
      <GlassCard variant="elevated" style={notifStyles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Ionicons name="barbell-outline" size={18} color="#F4E9A7" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Workout Reminders</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Daily at {preferences.workoutReminderTime}
              </Text>
            </View>
          </View>
          <Switch
            value={preferences.workoutReminderEnabled && notifEnabled}
            onValueChange={handleToggleWorkout}
            disabled={!notifEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(245, 158, 11, 0.4)' }}
            thumbColor={
              preferences.workoutReminderEnabled && notifEnabled ? '#F4E9A7' : '#6B7280'
            }
          />
        </View>

        {/* Day picker chips */}
        {preferences.workoutReminderEnabled && notifEnabled && (
          <View style={notifStyles.dayRow}>
            {WEEKDAY_NUMBERS.map((day) => {
              const active = preferences.workoutReminderDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={[notifStyles.dayChip, { backgroundColor: t.glass, borderColor: t.glassBorder }, active && notifStyles.dayChipActive]}
                  onPress={() => handleToggleWorkoutDay(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[notifStyles.dayChipText, { color: t.textSecondary }, active && notifStyles.dayChipTextActive]}
                  >
                    {weekdayNumberToLabel(day)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </GlassCard>

      {/* Meal Reminders */}
      <GlassCard variant="elevated" style={notifStyles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <Ionicons name="nutrition-outline" size={18} color="#10b981" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Meal Reminders</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Breakfast, lunch, and dinner
              </Text>
            </View>
          </View>
          <Switch
            value={preferences.mealRemindersEnabled && notifEnabled}
            onValueChange={handleToggleMeals}
            disabled={!notifEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(16, 185, 129, 0.4)' }}
            thumbColor={
              preferences.mealRemindersEnabled && notifEnabled ? '#10b981' : '#6B7280'
            }
          />
        </View>

        {/* Per-meal time display */}
        {preferences.mealRemindersEnabled && notifEnabled && (
          <View style={notifStyles.mealList}>
            {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
              <View key={meal} style={[notifStyles.mealRow, { backgroundColor: t.glass }]}>
                <Ionicons
                  name={
                    meal === 'breakfast'
                      ? 'sunny-outline'
                      : meal === 'lunch'
                        ? 'partly-sunny-outline'
                        : 'moon-outline'
                  }
                  size={16}
                  color={t.textSecondary}
                />
                <Text style={[notifStyles.mealLabel, { color: t.text }]}>
                  {meal.charAt(0).toUpperCase() + meal.slice(1)}
                </Text>
                <Text style={notifStyles.mealTime}>
                  {preferences.mealReminderTimes[meal] ?? '--:--'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </GlassCard>

      {/* Weekly Health Report */}
      <GlassCard variant="elevated" style={notifStyles.card}>
        <View style={[styles.settingRow, { marginBottom: 0 }]}>
          <View style={styles.settingInfo}>
            <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Ionicons name="stats-chart-outline" size={18} color="#E89672" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: t.text }]}>Weekly Health Report</Text>
              <Text style={[styles.settingDescription, { color: t.textSecondary }]}>
                Summary every Sunday at 7:00 PM
              </Text>
            </View>
          </View>
          <Switch
            value={preferences.weeklyReportEnabled && notifEnabled}
            onValueChange={handleToggleWeeklyReport}
            disabled={!notifEnabled}
            trackColor={{ false: 'rgba(0,0,0,0.08)', true: 'rgba(59, 130, 246, 0.4)' }}
            thumbColor={
              preferences.weeklyReportEnabled && notifEnabled ? '#E89672' : '#6B7280'
            }
          />
        </View>
      </GlassCard>
    </View>
  );
}

/** Schedule workout reminders for the given days. */
async function rescheduleWorkouts(time: string, days: number[]): Promise<void> {
  for (const day of days) {
    const dayLabel = DAY_LABELS[day - 1] ?? 'Workout';
    await scheduleWorkoutReminder(dayLabel, time);
  }
}

/** Schedule meal reminders for all meal types. */
async function rescheduleAllMeals(mealTimes: Record<string, string>): Promise<void> {
  for (const [meal, time] of Object.entries(mealTimes)) {
    await scheduleMealReminder(meal, time);
  }
}

// ---------------------------------------------------------------------------
// Legal Links
// ---------------------------------------------------------------------------
function LegalLinks() {
  const router = useRouter();
  const t = useTheme();

  return (
    <View style={[linkStyles.legalSection, { borderTopColor: t.glassBorder }]}>
      <View style={linkStyles.legalRow}>
        <TouchableOpacity
          style={linkStyles.legalLink}
          onPress={() => router.push('/privacy')}
          activeOpacity={0.7}
        >
          <Ionicons name="shield-checkmark-outline" size={14} color={t.textSecondary} />
          <Text style={[linkStyles.privacyText, { color: t.textSecondary }]}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={[linkStyles.legalDivider, { color: t.textMuted }]}>|</Text>
        <TouchableOpacity
          style={linkStyles.legalLink}
          onPress={() => router.push('/terms')}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={14} color={t.textSecondary} />
          <Text style={[linkStyles.privacyText, { color: t.textSecondary }]}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={[linkStyles.legalDivider, { color: t.textMuted }]}>|</Text>
        <TouchableOpacity
          style={linkStyles.legalLink}
          onPress={() => router.push('/subscription')}
          activeOpacity={0.7}
        >
          <Ionicons name="card-outline" size={14} color={t.textSecondary} />
          <Text style={[linkStyles.privacyText, { color: t.textSecondary }]}>Subscription</Text>
        </TouchableOpacity>
      </View>
      <Text style={[linkStyles.versionText, { color: t.textMuted }]}>PepTalk v1.0.0 (Beta)</Text>
    </View>
  );
}

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
function DeleteDataSection() {
  const { deleteAllHealthData } = useHealthProfileStore();
  const t = useTheme();

  const handleDelete = () => {
    Alert.alert(
      'Delete All Health Data',
      'This will permanently erase your health profile, dose logs, check-ins, and chat history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            deleteAllHealthData();
            Alert.alert('Done', 'All health data has been deleted.');
          },
        },
      ]
    );
  };

  return (
    <View style={{ marginTop: Spacing.lg }}>
      <TouchableOpacity
        style={deleteStyles.button}
        onPress={handleDelete}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={16} color="#ef4444" />
        <Text style={deleteStyles.text}>Delete My Data</Text>
      </TouchableOpacity>
      <Text style={[deleteStyles.hint, { color: t.textSecondary }]}>
        Permanently removes all health data, dose logs, check-ins, and chat history from this device.
      </Text>
    </View>
  );
}

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
    <TouchableOpacity style={profileStyles.row} onPress={onPress} activeOpacity={0.6}>
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
            // Clear all stores
            useOnboardingStore.getState().reset();
            useHealthProfileStore.getState().resetProfile();
            Alert.alert('Done', 'All data has been deleted.');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
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

  return (
    <SafeAreaView style={[profileStyles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={profileStyles.scroll}
      >
        {/* ── Header ── */}
        <Text style={[profileStyles.pageTitle, { color: t.text }]}>Profile</Text>

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
              <ProfileRow icon="document-text-outline" label="Health Report" onPress={() => router.push('/health-report' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="library-outline" label="Sources & references" onPress={() => router.push('/resources' as any)} color={t.text} />
              <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
              <ProfileRow icon="people-outline" label="Community" onPress={() => router.push('/community' as any)} color={t.text} />
            </View>
          </View>
        )}

        {/* ── Settings Section ── */}
        <View style={profileStyles.section}>
          <Text style={[profileStyles.sectionTitle, { color: t.textSecondary }]}>SETTINGS</Text>
          <View style={[profileStyles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <ProfileRow icon="link-outline" label="Integrations" onPress={() => router.push('/settings/integrations' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="lock-closed-outline" label="Privacy" onPress={() => router.push('/settings/privacy' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow icon="snow-outline" label="Food safety windows" onPress={() => router.push('/settings/food-safety' as any)} color={t.text} />
            <View style={[profileStyles.divider, { backgroundColor: t.cardBorder }]} />
            <ProfileRow
              icon="notifications-outline"
              label={notificationsAvailable() ? 'Notifications' : 'Notifications · Off'}
              onPress={() => {
                if (notificationsAvailable()) return;
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
                router.push('/(tabs)/' as any);
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

        <Text style={[profileStyles.version, { color: t.textSecondary }]}>PepTalk v1.0.0</Text>
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
    backgroundColor: '#EDE6D6',
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
    color: '#F4E9A7',
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


