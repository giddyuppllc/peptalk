/**
 * SuppliesEstimatorCard — concrete shopping list for the cycle.
 *
 * Computes vials / syringes / BAC water / alcohol swabs needed at the
 * mid-point of the protocol's typical dose range, for three planning
 * horizons (1 week, 2 weeks, full cycle). Matches the practical
 * "Supplies Needed" section users expect on a dosing reference page —
 * peptide planning is supply-chain planning, and Edward's testers want
 * the totals up-front rather than mental-mathing them from the per-dose
 * numbers above.
 *
 * Math:
 *   - Doses per period = freqPerWeek × weeks
 *   - Total dose mcg = doses × midDose mcg
 *   - Vials needed = ceil(totalMcg / vialMcg) — only shown when the user
 *     has populated vial size on the calculator. Without that input the
 *     supplies card hides the vials cell and shows a hint.
 *   - Syringes needed = doses (one per injection, never reuse)
 *   - BAC water mL = vialsNeeded × bacWaterPerVial (default 2 mL when
 *     user hasn't set BAC water yet)
 *   - Alcohol swabs = doses × 2 (one for vial stopper, one for skin) — Edward's
 *     example uses this same per-injection ratio
 *
 * All numbers display as ranges when the protocol's dose has a typical
 * range, so users see the lower-bound + upper-bound supply needs.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import type { ProtocolTemplate } from '../types';
import { estimateSupplies, type ProtocolIntensity } from '../lib/protocolDoseMath';

interface SuppliesEstimatorCardProps {
  protocol: ProtocolTemplate;
  /** Vial concentration in mcg — when known, vials-needed cell renders.
   *  Without this, the cell hides and a hint asks user to fill in vial
   *  size on the calculator above. */
  vialMcg?: number;
  /** BAC water mL per vial, from the calculator. Defaults to 2 mL —
   *  the most common reconstitution volume across our protocol library. */
  bacWaterMl?: number;
  /** Mild / Standard / Aggressive — shifts the dose range used to count
   *  total vials needed. Defaults to Standard. */
  intensity?: ProtocolIntensity;
}

export function SuppliesEstimatorCard({ protocol, vialMcg, bacWaterMl, intensity }: SuppliesEstimatorCardProps) {
  const t = useTheme();

  // The arithmetic lives in src/lib/protocolDoseMath (estimateSupplies) so a
  // test can pin the vial count a user is told to buy; labels render verbatim.
  // Vials are derived from a mcg-per-vial amount, so the vial / BAC-water chain
  // only means anything for a MASS dose — an IU or ml protocol counts syringes
  // and swabs and says nothing about vials. `doseIsMassBased` decides whether
  // telling the user to "enter vial size" could ever produce an answer.
  const { periods, hasVialMath, doseIsMassBased } = useMemo(
    () => estimateSupplies(protocol, { vialMcg, bacWaterMl, intensity }),
    [protocol, vialMcg, bacWaterMl, intensity],
  );

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: t.primary + '22' }]}>
          <Ionicons name="cart-outline" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Supplies estimator</Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            What you'll need for each planning horizon
          </Text>
        </View>
      </View>

      <View style={[styles.table, { borderTopColor: t.cardBorder }]}>
        {/* Header row */}
        <View style={[styles.row, styles.headerRow, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.cellLeft, styles.headerText, { color: t.textSecondary }]}>Item</Text>
          {periods.map((p) => (
            <Text
              key={p.label}
              style={[styles.cell, styles.headerText, { color: t.textSecondary }]}
              numberOfLines={2}
            >
              {p.label}
            </Text>
          ))}
        </View>

        {/* Vials row */}
        <SupplyRow
          label="Vials"
          values={periods.map((p) => p.vialsLabel)}
          t={t}
          highlight
        />

        {/* Syringes row */}
        <SupplyRow
          label="Syringes (U-100)"
          values={periods.map((p) => p.syringesLabel)}
          t={t}
        />

        {/* BAC water row */}
        <SupplyRow
          label="BAC water"
          values={periods.map((p) => p.bacWaterLabel)}
          t={t}
        />

        {/* Alcohol swabs row */}
        <SupplyRow
          label="Alcohol swabs"
          values={periods.map((p) => p.swabsLabel)}
          t={t}
          last
        />
      </View>

      {!hasVialMath && (
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          {doseIsMassBased
            ? 'Enter vial size + BAC water above to see exact vials and BAC water totals.'
            : `This protocol is dosed in ${protocol.typicalDose.unit}, which doesn't convert to a vial weight — syringe and swab counts still apply.`}
        </Text>
      )}

      <Text style={[styles.note, { color: t.textSecondary }]}>
        Counts assume one syringe + two alcohol swabs per injection (vial stopper + skin).
        Buy a 100-count swab box if you'll cycle longer than 4 weeks.
      </Text>
    </GlassCard>
  );
}

interface SupplyRowProps {
  label: string;
  values: string[];
  t: ReturnType<typeof useTheme>;
  highlight?: boolean;
  last?: boolean;
}

function SupplyRow({ label, values, t, highlight, last }: SupplyRowProps) {
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
      ]}
    >
      <Text style={[styles.cellLeft, styles.bodyText, { color: t.text }]}>{label}</Text>
      {values.map((v, i) => (
        <Text
          key={`${label}-${i}`}
          style={[
            styles.cell,
            styles.bodyText,
            { color: highlight ? t.primary : t.text, fontWeight: highlight ? '700' : '500' },
          ]}
          numberOfLines={2}
        >
          {v}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.sm },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: FontSizes.xs, marginTop: 2 },
  table: { borderTopWidth: 1, marginTop: 4 },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
  },
  headerRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  cellLeft: {
    flex: 1.4,
    paddingHorizontal: 4,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  headerText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bodyText: { fontSize: FontSizes.xs, fontWeight: '500' },
  hint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  note: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
