/**
 * Google Health Connect adapter (Android).
 *
 * Uses react-native-health-connect via dynamic require. Exposes the
 * equivalent set of scopes to the HealthKit adapter for cross-platform
 * parity.
 *
 * STATUS (May 2026): explicit "Android coming soon" — we don't ship a
 * functional Android build today (iOS-only on the store), and the
 * full Health Connect read path is staged behind an iOS validation
 * window. available() reports false and connect() refuses so the
 * integrations UI shows a clear "coming soon" message rather than a
 * broken connect button.
 *
 * When we ship Android, flip `ANDROID_LIVE` to true and the rest of
 * the adapter (init / sync) takes over.
 */

import { Platform } from 'react-native';
import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
} from './types';
import type { BiomarkerScope } from '../../types/cycle';

const ANDROID_LIVE = false;

let HealthConnect: any = null;
try {
  if (Platform.OS === 'android') {
     
    HealthConnect = require('react-native-health-connect');
  }
} catch {
  HealthConnect = null;
}

let authorized = false;
let lastSyncedAt: string | undefined;

export const healthConnectAdapter: BiomarkerAdapter = {
  source: 'health_connect',

  available() {
    // Hard-gated until Android ships. See ANDROID_LIVE flag above.
    if (!ANDROID_LIVE) return false;
    return Platform.OS === 'android' && HealthConnect != null;
  },

  async isAuthorized() {
    return authorized;
  },

  async connect(_scopes: BiomarkerScope[]) {
    if (!this.available()) return false;
    try {
      const initialized = await HealthConnect.initialize?.();
      authorized = Boolean(initialized);
      return authorized;
    } catch {
      authorized = false;
      return false;
    }
  },

  async disconnect() {
    authorized = false;
    lastSyncedAt = undefined;
  },

  async status(): Promise<AdapterStatus> {
    // Explicit "coming soon" surface — the integrations UI keys off
    // the message field, so this is what users actually read.
    if (!ANDROID_LIVE) {
      return {
        connected: false,
        message: 'Android coming soon',
      };
    }
    return {
      connected: authorized,
      lastSyncedAt,
      message: authorized
        ? 'Connected to Health Connect'
        : Platform.OS === 'android'
        ? 'Not connected'
        : 'Android only',
    };
  },

  async sync(_scopes: BiomarkerScope[], _sinceIso?: string): Promise<SyncResult> {
    const syncedAt = new Date().toISOString();
    lastSyncedAt = syncedAt;
    return {
      scalars: [],
      ranges: [],
      sleeps: [],
      periods: [],
      cycleDayLogs: [],
      syncedAt,
      notes: ANDROID_LIVE
        ? 'Health Connect read paths land in 1.9.x'
        : 'Android coming soon — Health Connect integration not yet shipped',
    };
  },
};

export default healthConnectAdapter;
