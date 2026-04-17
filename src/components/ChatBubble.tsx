import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { ChatMessage } from '../types';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
  Gradients,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { PepTalkCharacter } from './PepTalkCharacter';

/* ─── Markdown-to-RN bold rendering ─────────────────────────────── */

function renderMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={i} style={mdStyles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

const mdStyles = StyleSheet.create({
  bold: { fontWeight: '700' },
});

/* ─── ChatBubble ────────────────────────────────────────────────── */

interface ChatBubbleProps {
  message: ChatMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const t = useTheme();
  const accent = useSectionAccent();
  const isBot = message.role === 'bot';
  const hasJournal = isBot && !!message.journalEntry;

  // Fade-in + slide animation
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(
      50,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }),
    );
    translateY.value = withDelay(
      50,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.ease) }),
    );
  }, [opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const timeLabel = useMemo(
    () =>
      new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.timestamp],
  );

  /* ─── User bubble ─────────────────────────────────────────────── */
  if (!isBot) {
    return (
      <Animated.View style={[styles.row, styles.rowUser, animStyle]}>
        <View style={styles.userBubbleOuter}>
          <LinearGradient
            colors={[accent.deep, accent.darker]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.userBubble}
          >
            <Text style={styles.textUser}>
              {renderMarkdown(message.content)}
            </Text>
            <Text style={styles.timestampUser}>{timeLabel}</Text>
          </LinearGradient>
        </View>
      </Animated.View>
    );
  }

  /* ─── Bot bubble ──────────────────────────────────────────────── */
  return (
    <Animated.View style={[styles.row, styles.rowBot, animStyle]}>
      <View style={styles.avatarWrap}>
        <PepTalkCharacter size={32} variant="avatar" />
      </View>
      <View style={styles.botBubbleContainer}>
        {/* Gradient border via a wrapping LinearGradient */}
        <LinearGradient
          colors={[`${accent.deep}40`, `${accent.pastel}20`, 'rgba(0,0,0,0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.botBorderGradient}
        >
          <View style={[styles.botBubbleInner, { backgroundColor: t.surface }]}>
            <Text style={[styles.textBot, { color: t.text }]}>
              {renderMarkdown(message.content)}
            </Text>

            {/* Journal badge */}
            {hasJournal && (
              <View style={styles.journalBadge}>
                <Text style={styles.journalBadgeIcon}>{'  '}</Text>
                <LinearGradient
                  colors={[`${accent.deep}25`, `${accent.pastel}15`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.journalBadgeBg}
                >
                  <Text style={[styles.journalBadgeText, { color: accent.deep }]}>Logged to Journal</Text>
                </LinearGradient>
              </View>
            )}

            <Text style={[styles.timestampBot, { color: t.textSecondary }]}>{timeLabel}</Text>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

/* ─── Typing Indicator ──────────────────────────────────────────── */

export const TypingIndicator: React.FC = () => {
  const t = useTheme();
  const accent = useSectionAccent();
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const animate = (sv: { value: number }, delay: number) => {
      sv.value = withDelay(
        delay,
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      );
      // Loop manually via interval
    };
    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);

    const interval = setInterval(() => {
      dot1.value = 0.3;
      dot2.value = 0.3;
      dot3.value = 0.3;
      setTimeout(() => animate(dot1, 0), 50);
      setTimeout(() => animate(dot2, 200), 50);
      setTimeout(() => animate(dot3, 400), 50);
    }, 1200);

    return () => clearInterval(interval);
  }, [dot1, dot2, dot3]);

  const d1Style = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const d2Style = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const d3Style = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={[styles.row, styles.rowBot]}>
      <View style={styles.avatarWrap}>
        <PepTalkCharacter size={32} variant="avatar" typing />
      </View>
      <LinearGradient
        colors={[`${accent.deep}40`, `${accent.pastel}20`, 'rgba(0,0,0,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.typingBorderGradient}
      >
        <View style={[styles.typingInner, { backgroundColor: t.surface }]}>
          <View style={styles.typingRow}>
            <Animated.View style={[styles.typingDot, { backgroundColor: accent.deep }, d1Style]} />
            <Animated.View style={[styles.typingDot, { backgroundColor: accent.deep }, d2Style]} />
            <Animated.View style={[styles.typingDot, { backgroundColor: accent.deep }, d3Style]} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

/* ─── Styles ────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    alignItems: 'flex-end',
  },
  rowBot: {
    justifyContent: 'flex-start',
  },
  rowUser: {
    justifyContent: 'flex-end',
  },

  /* Avatar */
  avatarWrap: {
    marginRight: Spacing.sm,
    marginBottom: 2,
  },

  /* ── User bubble ── */
  userBubbleOuter: {
    maxWidth: '78%',
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.sm,
    overflow: 'hidden',
    // Outer shadow / glow
    shadowColor: Colors.orchidDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  userBubble: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.sm,
  },
  textUser: {
    color: '#ffffff',
    fontSize: FontSizes.md,
    lineHeight: 22,
    fontWeight: '500',
  },
  timestampUser: {
    fontSize: FontSizes.xs,
    color: 'rgba(0,0,0,0.40)',
    marginTop: 4,
    textAlign: 'right',
  },

  /* ── Bot bubble ── */
  botBubbleContainer: {
    maxWidth: '78%',
    // Soft glow
    shadowColor: Colors.orchidDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  botBorderGradient: {
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.sm,
    padding: 1, // The "border" width
  },
  botBubbleInner: {
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.lg - 1,
    borderBottomLeftRadius: BorderRadius.sm - 1,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
  },
  textBot: {
    color: Colors.darkText,
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  timestampBot: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 4,
    textAlign: 'right',
    opacity: 0.6,
  },

  /* ── Journal badge ── */
  journalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 4,
  },
  journalBadgeIcon: {
    fontSize: 12,
  },
  journalBadgeBg: {
    borderRadius: BorderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  journalBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* ── Typing indicator ── */
  typingBorderGradient: {
    borderRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.sm,
    padding: 1,
  },
  typingInner: {
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.lg - 1,
    borderBottomLeftRadius: BorderRadius.sm - 1,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md + 4,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 22,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default ChatBubble;
