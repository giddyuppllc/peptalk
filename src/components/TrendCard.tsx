import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { Sparkline } from './Sparkline';
import { computeTrend } from '../utils/trends';

interface TrendCardProps {
  label: string;
  data: number[];
  color: string;
  unit?: string;
}

export const TrendCard: React.FC<TrendCardProps> = ({
  label,
  data,
  color,
  unit,
}) => {
  const trend = computeTrend(data);
  const currentValue = data.length > 0 ? data[data.length - 1] : 0;

  const trendArrow =
    trend.direction === 'up' ? '\u2191' : trend.direction === 'down' ? '\u2193' : '\u2014';

  const trendColor =
    trend.direction === 'up'
      ? '#22c55e'
      : trend.direction === 'down'
        ? '#ef4444'
        : '#6B7280';

  const deltaText =
    trend.delta >= 0 ? `+${trend.delta.toFixed(1)}` : trend.delta.toFixed(1);

  return (
    <GlassCard style={styles.card}>
      {/* Top row: label + trend */}
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.trendBadge}>
          <Text style={[styles.arrow, { color: trendColor }]}>
            {trendArrow}
          </Text>
          <Text style={[styles.delta, { color: trendColor }]}>
            {deltaText}
          </Text>
        </View>
      </View>

      {/* Sparkline */}
      <View style={styles.sparklineContainer}>
        <Sparkline data={data} color={color} width={140} height={40} />
      </View>

      {/* Current value */}
      <Text style={styles.value}>
        {currentValue}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 12,
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: '#2D2D2D',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrow: {
    fontSize: 14,
    fontWeight: '700',
  },
  delta: {
    fontSize: 11,
    fontWeight: '600',
  },
  sparklineContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  value: {
    color: '#2D2D2D',
    fontSize: 18,
    fontWeight: '700',
  },
  unit: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '400',
  },
});

export default TrendCard;
