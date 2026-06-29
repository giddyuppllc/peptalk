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

/**
 * Secure storage adapter for Supabase auth session persistence.
 *
 * Android's expo-secure-store has a ~2048-byte limit per value; the Supabase
 * session blob (access + refresh tokens + user metadata) can exceed it, which
 * silently fails to persist → the user appears logged out on the next launch.
 * We chunk large values across multiple SecureStore keys to stay under the
 * limit (the documented LargeSecureStore pattern, kept ENTIRELY in SecureStore
 * so tokens are never written to unencrypted AsyncStorage). SecureStore keys
 * allow [A-Za-z0-9._-], so the `.N` / `.__chunks__` suffixes are valid.
 */
const CHUNK_SIZE = 1800; // chars; stays < 2048 bytes even with some multi-byte chars
const COUNT_SUFFIX = '.__chunks__';

const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const countRaw = await SecureStore.getItemAsync(key + COUNT_SUFFIX);
      if (countRaw == null) {
        // Legacy single-key value (pre-chunking) — read it directly so an
        // existing session survives the upgrade without a forced logout.
        return await SecureStore.getItemAsync(key);
      }
      const count = parseInt(countRaw, 10) || 0;
      let out = '';
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part == null) return null; // partial/corrupt → treat as no session
        out += part;
      }
      return out;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const prevCountRaw = await SecureStore.getItemAsync(key + COUNT_SUFFIX);
      const prevCount = prevCountRaw ? parseInt(prevCountRaw, 10) || 0 : 0;

      const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      // Remove stale higher-index chunks if the value shrank since last write.
      for (let i = chunkCount; i < prevCount; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
      await SecureStore.setItemAsync(key + COUNT_SUFFIX, String(chunkCount));
      // Drop any legacy single-key value now that it's stored chunked.
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const countRaw = await SecureStore.getItemAsync(key + COUNT_SUFFIX);
      const count = countRaw ? parseInt(countRaw, 10) || 0 : 0;
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key + COUNT_SUFFIX).catch(() => {});
      await SecureStore.deleteItemAsync(key).catch(() => {}); // legacy single-key
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
