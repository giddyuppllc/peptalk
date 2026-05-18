/**
 * PeptideDisclaimerModal — blocking first-visit modal for the Peptides tab.
 *
 * Requires the user to explicitly acknowledge that all peptide content is
 * for research and educational purposes only. Tracked via
 * useOnboardingStore.acceptedPeptideDisclaimer so it shows only once.
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

export function PeptideDisclaimerModal() {
  const t = useTheme();
  const accepted = useOnboardingStore((s) => s.acceptedPeptideDisclaimer);
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const setAccepted = useOnboardingStore((s) => s.setAcceptedPeptideDisclaimer);

  const [checked, setChecked] = useState(false);

  // Don't render until the store has hydrated (avoids flashing on cold start)
  if (!hasHydrated || accepted) return null;

  return (
    // 2026-05-18 belt+suspenders: bind `visible` to the derived
    // !accepted so a parent re-render between setAccepted(true) and
    // this component's next render can't leave the Modal stuck
    // mid-animation (Android RN Modal z-order edge case).
    <Modal visible={!accepted} transparent animationType="fade" onRequestClose={() => { /* gate dismiss to the button */ }}>
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <View style={styles.backdrop} accessibilityViewIsModal={true}>
        <View style={[styles.card, { backgroundColor: t.bg }]}>
          {/* Icon */}
          <LinearGradient
            colors={['#E89672', '#F2D8D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
          </LinearGradient>

          <Text style={[styles.title, { color: t.text }]}>
            Research & Education Only
          </Text>

          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              The peptide information and calculators in PepTalk are provided strictly for{' '}
              <Text style={[styles.bold, { color: t.text }]}>research and educational purposes</Text>.
            </Text>

            <View style={styles.bulletGroup}>
              <Bullet text="We are not medical professionals, pharmacists, or licensed healthcare providers." />
              <Bullet text="This app does not provide medical advice, diagnosis, or treatment." />
              <Bullet text="Nothing here is a prescription, and no doctor-patient relationship is created." />
              <Bullet text="Any actions you take based on content or tools in this app are at your sole discretion and risk." />
              <Bullet text="You agree to consult a licensed healthcare professional before using any peptide." />
            </View>

            <View style={[styles.warningBox, { backgroundColor: `${t.primary}0F`, borderColor: `${t.primary}40` }]}>
              <Ionicons name="warning-outline" size={16} color={t.primary} style={{ marginTop: 1 }} />
              <Text style={[styles.warningText, { color: t.textSecondary }]}>
                PepTalk and its creators are not liable for any outcomes, injuries, or consequences resulting from use of the information or tools provided in this application.
              </Text>
            </View>
          </ScrollView>

          {/* Acceptance checkbox */}
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setChecked(!checked)}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: t.cardBorder },
                checked && { backgroundColor: t.primary, borderColor: t.primary },
              ]}
            >
              {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkLabel, { color: t.text }]}>
              I understand and agree
            </Text>
          </TouchableOpacity>

          {/* Continue button */}
          <TouchableOpacity
            disabled={!checked}
            onPress={() => setAccepted(true)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={checked ? ['#E89672', '#F2D8D5'] : ['#D1D5DB', '#D1D5DB']}
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
      <View style={[styles.bulletDot, { backgroundColor: t.primary }]} />
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
  bodyScroll: {
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: {
    fontFamily: 'DMSans-Bold',
  },
  bulletGroup: {
    gap: 8,
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
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
  checkLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
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

export default PeptideDisclaimerModal;
