/**
 * Lab entry — Master Refactor Plan v3.1 §10.1.
 *
 * Manual entry surface. Each marker chip opens an inline numeric input;
 * submit writes to useLabResultsStore. The vendor parser path (LabCorp,
 * Quest, photo OCR) pre-fills the same fields so this screen is the
 * single confirm step before save.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import {
  useLabResultsStore,
  LAB_MARKERS,
  LAB_CATEGORY_LABELS,
  type LabCategory,
} from '../../src/store/useLabResultsStore';
import { useAimeeReportsStore } from '../../src/store/useAimeeReportsStore';
import { detectLabParser } from '../../src/services/labParsers';
import { recognizeLabPhoto } from '../../src/services/labOcr';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { isValidIsoDate } from '../../src/utils/aimeeActionSanitize';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORIES: LabCategory[] = [
  'lipid',
  'metabolic',
  'hormone',
  'inflammation',
  'liver',
  'kidney',
  'cbc',
  'vitamin',
];

export default function LabEntryScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const addResult = useLabResultsStore((s) => s.addResult);
  const refreshInsights = useAimeeReportsStore((s) => s.refreshInsights);

  const [category, setCategory] = useState<LabCategory>('lipid');
  const [drawDate, setDrawDate] = useState(todayKey());
  const [values, setValues] = useState<Record<string, string>>({});

  // Lab vision OCR can take 10-20s. Guard post-await setState so backing
  // out mid-scan doesn't bleed state into the next mount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // §10.1 — paste raw text from a LabCorp / Quest report (OCR output,
  // PDF text extraction, or copy-paste from the patient portal). The
  // vendor adapter pattern auto-detects and pre-fills the form.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [parseStatus, setParseStatus] = useState<string | null>(null);

  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = tier !== 'free';
  const [scanInFlight, setScanInFlight] = useState(false);

  const handleScanPhoto = async () => {
    if (!isPro) {
      router.push('/subscription' as never);
      return;
    }
    tapMedium();
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          Alert.alert(
            'Photos access needed',
            'Allow camera or library access in Settings to scan a report.',
          );
          return;
        }
      }
      const result = perm.granted
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.9,
          });
      if (result.canceled || !result.assets?.[0]) return;
      setScanInFlight(true);
      const ocr = await recognizeLabPhoto(result.assets[0].uri);
      if (!mountedRef.current) return;
      setScanInFlight(false);
      if (!ocr.ok) {
        const msg =
          ocr.reason === 'unavailable'
            ? 'Vision OCR is rolling out — paste the report text or enter values manually.'
            : ocr.reason === 'no_match'
              ? 'No lab values detected in the photo. Try a clearer crop or paste the text.'
              : `Scan failed: ${ocr.error ?? 'unknown error'}.`;
        setParseStatus(msg);
        return;
      }
      // Validate vision output before piping into form state. A 50MB
      // value string would freeze the TextInput; an unknown markerId
      // would create dead keys; a malformed drawDate would corrupt
      // every saved row's sort key. The save handler at line 175+
      // also enforces markerId allowlist + parseFloat, so this is
      // belt-and-braces — guards the UI, not just the persistence.
      const validMarkerIds = new Set(LAB_MARKERS.map((m) => m.id));
      const nextValues: Record<string, string> = {};
      for (const v of (ocr.values ?? []).slice(0, 80)) {
        if (typeof v.markerId !== 'string' || !validMarkerIds.has(v.markerId)) continue;
        const n = Number(v.value);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) continue;
        nextValues[v.markerId] = String(n);
      }
      setValues((prev) => ({ ...prev, ...nextValues }));
      if (ocr.drawDate && isValidIsoDate(ocr.drawDate)) setDrawDate(ocr.drawDate);
      const filled = Object.keys(nextValues).length;
      setParseStatus(
        `${ocr.vendor ?? 'Vision'}: pre-filled ${filled} marker${filled === 1 ? '' : 's'}.${ocr.unmappedLines.length ? ` ${ocr.unmappedLines.length} lines unmapped.` : ''}`,
      );
    } catch (err) {
      if (!mountedRef.current) return;
      setScanInFlight(false);
      Alert.alert(
        'Could not scan',
        err instanceof Error ? err.message : 'Try paste-text instead.',
      );
    }
  };

  const handleParsePasted = () => {
    if (!pastedText.trim()) {
      setParseStatus('Nothing to parse.');
      return;
    }
    const parser = detectLabParser(pastedText);
    if (!parser) {
      setParseStatus(
        'Could not auto-detect the vendor. Check the report header — LabCorp and Quest are supported today.',
      );
      return;
    }
    const result = parser.parseText(pastedText);
    if (result.values.length === 0) {
      setParseStatus(
        `${parser.label} detected, but no markers matched. Add them manually below.`,
      );
      return;
    }
    // Same defense as the OCR path — even though paste-text parsers
    // are deterministic (LabCorp/Quest regex), the input itself is
    // user-pasted and could be a 5MB blob of crafted gibberish.
    const validMarkerIds = new Set(LAB_MARKERS.map((m) => m.id));
    const nextValues: Record<string, string> = {};
    for (const v of (result.values ?? []).slice(0, 80)) {
      if (typeof v.markerId !== 'string' || !validMarkerIds.has(v.markerId)) continue;
      const n = Number(v.value);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) continue;
      nextValues[v.markerId] = String(n);
    }
    setValues((prev) => ({ ...prev, ...nextValues }));
    if (result.drawDate && isValidIsoDate(result.drawDate)) setDrawDate(result.drawDate);
    const filled = Object.keys(nextValues).length;
    setParseStatus(
      `${parser.label}: pre-filled ${filled} marker${filled === 1 ? '' : 's'}.${result.unmappedLines.length ? ` ${result.unmappedLines.length} lines unmapped — add manually if needed.` : ''}`,
    );
    setPasteOpen(false);
  };

  const markers = LAB_MARKERS.filter((m) => m.category === category);

  const handleSave = () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim() !== '');
    if (entries.length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one value before saving.');
      return;
    }
    tapMedium();
    let savedCount = 0;
    for (const [markerId, raw] of entries) {
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) continue;
      const marker = LAB_MARKERS.find((m) => m.id === markerId);
      if (!marker) continue;
      addResult({
        markerId,
        value,
        unit: marker.unit,
        date: drawDate,
      });
      savedCount++;
    }
    // §10.4 — Aimee narrative on new upload. Refreshing insights picks
    // up the new data point in the next correlation pass.
    refreshInsights();
    // §16 — fire the ingest push so the user gets a tap-to-read banner.
    // Fire-and-forget; failure here doesn't block the save.
    import('../../src/services/notificationService')
      .then((m) => m.fireIngestNarrativeNudge('labs'))
      .catch(() => {});
    Alert.alert(
      'Saved',
      `${savedCount} result${savedCount === 1 ? '' : 's'} added.`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <V3DetailShell
      title="Add results"
      observation="Enter values for as many markers as you have. Leave others blank."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Draw date */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.label,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            Draw date
          </Text>
          <View
            style={[
              styles.inputBox,
              {
                borderColor: t.colors.cardBorder as string,
                backgroundColor: t.isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.5)',
              },
            ]}
          >
            <TextInput
              value={drawDate}
              onChangeText={setDrawDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.colors.textSecondary as string}
              style={{
                flex: 1,
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 14,
              }}
            />
          </View>
        </GlassCard>

        {/* §10.1 — vision OCR. Pro feature; fail-soft when the edge
            function isn't deployed yet. */}
        <Pressable
          onPress={handleScanPhoto}
          disabled={scanInFlight}
          accessibilityRole="button"
          accessibilityLabel={
            isPro
              ? scanInFlight
                ? 'Scanning report — please wait'
                : 'Scan a report photo with vision OCR'
              : 'Upgrade to Pro to unlock photo OCR'
          }
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.pasteRow}>
              <Ionicons
                name="camera-outline"
                size={18}
                color={t.colors.textSecondary as string}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.pasteTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  {isPro ? 'Scan a report photo' : 'Photo OCR (Pro)'}
                </Text>
                <Text
                  style={[
                    styles.pasteHint,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {scanInFlight
                    ? 'Scanning…'
                    : isPro
                      ? 'Vision pulls structured markers. You confirm before save.'
                      : 'Upgrade to let Aimee extract markers from a photo.'}
                </Text>
              </View>
              <Ionicons
                name={scanInFlight ? 'ellipsis-horizontal' : 'chevron-forward'}
                size={16}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {/* §10.1 — paste-text parser. Reachable from this screen so the
            vendor adapters in src/services/labParsers/ get used today
            without a full OCR pipeline. */}
        <Pressable
          onPress={() => {
            setPasteOpen((v) => !v);
            setParseStatus(null);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            pasteOpen
              ? 'Close paste-from-report panel'
              : 'Open paste-from-report panel'
          }
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.pasteRow}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={t.colors.textSecondary as string}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.pasteTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Paste from a LabCorp or Quest report
                </Text>
                <Text
                  style={[
                    styles.pasteHint,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  We pre-fill the form. You confirm the numbers before save.
                </Text>
              </View>
              <Ionicons
                name={pasteOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>
        {pasteOpen ? (
          <GlassCard style={styles.cardSpacing}>
            <View
              style={[
                styles.pasteBox,
                {
                  borderColor: t.colors.cardBorder as string,
                  backgroundColor: t.isDark
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.5)',
                },
              ]}
            >
              <TextInput
                value={pastedText}
                onChangeText={setPastedText}
                placeholder="Paste your report text here…"
                placeholderTextColor={t.colors.textSecondary as string}
                multiline
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.body,
                  fontSize: 13,
                  minHeight: 120,
                  textAlignVertical: 'top',
                }}
                accessibilityLabel="Paste raw lab report text"
              />
            </View>
            <Pressable
              onPress={handleParsePasted}
              style={[
                styles.parseCta,
                { backgroundColor: t.colors.textPrimary as string },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Parse pasted report and pre-fill the form"
            >
              <Text
                style={{
                  color: t.colors.bgBase1 as string,
                  fontFamily: t.typography.bodyBold,
                  fontSize: 12,
                  letterSpacing: 0.3,
                }}
              >
                Parse + pre-fill
              </Text>
            </Pressable>
            {parseStatus ? (
              <Text
                style={[
                  styles.parseStatus,
                  {
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                  },
                ]}
              >
                {parseStatus}
              </Text>
            ) : null}
          </GlassCard>
        ) : null}

        {/* Category picker */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={LAB_CATEGORY_LABELS[c]}
              primary={category === c}
              onPress={() => {
                tapLight();
                setCategory(c);
              }}
            />
          ))}
        </View>

        {/* Markers */}
        {markers.map((m) => (
          <GlassCard key={m.id} style={styles.markerCard}>
            <View style={styles.markerRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.markerLabel,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                    },
                  ]}
                >
                  {m.label}
                </Text>
                <Text
                  style={[
                    styles.markerRef,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  Ref {m.refLow ?? '—'}-{m.refHigh ?? '—'} {m.unit}
                </Text>
              </View>
              <View
                style={[
                  styles.smallInput,
                  {
                    borderColor: t.colors.cardBorder as string,
                    backgroundColor: t.isDark
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(255,255,255,0.5)',
                  },
                ]}
              >
                <TextInput
                  value={values[m.id] ?? ''}
                  onChangeText={(v) =>
                    setValues((prev) => ({ ...prev, [m.id]: v }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={t.colors.textSecondary as string}
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 16,
                    minWidth: 60,
                    textAlign: 'right',
                  }}
                />
              </View>
            </View>
          </GlassCard>
        ))}

        <Pressable
          onPress={handleSave}
          style={[
            styles.saveCta,
            { backgroundColor: t.colors.textPrimary as string },
          ]}
        >
          <Ionicons
            name="checkmark"
            size={18}
            color={t.colors.bgBase1 as string}
          />
          <Text
            style={{
              color: t.colors.bgBase1 as string,
              fontFamily: t.typography.bodyBold,
              fontSize: 13,
              letterSpacing: 0.3,
              marginLeft: 6,
            }}
          >
            Save
          </Text>
        </Pressable>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  label: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputBox: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  catRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  markerCard: {
    marginTop: 8,
    paddingVertical: 12,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markerLabel: {
    fontSize: 14,
  },
  markerRef: {
    fontSize: 11,
    marginTop: 2,
  },
  smallInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 90,
  },
  saveCta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
  },
  pasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pasteTitle: {
    fontSize: 14,
  },
  pasteHint: {
    fontSize: 11,
    marginTop: 2,
  },
  pasteBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  parseCta: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  parseStatus: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
  },
});
