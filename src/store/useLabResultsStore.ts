/**
 * Lab results store — durable record of user-entered or imported lab
 * panels (HDL, LDL, HbA1c, testosterone, etc.).
 *
 * Manual entry first; PDF/photo OCR via the existing food-scan pattern
 * lands in 1.9.x. Aimee chat reads a summary block from here so she can
 * answer "is my LDL high?" with the user's actual numbers instead of
 * generic ranges.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';

/** Common lab panel categories. UI groups entry by these. */
export type LabCategory =
  | 'lipid'         // HDL, LDL, total chol, triglycerides
  | 'metabolic'     // glucose, HbA1c, insulin
  | 'hormone'       // T total/free, estradiol, DHEA, cortisol, TSH, T3, T4
  | 'inflammation'  // CRP, hsCRP, ESR, homocysteine
  | 'liver'         // ALT, AST, alk phos, GGT, bilirubin
  | 'kidney'        // creatinine, BUN, eGFR
  | 'cbc'           // hemoglobin, hematocrit, WBC, platelets
  | 'vitamin'       // D3, B12, folate, ferritin, magnesium
  | 'other';

export interface LabMarker {
  /** UI-stable id — slug-style. */
  id: string;
  label: string;
  category: LabCategory;
  unit: string;
  /** Reference range shown next to the input. Generic adult range —
   *  user's specific reference depends on their lab; we surface this as
   *  a hint, not as a diagnostic threshold. */
  refLow?: number;
  refHigh?: number;
  /** Higher-is-better marker (HDL, free T) vs higher-is-worse (LDL).
   *  Used by Aimee to decide which direction is "trending favorably". */
  preferHigh?: boolean;
}

/** Curated common-lab catalog. ~30 markers covers ~95% of what users
 *  bring to a peptide app. More can be added without migration. */
