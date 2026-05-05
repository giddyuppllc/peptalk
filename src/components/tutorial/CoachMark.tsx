/**
 * CoachMark — one-off tooltip for per-feature first-visit hints.
 *
 * Unlike the full TutorialOverlay, this is a small banner that appears at
 * the top of a tab/screen on first visit and dismisses on tap. Each mark
 * is keyed so it only shows once per user (persisted in useTutorialStore).
 *
 * Usage:
 *   <CoachMark
 *     id="first_nutrition_visit"
 *     title="Track everything you eat"
 *     body="Tap + Add on any meal section to search, scan, or voice-log a food."
 *   />
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTutorialStore } from '../../store/useTutorialStore';
import { useTheme } from '../../hooks/useTheme';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface CoachMarkProps {
  id: string;
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function CoachMark({ id, title, body, icon = 'bulb-outline' }: CoachMarkProps) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const hasSeen = useTutorialStore((state) => state.seenCoachMarks[id]);
  const markSeen = useTutorialStore((state) => state.markCoachMarkSeen);

  if (hasSeen) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(400).springify()}
      exiting={reduceMotion ? undefined : FadeOut.duration(200)}
      style={[styles.wrapper, { backgroundColor: `${t.primary}12`, borderColor: `${t.primary}40` }]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${t.primary}22` }]}>
        <Ionicons name={icon} size={16} color={t.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>{body}</Text>
      </View>
      <TouchableOpacity
        onPress={() => markSeen(id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
      >
        <Ionicons name="close" size={16} color={t.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    marginBottom: 2,
  },
  body: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 16,
  },
  closeBtn: {
    padding: 2,
  },
});

export default CoachMark;
