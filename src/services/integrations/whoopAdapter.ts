/**
 * Whoop adapter — scaffolded dark.
 *
 * Partnership application is filed out-of-band. Whoop's review can
 * take weeks. Once approved, wire the OAuth flow here.
 *
 * UI surfaces this as "Coming soon — join beta" until then.
 */

import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
} from './types';
import type { BiomarkerScope } from '../../types/cycle';

const WHOOP_CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID ?? '';

export const whoopAdapter: BiomarkerAdapter = {
  source: 'whoop',

  available() {
    return WHOOP_CLIENT_ID.length > 0;
  },

  async isAuthorized() {
    return false;
  },

  async connect(_scopes: BiomarkerScope[]) {
    // TODO(1.9.x): OAuth flow against Whoop API v1
    return false;
  },

  async disconnect() {
    // TODO(1.9.x)
  },

  async status(): Promise<AdapterStatus> {
    return {
      connected: false,
      message: WHOOP_CLIENT_ID
        ? 'Whoop API approved — not yet implemented'
        : 'Whoop — coming soon (beta)',
    };
  },

  async sync(_scopes: BiomarkerScope[]): Promise<SyncResult> {
    return {
      scalars: [],
      ranges: [],
      sleeps: [],
      periods: [],
      cycleDayLogs: [],
      syncedAt: new Date().toISOString(),
    };
  },
};

export default whoopAdapter;
