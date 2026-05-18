/**
 * Doses hub — Master Refactor Plan v3.1 §8.
 *
 * Five sub-surfaces drill in from this hub:
 *   - Calculator (v2.1) — §8.1–8.8
 *   - Stack Builder       — §8.9
 *   - Library             — §8.10
 *   - Dose Tracker        — §8.11
 *   - Side Effects        — §8.12
 *
 * The Tracker tile is alpha-ed when no doses are logged yet — that's
 * Aimee's tell to suggest opening the calculator first.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useSideEffectStore } from '../../src/store/useSideEffectStore';

type TileIcon = React.ComponentProps<typeof Ionicons>['name'];

interface Tile {
  key: string;
  title: string;
  subtitle: string;
  icon: TileIcon;
  href: string;
}

const TILES: Tile[] = [
  {
    key: 'calculator',
    title: 'Calculator',
    subtitle: 'Reconstitute · draw · doses per vial',
    icon: 'calculator-outline',
    href: '/doses/calculator',
  },
  {
    key: 'stack-builder',
    title: 'Stack Builder',
    subtitle: 'Multi-peptide protocol planner',
    icon: 'layers-outline',
    href: '/doses/stack-builder',
  },
  {
    key: 'library',
    title: 'Library',
    subtitle: 'Clinical summaries, dose ranges',
    icon: 'library-outline',
    href: '/doses/library',
  },
  {
    key: 'tracker',
    title: 'Dose Tracker',
    subtitle: 'History by peptide / cycle / date',
    icon: 'time-outline',
    href: '/doses/tracker',
  },
  {
    key: 'side-effects',
    title: 'Side Effects',
    subtitle: 'Tagged log with 1–5 severity',
    icon: 'pulse-outline',
    href: '/doses/side-effects',
  },
];

export default function DosesHubScreen() {
  const t = useV3Theme();
  const router = useRouter();

  // P0 fix: selectors must return stable references. The previous
  // `s.entries.filter(...)` inside the selector created a new array on
  // every render, and Zustand v5's Object.is comparison saw it as
  // "changed" every time → infinite re-render loop → "Maximum update
  // depth exceeded" crash. Pull raw refs, filter in useMemo.
  const doses = useDoseLogStore((s) => s.doses);
  const entries = useSideEffectStore((s) => s.entries);

  const observation = useMemo(() => {
    if (doses.length === 0) {
      return 'No doses yet. Start in Calculator and I will pre-fill the math.';
    }
    const weekAgo = Date.now() - 7 * 86400_000;
    const recentCount = entries.filter(
      (e) => new Date(e.loggedAt).getTime() > weekAgo,
    ).length;
    if (recentCount >= 3) {
      return `${recentCount} side effects this week. Worth a check-in.`;
    }
    const recentDose = doses[0];
    if (recentDose) {
      return `Last logged: ${recentDose.peptideId} · ${recentDose.amount} ${recentDose.unit}.`;
    }
    return 'Pace looks healthy.';
  }, [doses, entries]);

  return (
    <V3DetailShell
      title="Doses"
      observation={observation}
      intent="doses_overview"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tiles}>
          {TILES.map((tile) => (
            <Pressable
              key={tile.key}
              onPress={() => {
                tapLight();
                router.push(tile.href as never);
              }}
              style={{ width: '100%' }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${tile.title}. ${tile.subtitle}`}
            >
              <GlassCard style={styles.tile}>
                <View style={styles.tileRow}>
                  <View
                    style={[
                      styles.iconBubble,
                      {
                        backgroundColor: t.isDark
                          ? 'rgba(201,136,90,0.18)'
                          : 'rgba(229,146,141,0.22)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={tile.icon}
                      size={22}
                      color={
                        t.isDark
                          ? ((t.colors as any).accentCognac as string)
                          : ((t.colors as any).accentRose as string)
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.tileTitle,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {tile.title}
                    </Text>
                    <Text
                      style={[
                        styles.tileSub,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {tile.subtitle}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={t.colors.textSecondary as string}
                  />
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  tiles: {
    gap: 12,
    paddingTop: 4,
  },
  tile: {
    paddingVertical: 16,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontSize: 17,
  },
  tileSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
