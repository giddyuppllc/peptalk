/**
 * Shared pieces for the leaderboard and milestones screens (v3 theme).
 *
 * Colours come from theme tokens only. Highlights use `semanticPositive` and
 * the text tokens — no gradient text, no orange accents.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { LEADERBOARD_COPY, shoutoutText } from '../../constants/leaderboardCopy';
import type { LeaderboardRow, ShoutoutRow } from '../../lib/leaderboardPayload';

/** The name a row shows: display name, else @handle, else the neutral fallback. */
export function leaderboardName(row: { displayName: string | null; username: string | null }): string {
  if (row.displayName && row.displayName.trim()) return row.displayName.trim();
  if (row.username && row.username.trim()) return `@${row.username.trim()}`;
  return LEADERBOARD_COPY.memberFallbackName;
}

function initials(name: string): string {
  return name
    .replace(/^@/, '')
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function LeaderboardAvatar({ uri, name, size = 36 }: { uri: string | null; name: string; size?: number }) {
  const t = useV3Theme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.divider as string,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} cachePolicy="memory-disk" transition={150} />
      ) : (
        <Text style={{ color: t.colors.textSecondary as string, fontFamily: t.typography.bodyBold, fontSize: size * 0.36 }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

export function LeaderboardRowView({
  row,
  valueLabel,
  onLongPress,
}: {
  row: LeaderboardRow;
  valueLabel: string;
  onLongPress?: () => void;
}) {
  const t = useV3Theme();
  const name = leaderboardName(row);
  const positive = t.colors.semanticPositive as string;
  return (
    <Pressable
      onLongPress={row.isSelf ? undefined : onLongPress}
      accessibilityRole="text"
      accessibilityLabel={`${row.rank}. ${name}, ${valueLabel}`}
      accessibilityHint={row.isSelf ? undefined : LEADERBOARD_COPY.rowA11yHint}
      style={[
        styles.row,
        { borderBottomColor: t.colors.divider as string },
        row.isSelf && { backgroundColor: `${positive}1F`, borderRadius: 12 },
      ]}
    >
      <Text style={[styles.rank, { color: t.colors.textSecondary as string, fontFamily: t.typography.bodyBold }]}>
        {row.rank}
      </Text>
      <LeaderboardAvatar uri={row.avatarUrl} name={name} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, color: t.colors.textPrimary as string, fontFamily: t.typography.bodyMedium, fontSize: 14 }}
        >
          {name}
        </Text>
        {row.isSelf ? (
          <View style={[styles.youBadge, { borderColor: positive }]}>
            <Text style={{ color: positive, fontFamily: t.typography.bodyBold, fontSize: 10 }}>
              {LEADERBOARD_COPY.youBadge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: t.colors.textPrimary as string, fontFamily: t.typography.bodyBold, fontSize: 14 }}>
        {valueLabel}
      </Text>
    </Pressable>
  );
}

export function ShoutoutRowView({ row, onLongPress }: { row: ShoutoutRow; onLongPress?: () => void }) {
  const t = useV3Theme();
  const name = leaderboardName(row);
  const text = shoutoutText(name, row.kind, row.threshold);
  return (
    <Pressable
      onLongPress={row.isSelf ? undefined : onLongPress}
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityHint={row.isSelf ? undefined : LEADERBOARD_COPY.rowA11yHint}
      style={[styles.row, { borderBottomColor: t.colors.divider as string }]}
    >
      <LeaderboardAvatar uri={row.avatarUrl} name={name} size={30} />
      <Text style={{ flex: 1, color: t.colors.textPrimary as string, fontFamily: t.typography.body, fontSize: 13, lineHeight: 18 }}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 22, textAlign: 'center', fontSize: 13 },
  youBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
});
