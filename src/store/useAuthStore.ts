/**
 * Auth store — Supabase email/password authentication.
 *
 * Handles signup, login, logout, session persistence.
 * Profile data syncs to Supabase profiles table.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Alert } from 'react-native';
import { User } from '../types';
import { secureStorage } from '../services/secureStorage';
import { supabase } from '../services/supabase';
import { useSubscriptionStore } from './useSubscriptionStore';
import { useOnboardingStore } from './useOnboardingStore';
import { isAdminEmail } from '../hooks/useIsAdmin';
import {
  trackSignupStarted,
  trackSignupCompleted,
  trackSignupFailed,
  trackLoginSucceeded,
  trackLoginFailed,
} from '../services/analyticsEvents';
import { setUser as telemetrySetUser, captureException } from '../services/telemetry';

const db = supabase as any;

/**
 * Narrow a raw `profiles` row from Supabase into the shape our User type
 * expects. Any field that isn't a string gets coerced / defaulted rather
 * than blown up — a malformed row should degrade gracefully, not crash
 * the session restore flow.
 *
 * Logs to telemetry when we had to coerce so schema drift is visible.
 */
function coerceProfileRow(
  raw: unknown,
  fallbackEmail: string,
): {
  firstName: string;
  lastName: string;
  tier: string;
  favoritePeptides: string[];
  avatarUri?: string;
} {
  const row = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
  // 2026-05-18 defensive guard: older signup paths (since fixed) wrote
  // the email into the first_name field, so Jamie + Edward saw
  // "Good morning, edward@giddyupp.com" as their greeting. Treat any
  // @-shaped string as missing so the email-prefix fallback kicks in.
  const looksLikeEmail = (s: string) => s.includes('@') && s.includes('.');
  const sanitize = (s: string) => (looksLikeEmail(s) ? '' : s);
  const name = sanitize(asString(row.name));
  const parts = name.split(' ').filter(Boolean);
  const first =
    sanitize(asString(row.first_name)) ||
    parts[0] ||
    fallbackEmail.split('@')[0] ||
    '';
  const last = sanitize(asString(row.last_name)) || parts.slice(1).join(' ');
  const tier = ['free', 'plus', 'pro'].includes(asString(row.subscription_tier))
    ? (asString(row.subscription_tier) as 'free' | 'plus' | 'pro')
    : 'free';
  const favs = Array.isArray(row.favorite_peptides)
    ? row.favorite_peptides.filter((x: unknown) => typeof x === 'string') as string[]
    : [];
  const avatar = asString(row.avatar_url);
  return {
    firstName: first,
    lastName: last,
    tier,
    favoritePeptides: favs,
    avatarUri: avatar || undefined,
  };
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Permanently delete the current user's account (server-side + local wipe). */
  deleteAccount: () => Promise<void>;
  toggleFavoritePeptide: (peptideId: string) => void;
  setAvatar: (uri: string) => void;
  /** Restore session from Supabase on app start */
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });

        const _email = email.toLowerCase().trim();

        // Use the normalized email so trailing whitespace / caps don't
        // produce a client-validates-but-server-rejects mismatch.
        try {
          const { data, error } = await db.auth.signInWithPassword({
            email: _email,
            password,
          });

          if (error) {
            set({ isLoading: false });
            throw new Error(error.message);
          }

          if (!data.user) {
            set({ isLoading: false });
            throw new Error('Login failed');
          }

          // Fetch profile from DB — maybeSingle() returns null instead of throwing on no rows
          const { data: profile } = await db
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

          const safe = coerceProfileRow(profile, _email);
          // Admin override: admins are upgraded to 'pro' on every login so
          // they can test paid features + approve video tags without
          // needing a real subscription. Source of truth is ADMIN_EMAILS
          // in useIsAdmin.ts.
          const effectiveTier = isAdminEmail(_email) ? 'pro' : safe.tier;
          // Use mirror-aware setter — won't clobber a more-recent
          // syncFromServer write. 2026-05-17 IAP P0 fix.
          useSubscriptionStore.getState().setTierFromProfileMirror(effectiveTier as any);

          const appUser: User = {
            id: data.user.id,
            email: data.user.email ?? _email,
            firstName: safe.firstName,
            lastName: safe.lastName,
            avatarUri: safe.avatarUri,
            savedStacks: [],
            favoritePeptides: safe.favoritePeptides,
            isPro: effectiveTier === 'pro',
            createdAt: data.user.created_at,
          };

          set({ user: appUser, isAuthenticated: true, isLoading: false });
          // Forward the user id (no email/PII — telemetry.setUser strips
          // those in beforeSend) so Sentry groups events per-user and
          // ops can see which user hit a given crash.
          telemetrySetUser({ id: appUser.id });
          trackLoginSucceeded();
        } catch (error: any) {
          if (__DEV__) console.error('[useAuthStore] Login failed:', error);
          captureException(error, { source: 'auth.login', errorName: error?.name });
          set({ isLoading: false });
          trackLoginFailed(error?.message ?? 'unknown');
          throw error;
        }
      },

      signup: async (firstName: string, lastName: string, email: string, password: string) => {
        set({ isLoading: true });
        trackSignupStarted();

        try {
          const fullName = `${firstName} ${lastName}`.trim();
          const normalizedEmail = email.trim().toLowerCase();
          const { data, error } = await db.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: { name: fullName, first_name: firstName, last_name: lastName },
            },
          });

          if (error) {
            set({ isLoading: false });
            throw new Error(error.message);
          }

          if (!data.user) {
            set({ isLoading: false });
            throw new Error('Signup failed');
          }

          // Profile is auto-created by DB trigger (handle_new_user). As a
          // safety net we upsert here in case the trigger failed. With
          // onConflict: 'id' a pre-existing row from the trigger just
          // gets updated — so the ONLY reason upsert fails is a genuine
          // DB/RLS problem, not a benign duplicate.
          //
          // If upsert fails the auth user exists but has no profile row,
          // which means the next login will hit a null profile and fall
          // back to email-derived names. That's a broken state. Sign the
          // user back out so we don't leave a half-created account, and
          // surface the error so they can retry (or flag it to support).
          const { error: upsertErr } = await db
            .from('profiles')
            .upsert(
              {
                id: data.user.id,
                email: data.user.email ?? email,
                name: fullName,
                first_name: firstName,
                last_name: lastName,
              },
              { onConflict: 'id' },
            );
          if (upsertErr) {
            if (__DEV__) console.warn('[useAuthStore] profile upsert failed — rolling back signup:', upsertErr);
            try { await db.auth.signOut(); } catch {}
            set({ isLoading: false });
            throw new Error(
              `Account created but profile setup failed: ${upsertErr.message ?? upsertErr}. Please try again.`,
            );
          }

          const appUser: User = {
            id: data.user.id,
            email: data.user.email ?? email,
            firstName,
            lastName,
            savedStacks: [],
            favoritePeptides: [],
            isPro: false,
            createdAt: data.user.created_at,
          };

          set({ user: appUser, isAuthenticated: true, isLoading: false });
          trackSignupCompleted();
        } catch (error: any) {
          if (__DEV__) console.error('[useAuthStore] Signup failed:', error);
          set({ isLoading: false });
          trackSignupFailed(error?.message ?? 'unknown');
          throw error;
        }
      },

      restoreSession: async () => {
        try {
          const { data: { session } } = await db.auth.getSession();

          if (!session?.user) {
            // No active server-side session. Clear any STALE persisted
            // user/isAuthenticated so the app doesn't render as "logged in"
            // while every authed call returns 401. P0 ghost-session fix
            // from 2026-05-18 cold-boot audit.
            set({ user: null, isAuthenticated: false, hasHydrated: true });
            return;
          }

          const { data: profile } = await db
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          const safe = coerceProfileRow(profile, session.user.email ?? '');
          // Admin override: same rule as login — admins always get 'pro'
          // tier so session restore can't drop them back to free.
          const effectiveTier = isAdminEmail(session.user.email) ? 'pro' : safe.tier;
          // Use mirror-aware setter — won't clobber a more-recent
          // syncFromServer write. 2026-05-17 IAP P0 fix.
          useSubscriptionStore.getState().setTierFromProfileMirror(effectiveTier as any);

          const appUser: User = {
            id: session.user.id,
            email: session.user.email ?? '',
            firstName: safe.firstName,
            lastName: safe.lastName,
            avatarUri: safe.avatarUri,
            savedStacks: [],
            favoritePeptides: safe.favoritePeptides,
            isPro: effectiveTier === 'pro',
            createdAt: session.user.created_at,
          };

          set({ user: appUser, isAuthenticated: true, hasHydrated: true });
        } catch {
          // Same ghost-session fix on the error path — if getSession()
          // or the profile fetch threw, treat the user as signed out
          // rather than leaving stale persisted credentials in place.
          set({ user: null, isAuthenticated: false, hasHydrated: true });
        }
      },

      logout: async () => {
        // Cancel every scheduled OS notification BEFORE signOut so
        // User A's dose / check-in / workout reminders don't fire
        // on the device after User B signs in. (Notifications carry
        // user-typed content in the body — "Time to take BPC-157" —
        // and would expose the prior user's data.) P0 from Wave
        // 76.11 logout audit.
        try {
          const { cancelAllReminders } = await import(
            '../services/notificationService'
          );
          await cancelAllReminders();
        } catch {}

        // Abort any in-flight Aimee SSE stream — otherwise a late
        // text_delta lands in chat store post-logout. We do this
        // before the chat store wipe.
        try {
          const w = globalThis as any;
          if (w.__peptalkActiveAimeeAbort) {
            w.__peptalkActiveAimeeAbort();
            w.__peptalkActiveAimeeAbort = null;
          }
        } catch {}

        // Drop the device's push-token row BEFORE signOut — otherwise
        // a shared device keeps receiving pushes addressed to the
        // signed-out user. Best-effort; if it fails the cron-prune
        // path on DeviceNotRegistered eventually catches it.
        try {
          const { clearPushToken } = await import('../services/pushTokenSync');
          await clearPushToken();
        } catch {}

        // Attempt server-side signOut first. On a health-sensitive app
        // running on a shared device, a failed signOut isn't a reason to
        // leave local data intact — we still wipe below. But we DO want
        // to surface the failure so the user knows the server session
        // wasn't cleanly revoked and can manually invalidate it (change
        // password, sign out from all devices) if needed.
        let signOutError: Error | null = null;
        try {
          const { error } = await db.auth.signOut();
          if (error) signOutError = new Error(error.message ?? 'signOut failed');
        } catch (err: any) {
          signOutError = err instanceof Error ? err : new Error(String(err));
        }
        if (signOutError) {
          if (__DEV__) console.warn('[useAuthStore] signOut failed:', signOutError);
          // Don't block — still wipe local. But tell the user so they can
          // decide whether to change their password.
          Alert.alert(
            'Signed Out — Server Issue',
            `You've been logged out on this device, but we couldn't reach the server to revoke your session. If you signed in on a shared device, change your password to be safe.\n\n${signOutError.message}`,
          );
        }

        // Wipe every user-specific data store so the next person to log in
        // on this device can't see the previous user's data. Required for
        // HIPAA-style privacy since we track meals, doses, health profile,
        // check-ins, journal entries, body map, workouts, and chat history.
        try {
          // clearSubscription() (vs setTier('free')) also drops
          // productId / expiresAt / pendingPurchase / lastSyncedAt
          // — without this, User A's subscription metadata (incl.
          // expiry, last-validated time) lingered into User B's
          // session. P0 from Wave 76.11 logout audit.
          useSubscriptionStore.getState().clearSubscription();
          useOnboardingStore.getState().reset();
        } catch {}

        // Lazy-require the rest so this file doesn't force early
        // initialization of every store on app boot.
        //
        // 2026-05-17 P1 fix: every previous `catch {}` was silent. If
        // a store's clear method threw (e.g. corrupt state, native
        // module hang), the next user logging in on the same device
        // would silently inherit the previous user's data — and we'd
        // never know. Centralize the pattern so every failure lands
        // in telemetry. HIPAA-adjacent app — cross-user leaks deserve
        // a Sentry event.
        const safeClear = (label: string, fn: () => void) => {
          try {
            fn();
          } catch (err) {
            try {
              const { captureException } = require('../services/telemetry');
              captureException?.(err, { source: 'logout.wipe', store: label });
            } catch {
              // Telemetry itself failed — don't recurse.
            }
          }
        };
        safeClear('meal', () => require('./useMealStore').useMealStore.getState().clearAll?.());
        safeClear('dose', () => require('./useDoseLogStore').useDoseLogStore.getState().clearAll?.());
        safeClear('healthProfile', () => require('./useHealthProfileStore').useHealthProfileStore.getState().resetProfile?.());
        safeClear('checkin', () => require('./useCheckinStore').useCheckinStore.getState().clearAll?.());
        safeClear('stack', () => require('./useStackStore').useStackStore.getState().clearAll?.());
        safeClear('journal', () => require('./useJournalStore').useJournalStore.getState().clearAll?.());
        safeClear('bodyMap', () => require('./useBodyMapStore').useBodyMapStore.getState().clearAll?.());
        safeClear('workout', () => require('./useWorkoutStore').useWorkoutStore.getState().clearAll?.());
        // Use the hard-reset variant — `clearChat` only drops the
        // active thread and leaves pendingSyncs intact, which would
        // replay user A's queued messages under user B's auth.
        safeClear('chat', () => require('./useChatStore').useChatStore.getState().resetForLogout?.());
        safeClear('achievement', () => require('./useAchievementStore').useAchievementStore.getState().clearAll?.());
        safeClear('pantry', () => require('./usePantryStore').usePantryStore.getState().clearAll?.());
        safeClear('cycle', () => require('./useCycleStore').useCycleStore.getState().clearAll?.());
        safeClear('integrations', () => require('./useIntegrationsStore').useIntegrationsStore.getState().clearAll?.());
        safeClear('allergy', () => require('./useAllergyStore').useAllergyStore.getState().clearAll?.());

        // Stores the original sweep missed — each one persists PII or
        // user-correlated state that survived logout. P0 from
        // Wave 76.11 logout audit.
        safeClear('biometrics', () => require('./useBiometricsStore').useBiometricsStore.getState().clearAll?.());
        safeClear('labResults', () => require('./useLabResultsStore').useLabResultsStore.getState().clearAll?.());
        safeClear('plan', () => require('./usePlanStore').usePlanStore.getState().clearAll?.());
        safeClear('grocery', () => require('./useGroceryStore').useGroceryStore.getState().clearAll?.());
        safeClear('tutorial', () => require('./useTutorialStore').useTutorialStore.getState().resetTour?.());
        safeClear('progressGoals', () => require('./useProgressGoalsStore').useProgressGoalsStore.getState().clearAll?.());
        safeClear('featureWaitlist', () => require('./useFeatureWaitlistStore').useFeatureWaitlistStore.getState().clearAll?.());
        safeClear('community', () => require('./useCommunityStore').useCommunityStore.getState().clearAll?.());
        // Reset preferences to default + drop pushToken. Don't fully
        // clear — notification preferences are device-pref-ish — but
        // we don't want User B inheriting User A's reminder schedule.
        safeClear('notification', () => require('./useNotificationStore').useNotificationStore.setState({ pushToken: null }));

        // Wave 76.27 — second-pass cross-user leak audit. These stores
        // hold per-user PII / health data and persist via SecureStore
        // but were missing from the original sweep.
        safeClear('aimeeReports', () => require('./useAimeeReportsStore').useAimeeReportsStore.getState().clearAll?.());
        safeClear('progressPhotos', () => require('./useProgressPhotosStore').useProgressPhotosStore.getState().clearAll?.());
        safeClear('nutritionRequest', () => require('./useNutritionRequestStore').useNutritionRequestStore.getState().clearAll?.());
        safeClear('appetiteLog', () => require('./useAppetiteLogStore').useAppetiteLogStore.getState().clearAll?.());
        safeClear('workoutTemplate', () => require('./useWorkoutTemplateStore').useWorkoutTemplateStore.getState().clearAll?.());
        safeClear('reactions', () => require('./useReactionsStore').useReactionsStore.getState().clearAll?.());
        // Tears down the Supabase Realtime channel — without this, a
        // live event the previous user subscribed to keeps delivering
        // messages to this device after the next user signs in.
        safeClear('liveEvent', () => require('./useLiveEventStore').useLiveEventStore.getState().reset?.());
        // Raw AsyncStorage keys outside any Zustand store — user A's
        // "don't ask me to review again" opt-out and last-prompt
        // timestamp inherited to user B before this clear.
        safeClear('reviewPrompt', () => {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          AsyncStorage.removeItem('peptalk_last_review_prompt_ms');
          AsyncStorage.removeItem('peptalk_review_prompt_disabled');
        });

        // Reset Sentry user binding so subsequent crashes aren't
        // attributed to the previous user.
        safeClear('telemetry', () => {
          const { setUser } = require('../services/telemetry');
          setUser?.(null);
        });

        set({
          user: null,
          isAuthenticated: false,
        });
      },

      deleteAccount: async () => {
        const { user } = get();
        if (!user) throw new Error('Not signed in.');

        // Call a server-side edge function that:
        //   (1) deletes every row keyed on user_id (meals, doses, journals, chat,
        //       check-ins, subscriptions, profiles, etc.) — preferably cascaded
        //       via FKs so this function only needs to trigger auth.admin.deleteUser.
        //   (2) revokes the auth user.
        //
        // Deploy this Supabase edge function (needs service_role key):
        //
        //   // supabase/functions/delete-user/index.ts
        //   import { createClient } from '@supabase/supabase-js';
        //   export default async (req: Request) => {
        //     const authHeader = req.headers.get('Authorization') ?? '';
        //     const jwt = authHeader.replace('Bearer ', '');
        //     const admin = createClient(
        //       Deno.env.get('SUPABASE_URL')!,
        //       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        //     );
        //     const { data: { user } } = await admin.auth.getUser(jwt);
        //     if (!user) return new Response('unauthenticated', { status: 401 });
        //     await admin.auth.admin.deleteUser(user.id);
        //     return new Response('ok');
        //   };
        const { data: { session } } = await db.auth.getSession();
        if (!session?.access_token) throw new Error('Session expired — sign in again and retry.');

        const { error } = await db.functions.invoke('delete-user', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) {
          // Deliberately do NOT wipe local state on failure — user needs
          // to retry. If they're offline, try again when reconnected.
          throw new Error(error.message ?? 'Could not delete account. Please try again.');
        }

        // Server-side deletion succeeded — now wipe local state.
        // logout() handles the store teardown and signOut.
        await get().logout();
      },

      setAvatar: (uri: string) => {
        const { user } = get();
        if (!user) return;
        set({ user: { ...user, avatarUri: uri } });
        // Sync to Supabase profiles table (fire and forget)
        db.from('profiles').update({ avatar_url: uri }).eq('id', user.id).then(() => {}, () => {});
      },

      toggleFavoritePeptide: (peptideId: string) => {
        const { user } = get();
        if (!user) return;

        const isFavorited = user.favoritePeptides.includes(peptideId);
        const updatedFavorites = isFavorited
          ? user.favoritePeptides.filter((id) => id !== peptideId)
          : [...user.favoritePeptides, peptideId];

        set({ user: { ...user, favoritePeptides: updatedFavorites } });

        // Sync to DB
        db
          .from('profiles')
          .update({ favorite_peptides: updatedFavorites })
          .eq('id', user.id)
          .then(() => {});
      },
    }),
    {
      name: 'peptalk-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        useAuthStore.setState({
          isAuthenticated: Boolean(state.user),
          isLoading: false,
          hasHydrated: true,
        });
      },
    }
  )
);
