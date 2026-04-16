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
import { PEPTIDES, getPeptideById } from '../../src/data/peptides';
import { SearchBar } from '../../src/components/SearchBar';
import { AnalysisCard } from '../../src/components/AnalysisCard';
import { GlassCard } from '../../src/components/GlassCard';
import { Disclaimer } from '../../src/components/Disclaimer';
import { Peptide, PeptideCategory, PeptideInteraction } from '../../src/types';
import { getInteraction } from '../../src/data/interactions';
import { analyzeStack } from '../../src/services/analysisEngine';
import { useTheme } from '../../src/hooks/useTheme';

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
      return '#FFBF82';
  }
}

export default function StackBuilderScreen() {
  const t = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PeptideCategory | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [stackName, setStackName] = useState('');

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
    saveStack(name);
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Stack Builder</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Combine up to {MAX_STACK_SIZE} peptides and analyze their
            interactions
          </Text>
        </View>

        {/* ── Visual Slot Workspace ── */}
        <GlassCard style={styles.workspace}>
          <View style={styles.workspaceHeader}>
            <Text style={[styles.workspaceTitle, { color: t.text }]}>
              Your Stack ({currentStack.length}/{MAX_STACK_SIZE})
            </Text>
            {currentStack.length > 0 && (
              <TouchableOpacity onPress={clearStack} activeOpacity={0.7}>
                <Text style={styles.clearButton}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 5 Visual Slots */}
          <View style={styles.slotsRow}>
            {Array.from({ length: MAX_STACK_SIZE }).map((_, index) => {
              const peptide = stackPeptides[index];
              return (
                <View key={index} style={styles.slotContainer}>
                  {peptide ? (
                    <TouchableOpacity
                      style={styles.slotFilled}
                      onPress={() => removeFromStack(peptide.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.slotText} numberOfLines={2}>
                        {peptide.abbreviation || peptide.name.split(' ')[0]}
                      </Text>
                      <View style={styles.slotRemove}>
                        <Ionicons name="close" size={12} color="#e3a7a1" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.slotEmpty, { backgroundColor: t.glass, borderColor: t.glassBorder }]}>
                      <Ionicons name="add" size={20} color={t.textSecondary} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </GlassCard>

        {/* ── Real-time Interaction Preview ── */}
        {pairwiseInteractions.length > 0 && (
          <View style={styles.previewSection}>
            <Text style={[styles.previewTitle, { color: t.text }]}>Interaction Preview</Text>
            {pairwiseInteractions.map((pair, index) => {
              const color = getInteractionColor(pair.interaction.interactionType);
              return (
                <View
                  key={index}
                  style={[styles.previewCard, { borderLeftColor: color, backgroundColor: t.glass }]}
                >
                  <View style={styles.previewHeader}>
                    <Text style={[styles.previewPairText, { color: t.text }]}>
                      {pair.peptideA.abbreviation || pair.peptideA.name}
                      {' '}
                      <Text style={[styles.previewArrow, { color: t.textSecondary }]}>{'\u2194'}</Text>
                      {' '}
                      {pair.peptideB.abbreviation || pair.peptideB.name}
                    </Text>
                    <View style={[styles.previewScoreBadge, { backgroundColor: `${color}20` }]}>
                      <Text style={[styles.previewScoreText, { color }]}>
                        {pair.interaction.synergyScore}/10
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.previewTypePill, { backgroundColor: `${color}15` }]}>
                    <Text style={[styles.previewTypeText, { color }]}>
                      {pair.interaction.interactionType}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Category Filter Chips ── */}
        {currentStack.length < MAX_STACK_SIZE && (
          <View style={styles.pickerSection}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Add Peptides</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterChipsScroll}
              contentContainerStyle={styles.filterChipsContent}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { backgroundColor: t.glass, borderColor: t.glassBorder },
                  !selectedCategory && styles.filterChipActive,
                ]}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: t.textSecondary },
                    !selectedCategory && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {CATEGORY_FILTERS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    { backgroundColor: t.glass, borderColor: t.glassBorder },
                    selectedCategory === cat && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setSelectedCategory(selectedCategory === cat ? null : cat)
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: t.textSecondary },
                      selectedCategory === cat && styles.filterChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search peptides to add..."
            />

            {/* Results list */}
            {(searchQuery.trim() || selectedCategory) && filteredPeptides.length > 0 && (
              <View style={styles.pickerList}>
                {filteredPeptides.slice(0, 12).map((peptide) => (
                  <TouchableOpacity
                    key={peptide.id}
                    style={[styles.pickerItem, { backgroundColor: t.glass, borderColor: t.glassBorder }]}
                    onPress={() => handleAddPeptide(peptide.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerItemContent}>
                      <Text style={[styles.pickerItemName, { color: t.text }]}>
                        {peptide.name}
                      </Text>
                      <Text style={[styles.pickerItemCategories, { color: t.textSecondary }]}>
                        {peptide.categories.join(', ')}
                      </Text>
                    </View>
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color="#b9cbb6"
                    />
                  </TouchableOpacity>
                ))}
                {filteredPeptides.length > 12 && (
                  <Text style={[styles.moreResultsText, { color: t.textSecondary }]}>
                    +{filteredPeptides.length - 12} more results
                  </Text>
                )}
              </View>
            )}
            {(searchQuery.trim() || selectedCategory) && filteredPeptides.length === 0 && (
              <Text style={[styles.noResultsText, { color: t.textSecondary }]}>
                No matching peptides found
              </Text>
            )}
          </View>
        )}

        {/* Analyze Button */}
        <TouchableOpacity
          style={[
            styles.analyzeButton,
            currentStack.length < 2 && styles.analyzeButtonDisabled,
          ]}
          onPress={handleAnalyze}
          disabled={currentStack.length < 2 || isAnalyzing}
          activeOpacity={0.8}
        >
          {isAnalyzing ? (
            <ActivityIndicator size="small" color="#2D2D2D" />
          ) : (
            <>
              <Ionicons name="analytics-outline" size={20} color="#2D2D2D" />
              <Text style={styles.analyzeButtonText}>
                {currentAnalysis ? 'Re-Analyze Stack' : 'Analyze Stack'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {currentStack.length < 2 && currentStack.length > 0 && (
          <Text style={[styles.minWarning, { color: t.textSecondary }]}>
            Add at least 2 peptides to analyze interactions
          </Text>
        )}

        {/* Save Stack */}
        {currentStack.length >= 2 && (
          <View style={styles.saveSection}>
            {showSaveInput ? (
              <GlassCard style={styles.saveInputCard}>
                <TextInput
                  style={[styles.saveInput, { color: t.text }]}
                  value={stackName}
                  onChangeText={setStackName}
                  placeholder="Enter stack name..."
                  placeholderTextColor={t.textSecondary}
                  selectionColor="#e3a7a1"
                  autoFocus
                />
                <View style={styles.saveActions}>
                  <TouchableOpacity
                    style={styles.saveCancelBtn}
                    onPress={() => {
                      setShowSaveInput(false);
                      setStackName('');
                    }}
                  >
                    <Text style={[styles.saveCancelText, { color: t.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveConfirmBtn}
                    onPress={handleSave}
                  >
                    <Text style={styles.saveConfirmText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ) : (
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => setShowSaveInput(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="bookmark-outline" size={18} color={t.tint} />
                <Text style={[styles.saveButtonText, { color: t.tint }]}>Save Stack</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Analysis Results */}
        {currentAnalysis && (
          <View style={styles.analysisSection}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Full Analysis</Text>
            <AnalysisCard analysis={currentAnalysis} />
          </View>
        )}

        {/* Disclaimer */}
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },

  // ── Workspace ─────────────────────────────────────────────
  workspace: {
    marginTop: 20,
    marginBottom: 16,
  },
  workspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  workspaceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  clearButton: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e3a7a1',
  },

  // ── Visual Slots ──────────────────────────────────────────
  slotsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  slotContainer: {
    flex: 1,
  },
  slotFilled: {
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.3)',
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  slotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#e3a7a1',
    textAlign: 'center',
  },
  slotRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },

  // ── Interaction Preview ───────────────────────────────────
  previewSection: {
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 10,
  },
  previewCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewPairText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D2D2D',
    flex: 1,
  },
  previewArrow: {
    color: '#6B7280',
  },
  previewScoreBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  previewScoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewTypePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  previewTypeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // ── Category Filter Chips ─────────────────────────────────
  filterChipsScroll: {
    marginBottom: 12,
  },
  filterChipsContent: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    borderColor: 'rgba(227, 167, 161, 0.4)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#e3a7a1',
  },

  // ── Peptide Picker ────────────────────────────────────────
  pickerSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 12,
  },
  pickerList: {
    marginTop: 12,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerItemContent: {
    flex: 1,
    marginRight: 12,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },
  pickerItemCategories: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  noResultsText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
  },
  moreResultsText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },

  // ── Analyze Button ────────────────────────────────────────
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3a7a1',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 8,
  },
  analyzeButtonDisabled: {
    backgroundColor: 'rgba(227, 167, 161, 0.3)',
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  minWarning: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },

  // ── Save ──────────────────────────────────────────────────
  saveSection: {
    marginTop: 12,
    marginBottom: 20,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(199, 215, 230, 0.3)',
    paddingVertical: 12,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c7d7e6',
  },
  saveInputCard: {
    padding: 16,
  },
  saveInput: {
    fontSize: 15,
    color: '#2D2D2D',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    paddingBottom: 10,
    marginBottom: 14,
  },
  saveActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  saveCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveConfirmBtn: {
    backgroundColor: '#b9cbb6',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  saveConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── Analysis ──────────────────────────────────────────────
  analysisSection: {
    marginTop: 8,
    marginBottom: 16,
  },
});
