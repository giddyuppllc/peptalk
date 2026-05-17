/**
 * Nutrition — Master Refactor Plan v3.1 §6.
 *
 * Protein-focal home for the vertical:
 *   1. Photo food log (top, Pro-gated) — §6.3
 *   2. Protein ring + secondary macro bars — §6.1
 *   3. Water tracker (cup-tap) — §6.5
 *   4. Appetite log chips — §6.6
 *   5. AI meal plan ribbon (Pro) — §6.7
 *   6. Macro target settings shortcut — §6.2
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  V3DetailShell,
  GlassCard,
  MacroRing,
  MacroBar,
} from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useMealStore } from '../../src/store/useMealStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import {
  useAppetiteLogStore,
  APPETITE_OPTIONS,
  type AppetiteState,
} from '../../src/store/useAppetiteLogStore';

const CUP_OZ = 8;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function NutritionScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const today = todayKey();
  const targets = useMealStore((s) => s.targets);
  const totals = useMealStore((s) => s.getDailyTotals(today));
  const waterOz = useMealStore((s) => s.getWater(today));
  const logWater = useMealStore((s) => s.logWater);
  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = tier !== 'free';
  const logAppetite = useAppetiteLogStore((s) => s.logAppetite);
  const recentAppetite = useAppetiteLogStore((s) => s.getByDate(today));

  const proteinDeficit = useMemo(() => {
    if (!targets.proteinGrams) return null;
    const gap = targets.proteinGrams - totals.proteinGrams;
    if (gap <= 0) return null;
    return Math.round(gap);
  }, [totals.proteinGrams, targets.proteinGrams]);

  const observation =
    proteinDeficit !== null
      ? `Protein is ${proteinDeficit}g short of target. I can suggest meals.`
      : "You're tracking on protein. Nice.";

  const cups = Math.floor(waterOz / CUP_OZ);
  const cupTarget = Math.max(1, Math.round((targets.waterOz ?? 64) / CUP_OZ));

  const handlePhotoLog = () => {
    tapMedium();
    if (!isPro) {
      router.push('/subscription' as never);
      return;
    }
    // Pro path uses the existing photo meal-scan flow.
    router.push('/nutrition/meal-scan' as never);
  };

  const handleAppetite = (state: AppetiteState) => {
    tapLight();
    logAppetite(state);
  };

  return (
    <V3DetailShell
      title="Nutrition"
      observation={observation}
      intent="nutrition_overview"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* §6.3 — Photo food log */}
        <Pressable onPress={handlePhotoLog}>
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.photoRow}>
              <View
                style={[
                  styles.cameraBubble,
                  {
                    backgroundColor: isPro
                      ? t.isDark
                        ? 'rgba(201,136,90,0.22)'
                        : 'rgba(229,146,141,0.22)'
                      : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <Ionicons
                  name="camera-outline"
                  size={26}
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
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  {isPro ? 'Snap to log a meal' : 'Photo log — Pro feature'}
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? 'Aimee estimates macros, you confirm before it writes.'
                    : 'Upgrade to log meals by photo — Aimee estimates macros.'}
                </Text>
              </View>
              {!isPro ? (
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.30)'
                        : 'rgba(229,146,141,0.25)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.4,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              ) : null}
            </View>
          </GlassCard>
        </Pressable>

        {/* §6.1 — Protein-focal macros */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.macroLayout}>
            <MacroRing
              current={totals.proteinGrams}
              target={targets.proteinGrams}
              unit="g"
              label="PROTEIN"
              size={128}
            />
            <View style={{ flex: 1, marginLeft: 18 }}>
              <MacroBar
                kind="carbs"
                current={totals.carbsGrams}
                target={targets.carbsGrams}
              />
              <MacroBar
                kind="fat"
                current={totals.fatGrams}
                target={targets.fatGrams}
              />
              <MacroBar
                kind="fiber"
                current={totals.fiberGrams ?? 0}
                target={targets.fiberGrams ?? 30}
              />
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.calsRow}>
            <Text
              style={[
                styles.calsLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              CALORIES
            </Text>
            <Text
              style={[
                styles.calsValue,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              {Math.round(totals.calories)} / {Math.round(targets.calories)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/nutrition/targets' as never);
            }}
            style={styles.targetsLink}
          >
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
                textDecorationLine: 'underline',
              }}
            >
              Adjust targets
            </Text>
          </Pressable>
        </GlassCard>

        {/* §6.5 — Water tracker */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.rowBetween}>
            <Text
              style={[
                styles.cardTitle,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              Water
            </Text>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
              }}
            >
              {cups} / {cupTarget} cups
            </Text>
          </View>
          <View style={styles.cupRow}>
            {Array.from({ length: cupTarget }).map((_, i) => {
              const filled = i < cups;
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    tapLight();
                    if (i < cups) {
                      // Tap a filled cup to remove
                      logWater(today, -CUP_OZ);
                    } else {
                      logWater(today, CUP_OZ);
                    }
                  }}
                  hitSlop={6}
                >
                  <Ionicons
                    name={filled ? 'water' : 'water-outline'}
                    size={26}
                    color={
                      filled
                        ? t.isDark
                          ? ((t.colors as any).accentCognac as string)
                          : '#7AA9C9'
                        : (t.colors.textSecondary as string)
                    }
                  />
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* §6.6 — Appetite log */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.cardTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            How's your appetite?
          </Text>
          <View style={styles.appetiteRow}>
            {APPETITE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.state}
                onPress={() => handleAppetite(opt.state)}
                style={[
                  styles.appetiteChip,
                  { borderColor: opt.tint, backgroundColor: 'transparent' },
                ]}
              >
                <Text style={styles.appetiteEmoji}>{opt.emoji}</Text>
                <Text
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyMedium,
                    fontSize: 12,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {recentAppetite.length > 0 ? (
            <Text
              style={{
                marginTop: 10,
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 11,
              }}
            >
              {recentAppetite.length} entr
              {recentAppetite.length === 1 ? 'y' : 'ies'} logged today.
            </Text>
          ) : null}
        </GlassCard>

        {/* §6.7 — AI meal plan (Pro) */}
        <Pressable
          onPress={() => {
            tapLight();
            if (!isPro) {
              router.push('/subscription' as never);
              return;
            }
            router.push('/nutrition/meal-plan' as never);
          }}
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  AI meal plan
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? '7-day meals + grocery list, from your targets.'
                    : 'Pro: weekly plan from your targets, dietary prefs, and cycle.'}
                </Text>
              </View>
              {!isPro ? (
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.30)'
                        : 'rgba(229,146,141,0.25)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.4,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
              )}
            </View>
          </GlassCard>
        </Pressable>

        {/* Quick logger entry — sends user to existing food search */}
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/nutrition/food-search' as never);
          }}
          style={[
            styles.cta,
            { backgroundColor: t.colors.textPrimary as string },
          ]}
        >
          <Ionicons
            name="add"
            size={18}
            color={t.colors.bgBase1 as string}
          />
          <Text
            style={{
              color: t.colors.bgBase1 as string,
              fontFamily: t.typography.bodyBold,
              fontSize: 13,
              letterSpacing: 0.3,
            }}
          >
            Log a meal
          </Text>
        </Pressable>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  cardTitle: {
    fontSize: 17,
  },
  cardSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  macroLayout: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.10)',
    marginVertical: 12,
  },
  calsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calsLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  calsValue: {
    fontSize: 18,
  },
  targetsLink: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  appetiteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  appetiteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  appetiteEmoji: {
    fontSize: 14,
  },
  cta: {
    marginTop: 18,
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    gap: 8,
  },
});
