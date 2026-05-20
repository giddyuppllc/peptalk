/**
 * AdherenceCard — Home-tab adherence widget.
 *
 * Wraps the shared `AdherenceDial` (built originally for the
 * Peptides tab) in a card that reads from `useDoseLogStore` and runs
 * the same `resolveActiveCycle` logic the Peptides tab uses. Surfaces
 * adherence into the unified progress dashboard so users don't have
 * to bounce between tabs to see how they're tracking.
 *
 * Hides itself entirely when the user has no active protocol — no
 * "0% adherence" empty shame state. The Stacks tab handles the
 * onboarding nudge, this is purely additive.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { useDoseLogStore } from '../../store/useDoseLogStore';
import { resolveActiveCycle } from '../../utils/doseAdherence';
import { selectionTick } from '../../utils/haptics';
import { AdherenceDial } from '../peptides/AdherenceDial';
import { Spacing, BorderRadius } from '../../constants/theme';

export const AdherenceCard: React.FC = () => {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const protocols = useDoseLogStore((s) => s.protocols);
  const doses = useDoseLogStore((s) => s.doses);

  const active = useMemo(
    () => resolveActiveCycle(protocols, doses),
    [protocols, doses],
  );

  // Empty state — no active protocol. Render nothing so the parent
  // dashboard doesn't show a stale "0%" dial. The Peptides tab owns
  // the "start a protocol" nudge.
  if (!active) return null;

  const open = () => {
    selectionTick();
    router.push('/(tabs)/my-stacks' as never);
  };

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={`Dose adherence ${active.adherencePct} percent. Open Peptides tab.`}
      style={[
        styles.card,
        { backgroundColor: t.card, borderColor: t.cardBorder },
      ]}
    >
      <View style={styles.dialCol}>
        <AdherenceDial
          percent={active.adherencePct}
          centerLabel={`${active.adherencePct}%`}
          subLabel="adherence"
          size={108}
          strokeWidth={10}
          color={accent.deep}
          gradientEnd={accent.darker}
          trackColor={t.cardBorder}
          centerLabelColor={t.text}
          subLabelColor={t.textSecondary}
        />
      </View>

      <View style={styles.metaCol}>
        <Text style={[styles.eyebrow, { color: t.textSecondary }]}>
          DOSE ADHERENCE
        </Text>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {active.peptideName}
        </Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Day {active.currentDay} of {active.totalDays}
        </Text>
        <Text style={[styles.dosesLine, { color: t.textMuted ?? t.textSecondary }]}>
          {active.loggedDoses.length} of {active.expectedDoses} doses logged
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  dialCol: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCol: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: 'DMSans-Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Playfair-ExtraBold',
    fontSize: 18,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    marginBottom: 2,
  },
  dosesLine: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
  },
});

export default AdherenceCard;
