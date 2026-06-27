/**
 * AiConsentModal — one-time, explicit consent for third-party AI processing.
 *
 * App Store Guideline 5.1.2 requires explicit consent before sharing personal
 * data with third parties, INCLUDING third-party AI services. PepTalk sends
 * chat text to xAI (Aimee), voice to OpenAI Whisper, and photos to a vision
 * model. This modal captures that consent up front — once — and is mounted at
 * the root so it appears the first time a user reaches the app after onboarding.
 *
 * Self-gating: renders only when onboarding is complete, both stores have
 * hydrated, and consent hasn't been given yet. "Not now" dismisses for the
 * session; the imperative ensureAiConsent() guard then catches any AI use.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAiConsentStore } from '../store/useAiConsentStore';
import { useOnboardingStore } from '../store/useOnboardingStore';

export function AiConsentModal() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  const consented = useAiConsentStore((s) => s.consented);
  const consentHydrated = useAiConsentStore((s) => s.hasHydrated);
  const grantConsent = useAiConsentStore((s) => s.grantConsent);

  const onboardingComplete = useOnboardingStore((s) => s.isComplete);
  const onboardingHydrated = useOnboardingStore((s) => s.hasHydrated);

  const visible =
    consentHydrated &&
    onboardingHydrated &&
    onboardingComplete &&
    !consented &&
    !dismissed;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles-outline" size={28} color="#E89672" />
          </View>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            AI-powered features
          </Text>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.body}>
              PepTalk uses AI to power Aimee, voice messages, and the food &amp; lab
              scanners. To generate responses, what you share is sent to our AI providers:
            </Text>
            <View style={styles.row}>
              <Ionicons name="chatbubbles-outline" size={18} color="#888" />
              <Text style={styles.rowText}>Your chat messages → xAI (Aimee)</Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="mic-outline" size={18} color="#888" />
              <Text style={styles.rowText}>Voice messages → OpenAI (transcription)</Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="camera-outline" size={18} color="#888" />
              <Text style={styles.rowText}>Scanned photos → vision model</Text>
            </View>
            <Text style={styles.fineprint}>
              Your data is used only to deliver these features — never for advertising. You
              can use the rest of PepTalk without AI. Details are in our{' '}
              <Text style={styles.link} onPress={() => router.push('/privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={grantConsent}
            accessibilityRole="button"
            accessibilityLabel="Agree and continue using AI features"
          >
            <Text style={styles.primaryBtnText}>Agree &amp; Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setDismissed(true)}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(232,150,114,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'DMSans-Bold',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  bodyScroll: { alignSelf: 'stretch', maxHeight: 320 },
  bodyContent: { paddingBottom: 4 },
  body: {
    fontSize: 15,
    fontFamily: 'DMSans-Regular',
    color: '#444',
    lineHeight: 22,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  rowText: { flex: 1, fontSize: 14, fontFamily: 'DMSans-Medium', color: '#333' },
  fineprint: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#777',
    lineHeight: 19,
    marginTop: 8,
  },
  link: { color: '#E89672', fontFamily: 'DMSans-Bold' },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E89672',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryBtnText: { fontSize: 17, fontFamily: 'DMSans-Bold', color: '#FFFFFF' },
  secondaryBtn: {
    alignSelf: 'stretch',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: 'DMSans-Medium', color: '#999' },
});

export default AiConsentModal;
