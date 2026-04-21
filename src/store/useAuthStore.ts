/**
 * Auth store — Supabase email/password authentication.
 *
 * Handles signup, login, logout, session persistence.
 * Profile data syncs to Supabase profiles table.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { User } from '../types';
import { secureStorage } from '../services/secureStorage';
import { supabase } from '../services/supabase';
import { useSubscriptionStore } from './useSubscriptionStore';
import { useOnboardingStore } from './useOnboardingStore';

const db = supabase as any;

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
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

        // Dev account bypass — skip Supabase for test/dev emails
        const DEV_EMAILS: Record<string, { firstName: string; lastName: string; tier: string }> = {
          'burnsnoho@gmail.com': { firstName: 'Burns', lastName: '', tier: 'pro' },
          'free@test.com': { firstName: 'Free', lastName: 'Tester', tier: 'free' },
          'plus@test.com': { firstName: 'Plus', lastName: 'Tester', tier: 'plus' },
          'pro@test.com': { firstName: 'Pro', lastName: 'Tester', tier: 'pro' },
          'jamie@test.com': { firstName: 'Jamie', lastName: '', tier: 'pro' },
          'jake@test.com': { firstName: 'Jake', lastName: '', tier: 'pro' },
          'sophia@test.com': { firstName: 'Sophia', lastName: '', tier: 'plus' },
          'marcus@test.com': { firstName: 'Marcus', lastName: '', tier: 'pro' },
          'sarah@test.com': { firstName: 'Sarah', lastName: '', tier: 'plus' },
          'richard@test.com': { firstName: 'Richard', lastName: '', tier: 'pro' },
          'diana@test.com': { firstName: 'Diana', lastName: '', tier: 'pro' },
          'walter@test.com': { firstName: 'Walter', lastName: '', tier: 'free' },
          'margaret@test.com': { firstName: 'Margaret', lastName: '', tier: 'pro' },
        };

        const _email = email.toLowerCase().trim();
        const devAccount = DEV_EMAILS[_email];

        // Dev backdoor — only works in development builds, NEVER in production/TestFlight
        if (__DEV__ && devAccount) {
          useSubscriptionStore.getState().setTier(devAccount.tier as any);

          const appUser: User = {
            id: `dev-${Date.now()}`,
            email: _email,
            firstName: devAccount.firstName,
            lastName: devAccount.lastName,
            savedStacks: [],
            favoritePeptides: [],
            isPro: devAccount.tier === 'pro',
            createdAt: new Date().toISOString(),
          };

          set({ user: appUser, isAuthenticated: true, isLoading: false });
          return;
        }

        // Real Supabase auth for non-dev emails
        try {
          const { data, error } = await db.auth.signInWithPassword({
            email,
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

          const tier = profile?.subscription_tier ?? 'free';

          // Sync subscription tier
          useSubscriptionStore.getState().setTier(tier);

          const profileName = profile?.name ?? email.split('@')[0];
          const nameParts = profileName.split(' ');

          const appUser: User = {
            id: data.user.id,
            email: data.user.email ?? email,
            firstName: profile?.first_name ?? nameParts[0] ?? '',
            lastName: profile?.last_name ?? nameParts.slice(1).join(' ') ?? '',
            savedStacks: [],
            favoritePeptides: profile?.favorite_peptides ?? [],
            isPro: tier === 'pro',
            createdAt: data.user.created_at,
          };

          set({ user: appUser, isAuthenticated: true, isLoading: false });
        } catch (error) {
          console.error('[useAuthStore] Login failed:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      signup: async (firstName: string, lastName: string, email: string, password: string) => {
        set({ isLoading: true });

        try {
          const fullName = `${firstName} ${lastName}`.trim();
          const { data, error } = await db.auth.signUp({
            email,
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

          // Profile is auto-created by DB trigger (handle_new_user) but as a
          // safety net we upsert here in case the trigger failed for any reason.
          // onConflict: 'id' means if the row exists we update; otherwise insert.
          await db
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
        } catch (error) {
          console.error('[useAuthStore] Signup failed:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      restoreSession: async () => {
        try {
          const { data: { session } } = await db.auth.getSession();

          if (!session?.user) {
            set({ hasHydrated: true });
            return;
          }

          const { data: profile } = await db
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          const tier = profile?.subscription_tier ?? 'free';
          useSubscriptionStore.getState().setTier(tier);

          const profileName = profile?.name ?? '';
          const nameParts = profileName.split(' ');

          const appUser: User = {
            id: session.user.id,
            email: session.user.email ?? '',
            firstName: profile?.first_name ?? nameParts[0] ?? '',
            lastName: profile?.last_name ?? nameParts.slice(1).join(' ') ?? '',
            savedStacks: [],
            favoritePeptides: profile?.favorite_peptides ?? [],
            isPro: tier === 'pro',
            createdAt: session.user.created_at,
          };

          set({ user: appUser, isAuthenticated: true, hasHydrated: true });
        } catch {
          set({ hasHydrated: true });
        }
      },

      logout: () => {
        db.auth.signOut().catch(() => {});

        // Wipe every user-specific data store so the next person to log in
        // on this device can't see the previous user's data. Required for
        // HIPAA-style privacy since we track meals, doses, health profile,
        // check-ins, journal entries, body map, workouts, and chat history.
        try {
          useSubscriptionStore.getState().setTier('free');
          useOnboardingStore.getState().reset();
        } catch {}

        // Lazy-require the rest so this file doesn't force early
        // initialization of every store on app boot.
        try {
          const { useMealStore } = require('./useMealStore');
          useMealStore.getState().clearAll?.();
        } catch {}
        try {
          const { useDoseLogStore } = require('./useDoseLogStore');
          useDoseLogStore.getState().clearAll?.();
        } catch {}
        try {
          const { useHealthProfileStore } = require('./useHealthProfileStore');
          useHealthProfileStore.getState().resetProfile?.();
        } catch {}
        try {
          const { useCheckinStore } = require('./useCheckinStore');
          useCheckinStore.getState().clearAll?.();
        } catch {}
        try {
          const { useStackStore } = require('./useStackStore');
          useStackStore.getState().clearAll?.();
        } catch {}
        try {
          const { useJournalStore } = require('./useJournalStore');
          useJournalStore.getState().clearAll?.();
        } catch {}
        try {
          const { useBodyMapStore } = require('./useBodyMapStore');
          useBodyMapStore.getState().clearAll?.();
        } catch {}
        try {
          const { useWorkoutStore } = require('./useWorkoutStore');
          useWorkoutStore.getState().clearAll?.();
        } catch {}
        try {
          const { useChatStore } = require('./useChatStore');
          useChatStore.getState().clearChat?.();
        } catch {}
        try {
          const { useAchievementStore } = require('./useAchievementStore');
          useAchievementStore.getState().clearAll?.();
        } catch {}

        set({
          user: null,
          isAuthenticated: false,
        });
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
