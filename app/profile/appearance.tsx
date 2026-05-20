/**
 * Appearance settings — Master Refactor Plan v3.1 §4.6.
 *
 * Pin the v3 visual variant manually. 'Auto' falls back to onboarding sex.
 */

import React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { useThemeStore, type V3Variant } from '../../src/store/useThemeStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { tapLight } from '../../src/utils/haptics';

interface Choice {
  key: V3Variant;
  label: string;
  body: string;
}

const CHOICES: Choice[] = [
  {
    key: 'auto',
    label: 'Auto',
    body: 'Match your onboarding sex (default).',
  },
  {
    key: 'female',
    label: 'Soft pastel',
    body: 'Cream backdrop, Playfair serif, rose / mint / lavender accents.',
  },
  {
    key: 'male',
    label: 'Dark charcoal',
    body: 'Charcoal backdrop, Newsreader serif, cognac + oxblood accents.',
  },
];

export default function AppearanceScreen() {
  const t = useV3Theme();
  const variant = useThemeStore((s) => s.v3Variant);
  const setVariant = useThemeStore((s) => s.setV3Variant);
  const gender = useOnboardingStore((s) => s.profile.gender);

  return (
    <V3DetailShell
      title="Appearance"
      observation="Pick the look that fits. Auto follows your onboarding sex."
      intent="profile_appearance"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {CHOICES.map((c) => {
          const active = variant === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => {
                tapLight();
                setVariant(c.key);
              }}
            >
              <GlassCard style={styles.card}>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: active
                          ? t.isDark
                            ? ((t.colors as any).accentCognac as string)
                            : ((t.colors as any).accentRose as string)
                          : (t.colors.cardBorder as string),
                      },
                    ]}
                  >
                    {active ? (
                      <View
                        style={[
                          styles.radioDot,
                          {
                            backgroundColor: t.isDark
                              ? ((t.colors as any).accentCognac as string)
                              : ((t.colors as any).accentRose as string),
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.label,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {c.label}
                      {c.key === 'auto' && gender ? (
                        <Text
                          style={{
                            fontFamily: t.typography.body,
                            fontSize: 12,
                            color: t.colors.textSecondary as string,
                          }}
                        >
                          {`  · currently ${gender.toLowerCase()}`}
                        </Text>
                      ) : null}
                    </Text>
                    <Text
                      style={[
                        styles.body,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {c.body}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          );
        })}

        <GlassCard style={styles.note}>
          <View style={styles.noteRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={t.colors.textSecondary as string}
            />
            <Text
              style={{
                flex: 1,
                marginLeft: 8,
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              Changes apply across every screen the next time it renders.
              The choice persists across launches.
            </Text>
          </View>
        </GlassCard>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 16,
  },
  body: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  note: {
    marginTop: 16,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
