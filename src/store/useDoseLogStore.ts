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
import { syncRecord, deleteRecord } from '../services/syncService';
import { getPeptideById } from '../data/peptides';

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

  // Alerts
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;

  // Queries
  getDosesByDate: (date: string) => DoseLogEntry[];
  getDosesByPeptide: (peptideId: string) => DoseLogEntry[];
  getRecentDoses: (days: number) => DoseLogEntry[];
  getActiveProtocols: () => ActiveProtocol[];
  getDatesWithDoses: () => Set<string>;
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
          doses: [entry, ...state.doses],
        }));

        // Sync to Supabase
        syncRecord('dose_logs', {
          id: entry.id,
          peptide_id: entry.peptideId,
          peptide_name: entry.peptideId,
          dose_mcg: entry.amount,
          route: entry.route,
          date: entry.date,
          time: entry.time,
          notes: entry.notes ?? null,
        });

        // Refresh alerts after logging
        setTimeout(() => get().refreshAlerts(), 100);

        return entry;
      },

      deleteDose: (id) =>
        set((state) => ({
          doses: state.doses.filter((d) => d.id !== id),
        })),

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
      },

      deactivateProtocol: (id) =>
        set((state) => ({
          protocols: state.protocols.map((p) =>
            p.id === id ? { ...p, isActive: false } : p
          ),
        })),

      deleteProtocol: (id) =>
        set((state) => ({
          protocols: state.protocols.filter((p) => p.id !== id),
        })),

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
    }),
    {
      name: 'peptalk-doselog',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        doses: state.doses,
        protocols: state.protocols,
        dismissedAlertIds: state.dismissedAlertIds,
      }),
    }
  )
);
