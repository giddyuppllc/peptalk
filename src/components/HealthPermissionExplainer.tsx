/**
 * Pre-permission explainer for Apple Health — App Review 5.1.1(iv).
 *
 * The HealthKit connect flow has been rejected four times. The named defects
 * were: the button that triggers the system prompt said "Connect" (Apple
 * asked for Continue/Next), there was no way to back out of the explanation,
 * and there was no route to Settings.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not imitate, pre-empt or duplicate the iOS permission sheet, and it
 * never claims a result. iOS owns that sheet and deliberately hides read
 * authorization status — an app cannot tell whether read access was granted or
 * refused, so anything here that reported success or failure would be a guess
 * shown as fact. A previous fix removed custom dialogs for exactly this reason;
 * this restores an explainer WITHOUT restoring that mistake.
 *
 * "Open Health settings" is always offered rather than shown conditionally,
 * because the state it would be conditional on (a prior denial) is precisely
 * what iOS refuses to tell us.
 */

import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

export interface HealthPermissionExplainerProps {
  visible: boolean;
  /** Proceeds to the iOS permission sheet. */
  onContinue: () => void;
  /** Dismiss without requesting anything. */
  onNotNow: () => void;
}

export function HealthPermissionExplainer({
  visible,
  onContinue,
  onNotNow,
}: HealthPermissionExplainerProps) {
  const t = useTheme();

  const openSettings = () => {
    // x-apple-health:// is not a documented public scheme; app-settings:
    // reliably opens PepTalk's own settings page, which is where the Health
    // toggles live once authorization has been requested at least once.
    Linking.openURL(Platform.OS === 'ios' ? 'app-settings:' : 'app-settings:').catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onNotNow}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
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
              stays in sync. You choose exactly what to share in the iOS permission dialog, and you
              can change it any time in Settings.
            </Text>
            <Text style={[styles.copy, { color: t.textMuted, marginTop: 12 }]}>
              Nothing is shared until you choose it on the next screen. PepTalk never sees a
              category you do not turn on.
            </Text>
          </ScrollView>

          {/* Apple named Continue / Next for the control that leads to the
              system prompt. "Connect" was cited as the defect. */}
          <TouchableOpacity
            onPress={onContinue}
            style={[styles.primaryBtn, { backgroundColor: t.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Continue to the Apple Health permission screen"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNotNow}
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Not now — do not connect Apple Health"
          >
            <Text style={[styles.secondaryText, { color: t.textSecondary }]}>Not Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openSettings}
            style={styles.linkBtn}
            accessibilityRole="button"
            accessibilityLabel="Open Health settings"
          >
            <Text style={[styles.linkText, { color: t.primary }]}>Open Health settings</Text>
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
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  linkBtn: { paddingVertical: 6, alignItems: 'center' },
  linkText: { fontSize: 13, fontWeight: '600' },
});

export default HealthPermissionExplainer;
