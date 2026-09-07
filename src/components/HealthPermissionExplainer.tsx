/**
 * Pre-permission explainer for Apple Health — App Review 5.1.1(iv).
 *
 * ── Read this before changing anything here ────────────────────────────────
 * This flow has now been rejected FOUR times, and the previous attempt failed
 * because it read the rejection backwards. Apple's 17 Jul text names three
 * faults, and two of them are things a well-meaning fix would ADD:
 *
 *   (a) you send users to Settings before showing the system permission prompt
 *   (b) the button says "Connect" — it must be "Continue" or "Next"
 *   (c) the pre-prompt has a "Not Now" escape — users must always proceed
 *
 * So an "Open Health settings" link is fault (a), not a courtesy, and a
 * "Not Now" button is fault (c), not good manners. The version this replaces
 * offered both, having recorded the defects as "there was no way to back out,
 * and there was no route to Settings". That is why the complaint got longer and
 * more specific each round rather than going away.
 *
 * WHAT APPLE ALLOWS
 * Exactly one informational screen before the system sheet, with:
 *   - no dismiss control of any kind (no button, no swipe, no back gesture)
 *   - a neutral forward label — "Continue" or "Next"
 *   - a direct path to the system sheet, never to the Settings app
 *
 * The user's way out is the iOS sheet itself, which has "Don't Allow". That is
 * the escape hatch, and it is the only one Apple wants offered. Adding a second
 * one before it is the violation.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not imitate, pre-empt or duplicate the iOS permission sheet, and it
 * never claims a result. iOS owns that sheet and deliberately hides read
 * authorization status — an app cannot tell whether read access was granted or
 * refused, so anything here that reported success or failure would be a guess
 * shown as fact.
 */

import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

export interface HealthPermissionExplainerProps {
  visible: boolean;
  /** Proceeds to the iOS permission sheet. The only control on this screen. */
  onContinue: () => void;
}

export function HealthPermissionExplainer({
  visible,
  onContinue,
}: HealthPermissionExplainerProps) {
  const t = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      // Inert on purpose. On Android this is the hardware back button; leaving
      // it able to close the sheet would reinstate fault (c) on one platform
      // while the UI looked compliant on the other.
      onRequestClose={() => {}}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        {/* No touchable backdrop either — a tap-to-dismiss is still a dismiss. */}
        <View style={[styles.sheet, { backgroundColor: t.bg, borderColor: t.cardBorder }]}>
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${t.primary}22` }]}>
              <Ionicons name="heart-outline" size={22} color={t.primary} />
            </View>
            <Text style={[styles.title, { color: t.text }]}>Apple Health</Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Verbatim from the integrations screen — the 2.5.1 disclosure
                copy, reused rather than rewritten so both surfaces state the
                same thing. */}
            <Text style={[styles.copy, { color: t.textSecondary }]}>
              When you connect Apple Health, PepTalk reads your activity (steps, active energy,
              workouts), body metrics (weight, body composition), heart data (heart rate, HRV,
              VO₂ max, blood oxygen, respiratory rate), and sleep so you can see trends
              alongside your protocols — and writes your check-ins and weight back so everything
              stays in sync.
            </Text>
            <Text style={[styles.copy, { color: t.textMuted, marginTop: 12 }]}>
              You choose exactly what to share on the next screen, and you can decline any of it
              there. Nothing is read until you allow it.
            </Text>
          </ScrollView>

          {/* The only control. "Continue" is one of the two labels Apple named;
              "Connect" was cited as the defect. */}
          <TouchableOpacity
            onPress={onContinue}
            style={[styles.primaryBtn, { backgroundColor: t.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Continue to the Apple Health permission screen"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { marginBottom: 16 },
  copy: { fontSize: 14, lineHeight: 21 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

export default HealthPermissionExplainer;
