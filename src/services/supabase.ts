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
 * limit, kept ENTIRELY in SecureStore so tokens never touch unencrypted
 * AsyncStorage. SecureStore keys allow [A-Za-z0-9._-], so the `.gN.i` / `.__ptr__`
 * suffixes are valid.
 *
 * ATOMICITY. The chunk set is written under a monotonic GENERATION namespace
 * (`key.g<gen>.<i>`); the live value is whichever generation the single pointer
 * key (`key.__ptr__` = "<gen>:<count>") names. setItem writes the NEW generation
 * fully, then commits with one atomic pointer write, then GCs the old generation.
 * So a crash, a thrown chunk write, or a concurrent read can never observe a
 * torn mix of new+old chunks — getItem always resolves a complete generation
 * (the old one until the pointer flips). A per-key write mutex serializes
 * setItem/removeItem so two writes can't interleave on the same generation.
 */
const CHUNK_SIZE = 1800; // chars; stays < 2048 bytes even with some multi-byte chars
const PTR_SUFFIX = '.__ptr__';

// Per-key promise chain — serializes writes (setItem/removeItem) for a key so
// concurrent token-refresh writes can't race the generation counter.
const writeChains = new Map<string, Promise<unknown>>();
function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain alive but don't let a rejection poison the next write.
  writeChains.set(key, next.catch(() => {}));
  return next;
}

function parsePtr(raw: string | null): { gen: number; count: number } | null {
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep < 0) return null;
  const gen = parseInt(raw.slice(0, sep), 10);
  const count = parseInt(raw.slice(sep + 1), 10);
  if (!Number.isFinite(gen) || !Number.isFinite(count) || count <= 0) return null;
  return { gen, count };
}

const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const ptr = parsePtr(await SecureStore.getItemAsync(key + PTR_SUFFIX));
      if (!ptr) {
        // No generation pointer. Two pre-`__ptr__` shapes can still be on disk:
        //
        //   1. The FIRST chunking scheme (the deploy-window build) wrote a
        //      `.__chunks__` count + `key.0`, `key.1`, … parts and DELETED the
        //      single-key value. The current `__ptr__`/generation reader would
        //      miss those entirely → null session → forced logout on the very
        //      next launch. Read that old shape here so those sessions survive.
        const legacyCountRaw = await SecureStore.getItemAsync(key + '.__chunks__');
        if (legacyCountRaw != null) {
          const legacyCount = parseInt(legacyCountRaw, 10) || 0;
          let out = '';
          for (let i = 0; i < legacyCount; i++) {
            const part = await SecureStore.getItemAsync(`${key}.${i}`);
            if (part == null) return null; // partial/corrupt → no session
            out += part;
          }
          return out;
        }
        //   2. The original pre-chunking single-key value. Read it directly so
        //      an existing session survives the upgrade without a forced logout.
        return await SecureStore.getItemAsync(key);
      }
      let out = '';
      for (let i = 0; i < ptr.count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.g${ptr.gen}.${i}`);
        if (part == null) return null; // incomplete generation → no session
        out += part;
      }
      return out;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): Promise<void> =>
    withWriteLock(key, async () => {
      try {
        const old = parsePtr(await SecureStore.getItemAsync(key + PTR_SUFFIX));
        const newGen = (old?.gen ?? -1) + 1;
        const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));

        // 1. Write the new generation fully (does not touch the live one).
        for (let i = 0; i < count; i++) {
          await SecureStore.setItemAsync(`${key}.g${newGen}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
        }
        // 2. COMMIT — single atomic pointer write flips the live generation.
        await SecureStore.setItemAsync(key + PTR_SUFFIX, `${newGen}:${count}`);
        // 3. GC the previous generation + any legacy single-key value.
        if (old) {
          for (let i = 0; i < old.count; i++) {
            await SecureStore.deleteItemAsync(`${key}.g${old.gen}.${i}`).catch(() => {});
          }
        }
        await SecureStore.deleteItemAsync(key).catch(() => {});
      } catch {}
    }),
  removeItem: (key: string): Promise<void> =>
    withWriteLock(key, async () => {
      try {
        const ptr = parsePtr(await SecureStore.getItemAsync(key + PTR_SUFFIX));
        if (ptr) {
          for (let i = 0; i < ptr.count; i++) {
            await SecureStore.deleteItemAsync(`${key}.g${ptr.gen}.${i}`).catch(() => {});
          }
        }
        await SecureStore.deleteItemAsync(key + PTR_SUFFIX).catch(() => {});
        await SecureStore.deleteItemAsync(key).catch(() => {}); // legacy single-key
      } catch {}
    }),
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
