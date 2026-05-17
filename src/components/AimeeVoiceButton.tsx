/**
 * Aimee Voice Button — hold-to-talk mic.
 *
 * The actual recording / Whisper / chat-routing is in `useAimeeVoice`.
 * This component is just the on-screen button. Press in to start, release
 * to stop — Aimee's existing chat pipeline (with its 10-tool registry +
 * confirm cards) handles intent routing once the transcript lands as the
 * next user message.
 */

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useV3Theme } from '../theme/V3ThemeProvider';
import { useAimeeVoice } from '../hooks/useAimeeVoice';

interface Props {
  compact?: boolean;
}

export function AimeeVoiceButton({ compact = false }: Props) {
  const t = useV3Theme();
  const { status, start, stop } = useAimeeVoice();
  const isRecording = status === 'recording';
  const isBusy = status === 'uploading' || status === 'transcribing';

  return (
    <Pressable
      onPressIn={start}
      onPressOut={isRecording ? stop : undefined}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording ? 'Release to send to Aimee' : 'Hold to talk to Aimee'
      }
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
      style={[
        compact ? styles.btnCompact : styles.btn,
        {
          backgroundColor: isRecording
            ? ((t.colors as any).accentCognac as string) ??
              ((t.colors as any).accentRose as string)
            : (t.colors.textPrimary as string),
        },
      ]}
    >
      {isBusy ? (
        <ActivityIndicator color={t.colors.bgBase1 as string} size="small" />
      ) : (
        <Ionicons
          name={isRecording ? 'radio' : 'mic'}
          size={compact ? 18 : 22}
          color={t.colors.bgBase1 as string}
        />
      )}
      {!compact ? (
        <Text
          style={{
            color: t.colors.bgBase1 as string,
            fontFamily: t.typography.bodyBold,
            fontSize: 13,
            letterSpacing: 0.3,
            marginLeft: 8,
          }}
        >
          {isRecording
            ? 'Listening…'
            : isBusy
              ? 'Thinking…'
              : 'Talk to Aimee'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  btnCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AimeeVoiceButton;
