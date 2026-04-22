import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Storage strategy:
 *
 *   - `secureStorage`  — the primary persisted store for Zustand. Wraps
 *                        `react-native-encrypted-storage` (iOS Keychain +
 *                        Android EncryptedSharedPreferences) so meal/chat/
 *                        journal/dose/check-in blobs are encrypted at rest.
 *                        Falls back to AsyncStorage in environments where
 *                        the native module is unavailable (Expo Go, web,
 *                        jest) so this file can't crash the app on import.
 *   - `secretStorage`  — expo-secure-store, for tiny secrets like auth
 *                        tokens. Each value is subject to the SecureStore
 *                        size limits; don't use this for user data blobs.
 *
 * Migration: the first time a value is read from secureStorage and the
 * encrypted backend misses, we check AsyncStorage for a legacy copy and
 * transparently migrate it into encrypted storage. This lets existing
 * testers keep their data after the upgrade without manual intervention.
 */

type NativeEncryptedStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let encryptedStorage: NativeEncryptedStorage | null = null;
try {
  const mod = require('react-native-encrypted-storage');
  encryptedStorage = (mod?.default ?? mod) as NativeEncryptedStorage;
} catch {
  // Not installed / not linked yet (Expo Go, web, fresh clone before
  // prebuild). We'll fall back to AsyncStorage. Keys will NOT be encrypted
  // in that case — so production builds MUST include the native module.
  if (__DEV__) {
    console.warn(
      '[storage] react-native-encrypted-storage unavailable; falling back to plaintext AsyncStorage. Run `npx expo prebuild` to enable encryption.',
    );
  }
}

const isEncryptionAvailable = () => encryptedStorage != null;

const safeGet = async (key: string): Promise<string | null> => {
  if (encryptedStorage) {
    try {
      const v = await encryptedStorage.getItem(key);
      if (v != null) return v;
      // Encrypted miss — check legacy AsyncStorage for an un-encrypted
      // copy from before the migration and promote it.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        try {
          await encryptedStorage.setItem(key, legacy);
          await AsyncStorage.removeItem(key);
        } catch {
          // Migration failure isn't fatal — next read will retry.
        }
        return legacy;
      }
      return null;
    } catch (err) {
      if (__DEV__) console.warn('[storage] encrypted read failed, falling back:', err);
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    if (__DEV__) console.warn('[storage] read failed');
    return null;
  }
};

const safeSet = async (key: string, value: string): Promise<void> => {
  if (encryptedStorage) {
    try {
      await encryptedStorage.setItem(key, value);
      return;
    } catch (err) {
      if (__DEV__) console.warn('[storage] encrypted write failed, falling back:', err);
    }
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    if (__DEV__) console.warn('[storage] write failed');
  }
};

const safeRemove = async (key: string): Promise<void> => {
  if (encryptedStorage) {
    try {
      await encryptedStorage.removeItem(key);
    } catch (err) {
      if (__DEV__) console.warn('[storage] encrypted remove failed:', err);
    }
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    if (__DEV__) console.warn('[storage] remove failed');
  }
};

export const secureStorage = {
  getItem: safeGet,
  setItem: safeSet,
  removeItem: safeRemove,
  /** True iff the underlying backend is encrypted (native module loaded). */
  isEncrypted: isEncryptionAvailable,
};

// Keep SecureStore available for actual secrets (auth tokens etc)
export const secretStorage = {
  getItem: async (key: string) => {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  setItem: async (key: string, value: string) => {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  },
  removeItem: async (key: string) => {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  },
};
