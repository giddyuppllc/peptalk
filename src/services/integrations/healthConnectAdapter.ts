/**
 * Google Health Connect adapter (Android).
 *
 * Uses react-native-health-connect via dynamic require. Exposes the
 * equivalent set of scopes to the HealthKit adapter for cross-platform
 * parity.
 *
 * Stubbed in 1.9.0 — available() returns true only when the SDK is
 * installed. Full read implementation lands in a 1.9.x patch once iOS
 * is validated.
 */

import { Platform } from 'react-native';
import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
} from './types';
import type { BiomarkerScope } from '../../types/cycle';

let HealthConnect: any = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    return Platform.OS === 'android' && HealthConnect != null;
  },

  async isAuthorized() {
    return authorized;
  },

  async connect(_scopes: BiomarkerScope[]) {
    if (!this.available()) return false;
    try {
      // Minimal init — real permission negotiation happens in 1.9.x
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
      notes: 'Health Connect read paths land in 1.9.x',
    };
  },
};

export default healthConnectAdapter;
