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
    // 2026-05-18 belt+suspenders: bind `visible` to derived `shouldShow`
    // so an intermediate re-render between setAccepted(true) and the
    // early-return guard above can't leave the Modal mounted with
    // visible={true} mid-animation (Android Modal z-order race that
    // sandwiched the user with a tap-eating overlay).
    // onRequestClose was ABSENT, which is not the same as "no dismiss". React
    // Native treats it as required on Android; without it the hardware back
    // button's behaviour on a visible Modal is unspecified rather than chosen,
    // and RN warns. The sibling gate (PeptideDisclaimerModal) states the
    // intention explicitly and this one now matches it: back does nothing,
    // because acceptance is the only way through this gate. No behaviour
    // changes — back did nothing before either.
    <Modal
      visible={shouldShow}
      transparent
      animationType="fade"
      onRequestClose={() => { /* gate dismiss to the button */ }}
    >
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
            // The same three props PeptideDisclaimerModal was given, for the
            // same reason, on the same shape of control — a required consent
            // checkbox built from a View plus a Text. Without them a screen
            // reader never announces it as a checkbox or says whether it is
            // ticked, Android composes the label from the children as
            // ", I understand and agree", and the inner Text is exposed as a
            // separate non-clickable node, so a tap aimed at the words lands on
            // dead space. That ends with the box unticked, Continue inert and
            // the gate never closing. The fix was applied to the twin and not
            // to this file; the label below is the visible text, unchanged.
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="I understand and agree"
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
            // Announce the disabled state as well as the role. Without it the
            // button reads as tappable while the checkbox is unticked, which is
            // the same dead end from the other side.
            accessibilityState={{ disabled: !checked }}
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
  // flexShrink: 1 — the same fix, and the same reason, as the sibling gate in
  // PeptideDisclaimerModal.tsx. React Native defaults flexShrink to 0, `card`
  // caps at 86%, and this ScrollView carried only a margin, so four bullets
  // plus the liability box could push the acceptance checkbox and the Continue
  // button it enables past the card's bottom edge. This modal has no dismiss
  // of any kind (see the onRequestClose note above), so that would leave it
  // unpassable. Nothing moves while the copy fits.
  bodyScroll: { marginBottom: 16, flexShrink: 1 },
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
