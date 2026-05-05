/**
 * CalculatorSectionTabs — horizontal swipeable tab strip pinned above
 * the calculator results. Tap a tab to scroll the parent to that
 * section. Visually communicates "there are more sections than fit on
 * screen" without forcing the user into a strict carousel.
 *
 * Combined with CollapsibleSection, this gives Edward's "accordion in
 * a carousel" feel: each section card collapses, tabs at top quick-nav
 * to any section, swipe-scroll the tab strip to see them all.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';

export interface CalculatorTab {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** When false, the tab is greyed out (e.g. "Activate" before user
   *  has run the calculation). Tap still works — the parent decides
   *  what to do (often: scroll to it + show a toast). */
  enabled?: boolean;
}

interface CalculatorSectionTabsProps {
  tabs: CalculatorTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function CalculatorSectionTabs({
  tabs,
  activeId,
  onSelect,
}: CalculatorSectionTabsProps) {
  const t = useTheme();

  return (
    <View style={[styles.wrap, { borderBottomColor: t.cardBorder }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const enabled = tab.enabled !== false;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onSelect(tab.id)}
              style={[
                styles.tab,
                {
                  borderColor: active ? t.primary : t.cardBorder,
                  backgroundColor: active ? t.primary + '14' : 'transparent',
                  opacity: enabled ? 1 : 0.45,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={active ? t.primary : t.textSecondary}
              />
              <Text
                style={[
                  styles.label,
                  { color: active ? t.primary : t.text },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingBottom: Spacing.sm,
  },
  row: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: FontSizes.xs, fontWeight: '700' },
});
