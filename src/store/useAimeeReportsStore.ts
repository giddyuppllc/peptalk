/**
 * Aimee Reports store — Master Refactor Plan v3.1 §9.3.
 *
 * Holds generated weekly + cycle reports + the latest insights feed.
 * Reports stay local-only by default (privacy §9.7); the user can opt
 * to share specific reports via the existing share infra. Insights
 * regenerate on each call to refreshInsights() — they're cheap.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import {
  generateWeeklyReport,
  generateCycleReport,
  generateInsights,
  type Report,
  type Insight,
} from '../services/aimeeReports';

interface ReportsState {
  reports: Report[];
  insights: Insight[];
  lastWeeklyAt: string | null;
  lastInsightsAt: string | null;
}

interface ReportsActions {
  refreshWeekly: () => Report;
  refreshInsights: () => Insight[];
  generateCycleReportFor: (protocolId: string) => Report | null;
  removeReport: (id: string) => void;
  markReportRead: (id: string) => void;
  clearAll: () => void;
}

export const useAimeeReportsStore = create<ReportsState & ReportsActions>()(
  persist(
    (set, get) => ({
      reports: [],
      insights: [],
      lastWeeklyAt: null,
      lastInsightsAt: null,

      refreshWeekly: () => {
        const r = generateWeeklyReport();
        // Replace any existing report for the same period — we don't
        // want six "Week of YYYY-MM-DD" copies cluttering history when
        // the user lands on the surface multiple times in the same week.
        const next = [
          r,
          ...get().reports.filter(
            (x) => !(x.kind === 'weekly' && x.periodStart === r.periodStart),
          ),
        ];
        set({
          reports: next.slice(0, 52), // keep ~1y of weeklies + any cycles
          lastWeeklyAt: r.generatedAt,
        });
        return r;
      },

      refreshInsights: () => {
        const list = generateInsights();
        set({ insights: list, lastInsightsAt: new Date().toISOString() });
        return list;
      },

      generateCycleReportFor: (protocolId) => {
        const r = generateCycleReport(protocolId);
        if (!r) return null;
        set({ reports: [r, ...get().reports].slice(0, 52) });
        return r;
      },

      removeReport: (id) =>
        set({ reports: get().reports.filter((r) => r.id !== id) }),

      markReportRead: (id) =>
        // No-op for now; reports don't have a read flag yet. Phase F2.1
        // adds an unread state for the ReportRibbon glow.
        set({ reports: get().reports.map((r) => (r.id === id ? r : r)) }),

      clearAll: () =>
        set({
          reports: [],
          insights: [],
          lastWeeklyAt: null,
          lastInsightsAt: null,
        }),
    }),
    {
      name: 'peptalk-aimee-reports-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
