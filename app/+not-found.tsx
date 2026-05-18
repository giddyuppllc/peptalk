/**
 * Custom 404 handler for unmatched routes.
 *
 * Hit when:
 *   - A deep link arrives with an empty or malformed path (e.g.
 *     `peptalk:///`, which can happen if a notification payload or
 *     auth callback builds a URL with no route segment).
 *   - A push notification's `data.route` field is dropped on cold-tap.
 *   - A typo in a router.push() target.
 *
 * Bounces to home after 600 ms so the user isn't stranded on a dead
 * screen; if they prefer to stay (admin or QA flow) they can tap the
 * "Stay here" link before the redirect fires.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';

export default function NotFound() {
  const router = useRouter();
  const t = useTheme();
  const params = useGlobalSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(tabs)' as never);
    }, 600);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.text }]}>One second…</Text>
      <Text style={[styles.body, { color: t.textSecondary }]}>
        Taking you home.
      </Text>
      <Pressable
        onPress={() => router.replace('/(tabs)' as never)}
        style={[styles.button, { borderColor: t.glassBorder }]}
        accessibilityRole="button"
        accessibilityLabel="Go to home"
      >
        <Text style={[styles.buttonText, { color: t.text }]}>Go home now</Text>
      </Pressable>
      {__DEV__ && Object.keys(params).length > 0 ? (
        <Text style={[styles.devNote, { color: t.textMuted }]}>
          dev: params {JSON.stringify(params)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    opacity: 0.8,
  },
  button: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  devNote: {
    marginTop: 16,
    fontSize: 11,
    fontFamily: 'monospace',
    opacity: 0.5,
  },
});
