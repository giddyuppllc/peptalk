/**
 * Integrations store — persists user's connected biomarker sources +
 * per-source status so the UI doesn't need to re-query adapters on
 * every render.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';
import type {
  ConnectedIntegration,
  BiomarkerSource,
  BiomarkerScope,
} from '../types/cycle';
import { getAdapter } from '../services/integrations/manager';

interface IntegrationsState {
  integrations: ConnectedIntegration[];
  /** In-flight sync state keyed by source — keeps UI spinners accurate. */
  syncingSources: BiomarkerSource[];
}

interface IntegrationsActions {
  /** Connect a source via its adapter and persist the resulting record. */
  connectSource: (source: BiomarkerSource, scopes: BiomarkerScope[]) => Promise<boolean>;
  /** Disconnect + revoke. Record stays but `connected` flips to false. */
  disconnectSource: (source: BiomarkerSource) => Promise<void>;
  /** Trigger a sync for a connected source. Results land in the downstream stores. */
  syncSource: (
    source: BiomarkerSource,
    scopes: BiomarkerScope[],
    onResult: (r: import('../services/integrations/types').SyncResult) => void,
  ) => Promise<void>;
  /** Refresh status for every integration (for settings screen). */
  refreshStatuses: () => Promise<void>;
  get: (source: BiomarkerSource) => ConnectedIntegration | undefined;
  clearAll: () => void;
}

function uid(): string {
  return `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
          id: existing?.id ?? uid(),
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

        return ok;
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
    }),
    {
      name: 'peptalk-integrations',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ integrations: state.integrations }),
    },
  ),
);

export default useIntegrationsStore;
