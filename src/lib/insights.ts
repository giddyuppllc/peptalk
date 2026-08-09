/**
 * Presentation rules for the insights screen.
 *
 * watchCorrelationService does the maths — 7-day pre-protocol baseline, during
 * average, percentage change, trend. Its only caller was the Aimee chat screen,
 * which piped the result into the bot's context. The analysis ran and was
 * visible only if the user thought to ASK for it in a conversation.
 *
 * What lives here is what the SCREEN needs on top: which correlations are worth
 * showing, in what order, and how to render a number honestly. Kept pure so it
 * is testable without an RN runtime.
 */

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface Correlation {
  metric: string;
  label: string;
  changePercent: number | null;
  trend: TrendDirection;
  dataPoints: number;
}

/**
 * Below this many check-ins, a percentage is noise dressed as a finding.
 *
 * The engine happily reports a change from two data points. "Your HRV improved
 * 18%" off two readings is not an insight, it is a coin flip with a decimal
 * place — and it is exactly the kind of confident-but-baseless number this app
 * has been burned by elsewhere. Thin metrics are counted and mentioned rather
 * than shown, so the user knows they exist and knows why they are not numbers
 * yet.
 */
export const MIN_DATA_POINTS = 5;

/**
 * Most meaningful first: biggest movement, then most evidence.
 *
 * A metric with no computable change (null — no baseline, or no during data)
 * sorts last rather than being treated as zero. Zero means "measured, did not
 * move"; null means "could not measure", and conflating them turns a gap in
 * the data into a finding.
 */
export function rankCorrelations<T extends Correlation>(correlations: readonly T[]): T[] {
  return [...correlations].sort((a, b) => {
    const aHas = a.changePercent != null;
    const bHas = b.changePercent != null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const mag = Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
    if (mag !== 0) return mag;
    return b.dataPoints - a.dataPoints;
  });
}

export interface TrendMeta {
  icon: string;
  color: string;
  label: string;
}

/**
 * Green for improving, red for declining, neutral for stable.
 *
 * `stable` deliberately gets a muted colour and a flat icon: a metric that did
 * not move is a real answer, and colouring it like a warning makes an
 * uneventful protocol look alarming.
 */
export function trendMeta(trend: TrendDirection): TrendMeta {
  switch (trend) {
    case 'improving':
      return { icon: 'trending-up', color: '#10b981', label: 'Improving' };
    case 'declining':
      return { icon: 'trending-down', color: '#ef4444', label: 'Declining' };
    default:
      return { icon: 'remove-outline', color: '#9ca3af', label: 'Stable' };
  }
}

/**
 * A percentage the user can trust at a glance.
 *
 * Null renders as an em dash, never "0%" — "could not measure" and "did not
 * change" are different answers and must not look identical. Signed, so the
 * direction is readable without the icon, and rounded to whole numbers because
 * a decimal on a seven-point average implies precision that is not there.
 */
export function formatChange(changePercent: number | null): string {
  if (changePercent == null || !Number.isFinite(changePercent)) return '—';
  const rounded = Math.round(changePercent);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
