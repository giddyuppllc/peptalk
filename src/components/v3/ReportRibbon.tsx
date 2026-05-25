/**
 * ReportRibbon — bottom-of-home Aimee report CTA (§4.4 / §4.5).
 *
 * Female: soft rose→lavender gradient pill.
 * Male: oxblood→oxblood-deep gradient pill.
 *
 * Phase A: static placeholder text "Your Week N Report is ready ›".
 * Phase F2 wires it to the report-generation pipeline so the ribbon
 * only appears when a report is actually ready, and tap navigates to
 * the rendered report.
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useAimeeReportsStore } from '../../store/useAimeeReportsStore';
import { tapLight } from '../../utils/haptics';

interface Props {
  /** Override label. Default: latest report headline, otherwise generic. */
  label?: string;
  onPress?: () => void;
}

export function ReportRibbon({ label, onPress }: Props) {
  const t = useV3Theme();
  const router = useRouter();
  const latestReport = useAimeeReportsStore((s) => s.reports[0]);
  const insightCount = useAimeeReportsStore((s) => s.insights.length);

  // Wave 76.49: dropped the trailing `›` from the label — the Ionicons
  // chevron-forward at the end of the row already serves that purpose.
  // Having both produced a double-chevron look on iOS and made labels
  // longer than they needed to be (worsening truncation on narrow
  // Android screens).
  //
  // Wave 76.55: tester saw the ribbon as "Week of" with no date because
  // their stored report headline came from a pre-76.49 build that
  // saved `Week of {YYYY-MM-DD}` and the date string somehow lost.
  // Rather than trust the stored headline, reformat at render time from
  // the report's periodStart. Both old + new reports now render the
  // same human-friendly "Week of May 12" label.
  const formattedHeadline = (() => {
    if (!latestReport) return null;
    const start = latestReport.periodStart;
    if (start) {
      const [y, mo, d] = start.split('-').map(Number);
      if (y && mo && d) {
        const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
        const datePart = dt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        return latestReport.kind === 'weekly'
          ? `Week of ${datePart}`
          : (latestReport.headline ?? `Report from ${datePart}`);
      }
    }
    // Fallback to stored headline if periodStart parse fails.
    return latestReport.headline || 'Latest report';
  })();

  const resolvedLabel =
    label ??
    (formattedHeadline ??
      (insightCount > 0
        ? `${insightCount} new insight${insightCount === 1 ? '' : 's'}`
        : 'See your Aimee reports'));

  const handlePress = () => {
    tapLight();
    if (onPress) {
      onPress();
      return;
    }
    router.push('/aimee/reports' as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${resolvedLabel}. Tap to view.`}
    >
      <LinearGradient
        colors={[
          (t.colors as any).reportRibbonStart,
          (t.colors as any).reportRibbonEnd,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.ribbon, { borderRadius: t.radius.pill }]}
      >
        <View style={styles.row}>
          <Ionicons
            name="sparkles"
            size={14}
            color={t.isDark ? (t.colors.textPrimary as string) : '#fff'}
          />
          <Text
            style={{
              fontFamily: t.typography.bodyBold,
              fontSize: 13,
              color: t.isDark ? (t.colors.textPrimary as string) : '#fff',
              letterSpacing: 0.2,
            }}
          >
            {resolvedLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={t.isDark ? (t.colors.textPrimary as string) : '#fff'}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginTop: 14,
  },
  ribbon: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
