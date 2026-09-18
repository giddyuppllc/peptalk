/**
 * Aimee Reports store — Master Refactor Plan v3.1 §9.3.
 *
 * Holds generated weekly + cycle reports + the latest insights feed.
 * Reports stay local-only by default (privacy §9.7); the user can opt
 * to share specific reports via the existing share infra. Insights
 * regenerate on each call to refreshInsights() — they're cheap.
 */

import { create } from 'zustand';
import { makeSafeMerge, passthroughMigrate } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
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
  /**
   * Server-side LLM rewrite of an existing report's body. Non-blocking:
   * the templated body is shown immediately; the rewrite swaps in when
   * it arrives. Failures are silent — the templated version stays put.
   */
  rewriteReportBody: (id: string) => Promise<void>;
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

      rewriteReportBody: async (id) => {
        const report = get().reports.find((r) => r.id === id);
        if (!report) return;
        // App Review 5.1.2: explicit consent before sending report text to xAI (Aimee).
        const { ensureAiConsent } = await import('../utils/ensureAiConsent');
        if (!(await ensureAiConsent())) return;
        // The health toggle is a SEPARATE consent. The templated body is dose
        // counts, side-effect severities and check-in moods — the rewrite has
        // nothing left to rewrite without it, so it refuses. Fail-soft: the
        // templated body the user already sees simply stays.
        const { healthConsentGranted, withHealthConsent } = await import('../lib/aiFeatureConsent');
        if (!healthConsentGranted()) return;
        try {
          // Lazy-require to keep this store boot-cheap; supabase client
          // pulls in expo-secure-store + the SDK.
          const { supabase } = await import('../services/supabase');
          const { data, error } = await (supabase as any).functions.invoke(
            'aimee-report-rewrite',
            {
              body: withHealthConsent('aimee-report-rewrite', {
                body: report.body,
                headline: report.headline,
                recommendation: report.recommendation,
              }),
            },
          );
          if (error) return;
          // Cap LLM output. Templated bodies are ≤2KB; a runaway model
          // could otherwise return megabytes that get persisted into
          // SecureStorage forever. 8KB is generous (4x the template
          // ceiling) and small enough that 52 weekly reports stay
          // comfortably inside the secure-store budget. Also strips
          // tags as a belt-and-braces measure against any future
          // markdown→HTML renderer.
          const raw = typeof data?.body === 'string' ? data.body.trim() : '';
          if (!raw) return;
          const rewritten = raw.replace(/<[^>]*>/g, '').slice(0, 8000);
          if (!rewritten) return;
          set({
            reports: get().reports.map((r) =>
              r.id === id ? { ...r, body: rewritten } : r,
            ),
          });
        } catch {
          // Silent fail — templated body stays.
        }
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
      // Explicit, and deliberately still 0: bumping it would send every
      // existing install through migrate for no gain. The point of
      // declaring it is that `migrate` below now exists, so a future bump
      // cannot leave this store unhydrated forever (zustand 5 destructures
      // the migration result, and a missing migrate makes that undefined).
      version: 0,
      migrate: passthroughMigrate,
      // Storage is untrusted input: on web it is localStorage, which the
      // user can edit, and a killed app leaves partial writes. See
      // src/lib/persistSafety.ts.
      merge: makeSafeMerge('peptalk-aimee-reports-v1', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
