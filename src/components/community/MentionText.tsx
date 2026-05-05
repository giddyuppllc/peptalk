/**
 * MentionText — renders post / comment body text with @mentions
 * highlighted and tappable. Tap navigates to /community/u/[username].
 *
 * Cheap regex-based detection: anything matching @username (alphanum +
 * underscore, 3-20 chars) becomes a TouchableOpacity inline. Doesn't
 * yet validate that the username actually exists — community/u/[username]
 * already gracefully shows "User not found" so the dead-link case
 * is non-destructive.
 *
 * @mention autocomplete in the composer is v1.5 — this is the read-side
 * surface so existing @-prefixed text already lights up.
 */

import React, { useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { FontSizes } from '../../constants/theme';

interface MentionTextProps {
  body: string;
  /** Match the surrounding text style. */
  style?: { color?: string; fontSize?: number; lineHeight?: number };
}

const MENTION_REGEX = /(@[a-zA-Z][a-zA-Z0-9_]{2,19})\b/g;

export function MentionText({ body, style }: MentionTextProps) {
  const t = useTheme();
  const router = useRouter();

  const segments = useMemo(() => {
    const out: { text: string; mention: boolean }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const re = new RegExp(MENTION_REGEX);
    while ((match = re.exec(body)) !== null) {
      if (match.index > lastIndex) {
        out.push({ text: body.slice(lastIndex, match.index), mention: false });
      }
      out.push({ text: match[1], mention: true });
      lastIndex = match.index + match[1].length;
    }
    if (lastIndex < body.length) {
      out.push({ text: body.slice(lastIndex), mention: false });
    }
    return out;
  }, [body]);

  const baseStyle = {
    color: style?.color ?? t.text,
    fontSize: style?.fontSize ?? FontSizes.sm,
    lineHeight: style?.lineHeight ?? 19,
  };

  return (
    <Text style={baseStyle}>
      {segments.map((seg, idx) => {
        if (!seg.mention) return <Text key={idx}>{seg.text}</Text>;
        const handle = seg.text.replace(/^@/, '');
        return (
          <Text
            key={idx}
            style={[styles.mention, { color: t.primary }]}
            onPress={() => router.push(`/community/u/${handle}` as any)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${handle}'s profile`}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  mention: { fontWeight: '700' },
});
