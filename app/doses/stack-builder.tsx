/**
 * Stack Builder — Master Refactor Plan v3.1 §8.9, ported back to the
 * full tooling from the original (legacy) implementation.
 *
 * Wave 76.26: the v3 rewrite dropped most of the original tool's
 * features (slot strip, search, category filters, MAX 5, save flow,
 * paywall, analyze button, AnalysisCard, intent card, disclaimers).
 * This merge keeps the V3DetailShell chrome + theme tokens + the new
 * "Add to Tracker" dose-log feature, but restores everything else so
 * the flow feels like the working tool again. Conditional rendering
 * keeps the page from crowding when no peptides are selected.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { PEPTIDES, getPeptideById } from '../../src/data/peptides';
import {
  KNOWN_INTERACTIONS,
  makeInteractionKey,
  getInteraction,
} from '../../src/data/interactions';
import { getDosingReference } from '../../src/data/peptideDosingReference';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useStackStore } from '../../src/store/useStackStore';
import { analyzeStack } from '../../src/services/analysisEngine';
import { getCategoryColor } from '../../src/constants/categories';
import { SearchBar } from '../../src/components/SearchBar';
import { AnalysisCard } from '../../src/components/AnalysisCard';
import { PaywallModal } from '../../src/components/PaywallModal';
import { Disclaimer } from '../../src/components/Disclaimer';
import type {
  Peptide,
  PeptideCategory,
  PeptideInteraction,
} from '../../src/types';

const MAX_STACK_SIZE = 5;

// Local (not UTC) YYYY-MM-DD key so the start-date chips match the user's
// calendar day.
const localDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysKey = (deltaDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return localDateKey(d);
};

// Lightweight inline start-date picker (BUG 1) — relative chips, no native
// date-picker dependency. Lets the user back-date the stack instead of it
// silently logging for today.
const START_DATE_OPTIONS: { label: string; delta: number }[] = [
  { label: 'Today', delta: 0 },
  { label: 'Yesterday', delta: -1 },
  { label: '2 days ago', delta: -2 },
  { label: '3 days ago', delta: -3 },
];

const CATEGORY_FILTERS: PeptideCategory[] = [
  'Metabolic',
  'Recovery',
  'Growth Hormone',
  'Nootropic',
  'Immune',
  'Longevity',
  'Mitochondrial',
  'Sleep',
  'Cosmetic',
  'Anti-inflammatory',
  'Sexual Health',
  'Antimicrobial',
  'Tanning',
  'Neuropeptide',
  'Reproductive',
];

interface PairSummary {
  peptideA: Peptide;
  peptideB: Peptide;
  interaction: PeptideInteraction;
}

export default function StackBuilderScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const logDose = useDoseLogStore((s) => s.logDose);

  const currentStack = useStackStore((s) => s.currentStack);
  const currentAnalysis = useStackStore((s) => s.currentAnalysis);
  const isAnalyzing = useStackStore((s) => s.isAnalyzing);
  const addToStack = useStackStore((s) => s.addToStack);
  const removeFromStack = useStackStore((s) => s.removeFromStack);
  const clearStack = useStackStore((s) => s.clearStack);
  const analyzeCurrentStack = useStackStore((s) => s.analyzeCurrentStack);
  const saveStack = useStackStore((s) => s.saveStack);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<PeptideCategory | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [stackName, setStackName] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  // BUG 1 — user-selectable start date for the stack (default today).
  const [stackStartDate, setStackStartDate] = useState<string>(() =>
    localDateKey(new Date()),
  );

  // Auto-analyze when stack hits 2+ — same UX as the original.
  useEffect(() => {
    if (currentStack.length >= 2) {
      analyzeCurrentStack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStack.length]);

  const stackPeptides = useMemo<Peptide[]>(
    () =>
      currentStack
        .map((id) => getPeptideById(id))
        .filter((p): p is Peptide => !!p),
    [currentStack],
  );

  const filteredPeptides = useMemo(() => {
    let results = PEPTIDES.filter((p) => !currentStack.includes(p.id));
    if (selectedCategory) {
      results = results.filter((p) => p.categories.includes(selectedCategory));
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.abbreviation && p.abbreviation.toLowerCase().includes(q)) ||
          p.categories.some((c) => c.toLowerCase().includes(q)),
      );
    }
    return results;
  }, [searchQuery, selectedCategory, currentStack]);

  // Stack-level intent (top-3 categories by membership).
  const stackIntent = useMemo(() => {
    if (stackPeptides.length === 0) return null;
    const counts = new Map<string, number>();
    for (const p of stackPeptides) {
      for (const c of p.categories) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return { top: sorted.slice(0, 3), total: stackPeptides.length };
  }, [stackPeptides]);

  // Real-time pairwise interactions — curated first, heuristic fallback.
  const pairs = useMemo<PairSummary[]>(() => {
    if (stackPeptides.length < 2) return [];
    const out: PairSummary[] = [];
    for (let i = 0; i < stackPeptides.length; i++) {
      for (let j = i + 1; j < stackPeptides.length; j++) {
        const pA = stackPeptides[i];
        const pB = stackPeptides[j];
        const known =
          getInteraction(pA.id, pB.id) ??
          KNOWN_INTERACTIONS.get(makeInteractionKey(pA.id, pB.id));
        if (known) {
          out.push({ peptideA: pA, peptideB: pB, interaction: known });
        } else {
          const analysis = analyzeStack([pA.id, pB.id]);
          if (analysis.interactions.length > 0) {
            out.push({
              peptideA: pA,
              peptideB: pB,
              interaction: analysis.interactions[0],
            });
          }
        }
      }
    }
    return out;
  }, [stackPeptides]);

  const conflicts = useMemo(
    () =>
      pairs.filter(
        (p) =>
          p.interaction.interactionType === 'contraindicated' ||
          p.interaction.interactionType === 'competitive',
      ),
    [pairs],
  );

  const observation = useMemo(() => {
    if (currentStack.length === 0) {
      return 'Pick 2+ peptides to see the interaction matrix.';
    }
    if (conflicts.length > 0) {
      return `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} in this stack — resolve before scheduling.`;
    }
    const synergy = pairs.filter(
      (p) => p.interaction.interactionType === 'synergistic',
    ).length;
    if (synergy > 0) {
      return `${synergy} synergistic pair${synergy === 1 ? '' : 's'} in this stack.`;
    }
    if (pairs.length > 0) {
      return `${pairs.length} pair${pairs.length === 1 ? '' : 's'} — neutral or undocumented.`;
    }
    return `${currentStack.length} peptide${currentStack.length === 1 ? '' : 's'} selected.`;
  }, [currentStack.length, conflicts.length, pairs]);

  const handleAddPeptide = useCallback(
    (peptideId: string) => {
      tapLight();
      addToStack(peptideId);
      setSearchQuery('');
    },
    [addToStack],
  );

  const handleSave = useCallback(() => {
    const name = stackName.trim();
    if (!name) {
      Alert.alert('Name Required', 'Please enter a name for your stack.');
      return;
    }
    const savedId = saveStack(name);
    if (savedId === null) {
      setPaywallVisible(true);
      return;
    }
    setStackName('');
    setShowSaveInput(false);
    Alert.alert('Saved', `"${name}" has been saved to My Stacks.`);
  }, [stackName, saveStack]);

  const handleAnalyze = useCallback(async () => {
    await analyzeCurrentStack();
  }, [analyzeCurrentStack]);

  const handleAddToTracker = useCallback(() => {
    if (currentStack.length === 0) return;
    if (conflicts.length > 0) {
      Alert.alert(
        'Conflicts in stack',
        `${conflicts.length} peptide pair${conflicts.length === 1 ? '' : 's'} flagged as competitive or contraindicated. Resolve those before adding to the calendar.`,
      );
      return;
    }
    tapMedium();
    let added = 0;
    for (const id of currentStack) {
      const ref = getDosingReference(id);
      const mg = ref ? ref.schedule[0].doseMcg / 1000 : 0;
      if (mg <= 0) continue;
      logDose({
        peptideId: id,
        amount: mg,
        unit: 'mg',
        route: (ref?.route as never) ?? 'subcutaneous',
        date: stackStartDate,
        notes: `Stack Builder · ${currentStack.length} peptides`,
      });
      added++;
    }
    // Truthful copy: doses land on the chosen date. There's no per-dose
    // time-edit screen yet, so we don't promise one — we point at delete
    // instead (each dose is removable from the Tracker day view).
    const isToday = stackStartDate === localDateKey(new Date());
    const whenLabel = isToday
      ? 'today'
      : new Date(stackStartDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
    Alert.alert(
      'Stack added to Tracker',
      `${added} ${added === 1 ? 'dose' : 'doses'} logged for ${whenLabel}. Open Tracker to see them — you can remove any dose from that day if you need to adjust.`,
    );
  }, [currentStack, conflicts.length, logDose, stackStartDate]);

  const textPrimary = t.colors.textPrimary as string;
  const textSecondary = t.colors.textSecondary as string;
  const cardBorder = t.colors.cardBorder as string;
  const accentDeep = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  const accentSoft = t.isDark
    ? 'rgba(201,136,90,0.20)'
    : 'rgba(229,146,141,0.22)';

  return (
    <V3DetailShell
      title="Stack Builder"
      observation={observation}
      intent="doses_stack_builder"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Slot strip (5 positions) ────────────────────────────── */}
        <View style={styles.slotsRow}>
          {Array.from({ length: MAX_STACK_SIZE }).map((_, idx) => {
            const peptide = stackPeptides[idx];
            return (
              <View key={idx} style={styles.slotContainer}>
                {peptide ? (
                  <TouchableOpacity
                    style={[
                      styles.slotFilled,
                      {
                        backgroundColor: accentSoft,
                        borderColor: accentDeep + '55',
                      },
                    ]}
                    onPress={() => removeFromStack(peptide.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${peptide.name} from stack`}
                  >
                    <Text
                      style={[styles.slotText, { color: accentDeep }]}
                      numberOfLines={2}
                    >
                      {peptide.abbreviation || peptide.name.split(' ')[0]}
                    </Text>
                    <View style={[styles.slotRemove, { backgroundColor: accentDeep }]}>
                      <Ionicons name="close" size={10} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.slotEmpty, { borderColor: cardBorder }]}>
                    <Ionicons name="add" size={18} color={textSecondary} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {currentStack.length > 0 ? (
          <View style={styles.stackHeaderRow}>
            <Text style={[styles.stackCount, { color: textSecondary }]}>
              {currentStack.length}/{MAX_STACK_SIZE} peptides
            </Text>
            <TouchableOpacity
              onPress={clearStack}
              accessibilityRole="button"
              accessibilityLabel="Clear all peptides from stack"
            >
              <Text style={[styles.clearLink, { color: accentDeep }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Stack Intent ────────────────────────────────────────── */}
        {stackIntent && stackIntent.top.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>
              STACK INTENT
            </Text>
            <GlassCard>
              {stackIntent.top.map(([category, count], idx) => {
                const color = getCategoryColor(category as any);
                const ratio = count / stackIntent.total;
                return (
                  <View
                    key={category}
                    style={[styles.intentRow, idx > 0 && { marginTop: 8 }]}
                  >
                    <Text style={[styles.intentName, { color: textPrimary }]}>
                      {category}
                    </Text>
                    <View
                      style={[
                        styles.intentBarTrack,
                        { backgroundColor: `${color}1F` },
                      ]}
                    >
                      <View
                        style={[
                          styles.intentBarFill,
                          {
                            width: `${Math.round(ratio * 100)}%`,
                            backgroundColor: color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.intentCount, { color: textSecondary }]}>
                      {count}/{stackIntent.total}
                    </Text>
                  </View>
                );
              })}
            </GlassCard>
          </View>
        ) : null}

        {/* ── Interaction Preview ─────────────────────────────────── */}
        {pairs.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>
              INTERACTIONS
            </Text>
            {pairs.map((pair, idx) => (
              <InteractionRow key={idx} pair={pair} />
            ))}
          </View>
        ) : null}

        {/* ── Add Peptides ────────────────────────────────────────── */}
        {currentStack.length < MAX_STACK_SIZE ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>
              ADD PEPTIDES
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !selectedCategory && {
                    backgroundColor: accentSoft,
                    borderColor: accentDeep + '55',
                  },
                ]}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: !selectedCategory ? accentDeep : textSecondary,
                    },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {CATEGORY_FILTERS.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.filterChip,
                      active && {
                        backgroundColor: accentSoft,
                        borderColor: accentDeep + '55',
                      },
                    ]}
                    onPress={() => setSelectedCategory(active ? null : cat)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? accentDeep : textSecondary },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search peptides..."
            />

            {(searchQuery.trim() || selectedCategory) &&
            filteredPeptides.length > 0 ? (
              <View style={styles.resultsList}>
                {filteredPeptides.slice(0, 12).map((peptide) => (
                  <TouchableOpacity
                    key={peptide.id}
                    style={[styles.resultRow, { borderBottomColor: cardBorder }]}
                    onPress={() => handleAddPeptide(peptide.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${peptide.name} to stack`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: textPrimary }]}>
                        {peptide.name}
                      </Text>
                      <Text style={[styles.resultCat, { color: textSecondary }]}>
                        {peptide.categories[0]}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={accentDeep} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (searchQuery.trim() || selectedCategory) ? (
              <Text style={[styles.noResults, { color: textSecondary }]}>
                No matching peptides
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Actions: Analyze + Save + Add to Tracker ────────────── */}
        {currentStack.length >= 2 ? (
          <View style={styles.actionsBlock}>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.analyzeBtn, { backgroundColor: accentDeep }]}
                onPress={handleAnalyze}
                disabled={isAnalyzing}
                activeOpacity={0.85}
              >
                {isAnalyzing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="analytics-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.analyzeBtnText}>Analyze</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { borderColor: accentDeep + '55' }]}
                onPress={() => setShowSaveInput(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="bookmark-outline" size={18} color={accentDeep} />
                <Text style={[styles.saveBtnText, { color: accentDeep }]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>

            {/* Start-date picker (BUG 1) — pick which day the stack logs to. */}
            <View style={styles.startDateBlock}>
              <Text style={[styles.startDateLabel, { color: textSecondary }]}>
                START DATE
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.startDateChips}
              >
                {START_DATE_OPTIONS.map((opt) => {
                  const value = addDaysKey(opt.delta);
                  const active = stackStartDate === value;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.filterChip,
                        active && {
                          backgroundColor: accentSoft,
                          borderColor: accentDeep + '55',
                        },
                      ]}
                      onPress={() => {
                        tapLight();
                        setStackStartDate(value);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Set stack start date to ${opt.label}`}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: active ? accentDeep : textSecondary },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={handleAddToTracker}
              disabled={conflicts.length > 0}
              style={[
                styles.trackerBtn,
                {
                  backgroundColor:
                    conflicts.length > 0 ? textSecondary : textPrimary,
                  opacity: conflicts.length > 0 ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                conflicts.length > 0
                  ? 'Resolve conflicts before scheduling'
                  : `Add ${currentStack.length} peptide stack to Tracker`
              }
            >
              <Text
                style={[
                  styles.trackerBtnText,
                  { color: t.colors.bgBase1 as string },
                ]}
              >
                Add stack to Tracker
              </Text>
            </Pressable>
          </View>
        ) : currentStack.length === 1 ? (
          <Text style={[styles.hint, { color: textSecondary }]}>
            Add at least 2 peptides to analyze
          </Text>
        ) : null}

        {/* ── Save input ──────────────────────────────────────────── */}
        {showSaveInput ? (
          <View style={styles.section}>
            <GlassCard>
              <TextInput
                style={[
                  styles.saveInput,
                  { color: textPrimary, borderBottomColor: cardBorder },
                ]}
                value={stackName}
                onChangeText={setStackName}
                placeholder="Stack name..."
                placeholderTextColor={textSecondary}
                selectionColor={accentDeep}
                autoFocus
                maxLength={60}
              />
              <View style={styles.saveActions}>
                <TouchableOpacity
                  onPress={() => {
                    setShowSaveInput(false);
                    setStackName('');
                  }}
                >
                  <Text style={[styles.saveCancelText, { color: textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveConfirmBtn, { backgroundColor: accentDeep }]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveConfirmText}>Save Stack</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        ) : null}

        {/* ── Full Analysis Results ───────────────────────────────── */}
        {currentAnalysis ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>
              ANALYSIS
            </Text>
            <AnalysisCard analysis={currentAnalysis} />
            <Disclaimer variant="safety" />
          </View>
        ) : null}

        <Disclaimer />
      </ScrollView>

      {paywallVisible ? (
        <PaywallModal
          visible
          feature="unlimited_stacks"
          onDismiss={() => setPaywallVisible(false)}
        />
      ) : null}
    </V3DetailShell>
  );
}

function InteractionRow({ pair }: { pair: PairSummary }) {
  const t = useV3Theme();
  const c = t.colors as any;
  const i = pair.interaction;
  const kind = i.interactionType ?? 'undocumented';
  const palette: Record<string, { dot: string; label: string }> = {
    synergistic: { dot: c.semanticPositive, label: 'Synergy' },
    neutral: { dot: c.semanticNeutral, label: 'Neutral' },
    competitive: { dot: c.semanticWarn, label: 'Competitive' },
    contraindicated: { dot: c.semanticDanger, label: 'Conflict' },
    undocumented: { dot: c.semanticNeutral, label: 'Undocumented' },
  };
  const p = palette[kind] ?? palette.undocumented;
  // First-sentence mechanism summary keeps the row compact; full analysis
  // is one tap away via the Analyze button.
  const mechanismFirst = (i.mechanismAnalysis ?? '')
    .split(/\.\s|\.$/)
    .find((s) => s.trim().length > 0);
  return (
    <GlassCard style={styles.interactionCard}>
      <View style={styles.interactionHeader}>
        <View style={[styles.dot, { backgroundColor: p.dot }]} />
        <Text
          style={[
            styles.pairTitle,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.typography.bodyBold,
            },
          ]}
          numberOfLines={1}
        >
          {pair.peptideA.abbreviation || pair.peptideA.name} ↔{' '}
          {pair.peptideB.abbreviation || pair.peptideB.name}
        </Text>
        {i.synergyScore != null ? (
          <Text style={[styles.pairScore, { color: p.dot }]}>
            {i.synergyScore}/10
          </Text>
        ) : null}
      </View>
      <Text style={[styles.pairKind, { color: p.dot }]}>{p.label}</Text>
      {mechanismFirst ? (
        <Text
          style={[
            styles.pairBody,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
          numberOfLines={3}
        >
          {mechanismFirst.trim()}.
        </Text>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // ── Slots ──
  slotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  slotContainer: { flex: 1 },
  slotFilled: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  slotText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  slotRemove: {
    position: 'absolute',
    top: 3,
    right: 3,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  stackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stackCount: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  clearLink: { fontSize: 13, fontWeight: '600' },

  // ── Section frame ──
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  // ── Stack Intent ──
  intentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intentName: { fontSize: 12, fontWeight: '600', width: 110 },
  intentBarTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  intentBarFill: { height: '100%', borderRadius: 3 },
  intentCount: {
    fontSize: 11,
    fontWeight: '500',
    width: 30,
    textAlign: 'right',
  },

  // ── Interaction Preview ──
  interactionCard: { marginBottom: 8 },
  interactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pairTitle: { fontSize: 13, flex: 1 },
  pairScore: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  pairKind: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 4,
    marginLeft: 18,
    textTransform: 'uppercase',
  },
  pairBody: { fontSize: 12, lineHeight: 17, marginTop: 6, marginLeft: 18 },

  // ── Add Peptides ──
  filterRow: { gap: 6, marginBottom: 12, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  resultsList: { marginTop: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resultName: { fontSize: 14, fontWeight: '600' },
  resultCat: { fontSize: 11, marginTop: 1 },
  noResults: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  },

  // ── Actions ──
  actionsBlock: { marginTop: 18 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  analyzeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  analyzeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  saveBtnText: { fontSize: 14, fontWeight: '600' },
  startDateBlock: { marginTop: 14 },
  startDateLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  startDateChips: { gap: 6, paddingRight: 8 },
  trackerBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 999,
  },
  trackerBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  hint: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 14,
  },

  // ── Save input ──
  saveInput: {
    fontSize: 15,
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 14,
  },
  saveActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    alignItems: 'center',
  },
  saveCancelText: { fontSize: 14, fontWeight: '500' },
  saveConfirmBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  saveConfirmText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
