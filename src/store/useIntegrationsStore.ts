/**
 * Integrations store — persists user's connected biomarker sources +
 * per-source status so the UI doesn't need to re-query adapters on
 * every render.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';
import type {
  ConnectedIntegration,
  BiomarkerSource,
  BiomarkerScope,
} from '../types/cycle';
import { getAdapter } from '../services/integrations/manager';
import { routeSyncResult, type RouteStats } from '../services/integrations/router';

interface IntegrationsState {
  integrations: ConnectedIntegration[];
  /** In-flight sync state keyed by source — keeps UI spinners accurate. */
  syncingSources: BiomarkerSource[];
}

interface IntegrationsActions {
  /** Connect a source via its adapter, persist, and auto-sync. */
  connectSource: (source: BiomarkerSource, scopes: BiomarkerScope[]) => Promise<boolean>;
  /** Disconnect + revoke. Record stays but `connected` flips to false. */
  disconnectSource: (source: BiomarkerSource) => Promise<void>;
  /**
   * Sync and route — pulls from the adapter, routes each category into
   * its downstream store (cycle / health profile / etc.), returns stats.
   * This is the main entry point for triggered + scheduled syncs.
   */
  syncAndRoute: (source: BiomarkerSource, scopes: BiomarkerScope[]) => Promise<RouteStats>;
  /** Legacy callback-style sync — kept for advanced consumers. */
  syncSource: (
    source: BiomarkerSource,
    scopes: BiomarkerScope[],
    onResult: (r: import('../services/integrations/types').SyncResult) => void,
  ) => Promise<void>;
  /** Refresh status for every integration (for settings screen). */
  refreshStatuses: () => Promise<void>;
  get: (source: BiomarkerSource) => ConnectedIntegration | undefined;
  clearAll: () => void;
  /**
   * Hydrate connection metadata from Supabase. On a new device the
   * OS-level permission has to be re-granted regardless, but pulling
   * the record means the settings screen shows accurate "last synced"
   * timestamps + previously-granted scopes instead of looking blank.
   */
  syncFromServer: () => Promise<void>;
}

// Deterministic id from the natural key (the table is UNIQUE(user_id, source)
// — one connection row per source). A random per-row id meant the same source
// reconnected on another device upserted onConflict:'id' against a mismatched
// key, duplicating the row or fighting the unique constraint. `int-${source}`
// aligns the primary key with the natural key so cross-device sync dedups.
function integrationId(source: BiomarkerSource): string {
  return `int-${source}`;
}

