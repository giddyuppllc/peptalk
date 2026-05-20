/**
 * Lightweight wrappers around @react-native-community/netinfo.
 *
 * Exposes both a React hook for UI (`useIsOnline`) and an imperative
 * API (`subscribeToReconnect`) for stores / services that want to kick
 * background recovery when the device comes back online.
 *
 * We intentionally treat "unknown" as online so the UI doesn't flash
 * an offline banner at boot before the first NetInfo event fires.
 */

import { useEffect, useState } from 'react';

type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type NetInfoModule = {
  addEventListener: (cb: (s: NetInfoState) => void) => () => void;
  fetch: () => Promise<NetInfoState>;
};

let NetInfo: NetInfoModule | null = null;
try {
   
  const mod = require('@react-native-community/netinfo');
  NetInfo = (mod?.default ?? mod) as NetInfoModule;
} catch {
  // Running in Expo Go / web / jest without the native module — we'll
  // assume online so functionality isn't gated by a missing dep.
}

function stateToOnline(s: NetInfoState | null): boolean {
  if (!s) return true;
  // Treat null (unknown) as online so we don't flash offline at boot.
  const connected = s.isConnected !== false;
  const reachable = s.isInternetReachable !== false;
  return connected && reachable;
}

export function useIsOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (!NetInfo) return;
    let cancelled = false;
    NetInfo.fetch().then((s) => {
      if (!cancelled) setOnline(stateToOnline(s));
    }).catch(() => {});
    const unsub = NetInfo.addEventListener((s) => {
      if (!cancelled) setOnline(stateToOnline(s));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return online;
}

/**
 * Imperative reconnect subscription. Calls `onReconnect` each time the
 * device transitions from offline to online. Returns an unsubscribe fn.
 */
export function subscribeToReconnect(onReconnect: () => void): () => void {
  if (!NetInfo) return () => {};
  let previouslyOnline = true;
  return NetInfo.addEventListener((s) => {
    const online = stateToOnline(s);
    if (online && !previouslyOnline) {
      previouslyOnline = true;
      try { onReconnect(); } catch {}
    } else if (!online) {
      previouslyOnline = false;
    }
  });
}

/** One-shot "are we online right now?" check for imperative code paths. */
export async function isCurrentlyOnline(): Promise<boolean> {
  if (!NetInfo) return true;
  try {
    const s = await NetInfo.fetch();
    return stateToOnline(s);
  } catch {
    return true;
  }
}
