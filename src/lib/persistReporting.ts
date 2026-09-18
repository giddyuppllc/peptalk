/**
 * Telemetry for a persisted blob that was refused.
 *
 * Kept out of src/lib/persistSafety.ts so that module stays RN-free and its
 * tests do not have to mock the native storage chain to prove a shape check —
 * the same reasoning that keeps src/lib/products.ts importable in isolation.
 *
 * A refusal is not routine. It means storage held something the store could not
 * have written, which is either a partial write, a schema change nobody
 * migrated, or someone editing localStorage on the web build. All three are
 * worth knowing about, and none of them should reach the user as a crash.
 */

import { captureException } from '../services/telemetry';
import type { SafeMergeReport } from './persistSafety';

/**
 * Reported once per store per launch. A store whose blob is wrong is wrong on
 * every rehydrate, and the same event fifty times says nothing the first one
 * did not.
 */
const reported = new Set<string>();

export function reportPersistProblem(storeName: string, report: SafeMergeReport): void {
  if (reported.has(storeName)) return;
  reported.add(storeName);

  // `unknown` alone is ordinary — it is what a removed field looks like on the
  // first launch after it was removed, and it needs no alarm. A DROPPED key is
  // the one that would have crashed something.
  if (report.dropped.length === 0) return;

  captureException(
    new Error(`Persisted state refused for ${storeName}: ${report.dropped.join(', ')}`),
    {
      source: 'persist.shape',
      extra: { storeName, dropped: report.dropped, unknown: report.unknown },
    },
  );
}

/** Test seam — the set above would otherwise leak between cases. */
export function resetPersistReportingForTests(): void {
  reported.clear();
}
