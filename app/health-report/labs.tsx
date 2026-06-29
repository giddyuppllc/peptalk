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
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import {
  interpretLatestLabs,
  isLabInterpretError,
  type LabInterpretation,
} from '../../src/services/labAnalysisService';
import {
  LAB_MARKERS,
  LAB_CATEGORY_LABELS,
  useLabResultsStore,
  type LabCategory,
  type LabMarker,
} from '../../src/store/useLabResultsStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { supabase } from '../../src/services/supabase';
import { Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Minimal markdown renderer for Aimee's lab interpretation.
 *
 * The aimee-lab-interpret edge function returns markdown (## headings,
 * **bold**, > blockquotes, - bullets). No markdown renderer is shared
 * app-wide (ChatBubble's is inline-bold only + not exported), so we
 * convert the common block + inline tokens to styled <Text> here rather
 * than adding a react-native-markdown dependency.
 */
function renderInlineBold(text: string, baseKey: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={`${baseKey}-b${i}`} style={mdStyles.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Text key={`${baseKey}-t${i}`}>{part}</Text>
    ),
  );
}

function InterpretationMarkdown({ markdown }: { markdown: string }) {
  const t = useTheme();
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return (
    <View>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();
        const key = `md-${idx}`;
        if (line.trim() === '') {
          return <View key={key} style={mdStyles.spacer} />;
        }
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          const hStyle =
            level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3;
          return (
            <Text key={key} style={[hStyle, { color: t.text }]}>
              {renderInlineBold(heading[2], key)}
            </Text>
          );
        }
        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
          return (
            <View key={key} style={[mdStyles.quote, { borderLeftColor: '#9b6cd9' }]}>
              <Text style={[mdStyles.quoteText, { color: t.textSecondary }]}>
                {renderInlineBold(quote[1], key)}
              </Text>
            </View>
          );
        }
        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={key} style={mdStyles.bulletRow}>
              <Text style={[mdStyles.bulletDot, { color: '#9b6cd9' }]}>•</Text>
              <Text style={[mdStyles.bulletText, { color: t.text }]}>
                {renderInlineBold(bullet[1], key)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={key} style={[mdStyles.paragraph, { color: t.text }]}>
            {renderInlineBold(line, key)}
          </Text>
        );
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  bold: { fontWeight: '700' },
  h1: { fontSize: FontSizes.lg, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  h2: { fontSize: FontSizes.md, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  h3: { fontSize: FontSizes.sm, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  paragraph: { fontSize: FontSizes.sm, lineHeight: 22, marginBottom: 4 },
  spacer: { height: 6 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, marginVertical: 4 },
  quoteText: { fontSize: FontSizes.sm, lineHeight: 22, fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', marginBottom: 3, paddingRight: 4 },
  bulletDot: { fontSize: FontSizes.sm, lineHeight: 22, marginRight: 6 },
  bulletText: { flex: 1, fontSize: FontSizes.sm, lineHeight: 22 },
});

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
  const [scanning, setScanning] = useState(false);
  const tier = useSubscriptionStore((s) => s.tier);
  // Wave 76.35: hasFeature() so plus + pro both unlock (matches server)
  // and TestFlight preview builds bypass paywall. Testers reported lab
  // scanning never worked — they got the PRO upsell wall.
  const canUseLabScan = useSubscriptionStore((s) => s.hasFeature('lab_scan'));

  // Deep AI interpretation state — request, cached markdown, error.
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<LabInterpretation | null>(null);

  const handleInterpretLabs = async () => {
    if (interpreting) return;
    if (allResults.length === 0) {
      Alert.alert(
        'Nothing to interpret',
        'Log at least one lab value first — Aimee\'s interpretation reads what you\'ve saved.',
      );
      return;
    }
    setInterpreting(true);
    try {
      const res = await interpretLatestLabs();
      if (isLabInterpretError(res)) {
        if (res.upgrade) {
          Alert.alert(
            'Pro feature',
            res.error,
            [
              { text: 'OK', style: 'cancel' },
              { text: 'See plans', onPress: () => router.push('/subscription' as any) },
            ],
          );
        } else {
          Alert.alert('Could not interpret', res.error);
        }
        setInterpretation(null);
      } else {
        setInterpretation(res);
      }
    } finally {
      setInterpreting(false);
    }
  };

  /**
   * Photo upload → Grok Vision → pre-filled lab values.
   * Pro-only at the edge function level — surfaced in UI as upgrade
   * prompt for non-Pro tiers.
   */
  const handleScanLabReport = async () => {
    if (!canUseLabScan) {
      Alert.alert(
        'Plus / Pro feature',
        'Photo / PDF lab parsing is available with PepTalk+ or Pro. You can still type values in below — that\'s available to everyone.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'See plans', onPress: () => router.push('/subscription' as any) },
        ],
      );
      return;
    }
    // Android uses the system Photo Picker (no permission needed), so a
    // non-granted result must NOT block the picker there. iOS still
    // requires the library permission.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'android') {
      Alert.alert('Photo library access denied', 'Allow photos so we can pick your lab report image.');
      return;
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
      allowsEditing: false,
    });
    if (pick.canceled || !pick.assets?.[0]?.base64) return;
    const base64 = pick.assets[0].base64;
    if (base64.length > 5_000_000) {
      Alert.alert('Photo too large', 'Try a smaller / lower-quality photo (most lab reports compress fine at medium quality).');
      return;
    }
    // App Review 5.1.2: explicit consent before sending the lab photo to the vision model.
    if (!(await ensureAiConsent())) return;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Sign in required', 'Please sign in to use lab parsing.');
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/lab-scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Scan failed', data.error ?? 'Could not parse the image.');
        return;
      }
      // Pre-fill the form with what Grok extracted. User reviews + saves.
      const extracted: Record<string, string> = { ...values };
      let count = 0;
      for (const r of data.results ?? []) {
        if (typeof r.markerId === 'string' && typeof r.value === 'number') {
          extracted[r.markerId] = String(r.value);
          count++;
        }
      }
      setValues(extracted);
      if (typeof data.drawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.drawDate)) {
        setDrawDate(data.drawDate);
      }
      const unmapped = (data.unmappedNotes ?? []) as string[];
      const unmappedMsg = unmapped.length > 0
        ? `\n\nWe couldn't auto-map these — review and add manually:\n${unmapped.slice(0, 6).map((n) => `• ${n}`).join('\n')}`
        : '';
      Alert.alert(
        'Pre-filled',
        `Parsed ${count} lab value${count === 1 ? '' : 's'} from your image. Review the panels below and tap Save.${unmappedMsg}`,
      );
    } catch (err) {
      Alert.alert('Network error', 'Could not reach the lab parser. Try again or enter values manually.');
    } finally {
      setScanning(false);
    }
  };

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
          Snap a photo of your bloodwork or type the values in. Aimee will
          reference these when answering questions about your health.
        </Text>

        {/* Photo upload — Pro feature, gracefully degrades to a "see plans"
            prompt for free / plus tiers. */}
        <TouchableOpacity
          onPress={handleScanLabReport}
          disabled={scanning}
          style={[
            styles.scanBtn,
            { backgroundColor: scanning ? t.textMuted : '#3E7CB1' },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Scan a photo of your lab report"
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="scan-outline" size={18} color="#fff" />
          )}
          <Text style={styles.scanBtnText}>
            {scanning ? 'Parsing your lab report…' : 'Scan lab report photo'}
          </Text>
          {!canUseLabScan && !scanning && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PLUS</Text>
            </View>
          )}
        </TouchableOpacity>

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

        {/* Aimee deep interpretation — Pro tier. Reads the user's saved
            labs + active peptide stack + demographic profile and returns
            a structured markdown report (patterns, peptide implications,
            follow-up suggestions). */}
        {allResults.length > 0 && (
          <TouchableOpacity
            onPress={handleInterpretLabs}
            disabled={interpreting}
            style={[
              styles.interpretBtn,
              {
                backgroundColor: interpreting ? t.textMuted : '#9b6cd9',
                opacity: interpreting ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Get an AI interpretation of your lab panel"
          >
            {interpreting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
            )}
            <Text style={styles.interpretBtnText}>
              {interpreting ? 'Aimee is reading your labs…' : 'Get AI interpretation'}
            </Text>
            {!canUseLabScan && !interpreting && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PLUS</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {interpretation && (
          <GlassCard style={styles.interpretCard}>
            <View style={styles.interpretHeader}>
              <Ionicons name="sparkles" size={16} color="#9b6cd9" />
              <Text style={[styles.interpretTitle, { color: t.text }]}>
                Aimee's interpretation
              </Text>
              <Text style={[styles.interpretMeta, { color: t.textSecondary }]}>
                {new Date(interpretation.generatedAt).toLocaleString()}
              </Text>
            </View>
            <InterpretationMarkdown markdown={interpretation.markdown} />
          </GlassCard>
        )}

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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  scanBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  proBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
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
  interpretBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    marginTop: 12,
  },
  interpretBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  interpretCard: { marginTop: 16, padding: 14 },
  interpretHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  interpretTitle: { flex: 1, fontSize: FontSizes.sm, fontWeight: '700' },
  interpretMeta: { fontSize: 11 },
  interpretBody: { fontSize: FontSizes.sm, lineHeight: 22 },
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
