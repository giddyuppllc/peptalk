/**
 * ensureAiConsent — imperative guard for code paths that send user data to
 * third-party AI providers (Aimee chat, voice transcription, photo scans).
 *
 * The root <AiConsentModal> captures consent up front, so in practice this
 * usually returns immediately. It exists as a safety net for any path
 * reached before the modal was acknowledged (e.g. the user tapped "Not now").
 *
 * Returns true if the user has consented (now or previously); false if they
 * decline — callers should abort the AI request when it returns false.
 */

import { Alert } from 'react-native';
import { useAiConsentStore } from '../store/useAiConsentStore';

export function hasAiConsent(): boolean {
  return useAiConsentStore.getState().consented;
}

export function ensureAiConsent(): Promise<boolean> {
  if (useAiConsentStore.getState().consented) return Promise.resolve(true);

  return new Promise((resolve) => {
    Alert.alert(
      'Use AI features?',
      "Aimee and the food/lab scanners send what you share (your messages, voice, and photos) to PepTalk's AI providers — OpenAI (voice transcription) and xAI (Aimee) — to generate a response. They aren't used for advertising. You can review this in our Privacy Policy.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Agree & Continue',
          onPress: () => {
            useAiConsentStore.getState().grantConsent();
            resolve(true);
          },
        },
      ],
      { cancelable: false },
    );
  });
}

export default ensureAiConsent;
