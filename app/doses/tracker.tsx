/**
 * Dose Tracker — Master Refactor Plan v3.1 §8.11.
 *
 * Historical dose log, filterable by peptide. Shows timestamp, peptide,
 * dose, draw volume (if known via notes), and route. Source of truth
 * is useDoseLogStore; this screen is a thin read view.
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { PEPTIDES } from '../../src/data/peptides';
import { DoseLogEntry, DoseUnit } from '../../src/types';

// ---------------------------------------------------------------------------
// Edit-modal helpers — reuse the calendar's lightweight relative-date chips
// (no native date-picker dependency) so a logged/planned dose can be moved to
// a recent day without pulling in a new lib. See app/(tabs)/calendar.tsx.
// ---------------------------------------------------------------------------

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysKey = (deltaDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return toDateKey(d);
};

const EDIT_DATE_OPTIONS: { label: string; delta: number }[] = [
  { label: 'Today', delta: 0 },
  { label: 'Yesterday', delta: -1 },
  { label: '2 days ago', delta: -2 },
  { label: '3 days ago', delta: -3 },
];

const UNITS: DoseUnit[] = ['mcg', 'mg', 'IU', 'ml'];

export default function DoseTrackerScreen() {
  const t = useV3Theme();
  const doses = useDoseLogStore((s) => s.doses);
  const deleteDose = useDoseLogStore((s) => s.deleteDose);
  const confirmPlannedDose = useDoseLogStore((s) => s.confirmPlannedDose);
  const updateDose = useDoseLogStore((s) => s.updateDose);

  const [filter, setFilter] = useState<string | null>(null);

  // Edit modal — `editing` holds the dose under edit (null = closed). The
  // form fields seed from it when opened and write back via updateDose.
  const [editing, setEditing] = useState<DoseLogEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editUnit, setEditUnit] = useState<DoseUnit>('mcg');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // Accent matches the Chip primary treatment (rose on light, cognac on dark).
  const accent = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);

  const openEdit = (d: DoseLogEntry) => {
    tapLight();
    setEditing(d);
    setEditAmount(String(d.amount));
    setEditUnit(d.unit);
    setEditDate(d.date);
    setEditTime(d.time);
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = () => {
    if (!editing) return;
    const amount = parseFloat(editAmount);
    updateDose(editing.id, {
      amount: !isNaN(amount) && amount > 0 ? amount : editing.amount,
      unit: editUnit,
      date: editDate,
      time: editTime.trim() || editing.time,
    });
    tapMedium();
    setEditing(null);
  };

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
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        removeClippedSubviews
        windowSize={9}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          peptideOptions.length > 1 ? (
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
          ) : null
        }
        ListEmptyComponent={
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
        }
        renderItem={({ item: d }) => {
          const name =
            PEPTIDES.find((p) => p.id === d.peptideId)?.name ?? d.peptideId;
          return (
            <GlassCard
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
                    onPress={() => openEdit(d)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${name} dose`}
                  >
                    <Ionicons
                      name="create-outline"
                      size={18}
                      color={t.colors.textSecondary as string}
                    />
                  </Pressable>
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
        }}
      />

      {/* ── Edit dose modal ──────────────────────────────────────────── */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <GlassCard style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 16,
                  }}
                >
                  Edit dose
                </Text>
                <Pressable
                  onPress={closeEdit}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close edit"
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={t.colors.textPrimary as string}
                  />
                </Pressable>
              </View>

              {editing ? (
                <Text
                  style={{
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                    fontSize: 12,
                    marginBottom: 14,
                  }}
                >
                  {PEPTIDES.find((p) => p.id === editing.peptideId)?.name ??
                    editing.peptideId}
                </Text>
              ) : null}

              {/* Amount */}
              <Text style={[styles.fieldLabel, { color: t.colors.textSecondary as string, fontFamily: t.typography.label }]}>
                AMOUNT
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: t.colors.textPrimary as string,
                    borderColor: t.colors.cardBorder as string,
                    fontFamily: t.typography.body,
                  },
                ]}
                value={editAmount}
                onChangeText={setEditAmount}
                placeholder="e.g. 250"
                placeholderTextColor={t.colors.textSecondary as string}
                keyboardType="decimal-pad"
                accessibilityLabel="Dose amount"
              />

              {/* Unit */}
              <Text style={[styles.fieldLabel, { color: t.colors.textSecondary as string, fontFamily: t.typography.label }]}>
                UNIT
              </Text>
              <View style={styles.chipWrap}>
                {UNITS.map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    primary={editUnit === u}
                    onPress={() => {
                      tapLight();
                      setEditUnit(u);
                    }}
                  />
                ))}
              </View>

              {/* Date */}
              <Text style={[styles.fieldLabel, { color: t.colors.textSecondary as string, fontFamily: t.typography.label }]}>
                DATE
              </Text>
              <Text
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.body,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                {new Date(editDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              <View style={styles.chipWrap}>
                {EDIT_DATE_OPTIONS.map((opt) => {
                  const value = addDaysKey(opt.delta);
                  return (
                    <Chip
                      key={opt.label}
                      label={opt.label}
                      primary={editDate === value}
                      onPress={() => {
                        tapLight();
                        setEditDate(value);
                      }}
                    />
                  );
                })}
              </View>

              {/* Time */}
              <Text style={[styles.fieldLabel, { color: t.colors.textSecondary as string, fontFamily: t.typography.label }]}>
                TIME
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: t.colors.textPrimary as string,
                    borderColor: t.colors.cardBorder as string,
                    fontFamily: t.typography.body,
                  },
                ]}
                value={editTime}
                onChangeText={setEditTime}
                placeholder="e.g. 08:30"
                placeholderTextColor={t.colors.textSecondary as string}
                accessibilityLabel="Dose time"
              />

              {/* Actions */}
              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeEdit}
                  style={[styles.actionBtn, { borderColor: t.colors.cardBorder as string, borderWidth: 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel edit"
                >
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.bodyBold,
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={saveEdit}
                  style={[styles.actionBtn, { backgroundColor: accent }]}
                  accessibilityRole="button"
                  accessibilityLabel="Save dose"
                >
                  <Text
                    style={{
                      color: '#fff',
                      fontFamily: t.typography.bodyBold,
                      fontSize: 13,
                    }}
                  >
                    Save
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    maxHeight: '85%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
});
