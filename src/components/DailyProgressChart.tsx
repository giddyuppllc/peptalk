/**
 * Swipeable Daily Progress Dashboard — 3 category pages.
 *
 * Page 1: Nutrition (macros + vitamins/minerals)
 * Page 2: Fitness & Activity (workout, steps, sleep, etc.)
 * Page 3: Health & Wellness (check-in, doses, mood, vitals)
 *
 * Each page has: its own donut chart, horizontal scroll mini-rings,
 * tappable detail card, and a settings gear for that category.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Modal,
  TextInput,
  Switch,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, BorderRadius, Spacing } from '../constants/theme';
import { useProgressGoalsStore, type ProgressGoal, type GoalCategory } from '../store/useProgressGoalsStore';
import { useMealStore } from '../store/useMealStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useTheme } from '../hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_PAGE_WIDTH = SCREEN_WIDTH - 48; // fallback before onLayout fires

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartSegment {
  key: string;
  label: string;
  color: string;
  current: number;
  goal: number;
  unit: string;
  inverse?: boolean;
}

export interface ChartPage {
  title: string;
  icon: string;
  category: GoalCategory;
  segments: ChartSegment[];
  /** If set, this page requires the given feature — show paywall overlay if user lacks it */
  requiredFeature?: string;
  /** Tier label to show on the paywall (e.g. "PLUS", "PRO") */
  requiredTier?: string;
}

interface DailyProgressChartProps {
  pages: ChartPage[];
}

// ---------------------------------------------------------------------------
// Mini Progress Ring
// ---------------------------------------------------------------------------

