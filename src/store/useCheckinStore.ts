import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BodyMeasurements, CheckInEntry, CheckInRating, EmotionTag, PeptideEffect, SleepStageData } from '../types';
import { secureStorage } from '../services/secureStorage';
import {
  syncRecord,
  deleteRecord,
  hydrateFromServer,
  adoptLegacyDayIds,
  isLegacyDayId,
  newDayScopedId,
} from '../services/syncService';

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

/** The check_ins row for an entry. Columns match migration 20260420000000. */
function checkInRow(e: CheckInEntry) {
  return {
    id: e.id,
    date: e.date,
    mood: e.mood,
    energy: e.energy,
    stress: e.stress,
    sleep_quality: e.sleepQuality,
    recovery: e.recovery,
    appetite: e.appetite,
    weight_lbs: e.weightLbs ?? null,
    resting_heart_rate: e.restingHeartRate ?? null,
    steps: e.steps ?? null,
    hrv_ms: e.hrvMs ?? null,
    vo2_max: e.vo2Max ?? null,
    spo2: e.spo2 ?? null,
    respiratory_rate: e.respiratoryRate ?? null,
    body_measurements: e.bodyMeasurements ?? null,
    notes: e.notes ?? null,
    emotion_tags: e.emotionTags ?? [],
    side_effect_tags: e.sideEffectTags ?? [],
    peptide_effects: e.peptideEffects ?? [],
    sleep_stages: e.sleepStages ?? null,
    active_calories: e.activeCalories ?? null,
    source: 'user',
  };
}

export const useCheckinStore = create<CheckinStore>()(
  persist(
    (set, get) => ({
      entries: [],

      saveCheckIn: (entry) => {
        const date = entry.date ?? toDateKey(new Date());
        const existing = get().entries.find((item) => item.date === date);
        const nextEntry: CheckInEntry = {
          // Never a date-only id: those collide between users (syncService,
          // "Day-keyed ids"). A legacy id is replaced on its next save.
          id:
            existing && !isLegacyDayId('checkin', existing.id)
              ? existing.id
              : newDayScopedId('checkin', date),
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
        const previousId = existing?.id;
        if (previousId && previousId !== nextEntry.id) {
          // Re-keyed from a legacy date-only id: remove the old row first (RLS
          // limits this to the user's own row; for everyone else it is a no-op).
          void deleteRecord('check_ins', previousId).finally(() => {
            void syncRecord('check_ins', checkInRow(nextEntry));
          });
        } else {
          void syncRecord('check_ins', checkInRow(nextEntry));
        }

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
        // Check-ins saved under a legacy date-only id that the server never
        // accepted (another user owned that id) get a fresh id and are pushed
        // now — this is what recovers months of check-ins that only lived on
        // the phone.
        const adopted = await adoptLegacyDayIds('check_ins', 'checkin', merged, (e) =>
          syncRecord('check_ins', checkInRow(e)),
        );
        const sorted = adopted.sort((a, b) => (a.date < b.date ? 1 : -1));
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
