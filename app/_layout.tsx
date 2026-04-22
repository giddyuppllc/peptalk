import '../global.css';

import {
  Stack,
  useGlobalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { PlayfairDisplay_800ExtraBold } from '@expo-google-fonts/playfair-display/800ExtraBold';
import { PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display/900Black';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { CelebrationModal } from '../src/components/CelebrationModal';
import { PepTalkCharacter } from '../src/components/PepTalkCharacter';
import { SpotlightTour } from '../src/components/tutorial/SpotlightTour';
import { UpgradeDeltaWatcher } from '../src/components/tutorial/UpgradeDeltaWatcher';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import { syncHealthProfileFromServer } from '../src/store/useHealthProfileStore';
import { configureNotificationHandler } from '../src/services/notificationService';
import { initIAP, endIAP } from '../src/services/iapService';
import { warmKnowledgeBase } from '../src/services/llmService';
import { useChatStore } from '../src/store/useChatStore';
import { useMealStore } from '../src/store/useMealStore';
import { subscribeToReconnect } from '../src/hooks/useNetworkStatus';
import { initTelemetry } from '../src/services/telemetry';

// Boot-time telemetry init (no-op if no DSN). Done at module scope so it
// fires before any component renders or stores hydrate.
initTelemetry();
import { Platform } from 'react-native';
import { useTheme } from '../src/hooks/useTheme';

function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { edit } = useGlobalSearchParams<{ edit?: string }>();
  const isComplete = useOnboardingStore((state) => state.isComplete);
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authHydrated = useAuthStore((state) => state.hasHydrated);
  const t = useTheme();

  // Load custom fonts
  const [fontsLoaded, fontsError] = useFonts({
    'Playfair-Bold': PlayfairDisplay_700Bold,
    'Playfair-ExtraBold': PlayfairDisplay_800ExtraBold,
    'Playfair-Black': PlayfairDisplay_900Black,
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
    'DMSans-SemiBold': DMSans_600SemiBold,
    'DMSans-Bold': DMSans_700Bold,
  });

  // Safety net: if @expo-google-fonts can't reach its CDN (captive wifi,
  // regional block, sneaky VPN), `fontsLoaded` never flips and the splash
  // hangs forever. Accept "fonts ready OR 5 seconds elapsed OR load error"
  // as the trigger to proceed — the app simply renders with the system
  // font stack in that case.
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  useEffect(() => {
    if (fontsLoaded) return;
    const timer = setTimeout(() => setFontsTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);
  const fontsReady = fontsLoaded || fontsTimedOut || !!fontsError;

  // Wait for the navigator (<Stack>) to mount before attempting navigation
  const [navReady, setNavReady] = useState(false);

  // ── Splash animation ──────────────────────────────────────────────────────
  const [splashVisible, setSplashVisible] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashScale = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  // Ensure the splash animation only runs once — isAuthenticated / isComplete
  // can flip as stores hydrate, and without this guard the effect re-fires
  // and layers animations.
  const splashStarted = useRef(false);

  useEffect(() => {
    // Wait for fonts AND hydrated auth/onboarding state before deciding
    // which splash path to play. Otherwise returning users briefly get the
    // full welcome animation before we know they've seen it already.
    if (!fontsReady || !hasHydrated || !authHydrated) return;
    if (splashStarted.current) return;
    splashStarted.current = true;

    let cancelled = false;
    const isReturning = isComplete && isAuthenticated;
    (async () => {
      // AccessibilityInfo.isReduceMotionEnabled may not exist on older
      // OS versions / custom ROMs. Guard with optional chaining AND a
      // try/catch so a throw here never blocks the splash dismissal.
      let reduceMotion = false;
      try {
        const { AccessibilityInfo } = require('react-native');
        reduceMotion = (await AccessibilityInfo?.isReduceMotionEnabled?.()) ?? false;
      } catch {
        reduceMotion = false;
      }
      if (cancelled) return;

      // Fast path: returning users OR reduce-motion. No hold, no spring —
      // just a quick fade so boot feels instant on repeat launches.
      if (reduceMotion || isReturning) {
        logoScale.setValue(1);
        logoOpacity.setValue(1);
        const holdMs = reduceMotion ? 0 : 150;
        setTimeout(() => {
          if (cancelled) return;
          Animated.timing(splashOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            if (!cancelled) setSplashVisible(false);
          });
        }, holdMs);
        return;
      }

      // First-launch / logged-out welcome — full brand animation.
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(splashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
            Animated.timing(splashScale, { toValue: 1.08, duration: 500, useNativeDriver: true }),
          ]).start(() => setSplashVisible(false));
        }, 900);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [fontsReady, hasHydrated, authHydrated, isComplete, isAuthenticated]);

  // Initialize notifications and restore session — no-ops gracefully in Expo Go
  useEffect(() => {
    // Every call here is fire-and-forget. Wrapping each in try/catch so
    // a throw in one (offline Supabase, bad session token, native
    // module flake) can't tear down the boot sequence and leave the
    // app in a half-initialized state.
    try {
      configureNotificationHandler();
    } catch (err) {
      if (__DEV__) console.warn('[boot] configureNotificationHandler threw:', err);
    }
    useAuthStore
      .getState()
      .restoreSession()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] restoreSession failed:', err);
      });

    // Hook IAP into the app so purchase events flow into subscription
    // validation. `onPending` surfaces Ask-to-Buy / SCA / parental-consent
    // flows so the UI can show a "waiting for approval" state instead of
    // silently hanging.
    try {
      initIAP({
        onPurchase: async ({ productId, transactionReceipt }) => {
          const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
          try {
            await useSubscriptionStore
              .getState()
              .validatePurchase(platform, productId, transactionReceipt);
          } catch (err) {
            if (__DEV__) console.warn('[boot] validatePurchase failed:', err);
          }
        },
        onPending: ({ productId }) => {
          useSubscriptionStore.getState().setPendingPurchase({ productId });
        },
      });
    } catch (err) {
      if (__DEV__) console.warn('[boot] initIAP threw:', err);
    }

    // Pull the authoritative tier from the server once session is ready
    useSubscriptionStore
      .getState()
      .syncFromServer()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] subscription syncFromServer failed:', err);
      });

    // Pull health profile from server (overwrites local on login)
    try {
      syncHealthProfileFromServer()?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] syncHealthProfileFromServer failed:', err);
      });
    } catch (err) {
      if (__DEV__) console.warn('[boot] syncHealthProfileFromServer threw:', err);
    }

    // Pre-build the Aimee knowledge base in the background so the first
    // chat message doesn't pay the build cost. No-op on subsequent calls.
    try {
      warmKnowledgeBase();
    } catch (err) {
      if (__DEV__) console.warn('[boot] warmKnowledgeBase threw:', err);
    }

    // Drain any chat messages whose cloud sync failed on a previous
    // session (offline send, flaky network). Without this, chat history
    // silently diverges across the user's devices.
    useChatStore
      .getState()
      .flushPendingSyncs()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] chat sync flush failed:', err);
      });

    // Hydrate meals from the server so a reinstall / new device picks up
    // the user's logged meal history instead of a blank slate.
    useMealStore
      .getState()
      .syncFromServer()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] meal syncFromServer failed:', err);
      });

    // Mark navigator as mounted on next frame so <Stack> is in the tree
    requestAnimationFrame(() => setNavReady(true));

    // When the device reconnects after being offline, silently re-run the
    // recovery routines so queued work catches up without any user action.
    const unsubReconnect = subscribeToReconnect(() => {
      if (__DEV__) console.log('[net] back online — running recovery syncs');
      useChatStore.getState().flushPendingSyncs()?.catch?.(() => {});
      useSubscriptionStore.getState().syncFromServer()?.catch?.(() => {});
      useMealStore.getState().syncFromServer()?.catch?.(() => {});
    });

    return () => {
      try { endIAP(); } catch {}
      try { unsubReconnect?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!navReady || !hasHydrated) return;
    const inOnboarding = segments[0] === 'onboarding';
    const inAuth = segments[0] === 'auth';

    // If onboarding is complete, allow all routes freely (tabs, nutrition, learn, etc.)
    if (isComplete) return;

    // Not completed yet — only allow onboarding and auth screens
    if (!inOnboarding && !inAuth) {
      router.replace('/onboarding');
      return;
    }
  }, [edit, hasHydrated, isComplete, navReady, router, segments]);

  return (
    <ErrorBoundary>
    <GluestackUIProvider colorMode="light">
    <SafeAreaProvider>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <StatusBar style={t.statusBar} />
        <OfflineBanner />
        <CelebrationModal />
        {/* First-run walkthrough + upgrade delta tours (mounted at root so they survive navigation) */}
        <SpotlightTour />
        <UpgradeDeltaWatcher />
        {/* Splash Screen */}
        {splashVisible && (
          <Animated.View
            style={[
              styles.splash,
              { opacity: splashOpacity, transform: [{ scale: splashScale }] },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={t.splashGradient as unknown as [string, string, ...string[]]}
              style={styles.splashGrad}
            >
              <Animated.View
                style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center' }}
              >
                <PepTalkCharacter size={90} variant="full" animated glowColor={t.primary} />
                <Text style={[styles.splashTitle, { color: t.text }]}>PepTalk</Text>
                <Text style={[styles.splashSub, { color: t.textMuted }]}>Your peptide journey starts here</Text>
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        )}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="peptide/[id]"
            options={{
              headerShown: true,
              headerTransparent: true,
              headerTintColor: t.headerTint,
              headerTitle: '',
              headerBackTitle: 'Back',
              headerStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="peptide/category/[slug]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="research-feed"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="health-profile"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="learn/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/article/[slug]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/guides/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/guides/[slug]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/videos/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/videos/[slug]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/topic/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="learn/cycling"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="journal/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="journal/new"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="privacy"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="health-report/index"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="health-connect-setup"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="terms"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          {/* Workout screens */}
          <Stack.Screen
            name="workouts/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/program"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/player"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="workouts/exercises"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/history"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/my-workouts"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/generated-tracker"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/build-workout"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
              presentation: 'modal',
            }}
          />
          {/* Nutrition screens */}
          <Stack.Screen
            name="nutrition/index"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="nutrition/recipe-generator"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="nutrition/food-search"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="nutrition/targets"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="nutrition/create-food"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="nutrition/copy-previous-meal"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="nutrition/voice-log"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="nutrition/meal-scan"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          {/* Calculators */}
          <Stack.Screen
            name="calculators/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="calculators/dosing"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="calculators/reconstitution"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="calculators/quick-dose"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          {/* Auth (accessed from onboarding) */}
          <Stack.Screen
            name="auth"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          {/* Body map */}
          <Stack.Screen
            name="body-map"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          {/* Food barcode scanner */}
          <Stack.Screen
            name="nutrition/food-scanner"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="workouts/my-workouts"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="workouts/build-workout"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="workouts/generated-tracker"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="nutrition/voice-log"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="nutrition/meal-scan"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="nutrition/copy-previous-meal"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="nutrition/create-food"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="nutrition/meal-plan"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          {/* Dev / Testing */}
          <Stack.Screen
            name="dev-accounts"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          {/* Subscription */}
          <Stack.Screen
            name="subscription"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          {/* Settings */}
          <Stack.Screen
            name="settings/food-safety"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="settings/privacy"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="settings/integrations"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          {/* Pantry */}
          <Stack.Screen
            name="pantry/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="pantry/add"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="nutrition/pantry-suggestions"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          {/* Cycle */}
          <Stack.Screen
            name="cycle/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="cycle/setup"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="cycle/log"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="cycle/history"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
        </Stack>
      </View>
    </SafeAreaProvider>
    </GluestackUIProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDE6D6',
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  splashGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -1,
    marginTop: 12,
  },
  splashSub: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.30)',
    marginTop: 4,
  },
});

// Wrap with Sentry to capture unhandled errors + native crashes
export default RootLayout;