export const LAB_MARKERS: LabMarker[] = [
  // Lipid
  { id: 'hdl',       label: 'HDL Cholesterol',       category: 'lipid', unit: 'mg/dL', refLow: 40,  refHigh: 100, preferHigh: true },
  { id: 'ldl',       label: 'LDL Cholesterol',       category: 'lipid', unit: 'mg/dL', refLow: 0,   refHigh: 100 },
  { id: 'total_chol',label: 'Total Cholesterol',     category: 'lipid', unit: 'mg/dL', refLow: 0,   refHigh: 200 },
  { id: 'tg',        label: 'Triglycerides',         category: 'lipid', unit: 'mg/dL', refLow: 0,   refHigh: 150 },
  { id: 'apo_b',     label: 'ApoB',                  category: 'lipid', unit: 'mg/dL', refLow: 0,   refHigh: 90 },
  { id: 'lp_a',      label: 'Lp(a)',                 category: 'lipid', unit: 'nmol/L', refLow: 0,  refHigh: 75 },

  // Metabolic
  { id: 'glucose',   label: 'Fasting Glucose',       category: 'metabolic', unit: 'mg/dL', refLow: 70,  refHigh: 99 },
  { id: 'hba1c',     label: 'HbA1c',                 category: 'metabolic', unit: '%',     refLow: 0,   refHigh: 5.6 },
  { id: 'insulin',   label: 'Fasting Insulin',       category: 'metabolic', unit: 'µIU/mL', refLow: 2.6, refHigh: 24.9 },
  { id: 'homa_ir',   label: 'HOMA-IR',               category: 'metabolic', unit: '',      refLow: 0,   refHigh: 1.9 },

  // Hormone
  { id: 't_total',   label: 'Total Testosterone',    category: 'hormone', unit: 'ng/dL', refLow: 264, refHigh: 916, preferHigh: true },
  { id: 't_free',    label: 'Free Testosterone',     category: 'hormone', unit: 'pg/mL', refLow: 9,   refHigh: 30,  preferHigh: true },
  { id: 'shbg',      label: 'SHBG',                  category: 'hormone', unit: 'nmol/L', refLow: 16.5, refHigh: 55.9 },
  { id: 'estradiol', label: 'Estradiol',             category: 'hormone', unit: 'pg/mL', refLow: 7.6, refHigh: 42.6 },
  { id: 'dhea_s',    label: 'DHEA-S',                category: 'hormone', unit: 'µg/dL', refLow: 31,  refHigh: 701 },
  { id: 'cortisol',  label: 'Cortisol (AM)',         category: 'hormone', unit: 'µg/dL', refLow: 6.2, refHigh: 19.4 },
  { id: 'tsh',       label: 'TSH',                   category: 'hormone', unit: 'mIU/L', refLow: 0.4, refHigh: 4.5 },
  { id: 'free_t4',   label: 'Free T4',               category: 'hormone', unit: 'ng/dL', refLow: 0.8, refHigh: 1.8 },
  { id: 'free_t3',   label: 'Free T3',               category: 'hormone', unit: 'pg/mL', refLow: 2.3, refHigh: 4.2 },
  { id: 'igf_1',     label: 'IGF-1',                 category: 'hormone', unit: 'ng/mL', refLow: 78,  refHigh: 270 },

  // Inflammation
  { id: 'hs_crp',    label: 'hs-CRP',                category: 'inflammation', unit: 'mg/L', refLow: 0, refHigh: 1.0 },
  { id: 'homocyst',  label: 'Homocysteine',          category: 'inflammation', unit: 'µmol/L', refLow: 0, refHigh: 10.4 },

  // Liver
  { id: 'alt',       label: 'ALT',                   category: 'liver', unit: 'U/L', refLow: 0, refHigh: 35 },
  { id: 'ast',       label: 'AST',                   category: 'liver', unit: 'U/L', refLow: 0, refHigh: 35 },
  { id: 'alk_phos',  label: 'Alk Phos',              category: 'liver', unit: 'U/L', refLow: 36, refHigh: 130 },

  // Kidney
  { id: 'creatinine',label: 'Creatinine',            category: 'kidney', unit: 'mg/dL', refLow: 0.7, refHigh: 1.3 },
  { id: 'egfr',      label: 'eGFR',                  category: 'kidney', unit: 'mL/min/1.73', refLow: 60, refHigh: 200, preferHigh: true },

  // CBC
  { id: 'hgb',       label: 'Hemoglobin',            category: 'cbc', unit: 'g/dL', refLow: 13.5, refHigh: 17.5 },
  { id: 'hct',       label: 'Hematocrit',            category: 'cbc', unit: '%',    refLow: 38.8, refHigh: 50 },

  // Vitamin
  { id: 'vit_d',     label: 'Vitamin D (25-OH)',     category: 'vitamin', unit: 'ng/mL', refLow: 30, refHigh: 100, preferHigh: true },
  { id: 'b12',       label: 'Vitamin B12',           category: 'vitamin', unit: 'pg/mL', refLow: 232, refHigh: 1245, preferHigh: true },
  { id: 'ferritin',  label: 'Ferritin',              category: 'vitamin', unit: 'ng/mL', refLow: 30,  refHigh: 400 },
];

export interface LabValue {
  /** UID for this entry. */
  id: string;
  /** Marker id (matches LAB_MARKERS). */
  markerId: string;
  value: number;
  unit: string;
  /** YYYY-MM-DD when blood was drawn (or best estimate). */
  date: string;
  notes?: string;
  createdAt: string;
}

interface LabResultsState {
  results: LabValue[];
}

interface LabResultsActions {
  addResult: (input: Omit<LabValue, 'id' | 'createdAt'>) => LabValue;
  deleteResult: (id: string) => void;
  /** Most recent result for a marker, or undefined if none entered. */
  latest: (markerId: string) => LabValue | undefined;
  /** All results for a marker, newest first. */
  history: (markerId: string) => LabValue[];
  /** Plain-text summary for Aimee chat context. */
  summarizeForAimee: () => string | undefined;
  clearAll: () => void;
  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
}

