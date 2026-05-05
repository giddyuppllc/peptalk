/**
 * CollapsibleSection — wraps content in an expand/collapse card with a
 * chevron header. Used by the dosing calculator (and anywhere else)
 * to break up long stacked sections so the user can swipe through tabs
 * and pick what to expand.
 *
 * Pattern: section header always visible (title, hint, chevron).
 * Tap header → toggles expanded state. Children render inside an
 * Animated layout that resizes naturally because we just mount/unmount
 * the children — no measure-then-animate dance, which avoids the
 * Yoga-on-mount jank we'd hit with `Animated.Value` height tweens on
 * arbitrary content.
 *
 * `id` is forwarded so a parent CalculatorSectionTabs component can
 * find the section and ensure-visible / programmatically expand it
 * when a tab is tapped.
 */

import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  hint?: string;
  /** Ionicon name for the section header. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** When true, section starts expanded. Defaults to true so the
   *  user sees content out of the gate; tabs toggle to collapse. */
  defaultExpanded?: boolean;
  /** Notifies the parent of layout y so tab-tap can scroll to this
   *  section. */
  onLayoutY?: (id: string, y: number) => void;
  children: React.ReactNode;
}

export interface CollapsibleSectionRef {
  expand: () => void;
  collapse: () => void;
}

export const CollapsibleSection = forwardRef<CollapsibleSectionRef, CollapsibleSectionProps>(
  function CollapsibleSection(
    { id, title, hint, icon, defaultExpanded = true, onLayoutY, children },
    ref,
  ) {
    const t = useTheme();
    const [expanded, setExpanded] = useState(defaultExpanded);

    useImperativeHandle(ref, () => ({
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
    }));

    const handleLayout = (e: LayoutChangeEvent) => {
      onLayoutY?.(id, e.nativeEvent.layout.y);
    };

    return (
      <View style={styles.wrap} onLayout={handleLayout}>
        <GlassCard style={styles.card}>
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.7}
            style={styles.header}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          >
            {icon && (
              <View style={[styles.iconWrap, { backgroundColor: t.primary + '22' }]}>
                <Ionicons name={icon} size={16} color={t.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>{title}</Text>
              {hint && (
                <Text style={[styles.hint, { color: t.textSecondary }]} numberOfLines={2}>
                  {hint}
                </Text>
              )}
            </View>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={t.textSecondary}
            />
          </TouchableOpacity>

          {expanded && (
            <View style={[styles.body, { borderTopColor: t.cardBorder }]}>
              {children}
            </View>
          )}
        </GlassCard>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.sm },
  card: { padding: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  hint: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },
  body: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
  },
});
