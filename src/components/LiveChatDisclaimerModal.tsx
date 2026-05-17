/**
 * LiveChatDisclaimerModal — first-entry gate for any community live chat
 * room. Mirrors PeptideDisclaimerModal: requires a checkbox + tap to
 * acknowledge that conversations are member-to-member and are NOT medical
 * advice. Acceptance persists via useOnboardingStore so it only appears
 * once per user (across events + reinstalls — it's stored in secure storage).
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useOnboardingStore } from '../store/useOnboardingStore';

interface Props {
  /** Optional: control visibility from the host. If omitted, the modal
   *  shows itself whenever `acceptedLiveChatDisclaimer` is false. */
  visible?: boolean;
  /** Fires after the user accepts. */
  onAccepted?: () => void;
}

export function LiveChatDisclaimerModal({ visible, onAccepted }: Props) {
  const t = useTheme();
  const accepted = useOnboardingStore((s) => s.acceptedLiveChatDisclaimer);
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const setAccepted = useOnboardingStore((s) => s.setAcceptedLiveChatDisclaimer);

  const [checked, setChecked] = useState(false);

  // Don't render until the store has hydrated (avoids flashing on cold start).
  if (!hasHydrated) return null;
  // If a host explicitly says "not visible," respect that. Otherwise the
  // modal auto-shows when the persisted flag is false.
  const shouldShow = visible === undefined ? !accepted : visible && !accepted;
  if (!shouldShow) return null;

  const handleAccept = () => {
    setAccepted(true);
    onAccepted?.();
  };

  return (
    <Modal visible transparent animationType="fade">
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <View style={styles.backdrop} accessibilityViewIsModal={true}>
        <View style={[styles.card, { backgroundColor: t.bg }]}>
          <LinearGradient
            colors={['#3E7CB1', '#7FB3D8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name="chatbubbles" size={28} color="#fff" />
          </LinearGradient>

          <Text style={[styles.title, { color: t.text }]}>
            Before you join the chat
          </Text>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Live PepTalk chats are{' '}
              <Text style={[styles.bold, { color: t.text }]}>member-to-member conversations</Text>.
              Members share experiences, ask questions, and trade notes about
              their own peptide protocols.
            </Text>

            <View style={styles.bulletGroup}>
              <Bullet text="What's said in here is not medical advice." />
              <Bullet text="Hosts and other members are not your doctor or pharmacist." />
              <Bullet text="Always consult a licensed healthcare provider before starting, changing, or stopping any peptide protocol." />
              <Bullet text="Be respectful — harassment, spam, and unsafe medical claims may be removed." />
            </View>

            <View style={[styles.warningBox, { backgroundColor: '#3E7CB10F', borderColor: '#3E7CB140' }]}>
              <Ionicons name="warning-outline" size={16} color="#3E7CB1" style={{ marginTop: 1 }} />
              <Text style={[styles.warningText, { color: t.textSecondary }]}>
                Information shared in chat is provided for educational discussion only.
                PepTalk and its hosts are not liable for any outcomes resulting from member messages.
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setChecked(!checked)}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: t.cardBorder },
                checked && { backgroundColor: '#3E7CB1', borderColor: '#3E7CB1' },
              ]}
            >
              {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkLabel, { color: t.text }]}>
              I understand and agree
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!checked}
            onPress={handleAccept}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue into live chat"
          >
            <LinearGradient
              colors={checked ? ['#3E7CB1', '#7FB3D8'] : ['#D1D5DB', '#D1D5DB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueBtn}
            >
              <Text style={styles.continueText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: '#3E7CB1' }]} />
      <Text style={[styles.bulletText, { color: t.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 30, 0.78)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    maxHeight: '86%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  bodyScroll: { marginBottom: 16 },
  body: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: { fontFamily: 'DMSans-Bold' },
  bulletGroup: { gap: 8, marginBottom: 14 },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    lineHeight: 18,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 16,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  continueBtn: {
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: 'center',
  },
  continueText: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

export default LiveChatDisclaimerModal;
