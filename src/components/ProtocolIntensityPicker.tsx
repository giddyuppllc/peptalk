/**
 * ProtocolIntensityPicker — three-tier dose intensity selector:
 *
 *   - Mild: lower bound of typical research range (cautious entry, taper-up
 *     friendly, recommended for first-cycle users)
 *   - Standard: mid-range (the default — what published protocols target
 *     for most outcomes)
 *   - Aggressive: upper bound of typical range (max-effect for experienced
 *     users with established tolerance)
 *
 * The picker derives doses from the protocol template's typicalDose range.
 * Aggressive does NOT exceed the published max — it's "upper end of typical,"
 * not "above typical." This keeps the math grounded in research without the
 * app encouraging supraphysiologic dosing.
 *
 * The chosen intensity flows into ProtocolPlanCard + SuppliesEstimatorCard
 * so the cycle math + supply counts reflect the user's pick.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import type { ProtocolTemplate, DoseUnit } from '../types';

export type ProtocolIntensity = 'mild' | 'standard' | 'aggressive';

interface ProtocolIntensityPickerProps {
  protocol: ProtocolTemplate;
  value: ProtocolIntensity;
  onChange: (intensity: ProtocolIntensity) => void;
}

interface IntensityOption {
  key: ProtocolIntensity;
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
}

const OPTIONS: IntensityOption[] = [
  {
    key: 'mild',
    label: 'Mild',
    hint: 'Cautious start',
    icon: 'leaf-outline',
    tint: '#6FA891',
  },
  {
    key: 'standard',
    label: 'Standard',
    hint: 'Most-used target',
    icon: 'medkit-outline',
    tint: '#3E7CB1',
  },
  {
    key: 'aggressive',
    label: 'Aggressive',
    hint: 'Upper end of typical',
    icon: 'flash-outline',
    tint: '#B45309',
  },
];

/**
 * Derive a dose value (in mcg) for the chosen intensity from the protocol's
 * typical dose range. Mild = min, Standard = midpoint, Aggressive = max.
 */
export function intensityToDoseMcg(
  protocol: ProtocolTemplate,
  intensity: ProtocolIntensity,
): { mcg: number; displayUnit: DoseUnit } {
  const { typicalDose } = protocol;
  const minMcg = typicalDose.unit === 'mg' ? typicalDose.min * 1000 : typicalDose.min;
  const maxMcg = typicalDose.unit === 'mg' ? typicalDose.max * 1000 : typicalDose.max;
  const midMcg = (minMcg + maxMcg) / 2;
  const mcg =
    intensity === 'mild'       ? minMcg :
    intensity === 'aggressive' ? maxMcg :
    midMcg;
  return { mcg, displayUnit: typicalDose.unit };
}

/**
 * Build a (min, max) dose range pair shifted by intensity. Used by the
 * Cycle plan + Supplies estimator so range-based math (total dose over
 * cycle, vials needed) reflects the chosen intensity.
 *
 *   - Mild:       lower-third of typical range
 *   - Standard:   full typical range (default behavior)
 *   - Aggressive: upper-third of typical range
 */
export function intensityToDoseRangeMcg(
  protocol: ProtocolTemplate,
  intensity: ProtocolIntensity,
): { min: number; max: number } {
  const { typicalDose } = protocol;
  const minMcg = typicalDose.unit === 'mg' ? typicalDose.min * 1000 : typicalDose.min;
  const maxMcg = typicalDose.unit === 'mg' ? typicalDose.max * 1000 : typicalDose.max;
  const span = maxMcg - minMcg;
  if (intensity === 'mild') {
    return { min: minMcg, max: minMcg + span * 0.33 };
  }
  if (intensity === 'aggressive') {
    return { min: minMcg + span * 0.66, max: maxMcg };
  }
  return { min: minMcg, max: maxMcg };
}

export function ProtocolIntensityPicker({
  protocol,
  value,
  onChange,
}: ProtocolIntensityPickerProps) {
  const t = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: t.textSecondary }]}>Protocol intensity</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const active = opt.key === value;
          const { mcg } = intensityToDoseMcg(protocol, opt.key);
          const display =
            mcg >= 1000 ? `${(mcg / 1000).toFixed(mcg >= 10000 ? 1 : 2)} mg` : `${Math.round(mcg)} mcg`;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onChange(opt.key)}
              style={[
                styles.tile,
                {
                  borderColor: active ? opt.tint : t.cardBorder,
                  backgroundColor: active ? opt.tint + '14' : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.label} intensity, target ${display}`}
            >
              <Ionicons
                name={opt.icon}
                size={18}
                color={active ? opt.tint : t.textSecondary}
              />
              <Text style={[styles.tileLabel, { color: active ? opt.tint : t.text }]}>
                {opt.label}
              </Text>
              <Text style={[styles.tileHint, { color: t.textSecondary }]} numberOfLines={1}>
                {opt.hint}
              </Text>
              <Text style={[styles.tileDose, { color: active ? opt.tint : t.text }]}>
                {display}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.note, { color: t.textSecondary }]}>
        All three options stay inside the published research range.
        Aggressive doesn't exceed the protocol's documented max.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 4,
  },
  tileLabel: { fontSize: FontSizes.sm, fontWeight: '700' },
  tileHint: { fontSize: 10, marginTop: 1 },
  tileDose: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  note: { fontSize: 11, fontStyle: 'italic', lineHeight: 15 },
});
