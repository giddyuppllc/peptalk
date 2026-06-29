import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BodyMeasurements, CheckInEntry, CheckInRating, EmotionTag, PeptideEffect, SleepStageData } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const clampRating = (value: number): CheckInRating => {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return Math.round(value) as CheckInRating;
};

interface CheckInInput {
  date?: string;
  mood: CheckInRating;
  energy: CheckInRating;
  stress: CheckInRating;
  sleepQuality: CheckInRating;
  recovery: CheckInRating;
  appetite: CheckInRating;
  weightLbs?: number;
  restingHeartRate?: number;
  steps?: number;
  // Apple Watch metrics
  hrvMs?: number;
  vo2Max?: number;
  spo2?: number;
  respiratoryRate?: number;
  activeCalories?: number;
  sleepStages?: SleepStageData;
  bodyMeasurements?: import('../types').BodyMeasurements;
  notes?: string;
  emotionTags?: EmotionTag[];
  overallFeeling?: string;
  peptideEffects?: PeptideEffect[];
  sideEffectTags?: string[];
}

interface CheckinStore {
  entries: CheckInEntry[];
  saveCheckIn: (entry: CheckInInput) => CheckInEntry;
  removeCheckIn: (id: string) => void;
  getCheckInByDate: (date: string) => CheckInEntry | undefined;
  getEntriesInRange: (start: string, end: string) => CheckInEntry[];
  getEmotionFrequency: (days: number) => Record<string, number>;
  getStreak: () => number;
  clearAll: () => void;
  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
}

