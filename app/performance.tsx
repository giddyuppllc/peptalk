/**
 * Performance — bubble grid showing 6 single-figure scores. Tap any
 * bubble to open a slide-up sheet with the breakdown for that metric.
 *
 * Data comes from the local stores via performanceMetrics service —
 * pure compute, no network. The same scoring logic that backed the
 * old IntelligenceHeatMap now powers these tappable bubbles.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { useSectionAccent } from '../src/hooks/useSectionAccent';
import { Spacing, FontSizes, BorderRadius } from '../src/constants/theme';
import { PerformanceBubble } from '../src/components/PerformanceBubble';
import {
  computeAllMetrics,
  type BubbleMetric,
  type BreakdownRow,
} from '../src/services/performanceMetrics';

export default function PerformanceScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();

  const metrics = useMemo<BubbleMetric[]>(() => computeAllMetrics(), []);
  const [selected, setSelected] = useState<BubbleMetric | null>(null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>Performance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: t.textSecondary }]}>
          Tap any bubble to see what's behind the number. Higher = more consistent
          across the things you've told us matter.
        </Text>

        <View style={styles.grid}>
          {metrics.map((m) => (
            <PerformanceBubble
              key={m.id}
              value={m.value}
              unit={m.unit}
              label={m.label}
              onPress={() => setSelected(m)}
            />
          ))}
        </View>

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={14} color={t.textSecondary} />
          <Text style={[styles.helpText, { color: t.textSecondary }]}>
            Bubbles refresh every time you log something. The denser the
            fill, the closer you are to your goal — pop a bubble to see
            the contributing data points.
          </Text>
        </View>
      </ScrollView>

      <BreakdownSheet
        metric={selected}
        onClose={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface BreakdownSheetProps {
  metric: BubbleMetric | null;
  onClose: () => void;
}

function BreakdownSheet({ metric, onClose }: BreakdownSheetProps) {
  const t = useTheme();
  const accent = useSectionAccent();
  const visible = !!metric;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close breakdown"
        />
        {metric && (
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <Text style={[styles.sheetTitle, { color: t.text }]}>
                  {metric.label}
                </Text>
                <Text style={[styles.sheetValue, { color: accent.deep }]}>
                  {metric.value}
                  {metric.unit === '%' ? '%' : metric.unit === 'days' ? 'd' : ''}
                </Text>
              </View>
              <Text style={[styles.sheetDesc, { color: t.textSecondary }]}>
                {metric.description}
              </Text>
            </View>

            <View style={styles.sheetBody}>
              {metric.breakdown.map((row, i) => (
                <BreakdownRowView key={i} row={row} isLast={i === metric.breakdown.length - 1} />
              ))}
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: t.glass }]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={[styles.closeBtnText, { color: t.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

function BreakdownRowView({ row, isLast }: { row: BreakdownRow; isLast: boolean }) {
  const t = useTheme();
  const toneColor =
    row.tone === 'positive'
      ? '#22c55e'
      : row.tone === 'negative'
        ? '#ef4444'
        : t.textSecondary;
  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
      ]}
    >
      <Text style={[styles.rowLabel, { color: t.textSecondary }]}>{row.label}</Text>
      <Text style={[styles.rowValue, { color: toneColor }]}>{row.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 60,
  },
  intro: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing.lg,
    paddingHorizontal: 4,
  },
  helpText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  // ── Sheet ───────────────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    paddingHorizontal: Spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    paddingTop: 6,
    paddingBottom: 14,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
  },
  sheetValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sheetDesc: {
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  sheetBody: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowLabel: { fontSize: FontSizes.sm, flex: 1 },
  rowValue: { fontSize: FontSizes.sm, fontWeight: '700' },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  closeBtnText: { fontSize: FontSizes.sm, fontWeight: '700' },
});
