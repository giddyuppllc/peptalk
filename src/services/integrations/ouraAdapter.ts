/**
 * Oura adapter — scaffolded dark.
 *
 * The developer application + client approval is filed out-of-band.
 * When approved, wire the OAuth flow here and flip `available()`
 * to return true when the API client ID is present.
 *
 * UI surfaces this as "Coming soon — join beta" until then.
 */

import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
} from './types';
import type { BiomarkerScope } from '../../types/cycle';

const OURA_CLIENT_ID = process.env.EXPO_PUBLIC_OURA_CLIENT_ID ?? '';

export const ouraAdapter: BiomarkerAdapter = {
  source: 'oura',

  available() {
    // Flip on when OURA_CLIENT_ID lands in EAS env.
    return OURA_CLIENT_ID.length > 0;
  },

  async isAuthorized() {
    return false;
  },

  async connect(_scopes: BiomarkerScope[]) {
    // TODO(1.9.x): OAuth PKCE flow against Oura API v2
    return false;
  },

  async disconnect() {
    // TODO(1.9.x): revoke token
  },

  async status(): Promise<AdapterStatus> {
    return {
      connected: false,
      message: OURA_CLIENT_ID
        ? 'Oura API approved — not yet implemented'
        : 'Oura — coming soon (beta)',
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

export default ouraAdapter;
