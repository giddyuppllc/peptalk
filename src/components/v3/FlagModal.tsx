/**
 * FlagModal — red-flag warning modal scaffold.
 *
 * Phase A: shell + a single CTA "Got it". Phase B uses this for the
 * acetic-acid peptide warning ("AOD-9604, IGF-1, IGF-1 LR3, Dihexa —
 * do NOT use BAC water" — §8.3).
 */

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapMedium } from '../../utils/haptics';

interface Props {
  visible: boolean;
  title: string;
  body: string;
  onDismiss: () => void;
  /** Optional CTA label override. */
  ctaLabel?: string;
}

export function FlagModal({
  visible,
  title,
  body,
  onDismiss,
  ctaLabel = 'Got it',
}: Props) {
  const t = useV3Theme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: t.isDark
                ? 'rgba(38,40,44,0.96)'
                : 'rgba(255,255,255,0.96)',
              borderRadius: t.radius.card,
              borderWidth: 1,
              borderColor: '#D43A3A',
            },
          ]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="warning" size={26} color="#D43A3A" />
          </View>
          <Text
            style={{
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
              fontSize: 18,
              color: t.colors.textPrimary as string,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontFamily: t.typography.body,
              fontSize: 13,
              color: t.colors.textPrimary as string,
              lineHeight: 19,
              marginBottom: 18,
              textAlign: 'center',
            }}
          >
            {body}
          </Text>
          <Pressable
            onPress={() => {
              tapMedium();
              onDismiss();
            }}
            style={[
              styles.cta,
              {
                backgroundColor: '#D43A3A',
                borderRadius: t.radius.pill,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Text
              style={{
                color: '#fff',
                fontFamily: t.typography.bodyBold,
                fontSize: 13,
                letterSpacing: 0.3,
              }}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 10,
  },
  cta: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
});
