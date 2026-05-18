import '../global.css';

import {
  Stack,
  useGlobalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Text, AppState , Platform } from 'react-native';
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
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { Newsreader_700Bold } from '@expo-google-fonts/newsreader/700Bold';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { V3ThemeProvider } from '../src/theme/V3ThemeProvider';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { CelebrationModal } from '../src/components/CelebrationModal';
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
import { useTheme } from '../src/hooks/useTheme';

// Boot-time telemetry init (no-op if no DSN). Done at module scope so it
// fires before any component renders or stores hydrate.
initTelemetry();
installGlobalErrorHandler();

function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { edit } = useGlobalSearchParams<{ edit?: string }>();
  const isComplete = useOnboardingStore((state) => state.isComplete);
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authHydrated = useAuthStore((state) => state.hasHydrated);
  const subscriptionHasHydrated = useSubscriptionStore((state) => state.hasHydrated);
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
    // v3 male theme — Newsreader is the masculine serif counterpart to
    // Playfair on the female side (§3 / §10 of Master Refactor Plan v3.1).
    // EDWARD H. greeting + male glass-card headlines use these weights.
    'Newsreader-SemiBold': Newsreader_600SemiBold,
    'Newsreader-Bold': Newsreader_700Bold,
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

  // 2026-05-17 P0 fix: splash deadlock if any persistence store fails
  // to rehydrate (corrupted blob, encryption module link broken, OS
  // keychain locked). Fonts had a timeout but the hydration flags did
  // not — user saw the gradient + logo with no path forward. Now an
  // 8s ceiling forces the splash to dismiss even with stuck hydration.
  // Telemetry breadcrumb fires once so engineering can spot it.
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  useEffect(() => {
    if (hasHydrated && authHydrated && subscriptionHasHydrated) return;
    const timer = setTimeout(() => {
      setHydrationTimedOut(true);
      try {

        const { captureMessage } = require('../src/services/telemetry');
        captureMessage?.(
          'Splash hydration timeout — proceeding with stuck stores',
          'warning',
          {
            hasHydrated,
            authHydrated,
            subscriptionHasHydrated,
          },
        );
      } catch {}
    }, 8000);
    return () => clearTimeout(timer);
  }, [hasHydrated, authHydrated, subscriptionHasHydrated]);
  const hydrationReady =
    (hasHydrated && authHydrated && subscriptionHasHydrated) || hydrationTimedOut;

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
  // Holds a deep-link route from a notification tap that arrived before
  // auth was ready. Drained by the effect below once the user is
  // authenticated. P0 cold-tap intent-loss fix.
  const pendingDeepLinkRef = useRef<string | null>(null);

  // Drain the stashed deep-link once auth flips authenticated.
  useEffect(() => {
    if (!isAuthenticated) return;
    const route = pendingDeepLinkRef.current;
    if (!route) return;
    pendingDeepLinkRef.current = null;
    // Defer one frame so the navigator is definitely mounted.
    requestAnimationFrame(() => {
      import('expo-router').then(({ router }) => router.push(route as any));
    });
  }, [isAuthenticated]);

  // 2026-05-17 P0 fix (IAP audit): when the signed-in user id changes
  // (logout-then-login as a different user on the same device),
  // re-cycle the IAP connection so any stale purchase listener bound
  // to the previous user's context is torn down and a fresh one
  // captures the new user's uid for the cross-user mismatch check.
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const lastIapUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUserId) return;
    if (lastIapUserIdRef.current === currentUserId) return;
    // Only fire on actual user changes after first boot binding.
    if (lastIapUserIdRef.current !== null) {
      try { endIAP(); } catch {}
      try {
        initIAP({
          onPurchase: async ({ productId, transactionReceipt }) => {
            const liveUserId = useAuthStore.getState().user?.id ?? null;
            if (liveUserId && currentUserId !== liveUserId) return;
            const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
            try {
              await useSubscriptionStore
                .getState()
                .validatePurchase(platform, productId, transactionReceipt);
            } catch {}
          },
          onPending: ({ productId }) => {
            useSubscriptionStore.getState().setPendingPurchase({ productId });
          },
        });
      } catch {}
    }
    lastIapUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    // Wait for fonts AND hydrated auth/onboarding/subscription state before
    // deciding which splash path to play. Otherwise returning users briefly
    // get the full welcome animation before we know they've seen it already,
    // and cold-install Pro users flash the paywall on first frame while the
    // subscription store rehydrates from default tier='free'.
    if (!fontsReady || !hydrationReady) return;
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
  }, [fontsReady, hasHydrated, authHydrated, subscriptionHasHydrated, isComplete, isAuthenticated]);

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
        const {
          registerForPushNotifications,
          scheduleDailyCheckInReminder,
          scheduleWeeklyReport,
          cancelWeeklyReport,
          scheduleMealSafetyChecks,
          cancelRemindersByTag,
        } = await import('../src/services/notificationService');
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
        // §9.3 — Aimee weekly report. Schedule a Sunday 9 AM local push
        // when notifications + weeklyReport are on; cancel cleanly when
        // either is off so a previously-scheduled Sunday push doesn't
        // keep firing for a user who turned the feature off.
        if (prefs.enabled && prefs.weeklyReport) {
          await scheduleWeeklyReport();
        } else {
          await cancelWeeklyReport();
        }
        // Food-safety reminder — daily local notification that points at
        // the nutrition tab so the user can check which preps are stale.
        // Default-on safety feature, not paywall-gated.
        if (prefs.enabled && prefs.mealSafetyReminders) {
          const [hh, mm] = (prefs.mealSafetyReminderTime ?? '09:00')
            .split(':')
            .map((s) => Number(s));
          await scheduleMealSafetyChecks(
            Number.isFinite(hh) ? hh : 9,
            Number.isFinite(mm) ? mm : 0,
          );
        } else {
          await cancelRemindersByTag('meal-safety-');
        }
      } catch (err) {
        if (__DEV__) console.warn('[boot] notification registration failed:', err);
      }
    })();

    // §9.3 — refresh the weekly report on every cold boot when the last
    // refresh is older than 6 days. This way the report the user lands
    // on after tapping a Sunday push is the current one, even though
    // the notification itself can't run code. Dynamic import keeps boot
    // cheap when the reports surface is never opened.
    (async () => {
      try {
        let waited = 0;
        // Wait for stores to hydrate so the report sees real data.
        while (waited < 5000) {
          const ready =
            useDoseLogStore.getState().doses != null &&
            useMealStore.getState().meals != null;
          if (ready) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
          waited += 50;
        }
        // §17 — Reports + Insights are Pro features; skip the work for
        // free-tier users entirely. Wait for subscription hydration
        // first; previously this read `tier` before the store rehydrated
        // from disk, defaulting Pro users to 'free' on cold boot and
        // skipping their weekly refresh (2026-05-17 correctness audit).
        let subWait = 0;
        while (!useSubscriptionStore.getState().hasHydrated && subWait < 5000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          subWait += 50;
        }
        const subTier = useSubscriptionStore.getState().tier;
        if (subTier === 'free') return;
        const { useAimeeReportsStore } = await import(
          '../src/store/useAimeeReportsStore'
        );
        const state = useAimeeReportsStore.getState();
        const lastAt = state.lastWeeklyAt
          ? new Date(state.lastWeeklyAt).getTime()
          : 0;
        if (Date.now() - lastAt > 6 * 86400_000) {
          const r = state.refreshWeekly();
          // Pro users get the LLM rewrite kicked off after the templated
          // weekly lands. Silent fail-soft on rate-limit or network.
          state.rewriteReportBody(r.id).catch(() => {});
        }
        state.refreshInsights();
      } catch (err) {
        if (__DEV__) console.warn('[boot] weekly report refresh failed:', err);
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
    //
    // 2026-05-17 P0 fix: previously the unauthenticated branch dropped
    // the route and just bounced to /auth — the comment claimed to
    // "stash the intent" but no stash existed. Cold-start taps before
    // auth rehydrated were always lost. Now we keep the pending route
    // in module state and a separate effect (below) drains it once
    // auth flips authenticated.
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
          try {
            const authState = useAuthStore.getState();
            const hydrated = authState.hasHydrated === true;
            const isAuthed = authState.isAuthenticated;
            if (!hydrated || !isAuthed) {
              // Stash the intent — drained by the post-auth effect.
              pendingDeepLinkRef.current = route;
              if (!hydrated || !isAuthed) {
                import('expo-router').then(({ router }) => router.replace('/auth'));
              }
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
    //
    // 2026-05-17 P0 fix: capture the authenticated user id at init time
    // so a delayed Ask-to-Buy approval (Apple can deliver this hours or
    // days later, possibly after a logout/login cycle on the same
    // device) doesn't run validatePurchase under user B's session and
    // credit them with user A's purchase. We compare the boot-time uid
    // against the live session uid at delivery; mismatch → drop the
    // event, telemetry breadcrumb so support can correlate.
    const iapBootUserId = useAuthStore.getState().user?.id ?? null;
    try {
      initIAP({
        onPurchase: async ({ productId, transactionReceipt }) => {
          const liveUserId = useAuthStore.getState().user?.id ?? null;
          if (iapBootUserId && liveUserId && iapBootUserId !== liveUserId) {
            // Cross-user purchase event — drop it.
            try {

              const { captureMessage } = require('../src/services/telemetry');
              captureMessage?.(
                'IAP purchase event mismatched user — dropping',
                'warning',
                { bootUid: iapBootUserId, liveUid: liveUserId, productId },
              );
            } catch {}
            return;
          }
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
    //
    // 2026-05-17 race fix: chat store uses async storage. Calling
    // flushPendingSyncs() before `hasHydrated` flips means pendingSyncs
    // is still empty — the flush was a no-op and queued messages stayed
    // queued until the user happened to send another message. Now we
    // wait (up to 5s) for the rehydrate, same pattern as the subscription
    // store wait above.
    (async () => {
      const start = Date.now();
      while (!useChatStore.getState().hasHydrated && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      useChatStore
        .getState()
        .flushPendingSyncs()
        ?.catch?.((err: unknown) => {
          if (__DEV__) console.warn('[boot] chat sync flush failed:', err);
        });
      // Same drain for offline doses (2026-05-17 P1 fix). A dose
      // logged offline used to stay local-only forever; now the boot
      // path retries any queued upserts.
      useDoseLogStore
        .getState()
        .flushPendingSyncs()
        ?.catch?.((err: unknown) => {
          if (__DEV__) console.warn('[boot] dose sync flush failed:', err);
        });
      // And the workout retry queue — same pattern for gym data.
      useWorkoutStore
        .getState()
        .flushPendingSyncs()
        ?.catch?.((err: unknown) => {
          if (__DEV__) console.warn('[boot] workout sync flush failed:', err);
        });
      // And journal entries.
      useJournalStore
        .getState()
        .flushPendingSyncs?.()
        ?.catch?.((err: unknown) => {
          if (__DEV__) console.warn('[boot] journal sync flush failed:', err);
        });
    })();

    // Hydrate user-owned data from the server so a reinstall / new device
    // picks up the full history instead of a blank slate. Each store
    // handles its own schema mapping and falls back to local-only if the
    // pull fails — nothing blocks boot.
    //
    // Also re-runs below in a separate effect when isAuthenticated flips
    // from false → true so signup/login flows correctly hydrate without
    // requiring a restart or network disconnect.
    const bootHydrations: [string, () => Promise<void>][] = [
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
    // 2026-05-18 cold-boot audit: gate boot syncs on a fresh session.
    // Previously they fired unconditionally — if the user had a stale
    // persisted token, ALL 11 stores would 401 in parallel and
    // captureException would log 11 Sentry events for the same auth
    // expiry, plus burn ~11 API requests on every cold boot of an
    // unsigned-in user. Now we wait for the auth store to confirm
    // there is actually a session before kicking the syncs.
    (async () => {
      try {
        const { supabase } = await import('../src/services/supabase');
        const { data: { session } } = await (supabase as any).auth.getSession();
        if (!session?.access_token) return;
        for (const [label, run] of bootHydrations) {
          run().catch((err: unknown) => {
            if (__DEV__) console.warn(`[boot] ${label} syncFromServer failed:`, err);
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('[boot] hydrations gate failed:', err);
      }
    })();

    // Mark navigator as mounted on next frame so <Stack> is in the tree
    requestAnimationFrame(() => setNavReady(true));

    // When the device reconnects after being offline, silently re-run the
    // recovery routines so queued work catches up without any user action.
    const unsubReconnect = subscribeToReconnect(() => {
      if (__DEV__) console.log('[net] back online — running recovery syncs');
      // Reconnect can fire before the chat store rehydrates (rare —
      // device goes from offline at cold boot back to online inside
      // the first ~50ms — but it happens). Gate on hasHydrated.
      if (useChatStore.getState().hasHydrated) {
        useChatStore.getState().flushPendingSyncs()?.catch?.(() => {});
      }
      useDoseLogStore.getState().flushPendingSyncs()?.catch?.(() => {});
      useWorkoutStore.getState().flushPendingSyncs()?.catch?.(() => {});
      useJournalStore.getState().flushPendingSyncs?.()?.catch?.(() => {});
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

      // §6.4 — mid-day macro deficit nudge. Reads notification prefs +
      // today's totals + targets; fires a one-off local notification per
      // enabled macro tracking below 60% of target after 14:00 local.
      // Single-fire per day per macro is enforced inside the service.
      try {
        const dateKey = (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        const mealState = useMealStore.getState();
        const totals = mealState.getDailyTotals(dateKey);
        const targets = mealState.targets;
        const prefs = useNotificationStore.getState().preferences;
        import('../src/services/notificationService').then((mod) =>
          mod
            .checkMidDayMacroDeficit({
              totalsByMacro: {
                protein: totals.proteinGrams,
                carbs: totals.carbsGrams,
                fat: totals.fatGrams,
                fiber: totals.fiberGrams ?? 0,
              },
              targetsByMacro: {
                protein: targets.proteinGrams,
                carbs: targets.carbsGrams,
                fat: targets.fatGrams,
                fiber: targets.fiberGrams ?? 30,
              },
              prefs: {
                proteinDeficitNudge: prefs.proteinDeficitNudge,
                carbsDeficitNudge: prefs.carbsDeficitNudge,
                fatDeficitNudge: prefs.fatDeficitNudge,
                fiberDeficitNudge: prefs.fiberDeficitNudge,
              },
            })
            .catch((err: unknown) => {
              if (__DEV__) console.warn('[foreground-sync] macro nudge failed:', err);
            }),
        );
      } catch (err) {
        if (__DEV__) console.warn('[foreground-sync] macro nudge setup failed:', err);
      }

      // §16 — missed-dose nudges. Both checks run on foreground so
      // dynamic "did the user log this today" content is correct at
      // fire time (local scheduled notifications can't compute that).
      try {
        const dateKey = (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        const doseState = useDoseLogStore.getState();
        const todayLogged = doseState.doses.filter(
          (d) => d.date === dateKey && !d.planned,
        );
        const todayPlanned = doseState.doses.filter(
          (d) => d.date === dateKey && d.planned,
        );
        // Unconfirmed planned doses today, mapped to the shape the
        // notification service expects.
        const peptideNameFor = (id: string) => {
          try {
             
            const { getPeptideById } = require('../src/data/peptides');
            return getPeptideById(id)?.name ?? id;
          } catch {
            return id;
          }
        };
        const missedCandidates = todayPlanned
          .filter(
            (p) =>
              !todayLogged.some(
                (l) => l.peptideId === p.peptideId && !l.planned,
              ),
          )
          .map((p) => ({
            peptideId: p.peptideId,
            peptideName: peptideNameFor(p.peptideId),
            date: p.date,
            time: p.time,
          }));
        import('../src/services/notificationService').then((mod) => {
          mod
            .checkMissedDosesTwoHourNudge(missedCandidates)
            .catch((err: unknown) => {
              if (__DEV__) console.warn('[foreground-sync] 2hr nudge failed:', err);
            });
          mod
            .checkMissedDosesEndOfDay({
              hasUnconfirmedPlannedToday: missedCandidates.length > 0,
              dateKey,
            })
            .catch((err: unknown) => {
              if (__DEV__) console.warn('[foreground-sync] eod nudge failed:', err);
            });
        });
      } catch (err) {
        if (__DEV__)
          console.warn('[foreground-sync] missed-dose check setup failed:', err);
      }
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
    <V3ThemeProvider>
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
          {/* v3 detail screens — drill-ins from the 4-card home (§2 / §4). */}
          <Stack.Screen
            name="tracker/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="activity/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/calculator"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/stack-builder"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/library"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/tracker"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="doses/side-effects"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="profile/appearance"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="activity/performance"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="aimee/reports"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="aimee/report/[id]"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="labs/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="labs/entry"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="body-composition/index"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="body-composition/entry"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="profile/community-prefs"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="community/leaderboard"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="community/milestones"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="tracker/weight"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="tracker/sleep"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="tracker/mood"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="tracker/photos"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
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
            name="admin/video-tagger"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="admin/start-live"
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
            name="workouts/program/[programId]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="workouts/new"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
              presentation: 'modal',
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
            name="workouts/player-v2"
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
        {/* Profile shortcut overlay lives in the (tabs) layout — mounting
            it here too caused the FAB to render twice on tab screens. The
            (tabs) mount is the canonical one; non-tab routes don't get the
            FAB by design. */}
      </View>
    </SafeAreaProvider>
    </V3ThemeProvider>
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

