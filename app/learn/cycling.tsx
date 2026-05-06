/**
 * Peptide Cycling Education — Why cycling matters, receptor desensitization,
 * and how to structure on/off periods for different peptide classes.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../src/constants/theme';

interface CycleGuide {
  peptideClass: string;
  icon: string;
  color: string;
  onPeriod: string;
  offPeriod: string;
  reason: string;
  examples: string[];
}

const CYCLE_GUIDES: CycleGuide[] = [
  {
    peptideClass: 'GH Secretagogues',
    icon: 'trending-up-outline',
    color: '#E89672',
    onPeriod: '5 days on / 2 days off',
    offPeriod: '8-12 weeks on, then 4-6 weeks off',
    reason: 'GHRH receptors desensitize with continuous stimulation. Cycling preserves pituitary sensitivity and natural GH pulsatility.',
    examples: ['CJC-1295', 'Ipamorelin', 'GHRP-6', 'GHRP-2', 'Sermorelin'],
  },
  {
    peptideClass: 'GLP-1 Agonists',
    icon: 'scale-outline',
    color: '#22c55e',
    onPeriod: 'Daily (dose titration over 4-8 weeks)',
    offPeriod: 'Discuss tapering schedule with your doctor',
    reason: 'GLP-1 receptors can downregulate. Clinical protocols use gradual dose escalation. Abrupt cessation can cause rebound appetite.',
    examples: ['Semaglutide', 'Tirzepatide', 'Retatrutide'],
  },
  {
    peptideClass: 'Healing Peptides',
    icon: 'bandage-outline',
    color: '#e3a7a1',
    onPeriod: '4-8 weeks (until injury resolved)',
    offPeriod: '2-4 weeks off before next cycle',
    reason: 'BPC-157 and TB-500 are used in targeted cycles for specific injuries. Extended use beyond healing may have diminishing returns.',
    examples: ['BPC-157', 'TB-500', 'KPV', 'GHK-Cu'],
  },
  {
    peptideClass: 'Nootropics',
    icon: 'bulb-outline',
    color: '#A4D9D1',
    onPeriod: '10-20 days on',
    offPeriod: '10-20 days off',
    reason: 'BDNF and neurotransmitter receptor systems adapt to exogenous stimulation. Cycling prevents tolerance and preserves cognitive benefit.',
    examples: ['Semax', 'Selank', 'Pinealon', 'Dihexa'],
  },
  {
    peptideClass: 'Longevity / Telomere',
    icon: 'infinite-outline',
    color: '#E89672',
    onPeriod: '10-20 days, twice yearly',
    offPeriod: '5-6 months between cycles',
    reason: 'Epithalon follows the original Khavinson protocol — short intense cycles stimulate telomerase, then the body maintains elevated activity for months.',
    examples: ['Epithalon', 'Thymalin'],
  },
  {
    peptideClass: 'Metabolic / Fat Loss',
    icon: 'flame-outline',
    color: '#F4ECC2',
    onPeriod: '8-12 weeks',
    offPeriod: '4-8 weeks off',
    reason: 'Metabolic peptides can shift baseline metabolic rate. Cycling prevents metabolic adaptation and allows hormonal systems to re-equilibrate.',
    examples: ['AOD-9604', 'Tesamorelin', '5-Amino-1MQ', 'MOTS-c'],
  },
  {
    peptideClass: 'Immune Support',
    icon: 'shield-outline',
    color: '#E89672',
    onPeriod: '2-4 weeks during illness or seasonally',
    offPeriod: 'Use as needed, not continuously',
    reason: 'Thymic peptides modulate T-cell function. Chronic use may lead to immune system over-stimulation. Short targeted cycles are preferred.',
    examples: ['Thymosin Alpha-1', 'LL-37'],
  },
];

export default function CyclingEducationScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPress onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <Text style={styles.headerTitle}>Peptide Cycling</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <GlassCard variant="accent" style={styles.introCard}>
          <Ionicons name="warning-outline" size={24} color={Colors.rose} />
          <Text style={styles.introTitle}>Why Cycling Matters</Text>
          <Text style={styles.introText}>
            Using peptides continuously without breaks can lead to receptor desensitization,
            where your body's receptors become less responsive over time. This is similar to
            how caffeine tolerance develops — your body adapts and requires more to achieve
            the same effect.
          </Text>
          <Text style={styles.introText}>
            Cycling — alternating periods of use and rest — allows receptor populations to
            recover and maintain sensitivity. This approach is backed by receptor pharmacology
            research and is a key principle in peptide protocols.
          </Text>
        </GlassCard>

        {/* Receptor Science */}
        <Text style={styles.sectionTitle}>The Science</Text>
        <GlassCard style={styles.scienceCard}>
          <View style={styles.scienceRow}>
            <View style={[styles.scienceDot, { backgroundColor: '#ef4444' }]} />
            <View style={styles.scienceContent}>
              <Text style={styles.scienceLabel}>Receptor Downregulation</Text>
              <Text style={styles.scienceText}>
                Continuous agonist exposure causes cells to internalize or reduce surface
                receptors. Fewer receptors = weaker response to the same dose.
              </Text>
            </View>
          </View>
          <View style={styles.scienceRow}>
            <View style={[styles.scienceDot, { backgroundColor: '#F4ECC2' }]} />
            <View style={styles.scienceContent}>
              <Text style={styles.scienceLabel}>Tachyphylaxis</Text>
              <Text style={styles.scienceText}>
                Rapid tolerance development where increasing doses are needed. Common
                with GHRH analogs and some metabolic peptides when used without breaks.
              </Text>
            </View>
          </View>
          <View style={styles.scienceRow}>
            <View style={[styles.scienceDot, { backgroundColor: '#22c55e' }]} />
            <View style={styles.scienceContent}>
              <Text style={styles.scienceLabel}>Receptor Recovery</Text>
              <Text style={styles.scienceText}>
                Off periods allow receptor recycling and upregulation. Most receptor
                populations recover within 2-6 weeks depending on the signaling pathway.
              </Text>
            </View>
          </View>
          <View style={styles.scienceRow}>
            <View style={[styles.scienceDot, { backgroundColor: '#E89672' }]} />
            <View style={styles.scienceContent}>
              <Text style={styles.scienceLabel}>Gene Expression Concerns</Text>
              <Text style={styles.scienceText}>
                Prolonged receptor stimulation can alter gene expression patterns in target
                tissues. While most changes are reversible, chronic use without cycling may
                lead to more persistent epigenetic modifications. This is an active area of research.
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Cycle guides by class */}
        <Text style={styles.sectionTitle}>Cycling by Peptide Class</Text>
        {CYCLE_GUIDES.map((guide) => (
          <GlassCard key={guide.peptideClass} style={styles.guideCard}>
            <View style={styles.guideHeader}>
              <View style={[styles.guideIcon, { backgroundColor: `${guide.color}20` }]}>
                <Ionicons name={guide.icon as any} size={20} color={guide.color} />
              </View>
              <Text style={styles.guideTitle}>{guide.peptideClass}</Text>
            </View>

            <View style={styles.scheduleRow}>
              <View style={styles.scheduleItem}>
                <Text style={styles.scheduleLabel}>ON</Text>
                <Text style={styles.scheduleValue}>{guide.onPeriod}</Text>
              </View>
              <View style={styles.scheduleDivider} />
              <View style={styles.scheduleItem}>
                <Text style={[styles.scheduleLabel, { color: Colors.rose }]}>OFF</Text>
                <Text style={styles.scheduleValue}>{guide.offPeriod}</Text>
              </View>
            </View>

            <Text style={styles.guideReason}>{guide.reason}</Text>

            <View style={styles.exampleRow}>
              {guide.examples.map((ex) => (
                <View key={ex} style={[styles.examplePill, { borderColor: `${guide.color}40` }]}>
                  <Text style={[styles.exampleText, { color: guide.color }]}>{ex}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        ))}

        {/* Disclaimer */}
        <GlassCard style={styles.disclaimerCard}>
          <Ionicons name="medical-outline" size={20} color={Colors.darkTextSecondary} />
          <Text style={styles.disclaimerText}>
            This information is for educational purposes only. Cycling protocols vary by
            individual, health status, and goals. Always discuss any peptide protocol with
            your healthcare provider before starting or modifying your regimen.
          </Text>
        </GlassCard>

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
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  scroll: { paddingHorizontal: Spacing.lg },

  sectionTitle: {
    fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },

  // Intro
  introCard: { gap: Spacing.sm, marginBottom: Spacing.sm },
  introTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText },
  introText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 20 },

  // Science
  scienceCard: { gap: Spacing.md },
  scienceRow: { flexDirection: 'row', gap: Spacing.sm },
  scienceDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  scienceContent: { flex: 1 },
  scienceLabel: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText, marginBottom: 2 },
  scienceText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 18 },

  // Guide cards
  guideCard: { marginBottom: Spacing.sm },
  guideHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  guideIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText },
  scheduleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  scheduleItem: { flex: 1 },
  scheduleLabel: {
    fontSize: FontSizes.xs, fontWeight: '700', color: Colors.pepTeal,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2,
  },
  scheduleValue: { fontSize: FontSizes.sm, color: Colors.darkText, fontWeight: '500' },
  scheduleDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: Spacing.md },
  guideReason: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 18, marginBottom: Spacing.sm },
  exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  examplePill: {
    borderWidth: 1, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  exampleText: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Disclaimer
  disclaimerCard: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
  disclaimerText: { flex: 1, fontSize: FontSizes.xs, color: Colors.darkTextSecondary, lineHeight: 16 },
});
