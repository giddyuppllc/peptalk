/**
 * Calculators Hub — links to Dosing and Reconstitution calculators.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius, Gradients } from '../../src/constants/theme';

export default function CalculatorsHubScreen() {
  const router = useRouter();
  const t = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Calculators</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Pick your peptide — we'll handle the math.
        </Text>

        {/*
         * Hub restructure 2026-05-16:
         *  - Primary  → Dosing Calculator (`dosing.tsx`). Their Wave 76.4
         *    work baked Edward's authoritative dosing reference into this
         *    screen, so it's the canonical source of truth for what to draw.
         *  - Secondary → Quick Dose Guide (`quick-dose.tsx`). Lighter
         *    peptide-first walk-through that includes the mcg/mg
         *    conversion footer Jamie asked for.
         *  - Hidden    → Plan Your Cycle (still on disk for parts).
         */}

        {/* Dosing Calculator — primary, with Edward's authoritative data */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/doses/calculator')}
        >
          <LinearGradient
            colors={['#3E7CB1', '#7FB3D8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.card, styles.primaryCard]}
          >
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name="calculator" size={32} color="#fff" />
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: '#fff' }]}>Dosing Calculator</Text>
              <Text style={[styles.cardDesc, { color: 'rgba(255,255,255,0.85)' }]}>
                Pick a peptide and we'll show Edward's recommended ladder, draw amount
                in ticks, mL, and mcg — plus doses per vial.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/*
         * Quick Dose Guide HIDDEN 2026-05-16 — audit caught that
         * quick-dose.tsx hardcodes vialMg=5/waterMl=2 for every peptide
         * (src/data/protocols.ts is consulted but not Edward's reference
         * in peptideDosingReference.ts). Result: 2× concentration error
         * on semaglutide, 2× under-draw on retatrutide. Until that
         * screen is rewired through getDosingReference(), don't surface
         * it. dosing.tsx above is the source of truth.
         */}

        {/* Reconstitution Calculator — separate purpose: vial math only, not dosing */}
        <Text style={[styles.advancedLabel, { color: t.textSecondary }]}>ADVANCED TOOLS</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/calculators/reconstitution')}
        >
          <LinearGradient
            colors={t.isDark ? [Gradients.card[0], Gradients.card[1]] : [t.card, t.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, { borderColor: t.glassBorder }]}
          >
            <View style={[styles.cardIcon, { backgroundColor: t.glass }]}>
              <Ionicons name="flask-outline" size={32} color={Colors.iceMeltDeep} />
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: t.text }]}>Reconstitution Calculator</Text>
              <Text style={[styles.cardDesc, { color: t.textSecondary }]}>
                Determine concentration, injection volume, and doses per vial when mixing
                lyophilized peptides with bacteriostatic water.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={18} color={t.textSecondary} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            These calculators are informational tools only. Always consult a qualified healthcare
            provider before starting any peptide protocol.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },

  // Cards
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryCard: {
    borderWidth: 0,
    marginBottom: Spacing.lg,
    shadowColor: '#7ABED0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  advancedLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  cardContent: { flex: 1, marginRight: Spacing.sm },
  cardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    lineHeight: 16,
  },
});
