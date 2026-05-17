/**
 * Aimee Reports list — Master Refactor Plan v3.1 §9.3.
 *
 * Surfaces the most recent weekly + cycle reports + an Insights feed.
 * "Generate this week's report" CTA at the top runs the report
 * generator and routes to the detail screen. Insights are refreshed
 * on mount.
 */

import React, { useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useAimeeReportsStore } from '../../src/store/useAimeeReportsStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';

export default function ReportsListScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const reports = useAimeeReportsStore((s) => s.reports);
  const insights = useAimeeReportsStore((s) => s.insights);
  const refreshWeekly = useAimeeReportsStore((s) => s.refreshWeekly);
  const refreshInsights = useAimeeReportsStore((s) => s.refreshInsights);
  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = tier !== 'free';

  useEffect(() => {
    refreshInsights();
  }, [refreshInsights]);

  const handleGenerate = () => {
    if (!isPro) {
      router.push('/subscription' as never);
      return;
    }
    tapMedium();
    const r = refreshWeekly();
    router.push(`/aimee/report/${r.id}` as never);
  };

  return (
    <V3DetailShell
      title="Reports"
      observation={
        isPro
          ? `${reports.length} report${reports.length === 1 ? '' : 's'} in your history. ${insights.length} insight${insights.length === 1 ? '' : 's'} today.`
          : 'Reports + Insights unlock with Pro.'
      }
      intent="weekly_summary"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Generate */}
        <Pressable onPress={handleGenerate}>
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.generateRow}>
              <Ionicons
                name="sparkles"
                size={20}
                color={
                  t.isDark
                    ? ((t.colors as any).accentCognac as string)
                    : ((t.colors as any).accentRose as string)
                }
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.generateTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Generate this week's report
                </Text>
                <Text
                  style={[
                    styles.generateBody,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? 'Pulls protein, doses, training, side effects, mood.'
                    : 'Pro feature — unlocks weekly + cycle reports.'}
                </Text>
              </View>
              {isPro ? (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
              ) : (
                <View style={styles.proPill}>
                  <Text style={styles.proPillText}>PRO</Text>
                </View>
              )}
            </View>
          </GlassCard>
        </Pressable>

        {/* Insights feed */}
        {insights.length > 0 ? (
          <>
            <Text
              style={[
                styles.sectionHeader,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Insights
            </Text>
            {insights.map((i) => (
              <GlassCard key={i.id} style={styles.insightCard}>
                <Text
                  style={[
                    styles.insightCategory,
                    {
                      color:
                        t.isDark
                          ? ((t.colors as any).accentCognac as string)
                          : ((t.colors as any).accentRose as string),
                      fontFamily: t.typography.label,
                    },
                  ]}
                >
                  {i.category.replace('_', ' ').toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.insightBody,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {i.body}
                </Text>
                {i.delta ? (
                  <Text
                    style={[
                      styles.insightDelta,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.bodyBold,
                      },
                    ]}
                  >
                    {i.delta.label}: {i.delta.value}
                  </Text>
                ) : null}
              </GlassCard>
            ))}
          </>
        ) : null}

        {/* History */}
        <Text
          style={[
            styles.sectionHeader,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          History
        </Text>
        {reports.length === 0 ? (
          <GlassCard>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No reports yet. Generate one above.
            </Text>
          </GlassCard>
        ) : (
          reports.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                tapLight();
                router.push(`/aimee/report/${r.id}` as never);
              }}
            >
              <GlassCard style={styles.reportCard}>
                <View style={styles.reportRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.reportKind,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.label,
                        },
                      ]}
                    >
                      {r.kind.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.reportHeadline,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {r.headline}
                    </Text>
                    <Text
                      style={[
                        styles.reportPeriod,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {r.periodStart} → {r.periodEnd}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={t.colors.textSecondary as string}
                  />
                </View>
              </GlassCard>
            </Pressable>
          ))
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  generateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  generateTitle: {
    fontSize: 17,
  },
  generateBody: {
    fontSize: 12,
    marginTop: 2,
  },
  proPill: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  proPillText: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  insightCard: {
    marginBottom: 10,
  },
  insightCategory: {
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  insightBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightDelta: {
    fontSize: 11,
    marginTop: 8,
  },
  reportCard: {
    marginBottom: 10,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportKind: {
    fontSize: 9,
    letterSpacing: 1.4,
  },
  reportHeadline: {
    fontSize: 17,
    marginTop: 2,
  },
  reportPeriod: {
    fontSize: 11,
    marginTop: 2,
  },
});
