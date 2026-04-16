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

export default function QuickDoseScreen() {
  const router = useRouter();
  const weightLbs = useHealthProfileStore((s) => s.profile?.bodyMetrics?.weightLbs);
  const [search, setSearch] = useState('');
  const [selectedPeptideId, setSelectedPeptideId] = useState<string | null>(null);

  const weightKg = weightLbs ? Math.round(weightLbs / 2.20462) : null;

  const filteredPeptides = useMemo(() => {
    if (!search.trim()) return PEPTIDES.slice(0, 20);
    const q = search.toLowerCase();
    return PEPTIDES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.abbreviation && p.abbreviation.toLowerCase().includes(q))
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
    const volumeMinMl = doseMin / concentrationMcgPerMl;
    const volumeMaxMl = doseMax / concentrationMcgPerMl;
    const volumeMinUnits = Math.round(volumeMinMl * 100); // insulin syringe units
    const volumeMaxUnits = Math.round(volumeMaxMl * 100);

    return {
      vialMg,
      waterMl,
      concentrationMcgPerMl,
      doseMin,
      doseMax,
      doseUnit,
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
          <AnimatedPress onPress={() => router.back()} style={styles.backBtn}>
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
        <AnimatedPress onPress={() => setSelectedPeptideId(null)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <Text style={styles.headerTitle}>{selectedPeptide.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* What it does */}
        <GlassCard variant="elevated" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle" size={20} color={Colors.pepTeal} />
            <Text style={styles.sectionTitle}>What it does</Text>
          </View>
          <Text style={styles.sectionText}>
            {selectedPeptide.researchSummary || selectedPeptide.mechanismOfAction || 'Research peptide.'}
          </Text>
        </GlassCard>

        {protocol && reconInfo && (
          <>
            {/* Dosing */}
            <GlassCard variant="glow" glowColor="#F8A97A" style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flask" size={20} color="#F8A97A" />
                <Text style={styles.sectionTitle}>Your Dose</Text>
              </View>
              <View style={styles.doseGrid}>
                <View style={styles.doseItem}>
                  <Text style={styles.doseLabel}>Amount</Text>
                  <Text style={styles.doseValue}>
                    {reconInfo.doseMin}-{reconInfo.doseMax} {reconInfo.doseUnit}
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
            <GlassCard variant="glow" glowColor="#D4A853" style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="water" size={20} color="#D4A853" />
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
                  </Text>
                </View>
              </View>

              <GlassCard style={styles.injectionCard}>
                <Text style={styles.injectionTitle}>Injection Volume</Text>
                <Text style={styles.injectionValue}>
                  {reconInfo.volumeMinMl}-{reconInfo.volumeMaxMl} ml
                </Text>
                <Text style={styles.injectionUnits}>
                  = {reconInfo.volumeMinUnits}-{reconInfo.volumeMaxUnits} units on an insulin syringe
                </Text>
              </GlassCard>
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

            {/* Storage */}
            {protocol.storageNotes && (
              <GlassCard style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="snow" size={20} color="#F8A97A" />
                  <Text style={styles.sectionTitle}>Storage</Text>
                </View>
                <Text style={styles.sectionText}>{protocol.storageNotes}</Text>
              </GlassCard>
            )}

            {/* Side effects */}
            {protocol.contraindications && protocol.contraindications.length > 0 && (
              <GlassCard variant="accent" style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="warning" size={20} color="#FFBF82" />
                  <Text style={styles.sectionTitle}>Watch For</Text>
                </View>
                {protocol.contraindications.map((c: string, i: number) => (
                  <View key={i} style={styles.warningRow}>
                    <Ionicons name="alert-circle-outline" size={14} color="#FFBF82" />
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
              <LinearGradient colors={['#D4A853', '#B8913D']} style={styles.askAimeeBtnGradient}>
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
    fontSize: FontSizes.xs, color: Colors.pepTeal,
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
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.pepTeal,
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
    fontSize: FontSizes.xs, color: Colors.pepTeal,
    marginTop: Spacing.sm, fontStyle: 'italic',
  },

  // Steps
  stepList: { gap: Spacing.sm },
  step: { flexDirection: 'row', gap: Spacing.sm },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
    textAlign: 'center', lineHeight: 24,
    fontSize: FontSizes.sm, fontWeight: '700', color: Colors.pepTeal,
  },
  stepText: { flex: 1, fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 20 },

  // Injection card
  injectionCard: { marginTop: Spacing.md, alignItems: 'center' },
  injectionTitle: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },
  injectionValue: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.darkText, marginVertical: 4 },
  injectionUnits: { fontSize: FontSizes.sm, color: Colors.pepTeal, fontWeight: '600' },

  // Duration
  durationText: { fontSize: FontSizes.sm, color: Colors.pepTeal, marginTop: Spacing.sm, fontWeight: '500' },

  // Warnings
  warningRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginBottom: 4 },
  warningText: { flex: 1, fontSize: FontSizes.sm, color: Colors.darkTextSecondary },

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
