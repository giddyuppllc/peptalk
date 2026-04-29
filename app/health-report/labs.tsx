/**
 * Lab Results — manual entry screen.
 *
 * Lets users type their lab values into a structured form grouped by
 * panel (lipid, hormones, etc.). Persists locally; Aimee chat reads a
 * summary block at conversation time so she can answer "is my LDL OK?"
 * with the actual number.
 *
 * PDF/photo OCR ingest is a follow-up — the data shape is the same.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import {
  LAB_MARKERS,
  LAB_CATEGORY_LABELS,
  useLabResultsStore,
  type LabCategory,
  type LabMarker,
} from '../../src/store/useLabResultsStore';
import { Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function LabsScreen() {
  const router = useRouter();
  const t = useTheme();
  const addResult = useLabResultsStore((s) => s.addResult);
  const deleteResult = useLabResultsStore((s) => s.deleteResult);
  const latest = useLabResultsStore((s) => s.latest);
  const allResults = useLabResultsStore((s) => s.results);

  const [drawDate, setDrawDate] = useState(todayKey());
  const [values, setValues] = useState<Record<string, string>>({});
  const [expandedCategory, setExpandedCategory] = useState<LabCategory | null>('lipid');

  const grouped = useMemo(() => {
    const out: Record<LabCategory, LabMarker[]> = {} as any;
    for (const m of LAB_MARKERS) {
      if (!out[m.category]) out[m.category] = [];
      out[m.category].push(m);
    }
    return out;
  }, []);

  const handleSave = () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim());
    if (entries.length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one lab value.');
      return;
    }
    let saved = 0;
    for (const [markerId, raw] of entries) {
      const marker = LAB_MARKERS.find((m) => m.id === markerId);
      if (!marker) continue;
      const num = parseFloat(raw);
      if (isNaN(num)) continue;
      addResult({
        markerId,
        value: num,
        unit: marker.unit,
        date: drawDate,
      });
      saved++;
    }
    if (saved === 0) {
      Alert.alert('No valid numbers', 'Please enter numeric values.');
      return;
    }
    Alert.alert('Saved', `Logged ${saved} lab value${saved === 1 ? '' : 's'} for ${drawDate}. Aimee can reference these in chat now.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const renderMarker = (marker: LabMarker) => {
    const prev = latest(marker.id);
    const refRange = marker.refLow != null && marker.refHigh != null
      ? `${marker.refLow}–${marker.refHigh}`
      : '';
    return (
      <View key={marker.id} style={[styles.markerRow, { borderBottomColor: t.cardBorder }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.markerLabel, { color: t.text }]}>{marker.label}</Text>
          <Text style={[styles.markerHint, { color: t.textSecondary }]}>
            {refRange ? `Ref ${refRange} ${marker.unit}` : marker.unit}
            {prev ? ` · last: ${prev.value} on ${prev.date}` : ''}
          </Text>
        </View>
        <TextInput
          style={[
            styles.valueInput,
            { color: t.text, borderColor: t.cardBorder, backgroundColor: t.surface },
          ]}
          placeholder="—"
          placeholderTextColor={t.textMuted}
          keyboardType="decimal-pad"
          value={values[marker.id] ?? ''}
          onChangeText={(v) => setValues((s) => ({ ...s, [marker.id]: v }))}
          accessibilityLabel={`${marker.label} value in ${marker.unit}`}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Lab Results</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Enter your most recent bloodwork. Aimee will reference these values
          when answering questions about your health. PDF / photo upload is
          coming — for now, type in the numbers from your provider.
        </Text>

        {/* Draw date */}
        <View style={styles.dateRow}>
          <Text style={[styles.dateLabel, { color: t.textSecondary }]}>Drawn on:</Text>
          <TextInput
            style={[
              styles.dateInput,
              { color: t.text, borderColor: t.cardBorder, backgroundColor: t.surface },
            ]}
            value={drawDate}
            onChangeText={setDrawDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={t.textMuted}
          />
        </View>

        {/* Panels */}
        {(Object.keys(grouped) as LabCategory[]).map((cat) => {
          const isExpanded = expandedCategory === cat;
          const markers = grouped[cat];
          return (
            <GlassCard key={cat} style={styles.panelCard}>
              <TouchableOpacity
                onPress={() => setExpandedCategory(isExpanded ? null : cat)}
                style={styles.panelHeader}
                accessibilityRole="button"
              >
                <Text style={[styles.panelTitle, { color: t.text }]}>
                  {LAB_CATEGORY_LABELS[cat]}
                </Text>
                <Text style={[styles.panelCount, { color: t.textSecondary }]}>
                  {markers.length} marker{markers.length === 1 ? '' : 's'}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={t.textSecondary}
                />
              </TouchableOpacity>
              {isExpanded && <View style={styles.panelBody}>{markers.map(renderMarker)}</View>}
            </GlassCard>
          );
        })}

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, { backgroundColor: t.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Save lab values"
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.saveBtnText}>Save Lab Values</Text>
        </TouchableOpacity>

        {/* History */}
        {allResults.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.historyTitle, { color: t.textSecondary }]}>
              RECENT ENTRIES
            </Text>
            {allResults.slice(0, 12).map((r) => {
              const marker = LAB_MARKERS.find((m) => m.id === r.markerId);
              if (!marker) return null;
              return (
                <View
                  key={r.id}
                  style={[styles.historyRow, { borderBottomColor: t.cardBorder }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyLabel, { color: t.text }]}>
                      {marker.label}
                    </Text>
                    <Text style={[styles.historyMeta, { color: t.textSecondary }]}>
                      {r.value} {marker.unit} · {r.date}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteResult(r.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${marker.label} entry`}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={t.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  subtitle: { fontSize: FontSizes.sm, lineHeight: 20, marginBottom: Spacing.md },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  dateLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  dateInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: FontSizes.md,
  },
  panelCard: { marginBottom: Spacing.sm, padding: 0 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 8,
  },
  panelTitle: { fontSize: FontSizes.md, fontWeight: '700', flex: 1 },
  panelCount: { fontSize: FontSizes.xs },
  panelBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: 12,
    borderBottomWidth: 1,
  },
  markerLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  markerHint: { fontSize: FontSizes.xs, marginTop: 2 },
  valueInput: {
    width: 90,
    height: 36,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: FontSizes.md,
    textAlign: 'right',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  saveBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  historySection: { marginTop: Spacing.xl },
  historyTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  historyLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  historyMeta: { fontSize: FontSizes.xs, marginTop: 2 },
});
