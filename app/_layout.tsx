import '../global.css';

import {
  Stack,
  useGlobalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Text, AppState } from 'react-native';
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
import { ProfileShortcutFab } from '../src/components/ProfileShortcutFab';
import { WorkoutRewardModal } from '../src/components/WorkoutRewardModal';
import { PepTalkCharacter } from '../src/components/PepTalkCharacter';
import { SpotlightTour } from '../src/components/tutorial/SpotlightTour';
import { UpgradeDeltaWatcher } from '../src/components/tutorial/UpgradeDeltaWatcher';
import { useOnboardingStore } from '../src/store/useOnboardingStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';
import { syncHealthProfileFromServer } from '../src/store/useHealthProfileStore';
import { configureNotificationHandler } from '../src/services/notificationService';
import { useNotificationStore } from '../src/store/useNotificationStore';
import { initIAP, endIAP } from '../src/services/iapService';
import { warmKnowledgeBase } from '../src/services/llmService';
import { useChatStore } from '../src/store/useChatStore';
import { useMealStore } from '../src/store/useMealStore';
import { useCheckinStore } from '../src/store/useCheckinStore';
import { useDoseLogStore } from '../src/store/useDoseLogStore';
import { useWorkoutStore } from '../src/store/useWorkoutStore';
import { useJournalStore } from '../src/store/useJournalStore';
import { useStackStore } from '../src/store/useStackStore';
import { useAllergyStore } from '../src/store/useAllergyStore';
import { useBodyMapStore } from '../src/store/useBodyMapStore';
import { usePantryStore } from '../src/store/usePantryStore';
import { useCycleStore } from '../src/store/useCycleStore';
import { useIntegrationsStore } from '../src/store/useIntegrationsStore';
import { subscribeToReconnect } from '../src/hooks/useNetworkStatus';
import { initTelemetry, installGlobalErrorHandler, captureException } from '../src/services/telemetry';

