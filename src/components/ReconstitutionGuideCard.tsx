/**
 * ReconstitutionGuideCard — procedural sterile-technique steps + storage.
 *
 * Edward's call: "this is about helping people and saving lives." The
 * calculator already shows the math; what was buried in PeptideGuide
 * was the actual technique — alcohol-pad sterility, swirl-don't-shake,
 * cold-chain storage, expiry tracking. Surfacing here as a dedicated
 * card so it's read, not skipped.
 *
 * Steps reflect CDC subcutaneous injection guidance + standard peptide
 * reconstitution practice. Storage uses the protocol's actual values
 * when present, falling back to research-default (lyo at -20°C, recon
 * at 2-8°C, use within 30 days).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import type { ProtocolTemplate } from '../types';

interface ReconstitutionGuideCardProps {
  protocol?: ProtocolTemplate;
  /** Optional vial mg (for the example math line at the top). */
  vialMg?: number;
  /** Optional BAC water mL. */
  bacWaterMl?: number;
}

const STERILITY_STEPS: { title: string; body: string; warn?: boolean }[] = [
  {
    title: 'Bring the vial to room temp',
    body:
      'Take the lyophilized vial out of the freezer and let it sit at room temperature for 15–20 minutes before opening. Pierces are easier and you avoid pressure-spitting when the cap comes off.',
  },
  {
    title: 'Wipe the stopper with an alcohol pad',
    body:
      'Sterilize the rubber stopper before every needle puncture. One pad per vial entry. Let it air-dry for ~10 seconds before piercing — pushing alcohol into the vial denatures peptide.',
  },
  {
    title: 'Draw bacteriostatic water with a sterile syringe',
    body:
      'Use the recommended BAC water volume for this peptide. Insert the needle through the freshly-wiped stopper and pull the plunger to draw the calculated mL.',
  },
  {
    title: 'Inject down the side of the vial — never directly onto the powder',
    body:
      'Tilt the vial and run the BAC water down the inner glass wall. Hitting the lyophilized cake straight-on damages the peptide and creates foam.',
    warn: true,
  },
  {
    title: 'Swirl gently. Do NOT shake or stir.',
    body:
      'Roll the vial between your palms or swirl in slow circles until the powder fully dissolves. Shaking introduces air, denatures the peptide, and ruins potency. Foam = bad.',
    warn: true,
  },
  {
    title: 'Confirm clarity',
    body:
      'A properly reconstituted solution should be clear and colorless (some peptides are very pale). Cloudiness, particles, or color changes mean the batch is compromised — don\'t inject.',
  },
  {
    title: 'Wipe the stopper again before every dose',
    body:
      'Each time you draw a dose, alcohol-pad the stopper. The same vial gets pierced 5-30 times during a cycle; assume the cap is non-sterile between uses.',
  },
  {
    title: 'Wipe the injection site',
    body:
      'Alcohol-pad the skin where you\'ll inject. Let it dry for ~10 seconds (wet alcohol stings on injection). Rotate sites — abdomen, thighs, upper-arm — to avoid lipohypertrophy.',
  },
];

const DEFAULT_LYO_STORAGE = 'Lyophilized: store at -20°C (-4°F), protected from light. Stable up to 24 months.';
const DEFAULT_RECON_STORAGE = 'Reconstituted: refrigerate at 2–8°C (35.6–46.4°F). Use within 30 days. Do not refreeze.';

export function ReconstitutionGuideCard({ protocol, vialMg, bacWaterMl }: ReconstitutionGuideCardProps) {
  const t = useTheme();

  const concentrationLine =
    vialMg && vialMg > 0 && bacWaterMl && bacWaterMl > 0
      ? `${vialMg} mg vial + ${bacWaterMl} mL BAC water = ${(vialMg / bacWaterMl).toFixed(1)} mg/mL`
      : null;

  const lyoStorage = protocol?.storageNotes ?? DEFAULT_LYO_STORAGE;
  const reconStorage = protocol?.reconstitutionNotes ?? DEFAULT_RECON_STORAGE;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: '#6FA89122' }]}>
          <Ionicons name="flask-outline" size={18} color="#6FA891" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>How to reconstitute safely</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Sterile technique keeps the peptide active and the user safe.
          </Text>
        </View>
      </View>

      {concentrationLine && (
        <View style={[styles.concRow, { backgroundColor: t.primary + '12' }]}>
          <Ionicons name="calculator-outline" size={14} color={t.primary} />
          <Text style={[styles.concText, { color: t.primary }]}>{concentrationLine}</Text>
        </View>
      )}

      <View style={[styles.stepsList, { borderTopColor: t.cardBorder }]}>
        {STERILITY_STEPS.map((step, idx) => (
          <View
            key={step.title}
            style={[
              styles.step,
              idx > 0 && { borderTopWidth: 1, borderTopColor: t.cardBorder },
            ]}
          >
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: step.warn ? '#B4530922' : t.primary + '22' },
              ]}
            >
              <Text style={[styles.stepNumberText, { color: step.warn ? '#B45309' : t.primary }]}>
                {idx + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.stepTitleRow}>
                {step.warn && (
                  <Ionicons name="warning" size={13} color="#B45309" />
                )}
                <Text style={[styles.stepTitle, { color: t.text }]}>{step.title}</Text>
              </View>
              <Text style={[styles.stepBody, { color: t.textSecondary }]}>
                {step.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.storageBlock, { borderTopColor: t.cardBorder }]}>
        <Text style={[styles.storageHeader, { color: t.text }]}>Storage</Text>
        <View style={styles.storageRow}>
          <Ionicons name="snow-outline" size={14} color={t.textSecondary} style={{ marginTop: 2 }} />
          <Text style={[styles.storageText, { color: t.textSecondary }]}>
            {lyoStorage}
          </Text>
        </View>
        <View style={styles.storageRow}>
          <Ionicons name="thermometer-outline" size={14} color={t.textSecondary} style={{ marginTop: 2 }} />
          <Text style={[styles.storageText, { color: t.textSecondary }]}>
            {reconStorage}
          </Text>
        </View>
      </View>

      <View style={[styles.disclaimerRow, { borderColor: t.cardBorder }]}>
        <Ionicons name="information-circle-outline" size={14} color={t.textSecondary} />
        <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
          Educational reference only. Consult a qualified provider before any peptide use.
          Use new sterile syringes — never reuse needles.
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },
  concRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  concText: { fontSize: FontSizes.xs, fontWeight: '700' },
  stepsList: {
    borderTopWidth: 1,
    paddingTop: 4,
  },
  step: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: { fontSize: 11, fontWeight: '800' },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepTitle: { fontSize: FontSizes.sm, fontWeight: '700', flex: 1 },
  stepBody: { fontSize: FontSizes.xs, lineHeight: 17, marginTop: 3 },
  storageBlock: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  storageHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  storageRow: { flexDirection: 'row', gap: 8 },
  storageText: { flex: 1, fontSize: FontSizes.xs, lineHeight: 17 },
  disclaimerRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 8,
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  disclaimerText: { flex: 1, fontSize: 10, lineHeight: 14, fontStyle: 'italic' },
});
