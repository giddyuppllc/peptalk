/**
 * Send-feedback helper. Opens the user's mail client with a pre-filled
 * email that includes device + build context, so we don't spend the first
 * three replies asking "what version are you on?"
 *
 * No backend required — uses mailto: so it works offline and doesn't need
 * a support-desk integration. Swap for a proper ticket submission later.
 */

import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

const FEEDBACK_EMAIL = 'support@peptalk.app';

export async function sendFeedback(options: {
  kind: 'bug' | 'feedback' | 'question';
  userEmail?: string | null;
  userId?: string | null;
}): Promise<void> {
  const { kind, userEmail, userId } = options;

  const subject = {
    bug: 'PepTalk — Bug report',
    feedback: 'PepTalk — Feedback',
    question: 'PepTalk — Question',
  }[kind];

  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const runtimeVersion = Constants.expoConfig?.runtimeVersion ?? appVersion;
  const platform = `${Platform.OS} ${Platform.Version}`;
  const deviceName = Constants.deviceName ?? 'unknown device';

  const bodyTop =
    kind === 'bug'
      ? 'What happened (the more detail the better — steps, time of day, anything on screen):\n\n\nWhat you expected instead:\n\n\n'
      : kind === 'feedback'
        ? 'What you like, don\'t like, or want to see added:\n\n\n'
        : 'Your question:\n\n\n';

  const contextFooter = [
    '---',
    `App: PepTalk ${appVersion} (${runtimeVersion})`,
    `Device: ${deviceName} · ${platform}`,
    userId ? `User: ${userId}` : null,
    userEmail ? `Email: ${userEmail}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const body = `${bodyTop}\n\n${contextFooter}`;
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(
        'No mail app found',
        `Email us directly at ${FEEDBACK_EMAIL} and include:\nApp ${appVersion}\n${platform}`,
      );
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Could not open mail',
      `Email us directly at ${FEEDBACK_EMAIL}.`,
    );
  }
}
