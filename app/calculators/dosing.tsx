/**
 * Dosing Calculator — calculate dose per injection, weekly totals, and monthly vial supply.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius, Gradients } from '../../src/constants/theme';
import { PEPTIDES } from '../../src/data/peptides';
import { PROTOCOL_TEMPLATES } from '../../src/data/protocols';
import type { Peptide } from '../../src/types';

type WeightUnit = 'lbs' | 'kg';
type DoseUnit = 'mcg' | 'mg';
type Frequency = 'daily' | 'eod' | '2x_week' | '3x_week' | 'weekly';

const FREQUENCY_OPTIONS: { key: Frequency; label: string; perWeek: number }[] = [
  { key: 'daily', label: 'Daily', perWeek: 7 },
  { key: 'eod', label: 'Every Other Day', perWeek: 3.5 },
  { key: '2x_week', label: '2x / Week', perWeek: 2 },
  { key: '3x_week', label: '3x / Week', perWeek: 3 },
  { key: 'weekly', label: 'Weekly', perWeek: 1 },
];

export default function DosingCalculatorScreen() {
  const router = useRouter();
  const t = useTheme();

  // Inputs
  const [selectedPeptide, setSelectedPeptide] = useState<Peptide | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs');
  const [targetDose, setTargetDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mcg');
  const [frequency, setFrequency] = useState<Frequency>('daily');

  // Results
  const [showResults, setShowResults] = useState(false);

  const filteredPeptides = useMemo(() => {
    if (!searchQuery.trim()) return PEPTIDES;
    const q = searchQuery.toLowerCase();
    return PEPTIDES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.abbreviation && p.abbreviation.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const protocolsForPeptide = useMemo(() => {
    if (!selectedPeptide) return [];
    return PROTOCOL_TEMPLATES.filter((t) => t.peptideId === selectedPeptide.id);
  }, [selectedPeptide]);

  const frequencyOption = FREQUENCY_OPTIONS.find((f) => f.key === frequency)!;

  // Convert dose to mcg for calculations
  const doseMcg = useMemo(() => {
    const raw = parseFloat(targetDose) || 0;
    return doseUnit === 'mg' ? raw * 1000 : raw;
  }, [targetDose, doseUnit]);

  const weeklyTotalMcg = doseMcg * frequencyOption.perWeek;
  const monthlyTotalMcg = weeklyTotalMcg * 4.33; // average weeks per month

  // Assume common vial size of 5mg (5000mcg) unless protocol says otherwise
  const vialSizeMcg = 5000;
  const vialsPerMonth = monthlyTotalMcg > 0 ? Math.ceil(monthlyTotalMcg / vialSizeMcg) : 0;

  const bodyWeightKg = useMemo(() => {
    const raw = parseFloat(bodyWeight) || 0;
    return weightUnit === 'lbs' ? raw * 0.4536 : raw;
  }, [bodyWeight, weightUnit]);

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  const formatDose = (mcg: number): string => {
    if (mcg >= 1000) return `${(mcg / 1000).toFixed(2)} mg`;
    return `${mcg.toFixed(1)} mcg`;
  };

  const canCalculate = targetDose.trim() !== '' && parseFloat(targetDose) > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Dosing Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Peptide Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Select Peptide</Text>
          <GlassCard>
            <TouchableOpacity style={styles.pickerTrigger} onPress={() => setPickerOpen(true)}>
              <Text
                style={[
                  styles.pickerText,
                  { color: t.text },
                  !selectedPeptide && [styles.pickerPlaceholder, { color: t.textSecondary }],
                ]}
              >
                {selectedPeptide ? selectedPeptide.name : 'Choose a peptide...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={t.textSecondary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Body Weight */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Body Weight (optional)</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Enter weight"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={bodyWeight}
                onChangeText={setBodyWeight}
              />
              <View style={[styles.toggleGroup, { backgroundColor: t.glass }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, weightUnit === 'lbs' && styles.toggleActive]}
                  onPress={() => setWeightUnit('lbs')}
                >
                  <Text
                    style={[styles.toggleText, { color: t.textSecondary }, weightUnit === 'lbs' && styles.toggleTextActive]}
                  >
                    lbs
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, weightUnit === 'kg' && styles.toggleActive]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text
                    style={[styles.toggleText, { color: t.textSecondary }, weightUnit === 'kg' && styles.toggleTextActive]}
                  >
                    kg
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {bodyWeight !== '' && bodyWeightKg > 0 && (
              <Text style={[styles.conversionHint, { color: t.textSecondary }]}>
                {weightUnit === 'lbs'
                  ? `= ${bodyWeightKg.toFixed(1)} kg`
                  : `= ${(bodyWeightKg / 0.4536).toFixed(1)} lbs`}
              </Text>
            )}
          </GlassCard>
        </View>

        {/* Target Dose */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Target Dose Per Injection</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Enter dose"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={targetDose}
                onChangeText={(v) => {
                  setTargetDose(v);
                  setShowResults(false);
                }}
              />
              <View style={[styles.toggleGroup, { backgroundColor: t.glass }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, doseUnit === 'mcg' && styles.toggleActive]}
                  onPress={() => setDoseUnit('mcg')}
                >
                  <Text
                    style={[styles.toggleText, { color: t.textSecondary }, doseUnit === 'mcg' && styles.toggleTextActive]}
                  >
                    mcg
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, doseUnit === 'mg' && styles.toggleActive]}
                  onPress={() => setDoseUnit('mg')}
                >
                  <Text
                    style={[styles.toggleText, { color: t.textSecondary }, doseUnit === 'mg' && styles.toggleTextActive]}
                  >
                    mg
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Frequency */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Injection Frequency</Text>
          <GlassCard>
            <View style={styles.freqGrid}>
              {FREQUENCY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.freqBtn, { backgroundColor: t.glass }, frequency === opt.key && styles.freqBtnActive]}
                  onPress={() => {
                    setFrequency(opt.key);
                    setShowResults(false);
                  }}
                >
                  <Text
                    style={[
                      styles.freqBtnText,
                      { color: t.textSecondary },
                      frequency === opt.key && styles.freqBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* Calculate Button */}
        <View style={styles.section}>
          <GradientButton
            label="Calculate"
            onPress={handleCalculate}
            disabled={!canCalculate}
          />
        </View>

        {/* Results */}
        {showResults && canCalculate && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Results</Text>
            <GlassCard variant="glow">
              <ResultRow label="Dose per injection" value={formatDose(doseMcg)} />
              <ResultRow
                label="Injections per week"
                value={
                  frequencyOption.perWeek % 1 === 0
                    ? String(frequencyOption.perWeek)
                    : frequencyOption.perWeek.toFixed(1)
                }
              />
              <ResultRow label="Weekly total" value={formatDose(weeklyTotalMcg)} />
              <ResultRow label="Monthly total (est.)" value={formatDose(monthlyTotalMcg)} />
              <ResultRow
                label={`Vials / month (5mg vials)`}
                value={String(vialsPerMonth)}
                highlight
              />
              {bodyWeightKg > 0 && (
                <ResultRow
                  label="Dose per kg body weight"
                  value={`${(doseMcg / bodyWeightKg).toFixed(1)} mcg/kg`}
                />
              )}
            </GlassCard>
          </View>
        )}

        {/* Protocol Typical Ranges */}
        {showResults && protocolsForPeptide.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Typical Ranges (from research)</Text>
            {protocolsForPeptide.map((proto) => (
              <GlassCard key={proto.id} style={styles.protoCard}>
                <Text style={styles.protoName}>{proto.name}</Text>
                <View style={styles.protoRow}>
                  <Text style={[styles.protoLabel, { color: t.textSecondary }]}>Typical Dose</Text>
                  <Text style={[styles.protoValue, { color: t.text }]}>
                    {proto.typicalDose.min}–{proto.typicalDose.max} {proto.typicalDose.unit}
                  </Text>
                </View>
                <View style={styles.protoRow}>
                  <Text style={[styles.protoLabel, { color: t.textSecondary }]}>Frequency</Text>
                  <Text style={[styles.protoValue, { color: t.text }]}>{proto.frequencyLabel}</Text>
                </View>
                <View style={styles.protoRow}>
                  <Text style={[styles.protoLabel, { color: t.textSecondary }]}>Duration</Text>
                  <Text style={[styles.protoValue, { color: t.text }]}>
                    {proto.durationWeeks.min}–{proto.durationWeeks.max} weeks
                  </Text>
                </View>
                {proto.timing && (
                  <View style={styles.protoRow}>
                    <Text style={[styles.protoLabel, { color: t.textSecondary }]}>Timing</Text>
                    <Text style={[styles.protoValue, { color: t.text }]}>{proto.timing}</Text>
                  </View>
                )}
                {proto.reconstitutionNotes && (
                  <Text style={[styles.protoNote, { color: t.textSecondary }]}>{proto.reconstitutionNotes}</Text>
                )}
              </GlassCard>
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color={t.textSecondary} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            This calculator is for informational purposes only. Always consult a healthcare provider
            for dosing guidance specific to your situation.
          </Text>
        </View>
      </ScrollView>

      {/* Peptide Picker Modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: t.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Select Peptide</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: t.inputBg }]}>
              <Ionicons name="search" size={18} color={t.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: t.text }]}
                placeholder="Search peptides..."
                placeholderTextColor={t.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={t.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredPeptides}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.peptideItem,
                    selectedPeptide?.id === item.id && styles.peptideItemActive,
                  ]}
                  onPress={() => {
                    setSelectedPeptide(item);
                    setPickerOpen(false);
                    setSearchQuery('');
                    setShowResults(false);
                  }}
                >
                  <Text style={[styles.peptideItemName, { color: t.text }]}>{item.name}</Text>
                  <Text style={[styles.peptideItemCat, { color: t.textSecondary }]}>
                    {item.categories.join(', ')}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: t.glassBorder }]} />}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.resultRow, { borderBottomColor: t.glassBorder }]}>
      <Text style={[styles.resultLabel, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[styles.resultValue, { color: t.text }, highlight && styles.resultHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
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
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  scroll: { paddingBottom: 40 },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: Spacing.sm,
  },

  // Picker trigger
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  pickerPlaceholder: {
    color: Colors.darkTextSecondary,
    fontWeight: '400',
  },

  // Inputs
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    height: 44,
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.iceMeltDeep,
  },
  conversionHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 6,
  },

  // Toggle
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleActive: {
    backgroundColor: Colors.iceMeltDeep,
  },
  toggleText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  toggleTextActive: {
    color: Colors.white,
  },

  // Frequency
  freqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  freqBtnActive: {
    backgroundColor: Colors.glassBlue,
    borderColor: Colors.glassBlueBorder,
  },
  freqBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  freqBtnTextActive: {
    color: Colors.iceMelt,
  },

  // Results
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  resultLabel: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    flex: 1,
  },
  resultValue: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  resultHighlight: {
    color: Colors.iceMeltDeep,
    fontSize: FontSizes.lg,
  },

  // Protocol
  protoCard: { marginBottom: Spacing.sm },
  protoName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.iceMelt,
    marginBottom: 8,
  },
  protoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  protoLabel: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },
  protoValue: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
  },
  protoNote: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
  },
  peptideItem: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  peptideItemActive: {
    backgroundColor: Colors.glassBlue,
  },
  peptideItemName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  peptideItemCat: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: Spacing.lg,
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    lineHeight: 16,
  },
});
