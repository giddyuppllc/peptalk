/**
 * AimeeChatSheet — bottom sheet 65% screen height with empty conversation.
 *
 * Phase A: shell only. Renders a header (Aimee avatar + name + close)
 * and an empty-state body ("Start a conversation with Aimee"). The
 * full chat (LLM stream, tool calls, confirm cards) lands in Phase F1.
 *
 * Drag-handle resize is stubbed for Phase A — the sheet snaps to a
 * single height. Resizing arrives with F1.
 */

import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useV3Theme } from '../../theme/V3ThemeProvider';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.65;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional intent pre-loader (Phase F1 will use this). */
  intent?: string;
}

export function AimeeChatSheet({ visible, onClose, intent }: Props) {
  const t = useV3Theme();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { mass: 1, stiffness: 250, damping: 28 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(SHEET_HEIGHT, { mass: 1, stiffness: 280, damping: 30 });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          { backgroundColor: t.colors.cardBg as string, height: SHEET_HEIGHT },
        ]}
      >
        <BlurView
          intensity={36}
          tint={t.isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.isDark ? 'rgba(19,20,22,0.78)' : 'rgba(255,255,255,0.78)' }]} />

        {/* Drag handle */}
        <View style={styles.handleWrap}>
          <View
            style={[
              styles.handle,
              {
                backgroundColor: t.isDark
                  ? 'rgba(255,255,255,0.18)'
                  : 'rgba(42,26,79,0.18)',
              },
            ]}
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: t.isDark
                    ? (t.colors as any).accentCognac
                    : (t.colors as any).accentRose,
                },
              ]}
            >
              <Text
                style={{
                  fontFamily: t.isDark
                    ? t.typography.numeralsMale
                    : t.typography.numeralsFemale,
                  color: t.isDark ? (t.colors.textPrimary as string) : '#fff',
                  fontSize: 14,
                }}
              >
                A
              </Text>
            </View>
            <View>
              <Text
                style={{
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                  fontSize: 18,
                  color: t.colors.textPrimary as string,
                }}
              >
                Aimee
              </Text>
              <Text
                style={{
                  fontFamily: t.typography.body,
                  fontSize: 11,
                  color: t.colors.textSecondary as string,
                }}
              >
                Your science-forward sidekick
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          >
            <Ionicons
              name="close"
              size={22}
              color={t.colors.textPrimary as string}
            />
          </Pressable>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.empty}>
            <Text
              style={{
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
                fontSize: 22,
                color: t.colors.textPrimary as string,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Start a conversation
            </Text>
            <Text
              style={{
                fontFamily: t.typography.body,
                fontSize: 13,
                color: t.colors.textSecondary as string,
                textAlign: 'center',
                lineHeight: 19,
                maxWidth: 280,
              }}
            >
              Ask anything about your protocol, nutrition, training, or
              your data. Aimee is wired in next phase.
              {intent ? `\n\n(Intent: ${intent})` : ''}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
