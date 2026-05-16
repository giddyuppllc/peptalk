/**
 * TrendChart — bespoke line+area chart, react-native-svg.
 *
 * Why not Victory Native: Victory v41 adds Skia as a native dep
 * (~3MB + a prebuild cycle); the rest of peptalk's visual tracking
 * (AdherenceDial, CycleProgressBar, ActivityHeatmap, WeekStrip) is
 * already hand-rolled SVG so this component matches the pattern
 * and keeps the bundle lean.
 *
 * Renders:
 *  - smooth area gradient under the line
 *  - line stroke in the section accent color
 *  - latest value + delta label at top-right
 *  - tiny dot on the latest point
 *
 * No axes, no tick marks, no legend, no toggles. The chart is a
 * glance — tap to open a detail screen if we ever want deeper exploration.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { FontSizes, Spacing, BorderRadius } from '../../constants/theme';

export interface TrendPoint {
  /** ms epoch */
  t: number;
  v: number;
}

interface Props {
  title: string;
  /** Unit suffix shown after the latest value, e.g. "lb", "%". */
  unit?: string;
  /** Plain-English read of the trend, shown below the title when present. */
  subtitle?: string;
  /** Datapoints, any order — we sort + dedupe in here. */
  data: TrendPoint[];
  /** Height of the chart area in px. Default 80. */
  chartHeight?: number;
  /**
   * Direction "down is good" (weight, body fat %) vs "up is good"
   * (lean mass, adherence %). Controls the delta color.
   */
  goodWhenDecreasing?: boolean;
  /** Optional tap handler. */
  onPress?: () => void;
  /** Optional empty-state text. */
  emptyMessage?: string;
}

export const TrendChart: React.FC<Props> = ({
  title,
  unit = '',
  subtitle,
  data,
  chartHeight = 80,
  goodWhenDecreasing = false,
  onPress,
  emptyMessage = 'Log a scan to see this trend.',
}) => {
  const t = useTheme();
  const accent = useSectionAccent();

  // Sort + dedupe by timestamp, keep latest per ms.
  const points = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of data) {
      if (Number.isFinite(p.t) && Number.isFinite(p.v)) map.set(p.t, p.v);
    }
    return [...map.entries()]
      .map(([t, v]) => ({ t, v }))
      .sort((a, b) => a.t - b.t);
  }, [data]);

  // Empty state
  if (points.length === 0) {
    return (
      <View style={[styles.wrap, { borderColor: t.cardBorder }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        </View>
        <Text style={[styles.emptyText, { color: t.textSecondary }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  const latest = points[points.length - 1]!.v;
  const oldest = points[0]!.v;
  const delta = latest - oldest;
  const hasDelta = points.length > 1 && delta !== 0;

  // SVG geometry
  const W = 320; // viewBox width
  const H = chartHeight;
  const padX = 4;
  const padY = 6;

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  // Avoid divide-by-zero on flat data.
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const sx = (t: number) => padX + ((t - xMin) / xRange) * (W - padX * 2);
  const sy = (v: number) =>
    H - padY - ((v - yMin) / yRange) * (H - padY * 2);

  // Build smooth path with simple cardinal-spline-ish curves between
  // consecutive points. For under 3 points, just connect with lines.
  let linePath = `M ${sx(points[0]!.t)} ${sy(points[0]!.v)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    if (points.length < 3) {
      linePath += ` L ${sx(p1.t)} ${sy(p1.v)}`;
      continue;
    }
    // Smooth curve via quadratic bezier with midpoint as control
    const midX = (sx(p0.t) + sx(p1.t)) / 2;
    const midY = (sy(p0.v) + sy(p1.v)) / 2;
    linePath += ` Q ${sx(p0.t)} ${sy(p0.v)}, ${midX} ${midY}`;
    if (i === points.length - 1) {
      linePath += ` L ${sx(p1.t)} ${sy(p1.v)}`;
    }
  }

  // Fill path = same as line but closes to bottom.
  const fillPath = `${linePath} L ${sx(points[points.length - 1]!.t)} ${H} L ${sx(points[0]!.t)} ${H} Z`;

  const isGood = hasDelta && (goodWhenDecreasing ? delta < 0 : delta > 0);

  const inner = (
    <View style={[styles.wrap, { borderColor: t.cardBorder }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.latest, { color: t.text }]}>
            {formatNumber(latest)}
            <Text style={[styles.unit, { color: t.textSecondary }]}> {unit}</Text>
          </Text>
          {hasDelta && (
            <Text
              style={[
                styles.delta,
                { color: isGood ? '#3FA46A' : '#C76B45' },
              ]}
            >
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} {unit}
            </Text>
          )}
        </View>
      </View>

      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={accent.deep} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={accent.deep} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={fillPath} fill="url(#trendFill)" />
        <Path d={linePath} stroke={accent.deep} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {/* Latest point dot */}
        <Circle
          cx={sx(points[points.length - 1]!.t)}
          cy={sy(points[points.length - 1]!.v)}
          r={4}
          fill={accent.deep}
          stroke="#fff"
          strokeWidth={2}
        />
      </Svg>
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {inner}
    </TouchableOpacity>
  ) : (
    inner
  );
};

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  return Number(n.toFixed(n % 1 === 0 ? 0 : 1)).toString();
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  latest: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
  },
  unit: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  delta: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    fontStyle: 'italic',
    paddingVertical: Spacing.md,
  },
});
