/**
 * Quick Dose Calculator — Pick a peptide, get everything you need.
 * Uses the user's body weight + protocol data to auto-calculate.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../src/constants/theme';
import { PEPTIDES } from '../../src/data/peptides';
import { getProtocolsByPeptide } from '../../src/data/protocols';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { getPeptideTiming } from '../../src/data/peptideTiming';

/**
 * Unit conversion helpers — every dose shown in BOTH mcg and mg so users
 * never have to do the math in their head. 1 mg = 1,000 mcg.
 */
function toMcg(value: number, unit: string): number {
  return unit === 'mg' ? value * 1000 : value;
}
function toMg(value: number, unit: string): number {
  return unit === 'mg' ? value : value / 1000;
}
function fmt(n: number, max = 3): string {
  // Strip trailing zeros: 0.250 → 0.25, 250.0 → 250
  return Number(n.toFixed(max)).toString();
}

export default function QuickDoseScreen() {
  const router = useRouter();
  const weightLbs = useHealthProfileStore((s) => s.profile?.bodyMetrics?.weightLbs);
  const isPregnantOrNursing = useHealthProfileStore(
    (s) => s.profile?.medical?.pregnantOrNursing === true,
  );
  const [search, setSearch] = useState('');
  const [selectedPeptideId, setSelectedPeptideId] = useState<string | null>(null);

  const weightKg = weightLbs ? Math.round(weightLbs / 2.20462) : null;

  const filteredPeptides = useMemo(() => {
    if (!search.trim()) return PEPTIDES.slice(0, 20);
    // Dash/space-tolerant — "MOTSC" finds "MOTS-c", "BPC157" finds "BPC-157".
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(search);
    if (!q) return PEPTIDES.slice(0, 20);
    return PEPTIDES.filter(
      (p) =>
        norm(p.name).includes(q) ||
        norm(p.id).includes(q) ||
        (p.abbreviation && norm(p.abbreviation).includes(q)),
    ).slice(0, 20);
  }, [search]);

  const selectedPeptide = useMemo(
    () => PEPTIDES.find((p) => p.id === selectedPeptideId),
    [selectedPeptideId]
  );

  const protocols = useMemo(
    () => (selectedPeptideId ? getProtocolsByPeptide(selectedPeptideId) : []),
    [selectedPeptideId]
  );

  const protocol = protocols[0]; // Primary protocol

  const timingRule = useMemo(
    () => (selectedPeptide ? getPeptideTiming(selectedPeptide.id) : null),
    [selectedPeptide],
  );

  // Auto-calculate reconstitution
  const reconInfo = useMemo(() => {
    if (!protocol) return null;
    // Standard: 5mg vial + 2ml BAC water
    const vialMg = 5;
    const waterMl = 2;
    const concentrationMcgPerMl = (vialMg * 1000) / waterMl;
    const doseMin = protocol.typicalDose?.min ?? 0;
    const doseMax = protocol.typicalDose?.max ?? 0;
    const doseUnit = protocol.typicalDose?.unit ?? 'mcg';
    // IU is an activity unit with no peptide-agnostic mass conversion, so a
    // volume/ticks draw can't be computed from a mcg/mL concentration.
    const unitConvertible = doseUnit !== 'IU';
    // CRITICAL: convert the dose to mcg before dividing by the mcg/mL
    // concentration. Dividing a raw mg/IU value gave a ~0 draw for every
    // mg-dosed peptide (e.g. 1 mg → 0.0004 mL instead of 0.4 mL).
    const doseMinMcg = toMcg(doseMin, doseUnit);
    const doseMaxMcg = toMcg(doseMax, doseUnit);
    const volumeMinMl = doseMinMcg / concentrationMcgPerMl;
    const volumeMaxMl = doseMaxMcg / concentrationMcgPerMl;
    const volumeMinUnits = Math.round(volumeMinMl * 100); // insulin syringe units
    const volumeMaxUnits = Math.round(volumeMaxMl * 100);

    return {
      vialMg,
      waterMl,
      concentrationMcgPerMl,
      doseMin,
      doseMax,
      doseUnit,
      unitConvertible,
      volumeMinMl: Math.round(volumeMinMl * 100) / 100,
      volumeMaxMl: Math.round(volumeMaxMl * 100) / 100,
      volumeMinUnits,
      volumeMaxUnits,
    };
  }, [protocol]);

  // ── Peptide Picker ──
  if (!selectedPeptide) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
          </AnimatedPress>
          <Text style={styles.headerTitle}>Quick Dose Guide</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={Colors.darkTextSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search peptides..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {weightKg && (
          <Text style={styles.weightNote}>
            Your weight: {weightLbs} lbs ({weightKg} kg) — used for dose calculations
          </Text>
        )}

        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredPeptides.map((p) => (
            <AnimatedPress
              key={p.id}
              onPress={() => setSelectedPeptideId(p.id)}
              style={styles.peptideRow}
            >
              <View style={styles.peptideDot} />
              <View style={styles.peptideInfo}>
                <Text style={styles.peptideName}>{p.name}</Text>
                <Text style={styles.peptideCats}>
                  {p.categories.slice(0, 2).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.darkTextSecondary} />
            </AnimatedPress>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Full Dose Guide ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPress onPress={() => setSelectedPeptideId(null)} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <Text style={styles.headerTitle}>{selectedPeptide.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* What it does */}
        <GlassCard variant="elevated" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle" size={20} color={Colors.iceMeltDeep} />
            <Text style={styles.sectionTitle}>What it does</Text>
          </View>
          <Text style={styles.sectionText}>
            {selectedPeptide.researchSummary || selectedPeptide.mechanismOfAction || 'Research peptide.'}
          </Text>
        </GlassCard>

        {protocol && reconInfo && (
          <>
            {/* Dosing */}
            <GlassCard variant="glow" glowColor="#E89672" style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flask" size={20} color="#E89672" />
                <Text style={styles.sectionTitle}>Your Dose</Text>
              </View>
              <View style={styles.doseGrid}>
                <View style={styles.doseItem}>
                  <Text style={styles.doseLabel}>Amount</Text>
                  <Text style={styles.doseValue}>
                    {reconInfo.doseMin}-{reconInfo.doseMax} {reconInfo.doseUnit}
                  </Text>
                  <Text style={styles.doseConversion}>
                    = {fmt(toMg(reconInfo.doseMin, reconInfo.doseUnit))}-{fmt(toMg(reconInfo.doseMax, reconInfo.doseUnit))} mg
                    {' · '}
                    {fmt(toMcg(reconInfo.doseMin, reconInfo.doseUnit), 0)}-{fmt(toMcg(reconInfo.doseMax, reconInfo.doseUnit), 0)} mcg
                  </Text>
                </View>
                <View style={styles.doseItem}>
                  <Text style={styles.doseLabel}>Route</Text>
                  <Text style={styles.doseValue}>{protocol.route}</Text>
                </View>
                <View style={styles.doseItem}>
                  <Text style={styles.doseLabel}>Frequency</Text>
                  <Text style={styles.doseValue}>{protocol.frequencyLabel || 'Daily'}</Text>
                </View>
                {protocol.timing && (
                  <View style={styles.doseItem}>
                    <Text style={styles.doseLabel}>When</Text>
                    <Text style={styles.doseValue}>{protocol.timing}</Text>
                  </View>
                )}
              </View>
              {weightKg && (
                <Text style={styles.weightCalc}>
                  Based on your weight: {weightLbs} lbs ({weightKg} kg)
                </Text>
              )}
            </GlassCard>

            {/* Reconstitution */}
            <GlassCard variant="glow" glowColor="#A4D9D1" style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="water" size={20} color="#A4D9D1" />
                <Text style={styles.sectionTitle}>How to Reconstitute</Text>
              </View>
              <View style={styles.stepList}>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>1</Text>
                  <Text style={styles.stepText}>
                    Add {reconInfo.waterMl}ml bacteriostatic water to your {reconInfo.vialMg}mg vial
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>2</Text>
                  <Text style={styles.stepText}>
                    Drip water slowly down the inside wall of the vial — never spray directly on the powder
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>3</Text>
                  <Text style={styles.stepText}>
                    Gently swirl (never shake) until fully dissolved (1-3 minutes)
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>4</Text>
                  <Text style={styles.stepText}>
                    Your concentration: {reconInfo.concentrationMcgPerMl.toLocaleString()} mcg/ml
                    {' '}({fmt(reconInfo.concentrationMcgPerMl / 1000)} mg/ml)
                  </Text>
                </View>
              </View>

              <GlassCard style={styles.injectionCard}>
                <Text style={styles.injectionTitle}>Draw this much</Text>
                {reconInfo.unitConvertible ? (
                  <>
                    <Text style={styles.injectionValue}>
                      {reconInfo.volumeMinUnits}-{reconInfo.volumeMaxUnits} ticks
                    </Text>
                    <Text style={styles.injectionUnits}>
                      on a U-100 insulin syringe
                    </Text>
                    <Text style={styles.injectionDetail}>
                      = {reconInfo.volumeMinMl}-{reconInfo.volumeMaxMl} mL of liquid
                    </Text>
                    <Text style={styles.injectionDetail}>
                      Each tick delivers {fmt(reconInfo.concentrationMcgPerMl / 100, 1)} mcg of peptide
                    </Text>
                  </>
                ) : (
                  <Text style={styles.injectionDetail}>
                    This compound is dosed in {reconInfo.doseUnit}, which has no fixed
                    mass conversion — a syringe draw can't be auto-calculated. Follow
                    your product's reconstitution chart.
                  </Text>
                )}
              </GlassCard>

              {/* Plain-English conversion footer — same two sentences every time */}
              <View style={styles.conversionNote}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.darkTextSecondary} />
                <Text style={styles.conversionNoteText}>
                  1 mg = 1,000 mcg.  One tick on a U-100 insulin syringe = 0.01 mL of liquid.
                </Text>
              </View>
            </GlassCard>

            {/* How to inject */}
            <GlassCard style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="medkit" size={20} color={Colors.rose} />
                <Text style={styles.sectionTitle}>How to Inject</Text>
              </View>
              <View style={styles.stepList}>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>1</Text>
                  <Text style={styles.stepText}>
                    Clean injection site with alcohol swab and let dry
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>2</Text>
                  <Text style={styles.stepText}>
                    Pinch skin at injection site (abdomen 2" from navel, outer thigh, or upper arm)
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>3</Text>
                  <Text style={styles.stepText}>
                    Insert needle at 45° angle, inject slowly, hold 5 seconds, withdraw
                  </Text>
                </View>
                <View style={styles.step}>
                  <Text style={styles.stepNum}>4</Text>
                  <Text style={styles.stepText}>
                    Rotate injection sites — don't use the same spot twice in a row
                  </Text>
                </View>
              </View>
            </GlassCard>

            {/* Cycling */}
            {protocol.reconstitutionNotes && (
              <GlassCard style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="repeat" size={20} color="#22c55e" />
                  <Text style={styles.sectionTitle}>Reconstitution Notes</Text>
                </View>
                <Text style={styles.sectionText}>{protocol.reconstitutionNotes}</Text>
                {protocol.durationWeeks && (
                  <Text style={styles.durationText}>
                    Recommended duration: {protocol.durationWeeks.min}-{protocol.durationWeeks.max} weeks
                  </Text>
                )}
              </GlassCard>
            )}

            {/* Timing rule */}
            {timingRule && (
              <GlassCard style={{ ...styles.section, ...styles.timingCard }}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={timingRule.highSensitivity ? '#B45309' : '#7ABED0'}
                  />
                  <Text
                    style={[
                      styles.sectionTitle,
                      timingRule.highSensitivity ? { color: '#B45309' } : null,
                    ]}
                  >
                    Timing: {timingRule.title}
                  </Text>
                </View>
                <Text style={styles.sectionText}>{timingRule.body}</Text>
                {(timingRule.fastBeforeMin || timingRule.fastAfterMin) && (
                  <View style={styles.timingMetaRow}>
                    {timingRule.fastBeforeMin && (
                      <View style={styles.timingChip}>
                        <Ionicons name="arrow-back-outline" size={12} color="#6B7280" />
                        <Text style={styles.timingChipText}>
                          Fast {timingRule.fastBeforeMin} min before
                        </Text>
                      </View>
                    )}
                    {timingRule.fastAfterMin && (
                      <View style={styles.timingChip}>
                        <Ionicons name="arrow-forward-outline" size={12} color="#6B7280" />
                        <Text style={styles.timingChipText}>
                          Fast {timingRule.fastAfterMin} min after
                        </Text>
                      </View>
                    )}
                    {timingRule.suggestedTime && (
                      <View style={styles.timingChip}>
                        <Ionicons name="moon-outline" size={12} color="#6B7280" />
                        <Text style={styles.timingChipText}>
                          Best: {timingRule.suggestedTime}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </GlassCard>
            )}

            {/* Storage */}
            {protocol.storageNotes && (
              <GlassCard style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="snow" size={20} color="#E89672" />
                  <Text style={styles.sectionTitle}>Storage</Text>
                </View>
                <Text style={styles.sectionText}>{protocol.storageNotes}</Text>
              </GlassCard>
            )}

            {/* Pregnancy / nursing contraindication hit */}
            {isPregnantOrNursing &&
              protocol.contraindications &&
              protocol.contraindications.some((c: string) =>
                /pregnan|nursing|breastfeed/i.test(c),
              ) && (
                <GlassCard style={{ ...styles.section, ...styles.pregWarnCard }}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="alert-circle" size={22} color="#B91C1C" />
                    <Text style={[styles.sectionTitle, { color: '#B91C1C' }]}>
                      Not recommended during pregnancy / nursing
                    </Text>
                  </View>
                  <Text style={[styles.sectionText, { color: '#B91C1C' }]}>
                    Your health profile indicates you're pregnant or nursing. This peptide is
                    contraindicated in that scenario per research protocols. Please consult a
                    licensed provider before proceeding.
                  </Text>
                </GlassCard>
              )}

            {/* Side effects */}
            {protocol.contraindications && protocol.contraindications.length > 0 && (
              <GlassCard variant="accent" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="warning" size={20} color="#F4ECC2" />
                  <Text style={styles.sectionTitle}>Watch For</Text>
                </View>
                {protocol.contraindications.map((c: string, i: number) => (
                  <View key={i} style={styles.warningRow}>
                    <Ionicons name="alert-circle-outline" size={14} color="#F4ECC2" />
                    <Text style={styles.warningText}>{c}</Text>
                  </View>
                ))}
              </GlassCard>
            )}
          </>
        )}

        {!protocol && (
          <GlassCard style={styles.section}>
            <Text style={styles.sectionText}>
              No standardized protocol available for this peptide yet.
              Ask Aimee for personalized guidance based on your goals.
            </Text>
            <AnimatedPress
              onPress={() => router.push('/(tabs)/peptalk' as any)}
              style={styles.askAimeeBtn}
            >
              <LinearGradient colors={['#A4D9D1', '#B8913D']} style={styles.askAimeeBtnGradient}>
                <Ionicons name="chatbubble" size={16} color="#fff" />
                <Text style={styles.askAimeeBtnText}>Ask Aimee</Text>
              </LinearGradient>
            </AnimatedPress>
          </GlassCard>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          This information is for educational purposes only. Confirm this protocol
          with your healthcare provider before starting any peptide regimen.
        </Text>

        {/* Log to calendar */}
        {protocol && (
          <AnimatedPress
            onPress={() => {
              Alert.alert(
                'Log to Calendar',
                `Add ${selectedPeptide.name} to your dose tracking?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Log It', onPress: () => router.push('/(tabs)/calendar' as any) },
                ]
              );
            }}
          >
            <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.logBtn}>
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={styles.logBtnText}>Log to Calendar</Text>
            </LinearGradient>
          </AnimatedPress>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText, flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.md, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, fontSize: FontSizes.md, color: Colors.darkText },
  weightNote: {
    fontSize: FontSizes.xs, color: Colors.iceMeltDeep,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },

  // Peptide list
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  peptideRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  peptideDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.iceMeltDeep,
  },
  peptideInfo: { flex: 1 },
  peptideName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  peptideCats: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 1 },

  // Sections
  section: { marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  sectionText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 20 },

  // Dose grid
  doseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  doseItem: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: BorderRadius.sm, padding: Spacing.sm,
  },
  doseLabel: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginBottom: 2 },
  doseValue: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  weightCalc: {
    fontSize: FontSizes.xs, color: Colors.iceMeltDeep,
    marginTop: Spacing.sm, fontStyle: 'italic',
  },

  // Steps
  stepList: { gap: Spacing.sm },
  step: { flexDirection: 'row', gap: Spacing.sm },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
    textAlign: 'center', lineHeight: 24,
    fontSize: FontSizes.sm, fontWeight: '700', color: Colors.iceMeltDeep,
  },
  stepText: { flex: 1, fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 20 },

  // Injection card
  injectionCard: { marginTop: Spacing.md, alignItems: 'center' },
  injectionTitle: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  injectionValue: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.darkText, marginVertical: 4 },
  injectionUnits: { fontSize: FontSizes.sm, color: Colors.iceMeltDeep, fontWeight: '600' },
  injectionDetail: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 4, textAlign: 'center' },
  conversionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(122,190,208,0.08)',
    borderRadius: BorderRadius.md,
  },
  conversionNoteText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    lineHeight: 16,
  },
  doseConversion: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // Duration
  durationText: { fontSize: FontSizes.sm, color: Colors.iceMeltDeep, marginTop: Spacing.sm, fontWeight: '500' },

  // Warnings
  warningRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginBottom: 4 },
  warningText: { flex: 1, fontSize: FontSizes.sm, color: Colors.darkTextSecondary },
  pregWarnCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  timingCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  timingMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  timingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  timingChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },

  // Ask Aimee
  askAimeeBtn: { marginTop: Spacing.md },
  askAimeeBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    height: 44, borderRadius: BorderRadius.md,
  },
  askAimeeBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '600' },

  // Disclaimer
  disclaimer: {
    fontSize: FontSizes.xs, color: 'rgba(0,0,0,0.15)',
    textAlign: 'center', lineHeight: 16,
    marginVertical: Spacing.md,
  },

  // Log button
  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    height: 52, borderRadius: BorderRadius.md,
  },
  logBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
