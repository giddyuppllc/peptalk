/**
 * ReportRibbon — bottom-of-home Aimee report CTA (§4.4 / §4.5).
 *
 * Female: soft rose→lavender gradient pill.
 * Male: oxblood→oxblood-deep gradient pill.
 *
 * Phase A: static placeholder text "Your Week N Report is ready ›".
 * Phase F2 wires it to the report-generation pipeline so the ribbon
 * only appears when a report is actually ready, and tap navigates to
 * the rendered report.
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapLight } from '../../utils/haptics';

interface Props {
  /** Override label (e.g. "Your Week 6 Report is ready"). */
  label?: string;
  onPress?: () => void;
}

export function ReportRibbon({
  label = 'Your Week 6 Report is ready',
  onPress,
}: Props) {
  const t = useV3Theme();

  const handlePress = () => {
    tapLight();
    if (onPress) onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to view.`}
    >
      <LinearGradient
        colors={[
          (t.colors as any).reportRibbonStart,
          (t.colors as any).reportRibbonEnd,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.ribbon, { borderRadius: t.radius.pill }]}
      >
        <View style={styles.row}>
          <Ionicons
            name="sparkles"
            size={14}
            color={t.isDark ? (t.colors.textPrimary as string) : '#fff'}
          />
          <Text
            style={{
              fontFamily: t.typography.bodyBold,
              fontSize: 13,
              color: t.isDark ? (t.colors.textPrimary as string) : '#fff',
              letterSpacing: 0.2,
            }}
          >
            {label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={t.isDark ? (t.colors.textPrimary as string) : '#fff'}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    marginTop: 14,
  },
  ribbon: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