// Boot-time telemetry init (no-op if no DSN). Done at module scope so it
// fires before any component renders or stores hydrate.
initTelemetry();
installGlobalErrorHandler();
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

    // Register the tap-routing listener once at boot so any scheduled
    // reminder (with `data.route`) or push fan-out (with `data.kind`)
    // routes to the right screen when tapped. Without this, every
    // notification just opens the app to its last screen — the `route:`
    // fields we wrote on each scheduled reminder were dead data. P0
    // from Wave 76.9 push audit.
    (async () => {
      try {
        const { registerNotificationResponseHandler } = await import(
          '../src/services/notificationService'
        );
        registerNotificationResponseHandler(router);
      } catch (err) {
        if (__DEV__) console.warn('[boot] notif response handler failed:', err);
      }
    })();

    // First-run notification permission + daily check-in reminder.
    // Tester feedback: users want a morning nudge so the habit forms even
    // on days they're not actively dosing. Default-on in preferences,
    // so we just need to register + schedule once permissions are granted.
    // This runs every boot but registerForPushNotifications is idempotent —
    // OS short-circuits if permission already granted.
    (async () => {
      try {
        const { registerForPushNotifications, scheduleDailyCheckInReminder } =
          await import('../src/services/notificationService');
        const token = await registerForPushNotifications();
        if (!token) return; // user denied, or notifications unavailable
        // Wait for the notification store to rehydrate before scheduling.
        // Otherwise the in-memory default `dailyCheckInReminder=true`
        // schedules a reminder the user previously disabled — they get
        // a spurious 9 AM push and we never cancelled it.
        let waited = 0;
        while (!useNotificationStore.getState().hasHydrated && waited < 5000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          waited += 50;
        }
        const prefs = useNotificationStore.getState().preferences;
        if (prefs.dailyCheckInReminder && prefs.enabled) {
          await scheduleDailyCheckInReminder(prefs.checkInReminderTime);
        }
      } catch (err) {
        if (__DEV__) console.warn('[boot] notification registration failed:', err);
      }
    })();

    // Tap-to-deep-link for push notifications. Until this listener
    // was added, tapping any scheduled notification (check-in reminder,
    // dose reminder, motivation, community broadcast) was a no-op
    // route-wise — the `data.route` payload was set everywhere but
    // never read. Audit fix (Wave 76.8).
    //
    // Handles BOTH cold-start (getLastNotificationResponseAsync) and
    // warm-foreground (addNotificationResponseReceivedListener) cases.
    let notificationSub: any = null;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const handleResponse = (
          response: { notification: { request: { content: { data: any } } } } | null,
        ) => {
          if (!response) return;
          const data = response.notification.request.content.data ?? {};
          const route = typeof data.route === 'string' ? data.route : null;
          if (!route) return;
          // Guard: don't route into auth-gated screens if user isn't
          // signed in yet. Bounce to /auth and stash the intent.
          try {
            const isAuthed = useAuthStore.getState().isAuthenticated;
            if (!isAuthed) {
              import('expo-router').then(({ router }) => router.replace('/auth'));
              return;
            }
            import('expo-router').then(({ router }) => router.push(route as any));
          } catch (err) {
            if (__DEV__) console.warn('[boot] notification route failed:', err);
          }
        };
        // Cold-start tap (app launched from a notification).
        const cold = await Notifications.getLastNotificationResponseAsync();
        if (cold) handleResponse(cold);
        // Subsequent taps while the app is alive.
        notificationSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
      } catch (err) {
        if (__DEV__) console.warn('[boot] notification response listener failed:', err);
      }
    })();

    useAuthStore
      .getState()
      .restoreSession()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] restoreSession failed:', err);
      captureException(err, { source: 'boot.restoreSession' });
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
            captureException(err, { source: 'boot.validatePurchase' });
          }
        },
        onPending: ({ productId }) => {
          useSubscriptionStore.getState().setPendingPurchase({ productId });
        },
      });
    } catch (err) {
      if (__DEV__) console.warn('[boot] initIAP threw:', err);
      captureException(err, { source: 'boot.initIAP' });
    }

    // Pull the authoritative tier from the server once session is ready
    useSubscriptionStore
      .getState()
      .syncFromServer()
      ?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[boot] subscription syncFromServer failed:', err);
        captureException(err, { source: 'boot.subscription.syncFromServer' });
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

    // Hydrate user-owned data from the server so a reinstall / new device
    // picks up the full history instead of a blank slate. Each store
    // handles its own schema mapping and falls back to local-only if the
    // pull fails — nothing blocks boot.
    //
    // Also re-runs below in a separate effect when isAuthenticated flips
    // from false → true so signup/login flows correctly hydrate without
    // requiring a restart or network disconnect.
    const bootHydrations: Array<[string, () => Promise<void>]> = [
      ['meals',      () => useMealStore.getState().syncFromServer()],
      ['check-ins',  () => useCheckinStore.getState().syncFromServer()],
      ['dose logs',  () => useDoseLogStore.getState().syncFromServer()],
      ['workouts',   () => useWorkoutStore.getState().syncFromServer()],
      ['journal',    () => useJournalStore.getState().syncFromServer()],
      ['stacks',     () => useStackStore.getState().syncFromServer()],
      ['allergies',  () => useAllergyStore.getState().syncFromServer()],
      ['body map',   () => useBodyMapStore.getState().syncFromServer()],
      ['pantry',     () => usePantryStore.getState().syncFromServer()],
      ['cycle',      () => useCycleStore.getState().syncFromServer()],
      ['integrations', () => useIntegrationsStore.getState().syncFromServer()],
    ];
    for (const [label, run] of bootHydrations) {
      run().catch((err: unknown) => {
        if (__DEV__) console.warn(`[boot] ${label} syncFromServer failed:`, err);
      });
    }

    // Mark navigator as mounted on next frame so <Stack> is in the tree
    requestAnimationFrame(() => setNavReady(true));

    // When the device reconnects after being offline, silently re-run the
    // recovery routines so queued work catches up without any user action.
    const unsubReconnect = subscribeToReconnect(() => {
      if (__DEV__) console.log('[net] back online — running recovery syncs');
      useChatStore.getState().flushPendingSyncs()?.catch?.(() => {});
      useSubscriptionStore.getState().syncFromServer()?.catch?.(() => {});
      useMealStore.getState().syncFromServer()?.catch?.(() => {});
      useCheckinStore.getState().syncFromServer()?.catch?.(() => {});
      useDoseLogStore.getState().syncFromServer()?.catch?.(() => {});
      useWorkoutStore.getState().syncFromServer()?.catch?.(() => {});
      useJournalStore.getState().syncFromServer()?.catch?.(() => {});
      useStackStore.getState().syncFromServer()?.catch?.(() => {});
      useAllergyStore.getState().syncFromServer()?.catch?.(() => {});
      useBodyMapStore.getState().syncFromServer()?.catch?.(() => {});
      usePantryStore.getState().syncFromServer()?.catch?.(() => {});
      useCycleStore.getState().syncFromServer()?.catch?.(() => {});
      useIntegrationsStore.getState().syncFromServer()?.catch?.(() => {});
    });

    // Foreground sync — when the user returns to the app after backgrounding,
    // pull fresh device data from any connected biomarker source so the
    // calendar / weekly summary reflect overnight steps + sleep without
    // the user having to manually tap Sync in Settings. Throttled to once
    // per 10 minutes so a quick app-switch doesn't spam HealthKit.
    let lastForegroundSync = 0;
    const FOREGROUND_SYNC_THROTTLE_MS = 10 * 60 * 1000;
    let appStateRef = AppState.currentState;
    const appStateSub = AppState.addEventListener('change', (next) => {
      const wentForeground =
        appStateRef.match(/inactive|background/) && next === 'active';
      appStateRef = next;
      if (!wentForeground) return;
      const now = Date.now();
      if (now - lastForegroundSync < FOREGROUND_SYNC_THROTTLE_MS) return;
      lastForegroundSync = now;

      try {
        const integrationsState = useIntegrationsStore.getState();
        // Sync only sources that are actually connected — don't fire OS
        // permission prompts on every foreground for sources the user
        // hasn't opted into.
        const connected = integrationsState.integrations.filter((i) => i.connected);
        for (const intg of connected) {
          integrationsState
            .syncAndRoute(intg.source, intg.scopes)
            ?.catch?.((err: unknown) => {
              if (__DEV__) console.warn(`[foreground-sync] ${intg.source} failed:`, err);
            });
        }
      } catch (err) {
        if (__DEV__) console.warn('[foreground-sync] threw:', err);
      }

      // Refresh the subscription tier on foreground — closes the
      // PaywallGate-after-IAP loophole where the user completes a
      // purchase, the validatePurchase call resolves while the app is
      // backgrounded (Apple's purchase sheet briefly suspends RN), and
      // they return to the original gated screen still showing the
      // paywall. Bypass the throttle here since this is a different
      // signal than HealthKit sync.
      useSubscriptionStore
        .getState()
        .syncFromServer()
        ?.catch?.((err: unknown) => {
          if (__DEV__) console.warn('[foreground-sync] subscription failed:', err);
        });

      // Fire local banners for any community notifications (replies,
      // mentions, etc.) that arrived while backgrounded. Stays as the
      // belt-and-suspenders fallback even with real push wired up —
      // covers the edge case where push was missed (no permission yet,
      // expired token between sync windows, etc.).
      import('../src/services/communityNotificationDelivery')
        .then(({ deliverPendingCommunityNotifications }) =>
          deliverPendingCommunityNotifications(),
        )
        .catch((err: unknown) => {
          if (__DEV__) console.warn('[foreground-sync] community delivery failed:', err);
        });

      // Refresh / register the Expo push token so community-push-fanout
      // can deliver real pushes when the app is backgrounded. Cheap
      // upsert; bumps last_seen_at on the existing row when nothing
      // changed.
      import('../src/services/pushTokenSync')
        .then(({ syncPushToken }) => syncPushToken())
        .catch((err: unknown) => {
          if (__DEV__) console.warn('[foreground-sync] push-token sync failed:', err);
        });
    });

    return () => {
      try { endIAP(); } catch {}
      try { unsubReconnect?.(); } catch {}
      try { appStateSub?.remove(); } catch {}
      try { notificationSub?.remove(); } catch {}
    };
  }, []);

  // When auth flips from logged-out → logged-in (signup flow, or a
  // sign-in after the boot hydrations already no-op'd with no session),
  // re-run the hydrations so the user sees their server data without
  // having to restart the app or toggle airplane mode.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (!authHydrated) return;
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      if (__DEV__) console.log('[auth] logged in — rehydrating user stores');
      useSubscriptionStore.getState().syncFromServer()?.catch?.(() => {});
      useMealStore.getState().syncFromServer()?.catch?.(() => {});
      useCheckinStore.getState().syncFromServer()?.catch?.(() => {});
      useDoseLogStore.getState().syncFromServer()?.catch?.(() => {});
      useWorkoutStore.getState().syncFromServer()?.catch?.(() => {});
      useJournalStore.getState().syncFromServer()?.catch?.(() => {});
      useStackStore.getState().syncFromServer()?.catch?.(() => {});
      useAllergyStore.getState().syncFromServer()?.catch?.(() => {});
      useBodyMapStore.getState().syncFromServer()?.catch?.(() => {});
      usePantryStore.getState().syncFromServer()?.catch?.(() => {});
      useCycleStore.getState().syncFromServer()?.catch?.(() => {});
      useIntegrationsStore.getState().syncFromServer()?.catch?.(() => {});
      // Health profile + chat — also need to rehydrate on auth flip so a
      // fresh signup or device-switch picks up server state. Previously
      // only ran at boot, leaving signup users with empty health profiles
      // until the next cold launch.
      syncHealthProfileFromServer()?.catch?.((err: unknown) => {
        if (__DEV__) console.warn('[auth] syncHealthProfileFromServer failed:', err);
      });
      useChatStore.getState().flushPendingSyncs()?.catch?.(() => {});

      // Register the device's Expo push token so server-side fanout
      // can deliver pushes for community replies / mentions / reactions.
      import('../src/services/pushTokenSync')
        .then(({ syncPushToken }) => syncPushToken())
        .catch(() => {});
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, authHydrated]);

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
        <WorkoutRewardModal />
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
            name="resources"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          {/* Community routes — moved into the (tabs)/community/ group
              2026-05-14 so Community can be a real tab. The (tabs)
              layout + community/_layout.tsx (Stack) handle navigation;
              the previously-registered Stack.Screen entries here for
              community/index, community/compose, community/[id],
              community/setup-username, community/search,
              community/blocked-users, community/u/[username] were
              removed in the same commit. */}
          <Stack.Screen
            name="admin/community-queue"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="settings/notifications"
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
          {/* Nutrition meal-plan — unique to this block. The other five
              nutrition routes (voice-log, meal-scan, create-food,
              copy-previous-meal) and three workouts routes (my-workouts,
              build-workout, generated-tracker) were duplicated here and
              earlier in the file; removed the duplicates 2026-05-09 because
              expo-router undefined-behaves on duplicate names. */}
          <Stack.Screen
            name="nutrition/meal-plan"
            options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
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
        {/* Profile shortcut overlay — sits OUTSIDE the Stack so it's
            visible above whichever screen is rendered. The component
            itself decides via usePathname whether to render. */}
        <ProfileShortcutFab />
      </View>
    </SafeAreaProvider>
    </GluestackUIProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0EEE9',
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

