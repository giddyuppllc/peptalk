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
import { LearnVideoCard } from '../../src/components/LearnVideoCard';
import { SyringeSVG } from '../../src/components/v3';
import { ACETIC_ACID_PEPTIDE_NAMES } from '../../src/data/calculatorMetadata';

const VIAL_PRESETS = [2, 5, 10, 15, 30];
const WATER_PRESETS = [1, 2, 3, 5];

type VialUnit = 'mg' | 'mcg';
type DoseUnit = 'mg' | 'mcg';
type DiluentType = 'bacWater' | 'aceticAcid';

export default function ReconstitutionCalculatorScreen() {
  const router = useRouter();
  const t = useTheme();

  const [vialSize, setVialSize] = useState('');
  const [vialUnit, setVialUnit] = useState<VialUnit>('mg');
  const [waterVolume, setWaterVolume] = useState('');
  const [desiredDose, setDesiredDose] = useState('');
  // Default to mg — the user feedback was that mcg-by-default forces
  // every Selank / BPC / ipamorelin user to toggle on every visit. mg
  // is the readable unit at human-scale doses; the toggle stays so
  // mcg-thinking peptides still work.
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mg');
  // BUG A — screen-level RESULT display unit. Independent of the dose INPUT
  // toggle above: it reformats every computed result (concentration, dose)
  // between mcg and mg. Defaults to mg per the calculator spec so users
  // aren't forced to mentally divide by 1000 on every visit.
  const [resultUnit, setResultUnit] = useState<DoseUnit>('mg');
  // BUG C — user-selectable diluent. Metadata-only before; now the user can
  // say they're reconstituting with acetic acid and get the matching label +
  // stability reminder for hydrophobic compounds.
  const [diluentType, setDiluentType] = useState<DiluentType>('bacWater');
  const [showResults, setShowResults] = useState(false);

  // Clamp at parse so a transient negative input (user typing "-5") can't
  // propagate negative concentration / volume into the downstream display.
  // Mirrors the same guard in app/doses/calculator.tsx.
  const vialRaw = Math.max(0, parseFloat(vialSize) || 0);
  const waterMl = Math.max(0, parseFloat(waterVolume) || 0);
  const doseRaw = Math.max(0, parseFloat(desiredDose) || 0);

  // Normalize everything to mcg (matching peptidedosages.com logic)
  const vialMcg = vialUnit === 'mg' ? vialRaw * 1000 : vialRaw;
  const doseMcg = doseUnit === 'mg' ? doseRaw * 1000 : doseRaw;

  // Core calculations (per peptidedosages.com formula)
  const concentrationPerMl = waterMl > 0 ? vialMcg / waterMl : 0; // mcg per 1mL
  // U-100 insulin syringe: 100 ticks/units per 1mL, so 1 tick = 0.01mL.
  const concentrationPerTick = concentrationPerMl / 100; // mcg per 0.01mL tick
  const volumeToInject = concentrationPerMl > 0 ? doseMcg / concentrationPerMl : 0; // mL
  const syringeUnits = volumeToInject * 100; // U-100 insulin syringe
  const ticksToDrawTo = volumeToInject * 100; // 0.01mL ticks (1 tick = 1 unit)
  const dosesPerVial = doseMcg > 0 && volumeToInject > 0 ? waterMl / volumeToInject : 0;

  const canCalculate = vialRaw > 0 && waterMl > 0 && doseRaw > 0;

  // BUG A — reformat an internally-mcg value into the chosen result unit.
  // 1 mg = 1000 mcg. mg keeps 3 decimals below 1 (so a 33 mcg/tick reads as
  // 0.033 mg, not a lossy 0.03) and 2 decimals otherwise.
  const formatByUnit = useCallback(
    (mcg: number) => {
      if (resultUnit === 'mg') {
        const mg = mcg / 1000;
        return `${mg.toFixed(mg > 0 && mg < 1 ? 3 : 2)} mg`;
      }
      return `${mcg.toFixed(mcg < 10 ? 1 : 0)} mcg`;
    },
    [resultUnit],
  );
  // Show both units for the dose so the number is unambiguous regardless of
  // which unit the user is thinking in.
  const doseBothText = useMemo(() => {
    const mg = `${(doseMcg / 1000).toFixed(doseMcg / 1000 < 1 ? 3 : 2)} mg`;
    const mcg = `${doseMcg.toFixed(doseMcg < 10 ? 1 : 0)} mcg`;
    return resultUnit === 'mg' ? `${mg} (${mcg})` : `${mcg} (${mg})`;
  }, [doseMcg, resultUnit]);
  const isAcetic = diluentType === 'aceticAcid';
  const diluentLabel = isAcetic ? 'Acetic Acid' : 'BAC Water';

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  // Syringe visual: 1mL insulin syringe = 100 units = 100 ticks of 0.01mL
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
        {/* How-to video — same clip used on the How to Use Peptides
            FAQ. Sits above the inputs so a first-time user can watch
            the technique before reconstituting their first vial. */}
        <View style={styles.section}>
          <LearnVideoCard
            slug="reconstitution"
            title="Watch: peptide reconstitution"
            subtitle="See the BAC-water draw + slow-drip technique before you run the math below."
            gradientColors={[t.primary, t.tint]}
          />
        </View>

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

        {/* Diluent Volume (BAC water or acetic acid — BUG C) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>{diluentLabel} Volume</Text>
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

        {/* Result display unit (BUG A) + diluent type (BUG C).
            Toggle styling mirrors app/doses/calculator.tsx's pill toggle. */}
        <View style={styles.section}>
          <GlassCard>
            <View style={styles.optionRow}>
              <Text style={[styles.optionLabel, { color: t.textSecondary }]}>Show results in</Text>
              <View style={styles.segToggle}>
                {(['mg', 'mcg'] as DoseUnit[]).map((u) => {
                  const active = resultUnit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      style={[styles.segBtn, active && { backgroundColor: t.primary }]}
                      onPress={() => setResultUnit(u)}
                      accessibilityRole="button"
                      accessibilityLabel={`Show results in ${u}`}
                    >
                      <Text style={[styles.segText, { color: active ? '#fff' : t.textSecondary }]}>{u}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.optionRow, { marginTop: 14 }]}>
              <Text style={[styles.optionLabel, { color: t.textSecondary }]}>Diluent</Text>
              <View style={styles.segToggle}>
                {([
                  ['bacWater', 'BAC water'],
                  ['aceticAcid', 'Acetic acid'],
                ] as [DiluentType, string][]).map(([val, lbl]) => {
                  const active = diluentType === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.segBtn, styles.segBtnWide, active && { backgroundColor: t.primary }]}
                      onPress={() => {
                        setDiluentType(val);
                        setShowResults(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Diluent: ${lbl}`}
                    >
                      <Text style={[styles.segText, { color: active ? '#fff' : t.textSecondary }]}>{lbl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {isAcetic && (
              <View style={styles.aceticNote}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.rose} />
                <Text style={[styles.aceticNoteText, { color: t.textSecondary }]}>
                  Acetic acid (0.6%) improves stability for hydrophobic peptides like{' '}
                  {ACETIC_ACID_PEPTIDE_NAMES.join(', ')}. Use it in place of BAC water for those compounds.
                </Text>
              </View>
            )}
          </GlassCard>
        </View>

        {/* Quick Concentration Preview */}
        {vialRaw > 0 && waterMl > 0 && (
          <View style={styles.section}>
            <GlassCard variant="gradient">
              <Text style={[styles.previewLabel, { color: t.textSecondary }]}>Concentration</Text>
              <Text style={styles.previewValue}>
                {formatByUnit(concentrationPerTick)} per 0.01mL (tick)
              </Text>
              <Text style={[styles.previewSub, { color: t.textSecondary }]}>
                {formatByUnit(concentrationPerMl)} per 1mL total
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
                  label="Dose per injection"
                  value={doseBothText}
                />
                <ResultRow
                  label="Concentration"
                  value={`${formatByUnit(concentrationPerTick)} / tick`}
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

            {/* Syringe Diagram — uses the polished v3 horizontal U-100
                SVG (same one on the home Doses card). The previous
                vertical bar was harder to read at a glance; the
                horizontal form mirrors how the user actually holds the
                syringe. The red marker line shows EXACTLY where to
                pull the plunger to. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Draw your dose</Text>
              <GlassCard>
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <SyringeSVG
                    fillMl={Math.min(1, Math.max(0, volumeToInject))}
                    capacityMl={1}
                    width={300}
                    showMarker
                  />
                  <View style={{ marginTop: 14, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>
                      Draw to {volumeToInject.toFixed(2)} mL
                    </Text>
                    <Text style={{ fontSize: 13, color: t.textSecondary }}>
                      That's {(volumeToInject * 100).toFixed(0)} units on a U-100 insulin syringe
                      ({(volumeToInject * 100).toFixed(1)} tick{(volumeToInject * 100) === 1 ? '' : 's'})
                    </Text>
                  </View>
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

  // Result-unit + diluent toggles (mirror calculator.tsx pill toggle)
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  segToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  segBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  segBtnWide: {
    paddingHorizontal: 14,
  },
  segText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  aceticNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
  },
  aceticNoteText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 18,
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
