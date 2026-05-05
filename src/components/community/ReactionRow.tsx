/**
 * ReactionRow — three reaction buttons (Helpful / Like / ⚠ Dose warning)
 * with optimistic toggle.
 *
 * Used on both PostDetail and individual comments. Reaction state is
 * tracked locally per row since the store doesn't currently hydrate
 * per-target reaction membership (would require a separate query each
 * time; not worth the chatter for v1). Server enforces uniqueness via
 * the (user_id, post_id|comment_id, kind) unique index.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useCommunityStore } from '../../store/useCommunityStore';
import { FontSizes } from '../../constants/theme';
import type { CommunityReactionKind } from '../../types/community';

interface ReactionRowProps {
  postId?: string;
  commentId?: string;
  initialCount?: number;
}

const KINDS: { kind: CommunityReactionKind; icon: string; activeIcon: string; label: string; tint: string }[] = [
  { kind: 'helpful',      icon: 'medkit-outline',  activeIcon: 'medkit',  label: 'Helpful', tint: '#6FA891' },
  { kind: 'like',         icon: 'heart-outline',   activeIcon: 'heart',   label: 'Like',    tint: '#D98C86' },
  { kind: 'dose_warning', icon: 'warning-outline', activeIcon: 'warning', label: 'Caution', tint: '#B45309' },
];

export function ReactionRow({ postId, commentId, initialCount = 0 }: ReactionRowProps) {
  const t = useTheme();
  const toggleReaction = useCommunityStore((s) => s.toggleReaction);

  // Optimistic local state. We don't hydrate from server to keep the
  // row cheap; users see a momentary mismatch on app reopen if they
  // already reacted, but the count is server-authoritative.
  const [active, setActive] = useState<Record<CommunityReactionKind, boolean>>({
    helpful: false,
    like: false,
    dose_warning: false,
  });
  const [count, setCount] = useState(initialCount);

  const onTap = async (kind: CommunityReactionKind) => {
    const wasActive = active[kind];
    setActive((s) => ({ ...s, [kind]: !wasActive }));
    setCount((c) => c + (wasActive ? -1 : 1));
    const res = await toggleReaction(
      { postId, commentId, kind },
      wasActive,
    );
    if (!res.ok) {
      // Revert on error.
      setActive((s) => ({ ...s, [kind]: wasActive }));
      setCount((c) => c + (wasActive ? 1 : -1));
    }
  };

  return (
    <View style={styles.row}>
      {KINDS.map((k) => {
        const on = active[k.kind];
        return (
          <TouchableOpacity
            key={k.kind}
            onPress={() => onTap(k.kind)}
            style={[
              styles.btn,
              { borderColor: on ? k.tint : t.cardBorder, backgroundColor: on ? k.tint + '18' : 'transparent' },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${on ? 'Remove' : 'Add'} ${k.label} reaction`}
          >
            <Ionicons name={(on ? k.activeIcon : k.icon) as any} size={14} color={on ? k.tint : t.textSecondary} />
            <Text style={[styles.btnText, { color: on ? k.tint : t.textSecondary }]}>{k.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={{ flex: 1 }} />
      <Text style={[styles.count, { color: t.textSecondary }]}>{count} reactions</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  btnText: { fontSize: 11, fontWeight: '700' },
  count: { fontSize: 11, fontWeight: '600' },
});
