/**
 * Dose Tracker — Master Refactor Plan v3.1 §8.11.
 *
 * Historical dose log, filterable by peptide. Shows timestamp, peptide,
 * dose, draw volume (if known via notes), and route. Source of truth
 * is useDoseLogStore; this screen is a thin read view.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { PEPTIDES } from '../../src/data/peptides';

export default function DoseTrackerScreen() {
  const t = useV3Theme();
  const doses = useDoseLogStore((s) => s.doses);
  const deleteDose = useDoseLogStore((s) => s.deleteDose);
  const confirmPlannedDose = useDoseLogStore((s) => s.confirmPlannedDose);

  const [filter, setFilter] = useState<string | null>(null);

  const peptideOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const d of doses) {
      if (seen.has(d.peptideId)) continue;
      seen.add(d.peptideId);
      list.push({
        id: d.peptideId,
        name:
          PEPTIDES.find((p) => p.id === d.peptideId)?.name ?? d.peptideId,
      });
    }
    return list;
  }, [doses]);

  const filtered = useMemo(
    () => (filter ? doses.filter((d) => d.peptideId === filter) : doses),
    [doses, filter],
  );

  return (
    <V3DetailShell
      title="Dose Tracker"
      observation={
        doses.length === 0
          ? 'No doses logged yet. Add one from the Calculator.'
          : `${doses.length} doses across ${peptideOptions.length} peptides.`
      }
      intent="doses_tracker"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {peptideOptions.length > 1 ? (
          <View style={styles.filterRow}>
            <Chip
              label="All"
              primary={filter === null}
              onPress={() => {
                tapLight();
                setFilter(null);
              }}
            />
            {peptideOptions.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                primary={filter === p.id}
                onPress={() => {
                  tapLight();
                  setFilter(p.id);
                }}
              />
            ))}
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <GlassCard style={styles.empty}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              {doses.length === 0
                ? 'Your dose history shows up here once you log your first.'
                : 'Nothing logged for this peptide yet.'}
            </Text>
          </GlassCard>
        ) : (
          filtered.map((d) => {
            const name =
              PEPTIDES.find((p) => p.id === d.peptideId)?.name ??
              d.peptideId;
            return (
              <GlassCard
                key={d.id}
                style={[
                  styles.entryCard,
                  d.planned ? { opacity: 0.62 } : undefined,
                ]}
              >
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.headRow}>
                      <Text
                        style={[
                          styles.peptideName,
                          {
                            color: t.colors.textPrimary as string,
                            fontFamily: t.typography.bodyBold,
                          },
                        ]}
                      >
                        {name}
                      </Text>
                      {d.planned ? (
                        <View
                          style={[
                            styles.plannedPill,
                            {
                              borderColor: t.colors.cardBorder as string,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: t.colors.textSecondary as string,
                              fontFamily: t.typography.label,
                              fontSize: 9,
                              letterSpacing: 1.2,
                            }}
                          >
                            PLANNED
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.amount,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {d.amount} {d.unit}
                    </Text>
                    <Text
                      style={[
                        styles.meta,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {d.date} · {d.time} · {d.route}
                      {d.injectionSite ? ` · ${d.injectionSite}` : ''}
                    </Text>
                    {d.notes ? (
                      <Text
                        style={[
                          styles.notes,
                          {
                            color: t.colors.textSecondary as string,
                            fontFamily: t.typography.body,
                          },
                        ]}
                      >
                        {d.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.actions}>
                    {d.planned ? (
                      <Pressable
                        onPress={() => {
                          tapMedium();
                          confirmPlannedDose(d.id);
                        }}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${name} dose taken`}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color={t.colors.textPrimary as string}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        tapMedium();
                        deleteDose(d.id);
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${name} dose`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={t.colors.textSecondary as string}
                      />
                    </Pressable>
                  </View>
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  empty: {
    marginTop: 12,
  },
  entryCard: {
    marginBottom: 10,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plannedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  actions: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
  },
  peptideName: {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  amount: {
    fontSize: 20,
    marginTop: 4,
  },
  meta: {
    marginTop: 4,
    fontSize: 11,
  },
  notes: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: 'italic',
  },
});
