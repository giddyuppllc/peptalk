/**
 * Body Map — interactive human body model with health KPIs.
 * Tap a body region to see exercises, foods, and metrics for that zone.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AnimatedPress } from '@/components/AnimatedPress';
import { GlassCard } from '@/components/GlassCard';
import { BodyModel } from '@/components/BodyModel';
import { BodyRegionPanel } from '@/components/BodyRegionPanel';
import { BODY_REGIONS, BODY_REGION_MAP } from '@/data/bodyMapData';
import { Colors, FontSizes, Spacing, BorderRadius, Gradients } from '@/constants/theme';

export default function BodyMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const regionColors = Object.fromEntries(
    BODY_REGIONS.map((r) => [r.id, r.color])
  );

  const activeRegion = selectedRegion ? BODY_REGION_MAP[selectedRegion] : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[Colors.darkBg, '#0a1018']}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Header ──────────────────────────────────────── */}
      <View style={styles.header}>
        <AnimatedPress onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <View>
          <Text style={styles.headerTitle}>Body Map</Text>
          <Text style={styles.headerSub}>Tap a region to explore</Text>
        </View>
      </View>

      {/* ── Region Quick-Select Pills ───────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {BODY_REGIONS.map((region) => {
          const isActive = selectedRegion === region.id;
          return (
            <AnimatedPress
              key={region.id}
              onPress={() =>
                setSelectedRegion(isActive ? null : region.id)
              }
              style={[
                styles.pill,
                isActive && { backgroundColor: `${region.color}25`, borderColor: region.color },
              ]}
            >
              <Ionicons
                name={region.icon as any}
                size={14}
                color={isActive ? region.color : Colors.darkTextSecondary}
              />
              <Text
                style={[
                  styles.pillText,
                  isActive && { color: region.color },
                ]}
              >
                {region.label}
              </Text>
            </AnimatedPress>
          );
        })}
      </ScrollView>

      {/* ── Body Model ──────────────────────────────────── */}
      <View style={styles.bodyContainer}>
        <BodyModel
          selectedRegion={selectedRegion}
          onSelectRegion={(id) =>
            setSelectedRegion(selectedRegion === id ? null : id)
          }
          regionColors={regionColors}
        />

        {/* Instruction when nothing selected */}
        {!selectedRegion && (
          <GlassCard style={styles.hintCard}>
            <Ionicons name="hand-left-outline" size={20} color={Colors.pepTeal} />
            <Text style={styles.hintText}>
              Tap any body part to see workouts, nutrition, and health data
            </Text>
          </GlassCard>
        )}
      </View>

      {/* ── Detail Panel (slides up) ────────────────────── */}
      <BodyRegionPanel region={activeRegion} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  headerSub: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 1,
  },

  // Pills
  pillRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  pillText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },

  // Body
  bodyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hint
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  hintText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    flex: 1,
  },
});
