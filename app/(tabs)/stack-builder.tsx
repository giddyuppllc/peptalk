import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStackStore } from '../../src/store/useStackStore';
import { PaywallModal } from '../../src/components/PaywallModal';
import { PEPTIDES, getPeptideById } from '../../src/data/peptides';
import { SearchBar } from '../../src/components/SearchBar';
import { AnalysisCard } from '../../src/components/AnalysisCard';
import { GlassCard } from '../../src/components/GlassCard';
import { Disclaimer } from '../../src/components/Disclaimer';
import { Peptide, PeptideCategory, PeptideInteraction } from '../../src/types';
import { getInteraction } from '../../src/data/interactions';
import { analyzeStack } from '../../src/services/analysisEngine';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Colors } from '../../src/constants/theme';

const MAX_STACK_SIZE = 5;

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

function getInteractionColor(type: string): string {
  switch (type) {
    case 'synergistic':
      return '#22c55e';
    case 'competitive':
      return '#f97316';
    case 'contraindicated':
      return '#ef4444';
    default:
      return '#CADEE5';
  }
}

export default function StackBuilderScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PeptideCategory | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [stackName, setStackName] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);

  const {
    currentStack,
    currentAnalysis,
    isAnalyzing,
    addToStack,
    removeFromStack,
    clearStack,
    analyzeCurrentStack,
    saveStack,
  } = useStackStore();

  // Auto-analyze when stack has 2+ peptides
  useEffect(() => {
    if (currentStack.length >= 2) {
      analyzeCurrentStack();
    }
  }, [currentStack]);

  const filteredPeptides = useMemo(() => {
    let results = PEPTIDES.filter((p) => !currentStack.includes(p.id));

    // Apply category filter
    if (selectedCategory) {
      results = results.filter((p) => p.categories.includes(selectedCategory));
    }

    // Apply search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.abbreviation && p.abbreviation.toLowerCase().includes(q)) ||
          p.categories.some((c) => c.toLowerCase().includes(q))
      );
    }

    return results;
  }, [searchQuery, selectedCategory, currentStack]);

  const stackPeptides = useMemo(
    () =>
      currentStack
        .map((id) => getPeptideById(id))
        .filter(Boolean) as Peptide[],
    [currentStack]
  );

  // Real-time pairwise interactions
  const pairwiseInteractions = useMemo(() => {
    if (stackPeptides.length < 2) return [];
    const pairs: { peptideA: Peptide; peptideB: Peptide; interaction: PeptideInteraction }[] = [];
    for (let i = 0; i < stackPeptides.length; i++) {
      for (let j = i + 1; j < stackPeptides.length; j++) {
        const pA = stackPeptides[i];
        const pB = stackPeptides[j];
        const known = getInteraction(pA.id, pB.id);
        if (known) {
          pairs.push({ peptideA: pA, peptideB: pB, interaction: known });
        } else {
          // Use the heuristic analysis for unknown pairs
          const analysis = analyzeStack([pA.id, pB.id]);
          if (analysis.interactions.length > 0) {
            pairs.push({ peptideA: pA, peptideB: pB, interaction: analysis.interactions[0] });
          }
        }
      }
    }
    return pairs;
  }, [stackPeptides]);

  const handleAnalyze = useCallback(async () => {
    await analyzeCurrentStack();
  }, [analyzeCurrentStack]);

  const handleSave = useCallback(() => {
    const name = stackName.trim();
    if (!name) {
      Alert.alert('Name Required', 'Please enter a name for your stack.');
      return;
    }
    const savedId = saveStack(name);
    if (savedId === null) {
      // Free tier already has its one allowed stack — surface the paywall
      setPaywallVisible(true);
      return;
    }
    setStackName('');
    setShowSaveInput(false);
    Alert.alert('Saved', `"${name}" has been saved to My Stacks.`);
  }, [stackName, saveStack]);

  const handleAddPeptide = useCallback(
    (peptideId: string) => {
      addToStack(peptideId);
      setSearchQuery('');
    },
    [addToStack]
  );

  const showSearch = !searchQuery.trim() && !selectedCategory;

  const BLUE = '#7ABED0';
  const BLUE_DARK = '#5A9BB0';
  const BLUE_LIGHT = '#CADEE5';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
        <View>
          <Text style={[styles.title, { color: t.text }]}>Stack Builder</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Combine up to {MAX_STACK_SIZE} peptides
          </Text>
        </View>
        {currentStack.length > 0 && (
          <TouchableOpacity onPress={clearStack} activeOpacity={0.7}>
            <Text style={[styles.clearBtn, { color: BLUE }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Slot strip ── */}
        <View style={styles.slotsRow}>
          {Array.from({ length: MAX_STACK_SIZE }).map((_, index) => {
            const peptide = stackPeptides[index];
            return (
              <View key={index} style={styles.slotContainer}>
                {peptide ? (
                  <TouchableOpacity
                    style={[styles.slotFilled, { backgroundColor: `${BLUE}20`, borderColor: `${BLUE}50` }]}
                    onPress={() => removeFromStack(peptide.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.slotText, { color: BLUE_DARK }]} numberOfLines={2}>
                      {peptide.abbreviation || peptide.name.split(' ')[0]}
                    </Text>
                    <View style={[styles.slotRemove, { backgroundColor: BLUE }]}>
                      <Ionicons name="close" size={10} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.slotEmpty, { borderColor: t.cardBorder }]}>
                    <Ionicons name="add" size={18} color={t.textMuted} />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Interaction Preview ── */}
        {pairwiseInteractions.length > 0 && (
          <View style={styles.previewSection}>
            <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>INTERACTIONS</Text>
            {pairwiseInteractions.map((pair, index) => {
              const color = getInteractionColor(pair.interaction.interactionType);
              // Mechanism summary — first sentence of mechanismAnalysis is
              // the lay-friendly explanation. Gives users actual context
              // beyond a score, so they understand WHY the pairing scored
              // the way it did.
              const mechanismFirstSentence = (pair.interaction.mechanismAnalysis ?? '')
                .split(/\.\s|\.$/)
                .find((s) => s.trim().length > 0);
              return (
                <View key={index} style={[styles.previewCard, { borderLeftColor: color, backgroundColor: t.card, borderColor: t.cardBorder }]}>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewPair, { color: t.text }]} numberOfLines={1}>
                      {pair.peptideA.abbreviation || pair.peptideA.name} ↔ {pair.peptideB.abbreviation || pair.peptideB.name}
                    </Text>
                    <Text style={[styles.previewScore, { color }]}>{pair.interaction.synergyScore}/10</Text>
                  </View>
                  <Text style={[styles.previewType, { color }]}>{pair.interaction.interactionType}</Text>
                  {mechanismFirstSentence && (
                    <Text
                      style={[styles.previewMechanism, { color: t.textSecondary }]}
                      numberOfLines={3}
                    >
                      {mechanismFirstSentence.trim()}.
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Add Peptides ── */}
        {currentStack.length < MAX_STACK_SIZE && (
          <View style={styles.addSection}>
            <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>ADD PEPTIDES</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[styles.filterChip, { backgroundColor: !selectedCategory ? `${BLUE}20` : 'transparent' }]}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, { color: !selectedCategory ? BLUE : t.textSecondary }]}>All</Text>
              </TouchableOpacity>
              {CATEGORY_FILTERS.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, { backgroundColor: active ? `${BLUE}20` : 'transparent' }]}
                    onPress={() => setSelectedCategory(active ? null : cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, { color: active ? BLUE : t.textSecondary }]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search peptides..."
            />

            {(searchQuery.trim() || selectedCategory) && filteredPeptides.length > 0 && (
              <View style={styles.resultsList}>
                {filteredPeptides.slice(0, 12).map((peptide) => (
                  <TouchableOpacity
                    key={peptide.id}
                    style={[styles.resultRow, { borderBottomColor: t.cardBorder }]}
                    onPress={() => handleAddPeptide(peptide.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: t.text }]}>{peptide.name}</Text>
                      <Text style={[styles.resultCat, { color: t.textMuted }]}>{peptide.categories[0]}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={BLUE} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {(searchQuery.trim() || selectedCategory) && filteredPeptides.length === 0 && (
              <Text style={[styles.noResults, { color: t.textMuted }]}>No matching peptides</Text>
            )}
          </View>
        )}

        {/* ── Actions ── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.analyzeBtn, { backgroundColor: BLUE, opacity: currentStack.length < 2 ? 0.4 : 1 }]}
            onPress={handleAnalyze}
            disabled={currentStack.length < 2 || isAnalyzing}
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

          {currentStack.length >= 2 && (
            <TouchableOpacity
              style={[styles.saveBtn, { borderColor: `${BLUE}55` }]}
              onPress={() => setShowSaveInput(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="bookmark-outline" size={18} color={BLUE} />
              <Text style={[styles.saveBtnText, { color: BLUE }]}>Save</Text>
            </TouchableOpacity>
          )}
        </View>

        {currentStack.length < 2 && currentStack.length > 0 && (
          <Text style={[styles.hint, { color: t.textMuted }]}>Add at least 2 peptides to analyze</Text>
        )}

        {/* ── Save input ── */}
        {showSaveInput && (
          <View style={[styles.saveCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <TextInput
              style={[styles.saveInput, { color: t.text, borderBottomColor: t.cardBorder }]}
              value={stackName}
              onChangeText={setStackName}
              placeholder="Stack name..."
              placeholderTextColor={t.textMuted}
              selectionColor={BLUE}
              autoFocus
            />
            <View style={styles.saveActions}>
              <TouchableOpacity onPress={() => { setShowSaveInput(false); setStackName(''); }}>
                <Text style={[styles.saveCancelText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveConfirmBtn, { backgroundColor: BLUE }]} onPress={handleSave}>
                <Text style={styles.saveConfirmText}>Save Stack</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Analysis Results ── */}
        {currentAnalysis && (
          <View style={styles.analysisSection}>
            <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>ANALYSIS</Text>
            <AnalysisCard analysis={currentAnalysis} />
            <Disclaimer variant="safety" />
          </View>
        )}

        <Disclaimer />
      </ScrollView>

      {paywallVisible && (
        <PaywallModal
          visible
          feature="unlimited_stacks"
          onDismiss={() => setPaywallVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingTop: 16, paddingBottom: 12, paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontFamily: 'Playfair-Black', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontFamily: 'DMSans-Medium', marginTop: 2 },
  clearBtn: { fontSize: 13, fontFamily: 'DMSans-SemiBold' },

  // Slots
  slotsRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 16 },
  slotContainer: { flex: 1 },
  slotFilled: {
    borderRadius: 12, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', minHeight: 64,
  },
  slotText: { fontSize: 10, fontFamily: 'DMSans-Bold', textAlign: 'center' },
  slotRemove: {
    position: 'absolute', top: 3, right: 3, borderRadius: 8,
    width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },
  slotEmpty: {
    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 64,
  },

  // Interactions
  previewSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontFamily: 'DMSans-Bold', letterSpacing: 0.8, marginBottom: 10 },
  previewCard: {
    borderRadius: 10, borderLeftWidth: 3, borderWidth: 1, padding: 12, marginBottom: 6,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewPair: { fontSize: 13, fontFamily: 'DMSans-SemiBold', flex: 1 },
  previewScore: { fontSize: 13, fontFamily: 'DMSans-Bold', marginLeft: 8 },
  previewType: { fontSize: 11, fontFamily: 'DMSans-Medium', textTransform: 'capitalize', marginTop: 4 },
  previewMechanism: { fontSize: 12, lineHeight: 17, marginTop: 6 },

  // Add peptides
  addSection: { marginBottom: 16 },
  filterRow: { gap: 4, marginBottom: 12, paddingRight: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  filterChipText: { fontSize: 12, fontFamily: 'DMSans-SemiBold' },
  resultsList: { marginTop: 8 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1,
  },
  resultName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  resultCat: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 1 },
  noResults: { fontSize: 13, fontFamily: 'DMSans-Medium', textAlign: 'center', marginTop: 16 },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  analyzeBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12,
  },
  analyzeBtnText: { fontSize: 15, fontFamily: 'DMSans-Bold', color: '#FFFFFF', letterSpacing: 0.3 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
  },
  saveBtnText: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  hint: { fontSize: 12, fontFamily: 'DMSans-Regular', textAlign: 'center', marginBottom: 12, fontStyle: 'italic' },

  // Save input
  saveCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  saveInput: { fontSize: 15, fontFamily: 'DMSans-Regular', borderBottomWidth: 1, paddingBottom: 10, marginBottom: 14 },
  saveActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  saveCancelText: { fontSize: 14, fontFamily: 'DMSans-Medium' },
  saveConfirmBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  saveConfirmText: { fontSize: 14, fontFamily: 'DMSans-Bold', color: '#FFFFFF' },

  // Analysis
  analysisSection: { marginTop: 8, marginBottom: 16 },
});
