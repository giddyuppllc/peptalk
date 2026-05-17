/**
 * Supabase client — single instance shared across the app.
 *
 * Uses expo-secure-store for persisting auth tokens so sessions
 * survive app restarts without storing credentials in plaintext.
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Secure storage adapter for Supabase auth session persistence */
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

/**
 * Fail-soft client construction.
 *
 * `createClient` throws at module load when supabaseUrl is empty. That
 * crashes every caller of `import { supabase }` — including stores that
 * import the module purely to call `syncRecord`, which already swallows
 * errors at the catch site. The result was a boot-time crash for any
 * developer running the app without EXPO_PUBLIC_SUPABASE_URL set.
 *
 * When the env vars are missing we return a stub client that resolves
 * every method to "not configured" so the UI boots. Every sync call site
 * already handles failure (see syncService — silent fail by design), so
 * the UX is identical to "offline / unauthenticated" for the user.
 */
function buildClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {

      console.warn(
        '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. ' +
          'Backend sync will be skipped. Set them in .env to enable auth + sync.',
      );
    } else {
      // 2026-05-17 P1 fix: in production this is catastrophic — the
      // entire app runs in "offline forever" mode with no auth, no
      // sync, no user-facing error. Telemetry needs to know so the
      // build can be hot-fixed. Lazy-require to avoid a circular
      // import (telemetry might pull this client).
      try {

        const { captureMessage } = require('./telemetry');
        captureMessage?.(
          'Supabase env vars missing at boot — running in offline noop mode',
          'error',
          { hasUrl: !!supabaseUrl, hasAnonKey: !!supabaseAnonKey },
        );
      } catch {
        // Telemetry not initialized yet — swallow.
      }
    }
    return makeNoopClient();
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

function makeNoopClient() {
  const notConfigured = { message: 'Supabase not configured', status: 503 };
  const queryStub = () => ({
    select: () => Promise.resolve({ data: null, error: notConfigured }),
    insert: () => Promise.resolve({ data: null, error: notConfigured }),
    upsert: () => Promise.resolve({ data: null, error: notConfigured }),
    update: () => Promise.resolve({ data: null, error: notConfigured }),
    delete: () => Promise.resolve({ data: null, error: notConfigured }),
    eq: () => queryStub(),
    in: () => queryStub(),
    order: () => queryStub(),
    limit: () => queryStub(),
    single: () => Promise.resolve({ data: null, error: notConfigured }),
    maybeSingle: () => Promise.resolve({ data: null, error: notConfigured }),
    then: (resolve: (value: { data: null; error: typeof notConfigured }) => void) =>
      resolve({ data: null, error: notConfigured }),
  });
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () =>
        Promise.resolve({ data: { user: null, session: null }, error: notConfigured }),
      signUp: () =>
        Promise.resolve({ data: { user: null, session: null }, error: notConfigured }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      resetPasswordForEmail: () => Promise.resolve({ data: null, error: notConfigured }),
      refreshSession: () =>
        Promise.resolve({ data: { user: null, session: null }, error: null }),
      setSession: () =>
        Promise.resolve({ data: { user: null, session: null }, error: notConfigured }),
    },
    from: () => queryStub(),
    rpc: () => Promise.resolve({ data: null, error: notConfigured }),
    functions: {
      invoke: () => Promise.resolve({ data: null, error: notConfigured }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: notConfigured }),
        download: () => Promise.resolve({ data: null, error: notConfigured }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: () => Promise.resolve({ data: null, error: notConfigured }),
      }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => Promise.resolve('ok' as const),
  } as unknown as ReturnType<typeof createClient<Database>>;
}

export const supabase = buildClient();

export default supabase;
