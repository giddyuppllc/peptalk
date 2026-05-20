/**
 * InBody Adapter (scaffold)
 *
 * Ships with manual-entry-only today. The OAuth / REST flow is stubbed
 * so the UI can render the integration card and surface a "Set up
 * manual entry" CTA. When InBody developer credentials land, fill in
 * the connect() + sync() bodies — the shape matches whoopAdapter /
 * ouraAdapter.
 *
 * InBody offers two API paths:
 *   1. InBody RESTful API — clinic/B2B; user does a scan at a partner
 *      facility, results POST to our server via webhook OR we pull
 *      via /v1/results?userId=... (depends on contract).
 *   2. InBody App OAuth — pulls from the consumer-facing InBody mobile
 *      app account. Lower-effort to set up but only works for users
 *      who use the InBody app.
 *
 * Both write into useBodyCompositionStore.addScan. Manual entry uses
 * the same store with source: 'manual', and the integration card
 * shows the latest scan no matter where it came from.
 */

import type {
  BiomarkerAdapter,
  AdapterStatus,
  SyncResult,
} from './types';
import { EMPTY_SYNC_RESULT } from './types';
import type { BiomarkerScope } from '../../types/cycle';
import { useBodyCompositionStore } from '../../store/useBodyCompositionStore';

/**
 * Today this adapter is a stub. Returns "not connected" for the
 * connect path and an empty sync result. Manual entry remains the
 * working flow until we have InBody developer credentials.
 *
 * When wiring the real API:
 *   1. Store the OAuth tokens in `secureStorage` (the existing pattern
 *      for whoopAdapter/ouraAdapter).
 *   2. Implement `connect` to kick off the OAuth web flow.
 *   3. Implement `sync` to fetch the user's recent scans and call
 *      useBodyCompositionStore.getState().addScan(...) for each, with
 *      source: 'inbody'.
 */
export const inBodyAdapter: BiomarkerAdapter = {
  source: 'inbody',

  available(): boolean {
    // We can render the card on every platform. Once the real flow
    // exists we'll narrow this to whatever InBody supports.
    return true;
  },

  async isAuthorized(): Promise<boolean> {
    return false; // not wired yet
  },

  async connect(_scopes: BiomarkerScope[]): Promise<boolean> {
    // STUB — UI will surface a "Coming soon — use manual entry"
    // explanation. Return false so the integrations screen doesn't
    // claim a connection that doesn't exist.
    return false;
  },

  async disconnect(): Promise<void> {
    // No-op for the stub.
  },

  async status(): Promise<AdapterStatus> {
    const latest = useBodyCompositionStore.getState().latestScan();
    return {
      connected: false,
      lastSyncedAt: latest?.scannedAt,
      message:
        'Manual entry only for now — log your scan results below. ' +
        'Auto-sync from InBody comes once we finalize their API credentials.',
    };
  },

  async sync(_scopes: BiomarkerScope[], _sinceIso?: string): Promise<SyncResult> {
    // STUB — manual entries already live in the body-composition store,
    // not in the SyncResult pipeline. Return an empty result so the
    // sync manager doesn't get confused.
    return { ...EMPTY_SYNC_RESULT, syncedAt: new Date().toISOString() };
  },
};

export default inBodyAdapter;