export const useIntegrationsStore = create<IntegrationsState & IntegrationsActions>()(
  persist(
    (set, get) => ({
      integrations: [],
      syncingSources: [],

      connectSource: async (source, scopes) => {
        const adapter = getAdapter(source);
        if (!adapter || !adapter.available()) return false;
        const ok = await adapter.connect(scopes);
        const status = await adapter.status();

        const existing = get().integrations.find((i) => i.source === source);
        const record: ConnectedIntegration = {
          id: integrationId(source),
          source,
          connected: ok,
          scopes,
          lastSyncedAt: status.lastSyncedAt ?? existing?.lastSyncedAt,
          statusMessage: status.message,
          lastError: status.error,
        };

        set({
          integrations: existing
            ? get().integrations.map((i) => (i.source === source ? record : i))
            : [...get().integrations, record],
        });

        syncRecord('connected_integrations', {
          id: record.id,
          source: record.source,
          connected: record.connected,
          scopes: record.scopes,
          last_synced_at: record.lastSyncedAt ?? null,
          status_message: record.statusMessage ?? null,
          last_error: record.lastError ?? null,
        }).catch(() => {});

        // Auto-sync right after a successful connect so the user sees
        // data immediately rather than "Connected but empty."
        if (ok) {
          // Don't block the UI on this — fire and forget, errors surface
          // via the integration record's lastError.
          get().syncAndRoute(source, scopes).catch(() => {});
        }

        return ok;
      },

      syncAndRoute: async (source, scopes) => {
        const adapter = getAdapter(source);
        const emptyStats: RouteStats = {
          periodsImported: 0,
          cycleDaysImported: 0,
          biometricsImported: 0,
          sleepsImported: 0,
          skippedByPriority: 0,
          errors: [],
        };
        if (!adapter) return emptyStats;

        set({ syncingSources: [...get().syncingSources, source] });
        try {
          const result = await adapter.sync(scopes);
          const stats = await routeSyncResult(result);

          const existing = get().integrations.find((i) => i.source === source);
          if (existing) {
            const updated = {
              ...existing,
              lastSyncedAt: result.syncedAt,
              lastError: stats.errors.length > 0 ? stats.errors.join('; ') : undefined,
              statusMessage: `Last sync: ${new Date(result.syncedAt).toLocaleString()} · ${stats.periodsImported + stats.cycleDaysImported} new records`,
            };
            set({
              integrations: get().integrations.map((i) =>
                i.source === source ? updated : i,
              ),
            });
            syncRecord('connected_integrations', {
              id: updated.id,
              source: updated.source,
              connected: updated.connected,
              scopes: updated.scopes,
              last_synced_at: updated.lastSyncedAt ?? null,
              status_message: updated.statusMessage ?? null,
              last_error: updated.lastError ?? null,
            }).catch(() => {});
          }
          return stats;
        } catch (err) {
          const existing = get().integrations.find((i) => i.source === source);
          if (existing) {
            set({
              integrations: get().integrations.map((i) =>
                i.source === source ? { ...i, lastError: String(err) } : i,
              ),
            });
          }
          return { ...emptyStats, errors: [String(err)] };
        } finally {
          set({
            syncingSources: get().syncingSources.filter((s) => s !== source),
          });
        }
      },

      disconnectSource: async (source) => {
        const adapter = getAdapter(source);
        if (adapter) await adapter.disconnect();
        const existing = get().integrations.find((i) => i.source === source);
        if (!existing) return;
        const updated: ConnectedIntegration = {
          ...existing,
          connected: false,
          statusMessage: 'Disconnected',
          lastError: undefined,
        };
        set({
          integrations: get().integrations.map((i) =>
            i.source === source ? updated : i,
          ),
        });
        syncRecord('connected_integrations', {
          id: updated.id,
          source: updated.source,
          connected: false,
          scopes: updated.scopes,
          last_synced_at: updated.lastSyncedAt ?? null,
          status_message: updated.statusMessage ?? null,
          last_error: null,
        }).catch(() => {});
      },

      syncSource: async (source, scopes, onResult) => {
        const adapter = getAdapter(source);
        if (!adapter) return;
        set({ syncingSources: [...get().syncingSources, source] });
        try {
          const result = await adapter.sync(scopes);
          onResult(result);

          const existing = get().integrations.find((i) => i.source === source);
          if (existing) {
            const updated = {
              ...existing,
              lastSyncedAt: result.syncedAt,
              lastError: undefined,
              statusMessage: `Last sync: ${new Date(result.syncedAt).toLocaleString()}`,
            };
            set({
              integrations: get().integrations.map((i) =>
                i.source === source ? updated : i,
              ),
            });
            syncRecord('connected_integrations', {
              id: updated.id,
              source: updated.source,
              connected: updated.connected,
              scopes: updated.scopes,
              last_synced_at: updated.lastSyncedAt ?? null,
              status_message: updated.statusMessage ?? null,
              last_error: null,
            }).catch(() => {});
          }
        } catch (err) {
          const existing = get().integrations.find((i) => i.source === source);
          if (existing) {
            set({
              integrations: get().integrations.map((i) =>
                i.source === source
                  ? { ...i, lastError: String(err) }
                  : i,
              ),
            });
          }
        } finally {
          set({
            syncingSources: get().syncingSources.filter((s) => s !== source),
          });
        }
      },

      refreshStatuses: async () => {
        const updated: ConnectedIntegration[] = [];
        for (const existing of get().integrations) {
          const adapter = getAdapter(existing.source);
          if (!adapter) {
            updated.push(existing);
            continue;
          }
          const status = await adapter.status();
          updated.push({
            ...existing,
            connected: status.connected,
            lastSyncedAt: status.lastSyncedAt ?? existing.lastSyncedAt,
            statusMessage: status.message,
            lastError: status.error,
          });
        }
        set({ integrations: updated });
      },

      get: (source) => get().integrations.find((i) => i.source === source),

      clearAll: () => set({ integrations: [], syncingSources: [] }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          source: BiomarkerSource;
          connected: boolean | null;
          scopes: BiomarkerScope[] | null;
          last_synced_at: string | null;
          status_message: string | null;
          last_error: string | null;
        };
        const merged = await hydrateFromServer<Row, ConnectedIntegration>(
          'connected_integrations',
          get().integrations,
          (r) => ({
            id: r.id,
            source: r.source,
            // A reinstall means the OS-level permission must be
            // re-granted — never trust the server's `connected=true` on a
            // fresh device. Force `connected: false` so the settings UI
            // prompts the user to reconnect before we trust the adapter.
            connected: false,
            scopes: r.scopes ?? [],
            lastSyncedAt: r.last_synced_at ?? undefined,
            statusMessage: r.status_message ?? undefined,
            lastError: r.last_error ?? undefined,
          }),
          { orderBy: 'last_synced_at', ascending: false, limit: 50 },
        );
        set({ integrations: merged });
      },
    }),
    {
      name: 'peptalk-integrations',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ integrations: state.integrations }),
    },
  ),
);

export default useIntegrationsStore;
