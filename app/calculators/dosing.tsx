/**
 * Dosing Calculator — calculate exactly what to draw up per injection,
 * how many days each vial lasts, and how many vials you'll need per month.
 *
 * Shows actionable, user-facing metrics:
 *   - Draw to X units (on a U-100 insulin syringe)
 *   - Volume per injection in mL
 *   - Ticks to draw to
 *   - Concentration (mcg per tick)
 *   - Doses per vial
 *   - Days per vial (at the chosen frequency)
 *   - Vials per month (using the user's actual vial size, not hardcoded)
 *
 * Math matches peptidedosages.com.
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
type VialUnit = 'mg' | 'mcg';
type Frequency = 'daily' | 'eod' | '2x_week' | '3x_week' | 'weekly';

const FREQUENCY_OPTIONS: { key: Frequency; label: string; perWeek: number }[] = [
  { key: 'daily', label: 'Daily', perWeek: 7 },
  { key: 'eod', label: 'Every Other Day', perWeek: 3.5 },
  { key: '2x_week', label: '2x / Week', perWeek: 2 },
  { key: '3x_week', label: '3x / Week', perWeek: 3 },
  { key: 'weekly', label: 'Weekly', perWeek: 1 },
];

const VIAL_PRESETS = [2, 5, 10, 15, 30];
const WATER_PRESETS = [1, 2, 3, 5];

export default function DosingCalculatorScreen() {
  const router = useRouter();
  const t = useTheme();

  // Inputs
  const [selectedPeptide, setSelectedPeptide] = useState<Peptide | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vialSize, setVialSize] = useState('');
  const [vialUnit, setVialUnit] = useState<VialUnit>('mg');
  const [waterVolume, setWaterVolume] = useState('');
  const [targetDose, setTargetDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mcg');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [bodyWeight, setBodyWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs');

  // Results visibility
  const [showResults, setShowResults] = useState(false);

  // Reset results whenever an input changes
  const resetResults = useCallback(() => setShowResults(false), []);

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
    return PROTOCOL_TEMPLATES.filter((pt) => pt.peptideId === selectedPeptide.id);
  }, [selectedPeptide]);

  const frequencyOption = FREQUENCY_OPTIONS.find((f) => f.key === frequency)!;

  // All calculations in mcg internally
  const vialRaw = parseFloat(vialSize) || 0;
  const waterMl = parseFloat(waterVolume) || 0;
  const doseRaw = parseFloat(targetDose) || 0;
  const vialMcg = vialUnit === 'mg' ? vialRaw * 1000 : vialRaw;
  const doseMcg = doseUnit === 'mg' ? doseRaw * 1000 : doseRaw;

  // Core reconstitution math (same formulas as peptidedosages.com)
  const concentrationPerMl = waterMl > 0 ? vialMcg / waterMl : 0;   // mcg per 1mL
  const concentrationPerTick = concentrationPerMl / 10;              // mcg per 0.1mL tick
  const volumeToInjectMl = concentrationPerMl > 0 ? doseMcg / concentrationPerMl : 0;
  const syringeUnits = volumeToInjectMl * 100;                       // U-100 syringe units
  const ticksToDrawTo = volumeToInjectMl * 10;                       // 0.1mL ticks
  const dosesPerVial = doseMcg > 0 && volumeToInjectMl > 0 ? waterMl / volumeToInjectMl : 0;

  // Frequency-aware supply math
  const injectionsPerWeek = frequencyOption.perWeek;
  const daysPerVial = dosesPerVial > 0 ? dosesPerVial / injectionsPerWeek * 7 : 0;
  const weeklyTotalMcg = doseMcg * injectionsPerWeek;
  const monthlyTotalMcg = weeklyTotalMcg * 4.33;
  const vialsPerMonth = dosesPerVial > 0
    ? Math.ceil((injectionsPerWeek * 4.33) / dosesPerVial)
    : 0;

  // Optional: weight-normalized dose
  const bodyWeightKg = useMemo(() => {
    const raw = parseFloat(bodyWeight) || 0;
    return weightUnit === 'lbs' ? raw * 0.4536 : raw;
  }, [bodyWeight, weightUnit]);

  const syringeFillPercent = useMemo(() => {
    if (!showResults || volumeToInjectMl <= 0) return 0;
    return Math.min(volumeToInjectMl * 100, 100);
  }, [showResults, volumeToInjectMl]);

  const canCalculate = vialRaw > 0 && waterMl > 0 && doseRaw > 0;

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  const formatDose = (mcg: number): string => {
    if (mcg >= 1000) return `${(mcg / 1000).toFixed(2)} mg`;
    return `${mcg.toFixed(1)} mcg`;
  };

  // Round to nearest practical syringe tick. U-100 syringes have 1-unit
  // marks, with half-unit estimation between them.
  const roundSyringeUnits = (units: number): number => {
    if (units < 0.5) return 0;
    if (units < 2) return Math.round(units * 2) / 2; // half-units for tiny doses
    return Math.round(units);
  };

  const roundedUnits = roundSyringeUnits(syringeUnits);

  // Compact dose formatter for inline warning text
  function formatDoseInline(mcg: number): string {
    if (mcg >= 10000) return `${(mcg / 1000).toFixed(1)} mg`;
    if (mcg >= 1000) return `${(mcg / 1000).toFixed(2)} mg`;
    return `${Math.round(mcg)} mcg`;
  }

  // Build up safety warnings — ordered most severe to least
  const warnings: string[] = [];
  if (showResults) {
    // Dose larger than the entire vial
    if (doseMcg > vialMcg) {
      warnings.push(
        'Your dose is larger than the total peptide in the vial. Double-check your numbers — this usually means the dose unit (mg vs mcg) is wrong.'
      );
    }

    // Dose outside the selected peptide's typical research range
    const proto = protocolsForPeptide[0];
    if (proto && proto.typicalDose) {
      const { min, max, unit } = proto.typicalDose;
      const minMcg = unit === 'mg' ? min * 1000 : min;
      const maxMcg = unit === 'mg' ? max * 1000 : max;
      if (doseMcg > 0 && (doseMcg < minMcg || doseMcg > maxMcg)) {
        warnings.push(
          `Your dose (${formatDoseInline(doseMcg)}) is outside the typical research range for ${selectedPeptide!.name} (${min}–${max} ${unit}). Verify with your protocol.`
        );
      }
    }

    // Unusually high dose when no peptide is selected for range-checking
    if (!proto && doseMcg > 5000) {
      warnings.push(
        `${formatDoseInline(doseMcg)} is a very high dose for most peptides. Double-check the unit (mg vs mcg) before drawing.`
      );
    }

    // Volume larger than a U-100 syringe holds
    if (volumeToInjectMl > 1) {
      warnings.push(
        'This dose is more than 1mL — it won\'t fit in a standard U-100 insulin syringe. Use less BAC water to increase concentration, or split the injection.'
      );
    }

    // Volume too small to measure accurately on a standard insulin syringe
    if (volumeToInjectMl > 0 && syringeUnits < 0.5) {
      warnings.push(
        'This dose would be less than half a unit on a U-100 syringe — too small to draw accurately. Reconstitute with less BAC water for a higher concentration.'
      );
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
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
        {/* Peptide (optional, for protocol typical-range display) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide (optional)</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            Select one to see typical research ranges alongside your numbers.
          </Text>
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

        {/* Vial Size */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide Vial Size</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            The amount of peptide in your vial before mixing.
          </Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 5"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={vialSize}
                onChangeText={(v) => { setVialSize(v); resetResults(); }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: vialUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mcg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: vialUnit === 'mcg' ? '#fff' : t.textSecondary }]}>mcg</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.presetRow}>
              {VIAL_PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: t.glass },
                    vialSize === String(v) && vialUnit === 'mg' && styles.presetBtnActive,
                  ]}
                  onPress={() => {
                    setVialSize(String(v));
                    setVialUnit('mg');
                    resetResults();
                  }}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: t.textSecondary },
                      vialSize === String(v) && vialUnit === 'mg' && styles.presetBtnTextActive,
                    ]}
                  >
                    {v}mg
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* BAC Water */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>BAC Water Volume</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            How much bacteriostatic water you add to the vial.
          </Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 2"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={waterVolume}
                onChangeText={(v) => { setWaterVolume(v); resetResults(); }}
              />
              <Text style={[styles.unitLabel, { color: t.textSecondary }]}>mL</Text>
            </View>
            <View style={styles.presetRow}>
              {WATER_PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: t.glass },
                    waterVolume === String(v) && styles.presetBtnActive,
                  ]}
                  onPress={() => { setWaterVolume(String(v)); resetResults(); }}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: t.textSecondary },
                      waterVolume === String(v) && styles.presetBtnTextActive,
                    ]}
                  >
                    {v}mL
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* Target Dose */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Dose Per Injection</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 250"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={targetDose}
                onChangeText={(v) => { setTargetDose(v); resetResults(); }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mcg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mcg' ? '#fff' : t.textSecondary }]}>mcg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
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
                  onPress={() => { setFrequency(opt.key); resetResults(); }}
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

        {/* Body weight (optional — for mcg/kg) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Body Weight (optional)</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            Used to show your dose as mcg per kg body weight.
          </Text>
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
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, weightUnit === 'lbs' && { backgroundColor: t.primary }]}
                  onPress={() => setWeightUnit('lbs')}
                >
                  <Text style={[styles.unitToggleText, { color: weightUnit === 'lbs' ? '#fff' : t.textSecondary }]}>lbs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, weightUnit === 'kg' && { backgroundColor: t.primary }]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text style={[styles.unitToggleText, { color: weightUnit === 'kg' ? '#fff' : t.textSecondary }]}>kg</Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Quick concentration preview */}
        {vialRaw > 0 && waterMl > 0 && (
          <View style={styles.section}>
            <GlassCard variant="gradient">
              <Text style={[styles.previewLabel, { color: t.textSecondary }]}>Concentration</Text>
              <Text style={styles.previewValue}>
                {concentrationPerTick.toFixed(1)} mcg per tick (0.1mL)
              </Text>
              <Text style={[styles.previewSub, { color: t.textSecondary }]}>
                {concentrationPerMl.toFixed(0)} mcg per 1mL total
              </Text>
            </GlassCard>
          </View>
        )}

        {/* Calculate */}
        <View style={styles.section}>
          <GradientButton
            label="Calculate"
            onPress={handleCalculate}
            disabled={!canCalculate}
          />
        </View>

        {/* Warnings */}
        {showResults && warnings.length > 0 && (
          <View style={styles.section}>
            {warnings.map((w, i) => (
              <View key={i} style={[styles.warnBox, i > 0 && { marginTop: 8 }]}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.warnText}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Per-injection results (the actionable stuff) */}
        {showResults && canCalculate && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Per Injection</Text>
            <GlassCard variant="glow">
              <ResultRow
                label="Draw to"
                value={`${roundedUnits} units (U-100)`}
                hint={`precise: ${syringeUnits.toFixed(2)} units`}
                highlight
              />
              <ResultRow
                label="Volume"
                value={`${volumeToInjectMl.toFixed(3)} mL`}
              />
              <ResultRow
                label="Ticks on syringe"
                value={`${ticksToDrawTo.toFixed(1)} ticks (0.1mL each)`}
              />
              <ResultRow
                label="Actual dose"
                value={formatDose(doseMcg)}
              />
              {bodyWeightKg > 0 && (
                <ResultRow
                  label="Dose per kg body weight"
                  value={`${(doseMcg / bodyWeightKg).toFixed(2)} mcg/kg`}
                />
              )}
            </GlassCard>
          </View>
        )}

        {/* Syringe visual */}
        {showResults && canCalculate && volumeToInjectMl > 0 && volumeToInjectMl <= 1 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Syringe (1mL U-100)</Text>
            <GlassCard>
              <View style={styles.syringeContainer}>
                <View style={[styles.syringeBarrel, {
                  backgroundColor: t.isDark ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.04)',
                  borderColor: t.isDark ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.15)',
                }]}>
                  {Array.from({ length: 11 }, (_, i) => {
                    const pct = (i / 10) * 100;
                    const isMajor = i % 5 === 0;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.tick,
                          isMajor && styles.tickMajor,
                          { bottom: `${pct}%` },
                        ]}
                      >
                        {isMajor && (
                          <Text style={styles.tickLabel}>{(i / 10).toFixed(1)}</Text>
                        )}
                      </View>
                    );
                  })}
                  <LinearGradient
                    colors={[Gradients.primary[0], Gradients.primary[1]]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={[styles.syringeFill, { height: `${syringeFillPercent}%` }]}
                  />
                  {syringeFillPercent > 0 && syringeFillPercent <= 100 && (
                    <View style={[styles.drawLine, { bottom: `${syringeFillPercent}%` }]}>
                      <Text style={styles.drawLineLabel}>
                        Draw to here ({volumeToInjectMl.toFixed(2)} mL)
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.needleTip, { backgroundColor: t.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)' }]} />
              </View>
            </GlassCard>
          </View>
        )}

        {/* Supply math */}
        {showResults && canCalculate && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Your Supply</Text>
            <GlassCard>
              <ResultRow
                label="Doses per vial"
                value={dosesPerVial.toFixed(1)}
                highlight
              />
              <ResultRow
                label="Days each vial lasts"
                value={`${daysPerVial.toFixed(0)} days`}
              />
              <ResultRow
                label={`Vials per month (${vialRaw}${vialUnit} vials)`}
                value={String(vialsPerMonth)}
              />
              <ResultRow
                label="Injections per week"
                value={
                  injectionsPerWeek % 1 === 0
                    ? String(injectionsPerWeek)
                    : injectionsPerWeek.toFixed(1)
                }
              />
              <ResultRow
                label="Weekly total"
                value={formatDose(weeklyTotalMcg)}
              />
              <ResultRow
                label="Monthly total (est.)"
                value={formatDose(monthlyTotalMcg)}
              />
            </GlassCard>
          </View>
        )}

        {/* Typical ranges from protocol */}
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

        {/* Safety reminder */}
        {showResults && (
          <View style={styles.section}>
            <GlassCard variant="accent">
              <View style={styles.storageRow}>
                <Ionicons name="shield-checkmark-outline" size={22} color={Colors.rose} />
                <View style={styles.storageContent}>
                  <Text style={styles.storageTitle}>Safety Reminders</Text>
                  <Text style={[styles.storageText, { color: t.textSecondary }]}>
                    • Use a fresh sterile needle for every injection.{'\n'}
                    • Swab the vial stopper with alcohol before drawing.{'\n'}
                    • Refrigerate reconstituted peptide at 2–8°C.{'\n'}
                    • Use within 28–30 days of reconstitution.{'\n'}
                    • Do not freeze — and keep out of direct light.
                  </Text>
                </View>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color={t.textSecondary} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            This calculator is for informational purposes only. Always consult a licensed healthcare provider
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
                    resetResults();
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
  hint,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  hint?: string;
}) {
  const t = useTheme();
  return (
    <View style={[styles.resultRow, { borderBottomColor: t.glassBorder }]}>
      <Text style={[styles.resultLabel, { color: t.textSecondary }]}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.resultValue, { color: t.text }, highlight && styles.resultHighlight]}>{value}</Text>
        {hint && (
          <Text style={[styles.resultHint, { color: t.textSecondary }]}>{hint}</Text>
        )}
      </View>
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
    fontSize: 28,
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
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 16,
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
  unitLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
    width: 36,
  },

  // Toggle
  unitToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  unitToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    minWidth: 38,
    alignItems: 'center',
  },
  unitToggleText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetBtnActive: {
    backgroundColor: Colors.glassBlue,
    borderColor: Colors.glassBlueBorder,
  },
  presetBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  presetBtnTextActive: {
    color: Colors.pepBlueLight,
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

  // Preview
  previewLabel: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.iceMeltDeep,
  },
  previewSub: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // Warnings
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.md,
  },
  warnText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#B91C1C',
    lineHeight: 18,
    fontWeight: '600',
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
  resultHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Syringe
  syringeContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  syringeBarrel: {
    width: 60,
    height: 220,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  tick: {
    position: 'absolute',
    left: 0,
    width: 12,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tickMajor: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tickLabel: {
    position: 'absolute',
    left: 24,
    top: -7,
    fontSize: 10,
    color: Colors.darkTextSecondary,
    width: 30,
  },
  syringeFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.6,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  drawLine: {
    position: 'absolute',
    left: 0,
    right: -100,
    height: 2,
    backgroundColor: Colors.iceMeltDeep,
  },
  drawLineLabel: {
    position: 'absolute',
    left: 68,
    top: -8,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.iceMeltDeep,
    width: 160,
  },
  needleTip: {
    width: 4,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
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

  // Safety/storage
  storageRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  storageContent: { flex: 1 },
  storageTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.rose,
    marginBottom: 4,
  },
  storageText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
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
