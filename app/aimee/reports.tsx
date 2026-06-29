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
import { useNotificationStore } from '../../src/store/useNotificationStore';
import {
  scheduleWeeklyReport,
  notificationsAvailable,
} from '../../src/services/notificationService';

export default function ReportsListScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const reports = useAimeeReportsStore((s) => s.reports);
  const insights = useAimeeReportsStore((s) => s.insights);
  const refreshWeekly = useAimeeReportsStore((s) => s.refreshWeekly);
  const refreshInsights = useAimeeReportsStore((s) => s.refreshInsights);
  const rewriteReportBody = useAimeeReportsStore((s) => s.rewriteReportBody);
  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = tier !== 'free';
  const weeklyReportPref = useNotificationStore((s) => s.preferences.weeklyReportEnabled);
  const setWeeklyReportPref = useNotificationStore((s) => s.toggleWeeklyReport);
  const notifsOn = useNotificationStore((s) => s.preferences.enabled);

  useEffect(() => {
    refreshInsights();
  }, [refreshInsights]);

  // §9.3 — Pro users who opt in to weekly Sunday pushes inline; off by
  // default so we never push without consent.
  const handleEnableSundayPush = async () => {
    if (!isPro) return;
    tapMedium();
    setWeeklyReportPref();
    if (notificationsAvailable() && notifsOn) {
      try {
        await scheduleWeeklyReport();
      } catch {
        /* no-op — toggling the pref is the source of truth */
      }
    }
  };

  const handleGenerate = () => {
    if (!isPro) {
      router.push('/subscription' as never);
      return;
    }
    tapMedium();
    const r = refreshWeekly();
    // Kick off the LLM rewrite in the background — the templated body
    // is shown immediately on the detail screen, the prose swaps in
    // when the server returns. Cap is 2/day per user; failures are
    // silent (templated stays).
    rewriteReportBody(r.id).catch(() => {});
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
        <Pressable
          onPress={handleGenerate}
          accessibilityRole="button"
          accessibilityLabel={
            isPro
              ? "Generate this week's Aimee report"
              : 'Upgrade to Pro to unlock reports'
          }
        >
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
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.18)'
                        : 'rgba(229,146,141,0.22)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.proPillText,
                      { color: t.colors.textPrimary as string },
                    ]}
                  >
                    PRO
                  </Text>
                </View>
              )}
            </View>
          </GlassCard>
        </Pressable>

        {/* §9.3 — Sunday auto-push opt-in. Only nudge Pro users who
            haven't enabled it yet. */}
        {isPro && !weeklyReportPref ? (
          <Pressable
            onPress={handleEnableSundayPush}
            accessibilityRole="button"
            accessibilityLabel="Turn on Sunday 9 AM weekly report push"
          >
            <GlassCard style={styles.cardSpacing}>
              <View style={styles.optInRow}>
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.optInTitle,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    Sunday 9 AM push
                  </Text>
                  <Text
                    style={[
                      styles.optInBody,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    I'll ping you when the weekly is ready. Off by default.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={t.colors.textSecondary as string}
                />
              </View>
            </GlassCard>
          </Pressable>
        ) : null}

        {/* §17 — Insights feed is Pro-gated. Free users see nothing here
            (the upsell sits in the Generate CTA above). */}
        {isPro && insights.length > 0 ? (
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
              accessibilityRole="button"
              accessibilityLabel={`Open ${r.kind} report — ${r.headline}`}
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
  // Background is theme-derived at the call site so the pill stays
  // legible against both palettes; layout-only styles live here.
  proPill: {
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
  optInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optInTitle: {
    fontSize: 14,
  },
  optInBody: {
    fontSize: 11,
    marginTop: 2,
  },
});
