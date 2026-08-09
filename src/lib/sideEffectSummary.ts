/**
 * Summarising a user's OWN logged side effects for one compound.
 *
 * The peptide detail screen renders `safetyProfile.commonSideEffects` — the
 * research literature's list — and nothing about what the person holding the
 * phone actually experienced. useSideEffectStore.getByPeptide exists for
 * exactly that and had no caller anywhere in the app.
 *
 * So someone could log nausea on semaglutide three times, open the semaglutide
 * page, and be told what side effects are common in general while their own
 * record of the same compound sat two screens away, unreferenced. For a
 * tracking app that is the wrong way round: the generic list is context, and
 * their own history is the thing only this app knows.
 *
 * Pure, so it is testable without an RN runtime.
 */

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface LoggedSideEffect {
  id: string;
  symptom: string;
  severity: Severity;
  peptideId?: string;
  loggedAt: string;
}

export interface SymptomTally {
  symptom: string;
  count: number;
  /** Highest severity recorded for this symptom. */
  worst: Severity;
  /** ISO timestamp of the most recent occurrence. */
  lastLoggedAt: string;
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Very mild',
  2: 'Mild',
  3: 'Moderate',
  4: 'Severe',
  5: 'Very severe',
};

/**
 * Roll a compound's entries up by symptom.
 *
 * Grouped rather than listed chronologically because the useful question is
 * "does this keep happening to me?", which a flat list of dates buries.
 * Matching is case- and whitespace-insensitive, since symptoms come from both
 * a curated tag list and free text — "Nausea" and "nausea " are the same thing
 * and counting them separately understates a recurring problem.
 *
 * Ordered by count, then by severity, then most recent first: frequency is the
 * signal, but a single severe event should not sit below three mild ones.
 */
export function tallySymptoms(entries: readonly LoggedSideEffect[]): SymptomTally[] {
  const byKey = new Map<string, SymptomTally>();

  for (const e of entries) {
    const label = (e.symptom ?? '').trim();
    if (!label) continue; // an unnamed symptom renders as a blank row
    const key = label.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        symptom: label,
        count: 1,
        worst: e.severity,
        lastLoggedAt: e.loggedAt,
      });
      continue;
    }
    existing.count += 1;
    if (e.severity > existing.worst) existing.worst = e.severity;
    if (e.loggedAt > existing.lastLoggedAt) existing.lastLoggedAt = e.loggedAt;
  }

  return [...byKey.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.worst - a.worst ||
      b.lastLoggedAt.localeCompare(a.lastLoggedAt),
  );
}

/** "3 times · worst: Moderate" — the one-line version for a collapsed row. */
export function describeTally(t: SymptomTally): string {
  const times = t.count === 1 ? 'once' : `${t.count} times`;
  return `${times} · worst: ${SEVERITY_LABELS[t.worst]}`;
}
