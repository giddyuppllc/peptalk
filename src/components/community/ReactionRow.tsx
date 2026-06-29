/**
 * ReactionRow — three reaction buttons (Helpful / Like / ⚠ Dose warning)
 * with optimistic toggle.
 *
 * Used on both PostDetail and individual comments. The store hydrates
 * per-target reaction membership when a post detail opens
 * (reactionsByTarget), so the row knows which kinds the current user has
 * already reacted with and toggles instead of always incrementing. Server
 * enforces uniqueness via the (user_id, post_id|comment_id, kind) index.
 */

import React, { useEffect, useState } from 'react';
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

  // Per-target reaction membership hydrated by hydratePostDetail. Keyed by
  // commentId for comment rows, postId for the post row. May be undefined
  // until the detail finishes loading, then arrives as a (possibly empty)
  // array. P3.11.
  const targetKey = commentId ?? postId ?? '';
  const memberKinds = useCommunityStore((s) => s.reactionsByTarget[targetKey]);

  const buildActive = (kinds: CommunityReactionKind[] | undefined): Record<CommunityReactionKind, boolean> => ({
    helpful: !!kinds?.includes('helpful'),
    like: !!kinds?.includes('like'),
    dose_warning: !!kinds?.includes('dose_warning'),
  });

  // Seed from membership so re-reacting toggles off instead of double-counting.
  const [active, setActive] = useState<Record<CommunityReactionKind, boolean>>(() => buildActive(memberKinds));
  const [count, setCount] = useState(initialCount);

  // Membership may land after first render (detail loads async), and the
  // store row is updated on every toggle — resync so this row reflects the
  // authoritative membership. Keyed on the kinds string so it only fires on
  // an actual change, never clobbering an in-flight optimistic toggle of
  // the same value.
  const memberSig = (memberKinds ?? []).slice().sort().join(',');
  useEffect(() => {
    setActive(buildActive(memberKinds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSig]);

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