function uid(): string {
  return `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useLabResultsStore = create<LabResultsState & LabResultsActions>()(
  persist(
    (set, get) => ({
      results: [],

      addResult: (input) => {
        const entry: LabValue = {
          id: uid(),
          ...input,
          createdAt: new Date().toISOString(),
        };
        set({ results: [entry, ...get().results] });

        // Sync to Supabase. Columns match migration 20260628000002 —
        // without this the full lab history was local-only and vanished on
        // reinstall / device switch. ref_low/ref_high are carried from the
        // marker catalog so server-side consumers don't need it.
        const marker = LAB_MARKERS.find((m) => m.id === entry.markerId);
        syncRecord('lab_results', {
          id: entry.id,
          marker_id: entry.markerId,
          value: entry.value,
          unit: entry.unit,
          drawn_at: entry.date,
          ref_low: marker?.refLow ?? null,
          ref_high: marker?.refHigh ?? null,
          notes: entry.notes ?? null,
          created_at: entry.createdAt,
          updated_at: new Date().toISOString(),
        });

        return entry;
      },

      deleteResult: (id) => {
        set({ results: get().results.filter((r) => r.id !== id) });
        deleteRecord('lab_results', id);
      },

      latest: (markerId) =>
        get()
          .results.filter((r) => r.markerId === markerId)
          .sort((a, b) => b.date.localeCompare(a.date))[0],

      history: (markerId) =>
        get()
          .results.filter((r) => r.markerId === markerId)
          .sort((a, b) => b.date.localeCompare(a.date)),

      summarizeForAimee: () => {
        const results = get().results;
        if (results.length === 0) return undefined;
        // Most recent value for each marker, formatted compactly.
        // Aimee gets the truth here without us listing every historical draw.
        const seen = new Set<string>();
        const lines: string[] = [];
        const sorted = [...results].sort((a, b) => b.date.localeCompare(a.date));
        for (const r of sorted) {
          if (seen.has(r.markerId)) continue;
          seen.add(r.markerId);
          const marker = LAB_MARKERS.find((m) => m.id === r.markerId);
          if (!marker) continue;
          lines.push(`${marker.label}: ${r.value} ${marker.unit} (${r.date})`);
          if (lines.length >= 10) break; // cap context size
        }
        return lines.length > 0 ? lines.join('; ') : undefined;
      },

      clearAll: () => set({ results: [] }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          marker_id: string;
          value: number;
          unit: string | null;
          drawn_at: string;
          notes: string | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, LabValue>(
          'lab_results',
          get().results,
          (r) => ({
            id: r.id,
            markerId: r.marker_id,
            value: r.value,
            unit: r.unit ?? '',
            date: r.drawn_at,
            notes: r.notes ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
          }),
          { orderBy: 'drawn_at', ascending: false, limit: 1000 },
        );
        const sorted = merged.sort((a, b) => b.date.localeCompare(a.date));
        set({ results: sorted });
      },
    }),
    {
      name: 'peptalk-lab-results',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ results: state.results.slice(0, 200) }),
    },
  ),
);

/** Group markers by category for the entry-screen list. */
export function getMarkersByCategory(): Record<LabCategory, LabMarker[]> {
  const out: Record<string, LabMarker[]> = {};
  for (const m of LAB_MARKERS) {
    if (!out[m.category]) out[m.category] = [];
    out[m.category].push(m);
  }
  return out as Record<LabCategory, LabMarker[]>;
}

export const LAB_CATEGORY_LABELS: Record<LabCategory, string> = {
  lipid: 'Lipid Panel',
  metabolic: 'Metabolic & Glucose',
  hormone: 'Hormones',
  inflammation: 'Inflammation',
  liver: 'Liver Enzymes',
  kidney: 'Kidney',
  cbc: 'Complete Blood Count',
  vitamin: 'Vitamins & Minerals',
  other: 'Other',
};
