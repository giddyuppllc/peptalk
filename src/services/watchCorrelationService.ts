/**
 * Peptide ↔ Apple Watch Metric Correlation Service
 *
 * Correlates peptide protocol timelines with Apple Watch biometric data
 * from check-ins to surface insights like:
 * - "Your HRV improved 18% since starting BPC-157"
 * - "Sleep quality dropped after stopping Ipamorelin"
 * - "VO2 max trending up during your current GH protocol"
 *
 * All data stays on-device. This service reads from local stores only.
 */

import { CheckInEntry, ActiveProtocol } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricKey =
  | 'mood' | 'energy' | 'sleepQuality' | 'recovery'
  | 'restingHeartRate' | 'hrvMs' | 'vo2Max' | 'spo2'
  | 'respiratoryRate' | 'steps' | 'activeCalories' | 'weightLbs';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface MetricCorrelation {
  peptideId: string;
  metric: MetricKey;
  label: string;
  /** Average value in the 7 days before protocol started */
  baselineAvg: number | null;
  /** Average value during the protocol (last 7 days if ongoing) */
  duringAvg: number | null;
  /** Percentage change from baseline */
  changePercent: number | null;
  trend: TrendDirection;
  /** Number of check-in data points used */
  dataPoints: number;
}

export interface PeptideInsight {
  peptideId: string;
  peptideName: string;
  protocolStartDate: string;
  daysOnProtocol: number;
  correlations: MetricCorrelation[];
  /** Top-level summary for display */
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  return Math.floor(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateOffset(baseDate: string, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function getNumericValue(entry: CheckInEntry, metric: MetricKey): number | null {
  const val = entry[metric as keyof CheckInEntry];
  if (typeof val === 'number') return val;
  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function determineTrend(baselineAvg: number | null, duringAvg: number | null, metric: MetricKey): TrendDirection {
  if (baselineAvg === null || duringAvg === null) return 'stable';

  const change = ((duringAvg - baselineAvg) / Math.abs(baselineAvg)) * 100;
  const threshold = 5; // % change needed to be considered meaningful

  // For most metrics, higher = improving. Exceptions:
  const lowerIsBetter = new Set<MetricKey>(['restingHeartRate', 'respiratoryRate']);

  if (Math.abs(change) < threshold) return 'stable';

  if (lowerIsBetter.has(metric)) {
    return change < 0 ? 'improving' : 'declining';
  }
  return change > 0 ? 'improving' : 'declining';
}

const METRIC_LABELS: Record<MetricKey, string> = {
  mood: 'Mood',
  energy: 'Energy',
  sleepQuality: 'Sleep Quality',
  recovery: 'Recovery',
  restingHeartRate: 'Resting Heart Rate',
  hrvMs: 'Heart Rate Variability',
  vo2Max: 'VO2 Max',
  spo2: 'Blood Oxygen',
  respiratoryRate: 'Respiratory Rate',
  steps: 'Daily Steps',
  activeCalories: 'Active Calories',
  weightLbs: 'Weight',
};

// Metrics most relevant to peptide protocols
const CORRELATION_METRICS: MetricKey[] = [
  'hrvMs', 'vo2Max', 'spo2', 'restingHeartRate', 'respiratoryRate',
  'sleepQuality', 'recovery', 'energy', 'mood', 'weightLbs',
];

// ---------------------------------------------------------------------------
// Core correlation logic
// ---------------------------------------------------------------------------

/**
 * Correlate a single protocol's timeline with check-in biometric data.
 */
function correlateProtocol(
  protocol: ActiveProtocol,
  checkIns: CheckInEntry[],
  peptideName: string,
): PeptideInsight {
  const startDate = protocol.startDate;
  const today = toDateKey(new Date());
  const daysOn = daysBetween(startDate, today);

  // Baseline: 7 days before protocol started
  const baselineStart = dateOffset(startDate, -7);
  const baselineEntries = checkIns.filter(
    (c) => c.date >= baselineStart && c.date < startDate
  );

  // During: most recent 7 days (or since start if < 7 days)
  const duringStart = daysOn > 7 ? dateOffset(today, -7) : startDate;
  const duringEntries = checkIns.filter(
    (c) => c.date >= duringStart && c.date <= today
  );

  const correlations: MetricCorrelation[] = [];

  for (const metric of CORRELATION_METRICS) {
    const baselineValues = baselineEntries
      .map((e) => getNumericValue(e, metric))
      .filter((v): v is number => v !== null);
    const duringValues = duringEntries
      .map((e) => getNumericValue(e, metric))
      .filter((v): v is number => v !== null);

    const baselineAvg = average(baselineValues);
    const duringAvg = average(duringValues);

    let changePercent: number | null = null;
    if (baselineAvg !== null && duringAvg !== null && baselineAvg !== 0) {
      changePercent = Math.round(((duringAvg - baselineAvg) / Math.abs(baselineAvg)) * 100);
    }

    const trend = determineTrend(baselineAvg, duringAvg, metric);

    correlations.push({
      peptideId: protocol.peptideId,
      metric,
      label: METRIC_LABELS[metric],
      baselineAvg: baselineAvg !== null ? Math.round(baselineAvg * 10) / 10 : null,
      duringAvg: duringAvg !== null ? Math.round(duringAvg * 10) / 10 : null,
      changePercent,
      trend,
      dataPoints: baselineValues.length + duringValues.length,
    });
  }

  // Build summary from notable correlations
  const notable = correlations.filter(
    (c) => c.changePercent !== null && Math.abs(c.changePercent) >= 5 && c.dataPoints >= 3
  );

  let summary = `${daysOn} days on ${peptideName}. `;
  if (notable.length === 0) {
    summary += 'Not enough data yet for clear trends.';
  } else {
    const improving = notable.filter((c) => c.trend === 'improving');
    const declining = notable.filter((c) => c.trend === 'declining');

    if (improving.length > 0) {
      summary += `Improving: ${improving.map((c) => `${c.label} (${c.changePercent! > 0 ? '+' : ''}${c.changePercent}%)`).join(', ')}. `;
    }
    if (declining.length > 0) {
      summary += `Declining: ${declining.map((c) => `${c.label} (${c.changePercent}%)`).join(', ')}.`;
    }
  }

  return {
    peptideId: protocol.peptideId,
    peptideName,
    protocolStartDate: startDate,
    daysOnProtocol: daysOn,
    correlations,
    summary: summary.trim(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate correlation insights for all active peptide protocols.
 *
 * @param activeProtocols - Current active protocols from the dose log store
 * @param checkIns - All check-in entries (sorted newest first)
 * @param getPeptideName - Lookup function to resolve peptide IDs to names
 * @returns Array of insights, one per active protocol
 */
export function generateCorrelationInsights(
  activeProtocols: ActiveProtocol[],
  checkIns: CheckInEntry[],
  getPeptideName: (id: string) => string,
): PeptideInsight[] {
  return activeProtocols
    .filter((p) => p.isActive)
    .map((protocol) =>
      correlateProtocol(
        protocol,
        checkIns,
        getPeptideName(protocol.peptideId),
      )
    );
}

/**
 * Generate a concise text summary of peptide-biometric correlations
 * suitable for including in the AI bot context.
 */
export function buildCorrelationSummaryForBot(insights: PeptideInsight[]): string {
  if (insights.length === 0) return '';

  const lines = insights.map((i) => i.summary);
  return `Peptide-biometric correlations:\n${lines.join('\n')}`;
}
