/**
 * Progress dashboard components — visual tracking surfaces used on the
 * Home tab. Each pulls from one or more input stores and renders a
 * single self-contained widget.
 *
 * Pattern: every component reads its own data; the consumer screen
 * just drops them in the order it wants.
 */

export { ActivityHeatmap } from './ActivityHeatmap';
export { WeekStrip } from './WeekStrip';
export { StreakBadge } from './StreakBadge';
export { BodyCompositionHero } from './BodyCompositionHero';
export { TrendChart } from './TrendChart';
export type { TrendPoint } from './TrendChart';
export { BodyCompositionTrendCharts } from './BodyCompositionTrendCharts';