export const useCheckinStore = create<CheckinStore>()(
  persist(
    (set, get) => ({
      entries: [],

      saveCheckIn: (entry) => {
        const date = entry.date ?? toDateKey(new Date());
        const existing = get().entries.find((item) => item.date === date);
        const nextEntry: CheckInEntry = {
          id: existing?.id ?? `checkin-${date}`,
          date,
          createdAt: new Date().toISOString(),
          mood: clampRating(entry.mood),
          energy: clampRating(entry.energy),
          stress: clampRating(entry.stress),
          sleepQuality: clampRating(entry.sleepQuality),
          recovery: clampRating(entry.recovery),
          appetite: clampRating(entry.appetite),
          weightLbs: entry.weightLbs,
          restingHeartRate: entry.restingHeartRate,
          steps: entry.steps,
          hrvMs: entry.hrvMs,
          vo2Max: entry.vo2Max,
          spo2: entry.spo2,
          respiratoryRate: entry.respiratoryRate,
          activeCalories: entry.activeCalories,
          sleepStages: entry.sleepStages,
          bodyMeasurements: entry.bodyMeasurements,
          notes: entry.notes?.trim() || undefined,
          emotionTags: entry.emotionTags?.length ? entry.emotionTags : undefined,
          overallFeeling: entry.overallFeeling?.trim() || undefined,
          peptideEffects: entry.peptideEffects?.length ? entry.peptideEffects : undefined,
          sideEffectTags: entry.sideEffectTags?.length ? entry.sideEffectTags : undefined,
        };

        set((state) => {
          const filtered = state.entries.filter((item) => item.date !== date);
          return {
            entries: [nextEntry, ...filtered].sort((a, b) =>
              a.date < b.date ? 1 : -1
            ),
          };
        });

        // Sync to Supabase. Columns match migration 20260420000000 —
        // earlier versions of this code skipped peptide_effects,
        // sleep_stages, and active_calories, which meant Apple Watch
        // sleep breakdowns and peptide-attributed effect tags were
        // local-only and would disappear on reinstall.
        syncRecord('check_ins', {
          id: nextEntry.id,
          date: nextEntry.date,
          mood: nextEntry.mood,
          energy: nextEntry.energy,
          stress: nextEntry.stress,
          sleep_quality: nextEntry.sleepQuality,
          recovery: nextEntry.recovery,
          appetite: nextEntry.appetite,
          weight_lbs: nextEntry.weightLbs ?? null,
          resting_heart_rate: nextEntry.restingHeartRate ?? null,
          steps: nextEntry.steps ?? null,
          hrv_ms: nextEntry.hrvMs ?? null,
          vo2_max: nextEntry.vo2Max ?? null,
          spo2: nextEntry.spo2 ?? null,
          respiratory_rate: nextEntry.respiratoryRate ?? null,
          body_measurements: nextEntry.bodyMeasurements ?? null,
          notes: nextEntry.notes ?? null,
          emotion_tags: nextEntry.emotionTags ?? [],
          side_effect_tags: nextEntry.sideEffectTags ?? [],
          peptide_effects: nextEntry.peptideEffects ?? [],
          sleep_stages: nextEntry.sleepStages ?? null,
          active_calories: nextEntry.activeCalories ?? null,
          source: 'user',
        });

        return nextEntry;
      },

      removeCheckIn: (id) => {
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        }));
        deleteRecord('check_ins', id);
      },

      getCheckInByDate: (date) => {
        return get().entries.find((entry) => entry.date === date);
      },

      getEntriesInRange: (start, end) => {
        return get().entries.filter((e) => e.date >= start && e.date <= end);
      },

      getEmotionFrequency: (days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffKey = toDateKey(cutoff);
        const freq: Record<string, number> = {};
        for (const entry of get().entries) {
          if (entry.date < cutoffKey) break; // entries are sorted desc
          entry.emotionTags?.forEach((tag) => {
            freq[tag] = (freq[tag] ?? 0) + 1;
          });
        }
        return freq;
      },

      getStreak: () => {
        const { entries } = get();
        if (entries.length === 0) return 0;

        const entryDates = new Set(entries.map((entry) => entry.date));
        let streak = 0;
        const cursor = new Date();

        while (entryDates.has(toDateKey(cursor))) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        return streak;
      },

      clearAll: () => set({ entries: [] }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          date: string;
          mood: number;
          energy: number;
          stress: number;
          sleep_quality: number;
          recovery: number;
          appetite: number;
          weight_lbs: number | null;
          resting_heart_rate: number | null;
          steps: number | null;
          hrv_ms: number | null;
          vo2_max: number | null;
          spo2: number | null;
          respiratory_rate: number | null;
          body_measurements: BodyMeasurements | null;
          notes: string | null;
          emotion_tags: string[] | null;
          side_effect_tags: string[] | null;
          peptide_effects: PeptideEffect[] | null;
          sleep_stages: SleepStageData | null;
          active_calories: number | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, CheckInEntry>(
          'check_ins',
          get().entries,
          (r) => ({
            id: r.id,
            date: r.date,
            createdAt: r.created_at ?? new Date().toISOString(),
            mood: clampRating(r.mood),
            energy: clampRating(r.energy),
            stress: clampRating(r.stress),
            sleepQuality: clampRating(r.sleep_quality),
            recovery: clampRating(r.recovery),
            appetite: clampRating(r.appetite),
            weightLbs: r.weight_lbs ?? undefined,
            restingHeartRate: r.resting_heart_rate ?? undefined,
            steps: r.steps ?? undefined,
            hrvMs: r.hrv_ms ?? undefined,
            vo2Max: r.vo2_max ?? undefined,
            spo2: r.spo2 ?? undefined,
            respiratoryRate: r.respiratory_rate ?? undefined,
            bodyMeasurements: r.body_measurements ?? undefined,
            activeCalories: r.active_calories ?? undefined,
            sleepStages: r.sleep_stages ?? undefined,
            notes: r.notes ?? undefined,
            emotionTags: (r.emotion_tags as EmotionTag[]) ?? undefined,
            sideEffectTags: r.side_effect_tags ?? undefined,
            peptideEffects: r.peptide_effects ?? undefined,
          }),
          { orderBy: 'date', ascending: false, limit: 1000 },
        );
        const sorted = merged.sort((a, b) => (a.date < b.date ? 1 : -1));
        set({ entries: sorted });
      },
    }),
    {
      name: 'peptalk-checkins',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ entries: state.entries }),
    }
  )
);
