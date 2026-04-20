/**
 * Reconstitution Calculator — concentration, injection volume, doses per vial, and syringe visual.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius, Gradients } from '../../src/constants/theme';

const VIAL_PRESETS = [2, 5, 10, 15, 30];
const WATER_PRESETS = [1, 2, 3, 5];

type VialUnit = 'mg' | 'mcg';
type DoseUnit = 'mg' | 'mcg';

export default function ReconstitutionCalculatorScreen() {
  const router = useRouter();
  const t = useTheme();

  const [vialSize, setVialSize] = useState('');
  const [vialUnit, setVialUnit] = useState<VialUnit>('mg');
  const [waterVolume, setWaterVolume] = useState('');
  const [desiredDose, setDesiredDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mcg');
  const [showResults, setShowResults] = useState(false);

  const vialRaw = parseFloat(vialSize) || 0;
  const waterMl = parseFloat(waterVolume) || 0;
  const doseRaw = parseFloat(desiredDose) || 0;

  // Normalize everything to mcg (matching peptidedosages.com logic)
  const vialMcg = vialUnit === 'mg' ? vialRaw * 1000 : vialRaw;
  const doseMcg = doseUnit === 'mg' ? doseRaw * 1000 : doseRaw;

  // Core calculations (per peptidedosages.com formula)
  const concentrationPerMl = waterMl > 0 ? vialMcg / waterMl : 0; // mcg per 1mL
  const concentrationPerTick = concentrationPerMl / 10; // mcg per 0.1mL tick
  const volumeToInject = concentrationPerMl > 0 ? doseMcg / concentrationPerMl : 0; // mL
  const syringeUnits = volumeToInject * 100; // U-100 insulin syringe
  const ticksToDrawTo = volumeToInject * 10; // 0.1mL ticks
  const dosesPerVial = doseMcg > 0 && volumeToInject > 0 ? waterMl / volumeToInject : 0;

  const canCalculate = vialRaw > 0 && waterMl > 0 && doseRaw > 0;

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  // Syringe visual: 1mL insulin syringe = 100 units = 10 ticks of 0.1mL
  // Show where the fill line is
  const syringeFillPercent = useMemo(() => {
    if (!canCalculate || !showResults) return 0;
    const pct = (volumeToInject / 1.0) * 100; // percentage of 1mL syringe
    return Math.min(pct, 100);
  }, [canCalculate, showResults, volumeToInject]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Reconstitution</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Vial Size */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide Vial Size</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Vial size"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={vialSize}
                onChangeText={(v) => {
                  setVialSize(v);
                  setShowResults(false);
                }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mg'); setShowResults(false); }}
                >
                  <Text style={[styles.unitToggleText, { color: vialUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mcg'); setShowResults(false); }}
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
                    setShowResults(false);
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

        {/* BAC Water Volume */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>BAC Water Volume</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Water volume"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={waterVolume}
                onChangeText={(v) => {
                  setWaterVolume(v);
                  setShowResults(false);
                }}
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
                  onPress={() => {
                    setWaterVolume(String(v));
                    setShowResults(false);
                  }}
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

        {/* Desired Dose */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Desired Dose Per Injection</Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Desired dose"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={desiredDose}
                onChangeText={(v) => {
                  setDesiredDose(v);
                  setShowResults(false);
                }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mcg'); setShowResults(false); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mcg' ? '#fff' : t.textSecondary }]}>mcg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mg'); setShowResults(false); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Quick Concentration Preview */}
        {vialRaw > 0 && waterMl > 0 && (
          <View style={styles.section}>
            <GlassCard variant="gradient">
              <Text style={[styles.previewLabel, { color: t.textSecondary }]}>Concentration</Text>
              <Text style={styles.previewValue}>
                {concentrationPerTick.toFixed(1)} mcg per 0.1mL (tick)
              </Text>
              <Text style={[styles.previewSub, { color: t.textSecondary }]}>
                {(vialMcg / waterMl).toFixed(0)} mcg per 1mL total
              </Text>
            </GlassCard>
          </View>
        )}

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
          <>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Results</Text>
              <GlassCard variant="glow">
                <ResultRow
                  label="Concentration"
                  value={`${concentrationPerTick.toFixed(1)} mcg / tick`}
                />
                <ResultRow
                  label="Volume to inject"
                  value={`${volumeToInject.toFixed(3)} mL`}
                />
                <ResultRow
                  label="Syringe units (U-100)"
                  value={`${(volumeToInject * 100).toFixed(1)} units`}
                />
                <ResultRow
                  label="Ticks to draw to"
                  value={`${ticksToDrawTo.toFixed(1)} ticks`}
                />
                <ResultRow
                  label="Doses per vial"
                  value={dosesPerVial.toFixed(1)}
                  highlight
                />
              </GlassCard>
            </View>

            {/* Syringe Diagram */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Syringe Diagram (1mL)</Text>
              <GlassCard>
                <View style={styles.syringeContainer}>
                  {/* Syringe barrel */}
                  <View style={[styles.syringeBarrel, { backgroundColor: t.isDark ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.04)', borderColor: t.isDark ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.15)' }]}>
                    {/* Tick marks */}
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
                    {/* Fill level */}
                    <LinearGradient
                      colors={[Gradients.primary[0], Gradients.primary[1]]}
                      start={{ x: 0, y: 1 }}
                      end={{ x: 0, y: 0 }}
                      style={[styles.syringeFill, { height: `${syringeFillPercent}%` }]}
                    />
                    {/* Draw-to indicator */}
                    {syringeFillPercent > 0 && syringeFillPercent <= 100 && (
                      <View
                        style={[styles.drawLine, { bottom: `${syringeFillPercent}%` }]}
                      >
                        <Text style={styles.drawLineLabel}>
                          Draw to here ({volumeToInject.toFixed(2)} mL)
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Needle tip */}
                  <View style={[styles.needleTip, { backgroundColor: t.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)' }]} />
                </View>
              </GlassCard>
            </View>

            {/* Storage Reminder */}
            <View style={styles.section}>
              <GlassCard variant="accent">
                <View style={styles.storageRow}>
                  <Ionicons name="snow-outline" size={22} color={Colors.rose} />
                  <View style={styles.storageContent}>
                    <Text style={styles.storageTitle}>Storage Reminder</Text>
                    <Text style={[styles.storageText, { color: t.textSecondary }]}>
                      Refrigerate reconstituted peptide at 2-8{'\u00B0'}C (36-46{'\u00B0'}F).
                      {'\n'}Use within 28-30 days of reconstitution.
                      {'\n'}Do not freeze reconstituted solution.
                      {'\n'}Keep away from direct light and excessive heat.
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </View>
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color={t.textSecondary} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            This calculator is for informational purposes only. Always follow your healthcare
            provider's reconstitution and dosing instructions.
          </Text>
        </View>
      </ScrollView>
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

  // Input rows
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

  // Storage
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
