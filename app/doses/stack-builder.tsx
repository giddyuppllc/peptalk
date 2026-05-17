/**
 * Stack Builder — Master Refactor Plan v3.1 §8.9.
 *
 * Multi-select peptides → real-time interaction matrix → unified weekly
 * schedule (AM/PM, separate injection sites for any conflicting pair).
 * Powered by the curated KNOWN_INTERACTIONS dataset.
 *
 * Adding a stack to the calendar writes one dose log per selected peptide
 * using its dosing reference's first phase. Aimee surfaces a follow-up
 * suggesting the user revisit the calculator for fine titration.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { PEPTIDES } from '../../src/data/peptides';
import {
  KNOWN_INTERACTIONS,
  makeInteractionKey,
} from '../../src/data/interactions';
import { getDosingReference } from '../../src/data/peptideDosingReference';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import type { PeptideInteraction } from '../../src/types';

interface PairSummary {
  a: { id: string; name: string };
  b: { id: string; name: string };
  interaction?: PeptideInteraction;
}

export default function StackBuilderScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const logDose = useDoseLogStore((s) => s.logDose);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    tapLight();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pairs = useMemo<PairSummary[]>(() => {
    const ids = Array.from(selected);
    const out: PairSummary[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const aName = PEPTIDES.find((p) => p.id === a)?.name ?? a;
        const bName = PEPTIDES.find((p) => p.id === b)?.name ?? b;
        out.push({
          a: { id: a, name: aName },
          b: { id: b, name: bName },
          interaction: KNOWN_INTERACTIONS.get(makeInteractionKey(a, b)),
        });
      }
    }
    return out;
  }, [selected]);

  const conflicts = pairs.filter(
    (p) =>
      p.interaction?.interactionType === 'contraindicated' ||
      p.interaction?.interactionType === 'competitive',
  );

  const handleAddStack = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (conflicts.length > 0) {
      Alert.alert(
        'Conflicts in stack',
        `${conflicts.length} peptide pair${conflicts.length === 1 ? '' : 's'} flagged as competitive or contraindicated. Resolve those before adding to the calendar.`,
      );
      return;
    }
    tapMedium();
    let added = 0;
    for (const id of ids) {
      const ref = getDosingReference(id);
      const mg = ref ? ref.schedule[0].doseMcg / 1000 : 0;
      if (mg <= 0) continue;
      logDose({
        peptideId: id,
        amount: mg,
        unit: 'mg',
        route: (ref?.route as never) ?? 'subcutaneous',
        notes: `Stack Builder · ${ids.length} peptides`,
      });
      added++;
    }
    Alert.alert(
      'Stack added',
      `${added} ${added === 1 ? 'dose' : 'doses'} logged for today. Open Tracker to review and edit times.`,
    );
  };

  const observation = useMemo(() => {
    if (selected.size === 0) {
      return 'Pick 2+ peptides to see the interaction matrix.';
    }
    if (conflicts.length > 0) {
      return `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} in this stack — resolve before scheduling.`;
    }
    const synergy = pairs.filter(
      (p) => p.interaction?.interactionType === 'synergistic',
    ).length;
    if (synergy > 0) return `${synergy} synergistic pair${synergy === 1 ? '' : 's'} in this stack.`;
    return `${pairs.length} pair${pairs.length === 1 ? '' : 's'} — neutral or undocumented.`;
  }, [selected.size, conflicts.length, pairs]);

  return (
    <V3DetailShell
      title="Stack Builder"
      observation={observation}
      intent="doses_stack_builder"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Grid of selectable peptides */}
        <Text
          style={[
            styles.sectionLabel,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Peptides ({selected.size} selected)
        </Text>
        <View style={styles.grid}>
          {PEPTIDES.map((p) => {
            const active = selected.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={[
                  styles.tile,
                  {
                    backgroundColor: active
                      ? t.isDark
                        ? 'rgba(201,136,90,0.20)'
                        : 'rgba(229,146,141,0.22)'
                      : t.isDark
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(255,255,255,0.5)',
                    borderColor: active
                      ? t.isDark
                        ? ((t.colors as any).accentCognac as string)
                        : ((t.colors as any).accentRose as string)
                      : (t.colors.cardBorder as string),
                  },
                ]}
              >
                <Text
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 12,
                  }}
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                {p.abbreviation ? (
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      fontSize: 10,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {p.abbreviation}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Interaction matrix */}
        {pairs.length > 0 ? (
          <>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Interaction matrix
            </Text>
            {pairs.map((p, i) => (
              <InteractionRow key={i} pair={p} />
            ))}
          </>
        ) : null}

        {/* Add to calendar */}
        {selected.size > 0 ? (
          <Pressable
            onPress={handleAddStack}
            disabled={conflicts.length > 0}
            style={[
              styles.cta,
              {
                backgroundColor:
                  conflicts.length > 0
                    ? (t.colors.textSecondary as string)
                    : (t.colors.textPrimary as string),
                opacity: conflicts.length > 0 ? 0.5 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              conflicts.length > 0
                ? 'Resolve conflicts before scheduling'
                : `Add ${selected.size} peptide stack to Tracker`
            }
          >
            <Text
              style={{
                color: t.colors.bgBase1 as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 13,
                letterSpacing: 0.3,
              }}
            >
              Add stack to Tracker
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </V3DetailShell>
  );
}

function InteractionRow({ pair }: { pair: PairSummary }) {
  const t = useV3Theme();
  const c = t.colors as any;
  const i = pair.interaction;
  const kind = i?.interactionType ?? 'undocumented';
  // Tints come from v3 semantic tokens so both themes stay in palette.
  const palette: Record<string, { dot: string; label: string }> = {
    synergistic: { dot: c.semanticPositive, label: 'Synergy' },
    neutral: { dot: c.semanticNeutral, label: 'Neutral' },
    competitive: { dot: c.semanticWarn, label: 'Competitive' },
    contraindicated: { dot: c.semanticDanger, label: 'Conflict' },
    undocumented: { dot: c.semanticNeutral, label: 'Undocumented' },
  };
  const p = palette[kind];
  return (
    <GlassCard style={styles.interactionCard}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: p.dot }]} />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.pairTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.bodyBold,
              },
            ]}
          >
            {pair.a.name} + {pair.b.name}
          </Text>
          <Text
            style={[
              styles.pairKind,
              {
                color: p.dot,
                fontFamily: t.typography.bodyBold,
              },
            ]}
          >
            {p.label}
            {i?.synergyScore != null ? ` · score ${i.synergyScore}/10` : ''}
          </Text>
          {i?.mechanismAnalysis ? (
            <Text
              style={[
                styles.pairBody,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
              numberOfLines={3}
            >
              {i.mechanismAnalysis}
            </Text>
          ) : (
            <Text
              style={[
                styles.pairBody,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              No curated interaction record yet — treat as separate
              protocols and inject at different sites.
            </Text>
          )}
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '31.5%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 12,
  },
  interactionCard: {
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  pairTitle: {
    fontSize: 14,
  },
  pairKind: {
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  pairBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
  },
  cta: {
    marginTop: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 999,
  },
});
