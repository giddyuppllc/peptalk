import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DoseLogEntry,
  ActiveProtocol,
  DoseUnit,
  AdministrationRoute,
  ProtocolFrequency,
  HealthAlert,
  AlertLevel,
} from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';
import { getPeptideById } from '../data/peptides';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { STORE_LIMITS, capNewestFirst } from '../utils/storeLimits';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () =>
  `dose-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const today = () => toDateKey(new Date());

const timeNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Health alert detection
// ---------------------------------------------------------------------------

function detectAlerts(
  doses: DoseLogEntry[],
  protocols: ActiveProtocol[]
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentDoses = doses.filter(
    (d) => new Date(d.date) >= sevenDaysAgo
  );

  // Check for missed doses (active protocol but no recent dose)
  protocols
    .filter((p) => p.isActive)
    .forEach((protocol) => {
      const protocolDoses = recentDoses.filter(
        (d) => d.peptideId === protocol.peptideId
      );

      const expectedPerWeek =
        protocol.frequency === 'daily' ? 7 :
        protocol.frequency === 'twice_daily' ? 14 :
        protocol.frequency === 'eod' ? 3.5 :
        protocol.frequency === 'tiw' ? 3 :
        protocol.frequency === 'biw' ? 2 :
        protocol.frequency === 'weekly' ? 1 :
        protocol.frequency === 'biweekly' ? 0.5 : 3;

      const peptide = getPeptideById(protocol.peptideId);
      const name = peptide?.name || protocol.peptideId;

      if (protocolDoses.length < expectedPerWeek * 0.5) {
        alerts.push({
          id: `alert-missed-${protocol.peptideId}`,
          level: 'info',
          title: `Missed doses: ${name}`,
          message: `You've logged ${protocolDoses.length} doses of ${name} this week but your protocol calls for ~${Math.round(expectedPerWeek)}. Consistency matters for research outcomes.`,
          triggeredBy: 'dose_frequency',
          actionLabel: 'Log a dose',
          dismissed: false,
          createdAt: now.toISOString(),
        });
      }
    });

  // Check for unusually high frequency (> expected)
  const peptideDoseCounts = new Map<string, number>();
  recentDoses.forEach((d) => {
    peptideDoseCounts.set(
      d.peptideId,
      (peptideDoseCounts.get(d.peptideId) || 0) + 1
    );
  });

  peptideDoseCounts.forEach((count, peptideId) => {
    if (count > 14) {
      // More than 2x/day average for a week
      const peptide = getPeptideById(peptideId);
      alerts.push({
        id: `alert-high-freq-${peptideId}`,
        level: 'caution',
        title: `High dosing frequency: ${peptide?.name || peptideId}`,
        message: `You've logged ${count} doses in the last 7 days. Please verify this is consistent with your provider's guidance.`,
        triggeredBy: 'dose_frequency',
        actionLabel: 'Review with your doctor',
        dismissed: false,
        createdAt: now.toISOString(),
      });
    }
  });

  // Check active protocols that have exceeded their recommended max duration.
  // We lookup the protocol templates to find `durationWeeks.max` for the
  // peptide, add a 2-week grace, and warn once the user crosses that line.
  protocols
    .filter((p) => p.isActive && p.startDate)
    .forEach((protocol) => {
      const templates = PROTOCOL_TEMPLATES.filter(
        (t) => t.peptideId === protocol.peptideId,
      );
      if (templates.length === 0) return;

      // Use the widest max across matching templates so we don't false-positive
      // on users following a longer variant of the protocol.
      const maxWeeks = Math.max(...templates.map((t) => t.durationWeeks.max));
      if (!isFinite(maxWeeks) || maxWeeks <= 0) return;

      const start = new Date(protocol.startDate as string);
      if (isNaN(start.getTime())) return;
      const weeksActive = (now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
      if (weeksActive <= maxWeeks + 2) return;

      const peptide = getPeptideById(protocol.peptideId);
      const name = peptide?.name ?? protocol.peptideId;
      alerts.push({
        id: `alert-duration-${protocol.peptideId}`,
        level: 'warning',
        title: `${name} past recommended duration`,
        message: `You've been on ${name} for about ${Math.round(weeksActive)} weeks. Research protocols typically run up to ${maxWeeks} weeks. Consider taking a break and discussing with your provider.`,
        triggeredBy: 'dose_frequency',
        actionLabel: 'Review with your doctor',
        dismissed: false,
        createdAt: now.toISOString(),
      });
    });

  return alerts;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface DoseLogStore {
  doses: DoseLogEntry[];
  protocols: ActiveProtocol[];
  alerts: HealthAlert[];
  /** Alert IDs the user has dismissed — survives reload so they don't keep reappearing. */
  dismissedAlertIds: string[];
  hasAcceptedDoseDisclaimer: boolean;

  // Disclaimer gate
  acceptDoseDisclaimer: () => void;

  // Dose logging
  logDose: (input: {
    peptideId: string;
    amount: number;
    unit: DoseUnit;
    route: AdministrationRoute;
    date?: string;
    time?: string;
    injectionSite?: string;
    batchNumber?: string;
    notes?: string;
  }) => DoseLogEntry;
  deleteDose: (id: string) => void;

  // Protocols
  addProtocol: (input: {
    peptideId: string;
    templateId?: string;
    dose: number;
    unit: DoseUnit;
    route: AdministrationRoute;
    frequency: ProtocolFrequency;
    startDate?: string;
    endDate?: string;
    notes?: string;
  }) => void;
  deactivateProtocol: (id: string) => void;
  deleteProtocol: (id: string) => void;

  /**
   * §8.8 — bulk-insert planned doses across a cycle window. Returns
   * the number of entries written. De-dupes against existing logged or
   * planned entries on the same (peptideId, date) so re-running the
   * Calculator's "Schedule cycle" action a second time after edits
   * doesn't fan-out duplicates.
   */
  scheduleCycle: (input: {
    peptideId: string;
    amount: number;
    unit: DoseUnit;
    route: AdministrationRoute;
    dates: string[];
    time?: string;
    notes?: string;
  }) => number;

  /** Mark a planned dose as taken — flips `planned: false` and updates time. */
  confirmPlannedDose: (id: string, time?: string) => void;

  // Alerts
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;

  // Queries
  getDosesByDate: (date: string) => DoseLogEntry[];
  getDosesByPeptide: (peptideId: string) => DoseLogEntry[];
  getRecentDoses: (days: number) => DoseLogEntry[];
  getActiveProtocols: () => ActiveProtocol[];
  getDatesWithDoses: () => Set<string>;

  /** Wipe all local dose/protocol/alert state. Called on logout. */
  clearAll: () => void;

  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
}

export const useDoseLogStore = create<DoseLogStore>()(
  persist(
    (set, get) => ({
      doses: [],
      protocols: [],
      alerts: [],
      dismissedAlertIds: [],
      hasAcceptedDoseDisclaimer: false,

      // ── Disclaimer Gate ────────────────────────────────────────────────────

      acceptDoseDisclaimer: () => set({ hasAcceptedDoseDisclaimer: true }),

      // ── Dose Logging ─────────────────────────────────────────────────────

      logDose: (input) => {
        const entry: DoseLogEntry = {
          id: uid(),
          peptideId: input.peptideId,
          date: input.date || today(),
          time: input.time || timeNow(),
          amount: input.amount,
          unit: input.unit,
          route: input.route,
          injectionSite: input.injectionSite,
          batchNumber: input.batchNumber,
          notes: input.notes,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          doses: capNewestFirst([entry, ...state.doses], STORE_LIMITS.DOSES),
        }));

        // Sync to Supabase. Column names match the `dose_logs` table from
        // migration 20260420000000 (amount/unit/site/batch_number) — an
        // earlier version of this code wrote `dose_mcg` instead of
        // `amount`, which silently failed at PostgREST and left doses
        // local-only. Also look up the peptide's display name so the row
        // is readable without joining to the app's peptide catalog.
        const peptide = getPeptideById(entry.peptideId);
        syncRecord('dose_logs', {
          id: entry.id,
          peptide_id: entry.peptideId,
          peptide_name: peptide?.name ?? entry.peptideId,
          amount: entry.amount,
          unit: entry.unit,
          route: entry.route,
          date: entry.date,
          time: entry.time,
          site: entry.injectionSite ?? null,
          batch_number: entry.batchNumber ?? null,
          notes: entry.notes ?? null,
          source: 'user',
        });

        // Refresh alerts after logging
        setTimeout(() => get().refreshAlerts(), 100);

        return entry;
      },

      deleteDose: (id) => {
        set((state) => ({
          doses: state.doses.filter((d) => d.id !== id),
        }));
        // Also delete from Supabase — otherwise the row stays on the
        // server and reappears on the next syncFromServer() pull.
        deleteRecord('dose_logs', id);
      },

      // §8.8 — full-cycle scheduler. Writes one planned entry per
      // generated date so the Weekly Tracker can render the full plan.
      scheduleCycle: (input) => {
        const existing = get().doses;
        // De-dupe key: same peptide on same date already on file (logged
        // or planned). User can edit the calculator and re-schedule without
        // accidentally piling on duplicate entries.
        const occupied = new Set(
          existing
            .filter((d) => d.peptideId === input.peptideId)
            .map((d) => d.date),
        );
        const newEntries: DoseLogEntry[] = [];
        for (const date of input.dates) {
          if (occupied.has(date)) continue;
          newEntries.push({
            id: uid(),
            peptideId: input.peptideId,
            date,
            time: input.time ?? '09:00',
            amount: input.amount,
            unit: input.unit,
            route: input.route,
            notes: input.notes ?? 'Planned via Calculator',
            createdAt: new Date().toISOString(),
            planned: true,
          });
        }
        if (newEntries.length === 0) return 0;
        set((state) => ({
          doses: capNewestFirst(
            [...newEntries, ...state.doses],
            STORE_LIMITS.DOSES,
          ),
        }));
        // Sync each planned entry. The server uses `source: 'planned'` so
        // adherence calculations can distinguish planned vs logged.
        const peptide = getPeptideById(input.peptideId);
        for (const entry of newEntries) {
          syncRecord('dose_logs', {
            id: entry.id,
            peptide_id: entry.peptideId,
            peptide_name: peptide?.name ?? entry.peptideId,
            amount: entry.amount,
            unit: entry.unit,
            route: entry.route,
            date: entry.date,
            time: entry.time,
            site: entry.injectionSite ?? null,
            batch_number: entry.batchNumber ?? null,
            notes: entry.notes ?? null,
            source: 'planned',
          });
        }
        return newEntries.length;
      },

      confirmPlannedDose: (id, time) => {
        set((state) => ({
          doses: state.doses.map((d) =>
            d.id === id
              ? { ...d, planned: false, time: time ?? timeNow() }
              : d,
          ),
        }));
        const updated = get().doses.find((d) => d.id === id);
        if (updated) {
          const peptide = getPeptideById(updated.peptideId);
          syncRecord('dose_logs', {
            id: updated.id,
            peptide_id: updated.peptideId,
            peptide_name: peptide?.name ?? updated.peptideId,
            amount: updated.amount,
            unit: updated.unit,
            route: updated.route,
            date: updated.date,
            time: updated.time,
            site: updated.injectionSite ?? null,
            batch_number: updated.batchNumber ?? null,
            notes: updated.notes ?? null,
            source: 'user',
          });
        }
      },

      // ── Protocols ────────────────────────────────────────────────────────

      addProtocol: (input) => {
        const protocol: ActiveProtocol = {
          id: `proto-active-${Date.now()}`,
          peptideId: input.peptideId,
          templateId: input.templateId,
          dose: input.dose,
          unit: input.unit,
          route: input.route,
          frequency: input.frequency,
          startDate: input.startDate || today(),
          endDate: input.endDate,
          isActive: true,
          notes: input.notes,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          protocols: [protocol, ...state.protocols],
        }));

        // Auto-schedule a dose-time reminder. Fire-and-forget so a
        // notifications failure doesn't block the protocol from being
        // created. Defaults to 08:00 — Aimee can offer to change it
        // later, and the user can edit via Profile → Notifications.
        // No-op when notifications are unavailable (Expo Go, simulator,
        // permission denied — see notificationService.isAvailable).
        try {
          // Lazy require to avoid circular import + keep this store
          // testable in environments without expo-notifications.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { scheduleDoseReminder, notificationsAvailable } = require('../services/notificationService');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getPeptideById } = require('../data/peptides');
          if (notificationsAvailable?.()) {
            const peptideName = getPeptideById?.(input.peptideId)?.name ?? input.peptideId;
            const reminderTime = '08:00';
            scheduleDoseReminder?.(input.peptideId, peptideName, reminderTime, input.frequency)
              ?.catch?.((err: unknown) => {
                if (typeof __DEV__ !== 'undefined' && (__DEV__ as boolean)) {
                  if (__DEV__) console.warn('[useDoseLogStore] scheduleDoseReminder failed:', err);
                }
              });
          }
        } catch (err) {
          if (typeof __DEV__ !== 'undefined' && (__DEV__ as boolean)) {
            if (__DEV__) console.warn('[useDoseLogStore] dose reminder scheduling threw:', err);
          }
        }
      },

      deactivateProtocol: (id) => {
        const proto = get().protocols.find((p) => p.id === id);
        set((state) => ({
          protocols: state.protocols.map((p) =>
            p.id === id ? { ...p, isActive: false } : p,
          ),
        }));
        if (proto) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { cancelRemindersByTag } = require('../services/notificationService');
            cancelRemindersByTag?.(`dose-${proto.peptideId}-`)?.catch?.(() => {});
          } catch {}
        }
      },

      deleteProtocol: (id) => {
        const proto = get().protocols.find((p) => p.id === id);
        set((state) => ({
          protocols: state.protocols.filter((p) => p.id !== id),
        }));
        if (proto) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { cancelRemindersByTag } = require('../services/notificationService');
            cancelRemindersByTag?.(`dose-${proto.peptideId}-`)?.catch?.(() => {});
          } catch {}
        }
      },

      // ── Alerts ───────────────────────────────────────────────────────────

      dismissAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, dismissed: true } : a
          ),
          dismissedAlertIds: [...new Set([...state.dismissedAlertIds, id])],
        })),

      refreshAlerts: () => {
        const { doses, protocols, dismissedAlertIds } = get();
        const newAlerts = detectAlerts(doses, protocols).map((a) =>
          dismissedAlertIds.includes(a.id) ? { ...a, dismissed: true } : a
        );
        set({ alerts: newAlerts });
      },

      // ── Queries ──────────────────────────────────────────────────────────

      getDosesByDate: (date) =>
        get().doses.filter((d) => d.date === date),

      getDosesByPeptide: (peptideId) =>
        get().doses.filter((d) => d.peptideId === peptideId),

      getRecentDoses: (days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = toDateKey(cutoff);
        return get().doses.filter((d) => d.date >= cutoffStr);
      },

      getActiveProtocols: () =>
        get().protocols.filter((p) => p.isActive),

      getDatesWithDoses: () =>
        new Set(get().doses.map((d) => d.date)),

      clearAll: () =>
        set({
          doses: [],
          protocols: [],
          alerts: [],
          dismissedAlertIds: [],
          hasAcceptedDoseDisclaimer: false,
        }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          peptide_id: string;
          peptide_name: string | null;
          amount: number | null;
          dose_mcg: number | null;
          unit: string | null;
          route: string | null;
          date: string;
          time: string | null;
          site: string | null;
          batch_number: string | null;
          notes: string | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, DoseLogEntry>(
          'dose_logs',
          get().doses,
          (r) => ({
            id: r.id,
            peptideId: r.peptide_id,
            date: r.date,
            time: r.time ?? '00:00',
            amount: r.amount ?? r.dose_mcg ?? 0,
            unit: (r.unit as DoseUnit) ?? 'mcg',
            route: (r.route as AdministrationRoute) ?? 'subcutaneous',
            injectionSite: r.site ?? undefined,
            batchNumber: r.batch_number ?? undefined,
            notes: r.notes ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
          }),
          { orderBy: 'date', ascending: false, limit: 2000 },
        );
        set({
          doses: capNewestFirst(
            merged.sort((a, b) => (a.date < b.date ? 1 : -1)),
            STORE_LIMITS.DOSES,
          ),
        });
      },
    }),
    {
      name: 'peptalk-doselog',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        doses: state.doses,
        protocols: state.protocols,
        dismissedAlertIds: state.dismissedAlertIds,
        // Must persist or the disclaimer modal re-fires on every cold
        // launch — the gate at app/(tabs)/calendar.tsx reads this flag
        // on mount.
        hasAcceptedDoseDisclaimer: state.hasAcceptedDoseDisclaimer,
      }),
    }
  )
);
