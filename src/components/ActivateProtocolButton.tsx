/**
 * ActivateProtocolButton — turns the calculator's choices into a tracked
 * protocol with reminders.
 *
 * On tap:
 *   1. Adds the protocol to useDoseLogStore (calendar-aware)
 *   2. Schedules a recurring dose reminder at 9 AM matching the chosen
 *      frequency (daily / eod / weekly / etc.)
 *   3. Schedules a one-shot vial-expiry reminder 28 days out
 *   4. Schedules a one-shot cycle-end reminder at protocol.durationWeeks.max
 *      from today
 *
 * Notifications are tagged `protocol-{peptideId}-…` so the user can sweep
 * them later via cancelRemindersByTag if they end the protocol early.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import {
  notificationsAvailable,
  scheduleDoseReminder,
  cancelRemindersByTag,
} from '../services/notificationService';
import type { ProtocolTemplate, AdministrationRoute } from '../types';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

interface ActivateProtocolButtonProps {
  peptideId: string;
  peptideName: string;
  protocol: ProtocolTemplate;
  /** mcg amount user has dialed in via the calculator. */
  doseMcg: number;
  /** User-selected frequency (daily / eod / 2x_week / 3x_week / weekly). */
  frequency: 'daily' | 'eod' | '2x_week' | '3x_week' | 'weekly';
}

const VIAL_LIFE_DAYS = 28;

function frequencyToReminderKey(freq: string): string {
  switch (freq) {
    case 'daily':    return 'daily';
    case 'eod':      return 'eod';
    case '2x_week':  return 'biweekly';
    case '3x_week':  return 'triweekly';
    case 'weekly':   return 'weekly';
    default:         return 'daily';
  }
}

function frequencyToProtocolFrequency(freq: string): ProtocolTemplate['frequency'] {
  switch (freq) {
    case 'daily':    return 'daily';
    case 'eod':      return 'eod';
    case '2x_week':  return 'biw';
    case '3x_week':  return 'tiw';
    case 'weekly':   return 'weekly';
    default:         return 'daily';
  }
}

async function scheduleOneShot(
  identifier: string,
  fireAt: Date,
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsAvailable() || !Notifications) return;
  if (fireAt.getTime() <= Date.now()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
        date: fireAt,
        channelId: Platform.OS === 'android' ? 'reminders' : undefined,
      },
    });
  } catch {
    // Notifications are best-effort; ignore failures.
  }
}

export function ActivateProtocolButton({
  peptideId,
  peptideName,
  protocol,
  doseMcg,
  frequency,
}: ActivateProtocolButtonProps) {
  const t = useTheme();
  const addProtocol = useDoseLogStore((s) => s.addProtocol);
  const [activating, setActivating] = useState(false);

  const handleActivate = () => {
    if (doseMcg <= 0) {
      Alert.alert('Set a dose first', 'Enter your target dose before activating the protocol.');
      return;
    }

    Alert.alert(
      `Activate ${peptideName}?`,
      'This adds the protocol to your calendar and schedules reminders for each dose, vial expiry (~28 days), and cycle end. You can pause or cancel anytime from the protocol detail.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setActivating(true);
            try {
              const startDateIso = new Date().toISOString().slice(0, 10);
              const cycleEndDate = new Date(Date.now() + protocol.durationWeeks.max * 7 * 24 * 3600 * 1000);

              addProtocol({
                peptideId,
                templateId: protocol.id,
                dose: doseMcg,
                unit: 'mcg',
                route: protocol.route as AdministrationRoute,
                frequency: frequencyToProtocolFrequency(frequency),
                startDate: startDateIso,
                endDate: cycleEndDate.toISOString().slice(0, 10),
              });

              // Sweep any pre-existing notifications for this peptide so
              // re-activating doesn't double-schedule.
              const tag = `protocol-${peptideId}-`;
              await cancelRemindersByTag(tag);

              // Daily/freq dose reminder at 9 AM.
              await scheduleDoseReminder(
                peptideId,
                peptideName,
                '09:00',
                frequencyToReminderKey(frequency),
                startDateIso,
              );

              // Vial-expiry one-shot.
              const vialExpiry = new Date(Date.now() + VIAL_LIFE_DAYS * 24 * 3600 * 1000);
              vialExpiry.setHours(9, 0, 0, 0);
              await scheduleOneShot(
                `${tag}vial-expiry`,
                vialExpiry,
                `${peptideName} vial expiring`,
                `Your reconstituted vial is ${VIAL_LIFE_DAYS} days old today. Discard if it shows cloudiness, particles, or color change. Reconstitute a fresh vial for continued cycling.`,
              );

              // Cycle-end one-shot.
              cycleEndDate.setHours(9, 0, 0, 0);
              await scheduleOneShot(
                `${tag}cycle-end`,
                cycleEndDate,
                `${peptideName} cycle complete`,
                `Your protocol's planned ${protocol.durationWeeks.max}-week cycle ends today. Review your check-ins and decide on a break vs. continuation with your provider.`,
              );

              Alert.alert(
                'Protocol activated',
                `${peptideName} is now on your calendar. You\'ll get reminders at 9 AM for each dose, plus alerts when your vial reaches ${VIAL_LIFE_DAYS} days and when the cycle ends.`,
              );
            } catch (err: any) {
              Alert.alert('Could not activate', err?.message ?? 'Unknown error');
            } finally {
              setActivating(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleActivate}
        disabled={activating}
        style={[styles.btn, { backgroundColor: t.primary, opacity: activating ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Activate ${peptideName} protocol`}
      >
        <Ionicons name="calendar-outline" size={18} color="#fff" />
        <Text style={styles.btnText}>
          {activating ? 'Activating…' : `Activate ${peptideName} protocol`}
        </Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: t.textSecondary }]}>
        Schedules dose reminders, vial-expiry alerts (~28 days), and a cycle-end check-in.
        You can cancel anytime from the protocol detail.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  btnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
  hint: { fontSize: 11, fontStyle: 'italic', textAlign: 'center', lineHeight: 15 },
});
