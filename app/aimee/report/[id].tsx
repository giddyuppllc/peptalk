/**
 * Aimee Report detail — Master Refactor Plan v3.1 §9.3.
 *
 * Renders one report's narrative + charts + recommendation. Reports
 * are read-only (§9.6) — no confirm cards on this surface.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Line } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../../src/components/v3';
import { useV3Theme } from '../../../src/theme/V3ThemeProvider';
import { useAimeeReportsStore } from '../../../src/store/useAimeeReportsStore';
import { useAimeeRouter } from '../../../src/hooks/useAimeeRouter';
import { tapLight } from '../../../src/utils/haptics';

export default function ReportDetailScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const reports = useAimeeReportsStore((s) => s.reports);
  const openAimee = useAimeeRouter();
  const report = useMemo(
    () => reports.find((r) => r.id === params.id),
    [reports, params.id],
  );

  if (!report) {
    return (
      <V3DetailShell
        title="Report"
        observation="That report isn't in your history anymore."
      >
        <Pressable
          onPress={() => router.replace('/aimee/reports' as never)}
          style={styles.backCta}
        >
          <Text style={{ color: t.colors.textPrimary as string }}>
            Back to reports
          </Text>
        </Pressable>
      </V3DetailShell>
    );
  }

  return (
    <V3DetailShell
      title={report.kind === 'weekly' ? 'Weekly Report' : 'Cycle Report'}
      observation={report.headline}
      intent="weekly_summary"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.period,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.label,
              },
            ]}
          >
            {report.periodStart} → {report.periodEnd}
          </Text>
          <Text
            style={[
              styles.body,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            {report.body}
          </Text>
        </GlassCard>

        {report.charts.map((chart, i) => (
          <GlassCard key={i} style={styles.cardSpacing}>
            <Text
              style={[
                styles.chartTitle,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              {chart.kind === 'protein_trend' ? 'Protein this week' : chart.kind}
            </Text>
            <MiniChart values={chart.values} target={chart.target} />
          </GlassCard>
        ))}

        {report.recommendation ? (
          <Pressable
            onPress={() => {
              tapLight();
              openAimee({
                intent: 'open_chat',
                messageOverride: report.recommendation ?? '',
              });
            }}
          >
            <GlassCard style={styles.cardSpacing}>
              <Text
                style={[
                  styles.recHeader,
                  {
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.label,
                  },
                ]}
              >
                ONE THING
              </Text>
              <Text
                style={[
                  styles.recBody,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.isDark
                      ? t.typography.headlineMale
                      : t.typography.headlineFemale,
                  },
                ]}
              >
                {report.recommendation}
              </Text>
              <View style={styles.recCta}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={14}
                  color={t.colors.textSecondary as string}
                />
                <Text
                  style={{
                    marginLeft: 6,
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                    fontSize: 11,
                  }}
                >
                  Talk it through with Aimee
                </Text>
              </View>
            </GlassCard>
          </Pressable>
        ) : null}
      </ScrollView>
    </V3DetailShell>
  );
}

function MiniChart({ values, target }: { values: number[]; target?: number }) {
  const t = useV3Theme();
  const width = 280;
  const height = 110;
  const padding = 10;
  if (values.length === 0) return null;
  const max = Math.max(...values, target ?? 0, 1);
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (v / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  const targetY =
    target != null
      ? height - padding - (target / max) * (height - padding * 2)
      : null;
  return (
    <View style={{ alignItems: 'center', marginTop: 10 }}>
      <Svg width={width} height={height}>
        {targetY != null ? (
          <Line
            x1={padding}
            y1={targetY}
            x2={width - padding}
            y2={targetY}
            stroke={t.colors.textSecondary as string}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.6}
          />
        ) : null}
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  period: {
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
  chartTitle: {
    fontSize: 15,
  },
  recHeader: {
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  recBody: {
    fontSize: 18,
    lineHeight: 24,
  },
  recCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backCta: {
    marginTop: 20,
    alignItems: 'center',
  },
});
