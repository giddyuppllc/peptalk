/**
 * Cycle tracking store — periods, day logs, contraception history.
 *
 * Persistence: Zustand + secureStorage (locally encrypted).
 * Cloud sync: Supabase tables cycle_period_entries / cycle_day_logs /
 *             contraception_history. RLS limits each user to their own rows.
 * Privacy: post-Dobbs sensitive data; the Privacy settings screen surfaces
 *          an "extra sensitive" note. 2.0 adds opt-in local-only mode.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';
import type {
  PeriodEntry,
  CycleDayLog,
  ContraceptionHistoryEntry,
  FlowIntensity,
  BodySymptom,
  MoodTag,
  DischargeType,
  BiomarkerSource,
  ContraceptionMethod,
} from '../types/cycle';
import { computeCyclePrediction, computeCycleStats } from '../services/cyclePredictor';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CycleState {
  periods: PeriodEntry[];
  dayLogs: CycleDayLog[];
  contraceptionHistory: ContraceptionHistoryEntry[];
}

interface CycleActions {
  // ── Periods ────────────────────────────────────────────────────────────
  startPeriod: (input: { startDate?: string; flow?: FlowIntensity; source?: BiomarkerSource; notes?: string }) => PeriodEntry;
  endPeriod: (id: string, endDate?: string) => void;
  setDailyFlow: (periodId: string, date: string, flow: FlowIntensity) => void;
  updatePeriod: (id: string, patch: Partial<PeriodEntry>) => void;
  deletePeriod: (id: string) => void;
  getActivePeriod: () => PeriodEntry | undefined;
  getMostRecentPeriod: () => PeriodEntry | undefined;

  // ── Day logs ───────────────────────────────────────────────────────────
  upsertDayLog: (date: string, patch: Partial<Omit<CycleDayLog, 'id' | 'date' | 'createdAt' | 'updatedAt'>>) => CycleDayLog;
  deleteDayLog: (id: string) => void;
  getDayLog: (date: string) => CycleDayLog | undefined;

  // ── Symptom / mood quick toggles ──────────────────────────────────────
  toggleSymptom: (date: string, symptom: BodySymptom) => void;
  toggleMood: (date: string, mood: MoodTag) => void;
  setFlow: (date: string, flow?: FlowIntensity) => void;
  setDischarge: (date: string, discharge?: DischargeType) => void;
  setBBT: (date: string, bbt?: number, source?: BiomarkerSource) => void;
  setSexualActivity: (date: string, active: boolean) => void;

  // ── Contraception history ─────────────────────────────────────────────
  setCurrentContraception: (method: ContraceptionMethod, startDate?: string) => void;
  getCurrentContraception: () => ContraceptionHistoryEntry | undefined;

  // ── Predictions (derived) ─────────────────────────────────────────────
  getPrediction: (fallbackCycleLength?: number, fallbackPeriodLength?: number) => ReturnType<typeof computeCyclePrediction>;
  getStats: () => ReturnType<typeof computeCycleStats>;

  clearAll: () => void;
}

export const useCycleStore = create<CycleState & CycleActions>()(
  persist(
    (set, get) => ({
      periods: [],
      dayLogs: [],
      contraceptionHistory: [],

      // ── Periods ─────────────────────────────────────────────────────────
      startPeriod: (input) => {
        const now = new Date().toISOString();
        const entry: PeriodEntry = {
          id: uid('period'),
          startDate: input.startDate ?? todayKey(),
          dailyFlow: input.flow ? { [input.startDate ?? todayKey()]: input.flow } : undefined,
          notes: input.notes,
          source: input.source ?? 'manual',
          createdAt: now,
          updatedAt: now,
        };
        set({ periods: [entry, ...get().periods] });
        syncRecord('cycle_period_entries', {
          id: entry.id,
          start_date: entry.startDate,
          end_date: null,
          daily_flow: entry.dailyFlow ?? null,
          notes: entry.notes ?? null,
          source: entry.source,
        }).catch(() => {});
        return entry;
      },

      endPeriod: (id, endDate) => {
        const now = new Date().toISOString();
        const end = endDate ?? todayKey();
        set({
          periods: get().periods.map((p) =>
            p.id === id ? { ...p, endDate: end, updatedAt: now } : p,
          ),
        });
        const updated = get().periods.find((p) => p.id === id);
        if (updated) {
          syncRecord('cycle_period_entries', {
            id: updated.id,
            start_date: updated.startDate,
            end_date: updated.endDate ?? null,
            daily_flow: updated.dailyFlow ?? null,
            notes: updated.notes ?? null,
            source: updated.source,
          }).catch(() => {});
        }
      },

      setDailyFlow: (periodId, date, flow) => {
        const now = new Date().toISOString();
        set({
          periods: get().periods.map((p) =>
            p.id === periodId
              ? {
                  ...p,
                  dailyFlow: { ...(p.dailyFlow ?? {}), [date]: flow },
                  updatedAt: now,
                }
              : p,
          ),
        });
        const updated = get().periods.find((p) => p.id === periodId);
        if (updated) {
          syncRecord('cycle_period_entries', {
            id: updated.id,
            start_date: updated.startDate,
            end_date: updated.endDate ?? null,
            daily_flow: updated.dailyFlow ?? null,
            notes: updated.notes ?? null,
            source: updated.source,
          }).catch(() => {});
        }
      },

      updatePeriod: (id, patch) => {
        const now = new Date().toISOString();
        set({
          periods: get().periods.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: now } : p,
          ),
        });
        const updated = get().periods.find((p) => p.id === id);
        if (updated) {
          syncRecord('cycle_period_entries', {
            id: updated.id,
            start_date: updated.startDate,
            end_date: updated.endDate ?? null,
            daily_flow: updated.dailyFlow ?? null,
            notes: updated.notes ?? null,
            source: updated.source,
          }).catch(() => {});
        }
      },

      deletePeriod: (id) => {
        set({ periods: get().periods.filter((p) => p.id !== id) });
        deleteRecord('cycle_period_entries', id).catch(() => {});
      },

      getActivePeriod: () => get().periods.find((p) => !p.endDate),
      getMostRecentPeriod: () =>
        [...get().periods].sort((a, b) => b.startDate.localeCompare(a.startDate))[0],

      // ── Day logs ────────────────────────────────────────────────────────
      upsertDayLog: (date, patch) => {
        const now = new Date().toISOString();
        const existing = get().dayLogs.find((d) => d.date === date);
        const merged: CycleDayLog = existing
          ? {
              ...existing,
              ...patch,
              symptoms: patch.symptoms ?? existing.symptoms ?? [],
              moods: patch.moods ?? existing.moods ?? [],
              updatedAt: now,
            }
          : {
              id: uid('cyclelog'),
              date,
              symptoms: patch.symptoms ?? [],
              moods: patch.moods ?? [],
              flow: patch.flow,
              discharge: patch.discharge,
              bbt: patch.bbt,
              bbtSource: patch.bbtSource,
              notes: patch.notes,
              sexualActivity: patch.sexualActivity,
              positiveOvulationTest: patch.positiveOvulationTest,
              positivePregnancyTest: patch.positivePregnancyTest,
              source: patch.source ?? 'manual',
              createdAt: now,
              updatedAt: now,
            };

        set({
          dayLogs: existing
            ? get().dayLogs.map((d) => (d.id === existing.id ? merged : d))
            : [merged, ...get().dayLogs],
        });

        syncRecord('cycle_day_logs', {
          id: merged.id,
          date: merged.date,
          flow: merged.flow ?? null,
          symptoms: merged.symptoms,
          moods: merged.moods,
          discharge: merged.discharge ?? null,
          bbt: merged.bbt ?? null,
          bbt_source: merged.bbtSource ?? null,
          notes: merged.notes ?? null,
          sexual_activity: merged.sexualActivity ?? null,
          positive_ovulation_test: merged.positiveOvulationTest ?? null,
          positive_pregnancy_test: merged.positivePregnancyTest ?? null,
          source: merged.source,
        }).catch(() => {});

        return merged;
      },

      deleteDayLog: (id) => {
        set({ dayLogs: get().dayLogs.filter((d) => d.id !== id) });
        deleteRecord('cycle_day_logs', id).catch(() => {});
      },

      getDayLog: (date) => get().dayLogs.find((d) => d.date === date),

      // ── Symptom / mood toggles ──────────────────────────────────────────
      toggleSymptom: (date, symptom) => {
        const existing = get().getDayLog(date);
        const current = new Set(existing?.symptoms ?? []);
        current.has(symptom) ? current.delete(symptom) : current.add(symptom);
        get().upsertDayLog(date, { symptoms: Array.from(current) });
      },

      toggleMood: (date, mood) => {
        const existing = get().getDayLog(date);
        const current = new Set(existing?.moods ?? []);
        current.has(mood) ? current.delete(mood) : current.add(mood);
        get().upsertDayLog(date, { moods: Array.from(current) });
      },

      setFlow: (date, flow) => {
        get().upsertDayLog(date, { flow });
      },
      setDischarge: (date, discharge) => {
        get().upsertDayLog(date, { discharge });
      },
      setBBT: (date, bbt, source) => {
        get().upsertDayLog(date, { bbt, bbtSource: source });
      },
      setSexualActivity: (date, active) => {
        get().upsertDayLog(date, { sexualActivity: active });
      },

      // ── Contraception history ──────────────────────────────────────────
      setCurrentContraception: (method, startDate) => {
        const now = new Date().toISOString();
        const today = todayKey();
        const start = startDate ?? today;
        const history = [...get().contraceptionHistory];

        // Close out the current method (if any) the day before the new one begins.
        const current = history.find((h) => !h.endDate);
        if (current) {
          const prior = parseInt(start.slice(8, 10), 10) - 1;
          const yearMonth = start.slice(0, 7);
          const endDate = prior > 0 ? `${yearMonth}-${String(prior).padStart(2, '0')}` : start;
          current.endDate = endDate;
          syncRecord('contraception_history', {
            id: current.id,
            method: current.method,
            start_date: current.startDate,
            end_date: current.endDate ?? null,
            notes: current.notes ?? null,
          }).catch(() => {});
        }

        const entry: ContraceptionHistoryEntry = {
          id: uid('contra'),
          method,
          startDate: start,
        };
        history.push(entry);
        set({ contraceptionHistory: history });

        syncRecord('contraception_history', {
          id: entry.id,
          method: entry.method,
          start_date: entry.startDate,
          end_date: null,
          notes: null,
        }).catch(() => {});
      },

      getCurrentContraception: () =>
        get().contraceptionHistory.find((h) => !h.endDate),

      // ── Predictions (derived) ──────────────────────────────────────────
      getPrediction: (fallbackCycleLength, fallbackPeriodLength) => {
        const current = get().getCurrentContraception();
        const method = current?.method ?? 'tracking_natural';
        return computeCyclePrediction({
          method,
          periods: get().periods,
          fallbackCycleLength,
          fallbackPeriodLength,
        });
      },

      getStats: () => computeCycleStats(get().periods),

      clearAll: () =>
        set({ periods: [], dayLogs: [], contraceptionHistory: [] }),
    }),
    {
      name: 'peptalk-cycle',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        periods: state.periods,
        dayLogs: state.dayLogs,
        contraceptionHistory: state.contraceptionHistory,
      }),
    },
  ),
);

export default useCycleStore;