function MiniRing({ segment, isSelected, onPress }: {
  segment: ChartSegment & { percent: number };
  isSelected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const size = 64;
  const sw = 5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(segment.percent, 100)) / 100;
  const trackColor = t.isDark ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.06)';

  return (
    <TouchableOpacity
      style={[s.miniCard, { borderColor: isSelected ? segment.color + '66' : t.cardBorder, backgroundColor: t.surface }]}
      onPress={onPress} activeOpacity={0.7}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={size/2} cy={size/2} r={r} stroke={trackColor} strokeWidth={sw} fill="none" />
          <Circle cx={size/2} cy={size/2} r={r} stroke={segment.color} strokeWidth={sw} fill="none"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            rotation="-90" origin={`${size/2}, ${size/2}`} />
        </Svg>
        <View style={s.miniCenter}>
          <Text style={[s.miniPercent, { color: segment.color }]}>{segment.percent}%</Text>
        </View>
      </View>
      <Text style={[s.miniLabel, { color: t.textSecondary }]} numberOfLines={1}>{segment.label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Single Page (donut + rings + detail)
// ---------------------------------------------------------------------------

function ProgressPage({ page, onOpenSettings, selectedKey, setSelectedKey, scrollKey, pageWidth }: {
  page: ChartPage;
  segments: (ChartSegment & { percent: number })[];
  onOpenSettings: () => void;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  scrollKey: number;
  pageWidth: number;
}) {
  const t = useTheme();

  const segmentData = useMemo(() => {
    return page.segments.map((seg) => {
      let pct: number;
      if (seg.inverse) {
        // Inverse metrics (sodium, sugar, etc): only count once the user has started logging.
        // Before any data exists, show empty instead of a misleading "100% under limit".
        if (seg.current <= 0) {
          pct = 0;
        } else {
          pct = seg.goal > 0 ? Math.max(0, Math.round((1 - seg.current / seg.goal) * 100)) : 100;
        }
      } else {
        pct = Math.min(100, seg.goal > 0 ? Math.round((seg.current / seg.goal) * 100) : 0);
      }
      return { ...seg, percent: pct };
    });
  }, [page.segments]);

  const overallPercent = useMemo(() => {
    // Only count segments that have actual data — segments at 0% drag the overall
    // average down and make the donut feel pre-filled with zeros.
    const active = segmentData.filter((s) => s.current > 0);
    if (active.length === 0) return 0;
    return Math.round(active.reduce((a, s) => a + s.percent, 0) / active.length);
  }, [segmentData]);

  const donutSize = Math.min(pageWidth - 40, 180);
  const donutSw = 11;
  const radius = (donutSize - donutSw) / 2;
  const circ = 2 * Math.PI * radius;
  const arcLen = segmentData.length > 0 ? circ / segmentData.length : 0;
  const gap = segmentData.length > 1 ? 3 : 0;

  return (
    <View style={[s.page, { width: pageWidth }]}>
      {/* Category title */}
      <View style={s.pageHeader}>
        <Ionicons name={page.icon as any} size={16} color={t.primary} />
        <Text style={[s.pageTitle, { color: t.text }]}>{page.title}</Text>
      </View>

      {/* Donut */}
      <View style={[s.donutWrap, { width: donutSize, height: donutSize }]}>
        <Svg width={donutSize} height={donutSize}>
          <G rotation="-90" origin={`${donutSize/2}, ${donutSize/2}`}>
            {segmentData.map((seg, i) => {
              const off = i * arcLen;
              return (
                <Circle key={`t-${seg.key}`} cx={donutSize/2} cy={donutSize/2} r={radius}
                  stroke={t.isDark ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.06)'} strokeWidth={donutSw} fill="none"
                  strokeDasharray={`${arcLen - gap} ${circ - arcLen + gap}`}
                  strokeDashoffset={-off} strokeLinecap="round" />
              );
            })}
            {segmentData.map((seg, i) => {
              const off = i * arcLen;
              const fill = ((arcLen - gap) * seg.percent) / 100;
              if (fill <= 0) return null;
              return (
                <Circle key={`f-${seg.key}`} cx={donutSize/2} cy={donutSize/2} r={radius}
                  stroke={seg.color} strokeWidth={donutSw} fill="none"
                  strokeDasharray={`${fill} ${circ - fill}`}
                  strokeDashoffset={-off} strokeLinecap="round"
                  opacity={selectedKey && selectedKey !== seg.key ? 0.2 : 1} />
              );
            })}
          </G>
        </Svg>
        <View style={s.donutCenter}>
          <Text style={[s.donutPct, { color: t.text }]}>{overallPercent}%</Text>
          <Text style={[s.donutSub, { color: t.textSecondary }]}>Complete</Text>
        </View>
      </View>

      {/* Mini rings — independent horizontal scroll, doesn't trigger page swipe */}
      <ScrollView
        key={`rings-${page.category}-${scrollKey}`}
        horizontal
        showsHorizontalScrollIndicator={true}
        nestedScrollEnabled={true}
        contentContainerStyle={s.ringScroll}
        style={{ marginTop: 12 }}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {segmentData.map((seg) => (
          <MiniRing key={seg.key} segment={seg} isSelected={selectedKey === seg.key}
            onPress={() => setSelectedKey(selectedKey === seg.key ? null : seg.key)} />
        ))}
      </ScrollView>
      {segmentData.length > 4 && (
        <Text style={s.scrollHint}>Scroll for more →</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Goal Settings Modal (filtered by category)
// ---------------------------------------------------------------------------

function GoalSettingsModal({ visible, onClose, category }: { visible: boolean; onClose: () => void; category: GoalCategory }) {
  const { goals, toggleGoal, setGoalValue, resetGoals } = useProgressGoalsStore();
  const setMealTargets = useMealStore((st) => st.setTargets);
  const mealTargets = useMealStore((st) => st.targets);

  const NUTRITION_KEYS: Record<string, keyof typeof mealTargets> = {
    cal: 'calories', pro: 'proteinGrams', carb: 'carbsGrams',
    fat: 'fatGrams', fiber: 'fiberGrams', water: 'waterOz',
  };

  const handleSetGoal = (key: string, value: number) => {
    setGoalValue(key, value);
    if (key in NUTRITION_KEYS) {
      setMealTargets({ ...mealTargets, [NUTRITION_KEYS[key]]: value });
    }
  };

  const categoryGoals = goals.filter((g) => g.category === category);
  const titles: Record<GoalCategory, string> = { macros: 'Macros & Calories', vitamins: 'Vitamins & Minerals', fitness: 'Fitness Goals', health: 'Health Goals' };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.settingsOverlay}>
        <View style={s.settingsContent}>
          <View style={s.settingsHandle} />
          <View style={s.settingsHeader}>
            <Text style={s.settingsTitle}>{titles[category]}</Text>
            <TouchableOpacity onPress={onClose} style={s.settingsClose}>
              <Ionicons name="close" size={22} color="#2D2D2D" />
            </TouchableOpacity>
          </View>
          <Text style={s.settingsSub}>Toggle metrics on/off and set your daily targets.</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {categoryGoals.map((goal) => (
              <View key={goal.key} style={s.goalRow}>
                <View style={[s.goalDot, { backgroundColor: goal.color }]} />
                <View style={s.goalInfo}>
                  <Text style={[s.goalLabel, !goal.enabled && s.goalDim]}>{goal.label}</Text>
                  {goal.enabled && goal.unit !== 'done' && (
                    <View style={s.goalInputRow}>
                      <TextInput style={s.goalInput}
                        value={String(goal.goal)}
                        onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) handleSetGoal(goal.key, n); }}
                        keyboardType="number-pad" selectTextOnFocus />
                      <Text style={s.goalUnit}>{goal.unit}</Text>
                    </View>
                  )}
                </View>
                <Switch value={goal.enabled} onValueChange={() => toggleGoal(goal.key)}
                  trackColor={{ false: 'rgba(0,0,0,0.08)', true: goal.color + '55' }}
                  thumbColor={goal.enabled ? goal.color : '#555'} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Component — 3 swipeable pages
// ---------------------------------------------------------------------------

export function DailyProgressChart({ pages }: DailyProgressChartProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [settingsCategory, setSettingsCategory] = useState<GoalCategory | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(DEFAULT_PAGE_WIDTH);
  const scrollRef = useRef<ScrollView>(null);
  const hasFeature = useSubscriptionStore((st) => st.hasFeature);
  const t = useTheme();

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    if (idx !== activeIdx && idx >= 0 && idx < pages.length) {
      setActiveIdx(idx);
      setSelectedKey(null); // Clear selection when swiping pages
    }
  };

  // Find the selected segment across the active page
  const activePage = pages[activeIdx];
  const selected = useMemo(() => {
    if (!selectedKey || !activePage) return null;
    const seg = activePage.segments.find((s) => s.key === selectedKey);
    if (!seg) return null;
    let pct: number;
    if (seg.inverse) {
      pct = seg.goal > 0 ? Math.max(0, Math.round((1 - seg.current / seg.goal) * 100)) : 100;
    } else {
      pct = Math.min(100, seg.goal > 0 ? Math.round((seg.current / seg.goal) * 100) : 0);
    }
    return { ...seg, percent: pct };
  }, [selectedKey, activePage]);

  return (
    <View
      style={{ position: 'relative' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - pageWidth) > 1) setPageWidth(w);
      }}
    >
      {/* Settings gear — floats above swipeable pages */}
      <TouchableOpacity
        style={s.gearBtnFloat}
        onPress={() => pages[activeIdx] && setSettingsCategory(pages[activeIdx].category)}
      >
        <Ionicons name="settings-outline" size={16} color={t.textSecondary} />
      </TouchableOpacity>

      {/* Swipeable pages */}
      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
        snapToInterval={pageWidth}
        contentContainerStyle={{ gap: 0 }}
      >
        {pages.map((page) => {
          const locked = page.requiredFeature ? !hasFeature(page.requiredFeature) : false;
          return (
            <View key={page.category} style={{ width: pageWidth, position: 'relative' }}>
              <ProgressPage
                page={page}
                segments={[]}
                selectedKey={locked ? null : selectedKey}
                setSelectedKey={locked ? () => {} : setSelectedKey}
                scrollKey={activeIdx}
                pageWidth={pageWidth}
                onOpenSettings={() => !locked && setSettingsCategory(page.category)}
              />
              {locked && (
                <View style={s.paywallOverlay}>
                  <View style={s.paywallBlur} />
                  <View style={s.paywallContent}>
                    <Ionicons name="lock-closed" size={28} color="#fff" />
                    <Text style={s.paywallTitle}>Upgrade to {page.requiredTier ?? 'Plus'}</Text>
                    <Text style={s.paywallSub}>Unlock {page.title.toLowerCase()} tracking</Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Page dots */}
      <View style={s.dots}>
        {pages.map((_, i) => (
          <View key={i} style={[s.dot, i === activeIdx && s.dotActive]} />
        ))}
      </View>

      {/* Detail card — only renders when a ring is tapped, no blank space otherwise */}
      {selected && (
        <View style={[s.detail, { borderColor: selected.color + '44', backgroundColor: t.surface, marginHorizontal: Spacing.sm }]}>
          <View style={s.detailRow}>
            <View style={[s.detailDot, { backgroundColor: selected.color }]} />
            <Text style={[s.detailName, { color: t.text }]}>{selected.label}</Text>
            <Text style={[s.detailPct, { color: selected.color }]}>{selected.percent}%</Text>
          </View>
          <View style={s.detailVals}>
            <Text style={[s.detailCur, { color: t.text }]}>{selected.current}</Text>
            <Text style={[s.detailSlash, { color: t.textSecondary }]}>/</Text>
            <Text style={[s.detailGoal, { color: t.textSecondary }]}>{selected.goal}</Text>
            <Text style={[s.detailUnit, { color: t.textSecondary }]}>{selected.unit}</Text>
            {selected.inverse && <Text style={s.detailInverse}>(stay under)</Text>}
          </View>
          <View style={[s.detailTrack, { backgroundColor: t.isDark ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <View style={[s.detailFill, { backgroundColor: selected.color, width: `${Math.min(100, selected.percent)}%` }]} />
          </View>
        </View>
      )}

      {/* Settings modal */}
      {settingsCategory && (
        <GoalSettingsModal
          visible={true}
          onClose={() => setSettingsCategory(null)}
          category={settingsCategory}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  // Page
  page: { alignItems: 'center', paddingTop: 4, paddingBottom: 4, position: 'relative', overflow: 'visible' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pageTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: '#2D2D2D' },

  // Gear
  gearBtnFloat: {
    position: 'absolute', top: 4, right: 0, zIndex: 99,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Donut
  donutWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  donutCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  donutPct: { fontSize: 28, fontWeight: '900', color: '#2D2D2D' },
  donutSub: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginTop: -2 },

  // Mini rings
  // Extra paddingRight so the trailing macro card (Fat) clears the
  // floating + Log FAB which sits at the bottom-right corner.
  ringScroll: { paddingLeft: 16, paddingRight: 96, gap: 10 },
  miniCard: {
    alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4,
    borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: 'transparent', width: 76,
  },
  miniCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  miniPercent: { fontSize: 12, fontWeight: '800' },
  miniLabel: { fontSize: 9, color: '#6B7280', fontWeight: '600', marginTop: 3 },
  scrollHint: { fontSize: 9, color: '#6b7280', textAlign: 'right', marginTop: 4, marginRight: 8 },

  // Detail card
  detail: {
    marginTop: 10, backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.md, borderWidth: 1, padding: 12, width: '100%',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailDot: { width: 10, height: 10, borderRadius: 5 },
  detailName: { fontSize: FontSizes.md, fontWeight: '700', color: '#2D2D2D', flex: 1 },
  detailPct: { fontSize: FontSizes.lg, fontWeight: '800' },
  detailVals: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 8 },
  detailCur: { fontSize: 24, fontWeight: '900', color: '#2D2D2D' },
  detailSlash: { fontSize: 18, color: '#6B7280' },
  detailGoal: { fontSize: 18, color: '#6B7280', fontWeight: '600' },
  detailUnit: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  detailInverse: { fontSize: 10, color: '#f87171', marginLeft: 6, fontStyle: 'italic' },
  detailTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' },
  detailFill: { height: 5, borderRadius: 3 },

  // Page dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.10)' },
  dotActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.pepTeal },

  // Settings modal
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  settingsContent: {
    backgroundColor: '#F5F5F5', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 40,
    minHeight: '60%', maxHeight: '85%',
  },
  settingsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.10)', alignSelf: 'center', marginBottom: 16 },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  settingsTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: '#2D2D2D' },
  settingsClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  settingsSub: { fontSize: FontSizes.xs, color: '#6B7280', marginBottom: 16 },
  goalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  goalDot: { width: 12, height: 12, borderRadius: 6 },
  goalInfo: { flex: 1 },
  goalLabel: { fontSize: FontSizes.md, fontWeight: '600', color: '#2D2D2D' },
  goalDim: { color: '#6b7280' },
  goalInverse: { fontSize: 10, color: '#f87171', fontStyle: 'italic' },
  goalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  goalInput: {
    width: 100, height: 36, backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: BorderRadius.sm, paddingHorizontal: 12,
    fontSize: FontSizes.md, fontWeight: '700', color: '#2D2D2D', textAlign: 'center',
  },
  goalUnit: { fontSize: FontSizes.xs, color: '#6B7280' },

  // Paywall overlay
  paywallOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  paywallBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,32,0.85)',
  },
  paywallContent: {
    alignItems: 'center',
    gap: 8,
    zIndex: 51,
  },
  paywallTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  paywallSub: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.40)',
  },
});

export default DailyProgressChart;
