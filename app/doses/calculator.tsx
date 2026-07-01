/**
 * Calculator v2.1 — Master Refactor Plan v3.1 §8 + §14.
 *
 * Five inputs (in order): Peptide → Vial size → mg in vial → Protocol
 * intent → per-shot override. Three output cards: Reconstitute, Draw
 * your dose, Full Protocol expander. mg/mcg toggle. Red-flag modal on
 * acetic-acid peptides. Add-to-calendar CTA writes the full protocol
 * schedule into the dose log so the Tracker reflects it immediately.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  V3DetailShell,
  GlassCard,
  SyringeSVG,
  FlagModal,
  Chip,
} from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { PEPTIDES } from '../../src/data/peptides';
import {
  getDosingReference,
  PEPTALK_DOSING_DISCLAIMER,
} from '../../src/data/peptideDosingReference';
import { getCalculatorMetadata } from '../../src/data/calculatorMetadata';
import { getDosingTableEntry } from '../../src/data/peptideDosingTable';
import {
  calculate,
  formatDose,
  formatVolumeMl,
  formatUnits,
  parseDoseToMg,
  generateCycleDates,
  type CalculatorWarning,
} from '../../src/utils/calculatorV2';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';

const VIAL_SIZES: (3 | 5 | 10)[] = [3, 5, 10];
type ProtocolIntent = 'gradual' | 'aggressive' | 'maintenance';

const INTENT_LABELS: Record<ProtocolIntent, string> = {
  gradual: 'Gradual',
  aggressive: 'Aggressive',
  maintenance: 'Maintenance',
};

// Local (not UTC) YYYY-MM-DD key so the start-date chips line up with the
// user's calendar day rather than drifting near midnight.
const localDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysKey = (deltaDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return localDateKey(d);
};

// Lightweight inline start-date picker — relative chips instead of a native
// date-picker dependency (BUG 2). Covers back-dating + starting later.
const START_DATE_OPTIONS: { label: string; delta: number }[] = [
  { label: 'Yesterday', delta: -1 },
  { label: 'Today', delta: 0 },
  { label: 'Tomorrow', delta: 1 },
  { label: 'In 1 week', delta: 7 },
];

export default function CalculatorV2Screen() {
  const t = useV3Theme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    peptideId?: string;
    doseMcg?: string;
    vialMg?: string;
    waterMl?: string;
  }>();
  const logDose = useDoseLogStore((s) => s.logDose);
  const scheduleCycle = useDoseLogStore((s) => s.scheduleCycle);

  const [peptideId, setPeptideId] = useState<string | null>(
    params.peptideId ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAceticFlag, setShowAceticFlag] = useState(false);
  const [showProtocol, setShowProtocol] = useState(false);

  const meta = useMemo(
    () => (peptideId ? getCalculatorMetadata(peptideId) : null),
    [peptideId],
  );
  const ref = useMemo(
    () => (peptideId ? getDosingReference(peptideId) : null),
    [peptideId],
  );
  const peptideName = useMemo(
    () =>
      peptideId
        ? (PEPTIDES.find((p) => p.id === peptideId)?.name ??
          peptideId)
        : null,
    [peptideId],
  );

  const [vialSizeMl, setVialSizeMl] = useState<3 | 5 | 10>(3);
  const [peptideMg, setPeptideMg] = useState<string>('');
  const [diluentMl, setDiluentMl] = useState<string>('');
  const [intent, setIntent] = useState<ProtocolIntent>('maintenance');
  const [perShotOverride, setPerShotOverride] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [displayUnit, setDisplayUnit] = useState<'mg' | 'mcg'>('mg');
  // BUG 2 — user-selectable cycle start date (default today).
  const [cycleStartDate, setCycleStartDate] = useState<string>(() =>
    localDateKey(new Date()),
  );

  // Re-prime inputs from metadata + reference whenever the peptide changes.
  useEffect(() => {
    if (!meta || !ref) return;
    setVialSizeMl(meta.standardVialSizeMl);
    setPeptideMg(String(ref.vialMg));
    setDiluentMl(
      String(meta.recommendedReconstitutionMl ?? meta.standardVialSizeMl),
    );
    setDisplayUnit(meta.displayUnit);
    setPerShotOverride('');
    if (meta.diluentType === 'aceticAcid') setShowAceticFlag(true);
  }, [meta, ref]);

  // Apply Aimee deep-link overrides AFTER the metadata effect so they win.
  // Aimee tool open_dosing_calculator passes:
  //   doseMcg   → preShotOverride (the user's intended per-shot dose)
  //   vialMg    → peptideMg
  //   waterMl   → diluentMl
  // Tracked refs prevent the override from looping when the user later
  // edits a field manually.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (!meta || !ref) return; // wait for metadata defaults first
    const doseMcg = params.doseMcg ? Number(params.doseMcg) : NaN;
    const vialMg = params.vialMg ? Number(params.vialMg) : NaN;
    const waterMl = params.waterMl ? Number(params.waterMl) : NaN;
    let applied = false;
    if (Number.isFinite(doseMcg) && doseMcg > 0) {
      // Honor displayUnit chosen by metadata: render the number in the
      // matching unit so the input box shows the same value Aimee said.
      const value = meta.displayUnit === 'mcg' ? doseMcg : doseMcg / 1000;
      setPerShotOverride(String(value));
      applied = true;
    }
    if (Number.isFinite(vialMg) && vialMg > 0) {
      setPeptideMg(String(vialMg));
      applied = true;
    }
    if (Number.isFinite(waterMl) && waterMl > 0) {
      setDiluentMl(String(waterMl));
      applied = true;
    }
    if (applied) deepLinkApplied.current = true;
  }, [meta, ref, params.doseMcg, params.vialMg, params.waterMl]);

  const phase = useMemo(() => {
    if (!ref) return null;
    // Map plan intent to existing schedule order: gradual = first (titration
    // start), aggressive = last (full target), maintenance = final
    // maintenance-labelled phase or the standard step.
    if (intent === 'gradual') return ref.schedule[0] ?? null;
    if (intent === 'aggressive')
      return ref.schedule[ref.schedule.length - 1] ?? null;
    return (
      ref.schedule.find((p) => /maint/i.test(p.label)) ??
      ref.schedule[Math.floor(ref.schedule.length / 2)] ??
      ref.schedule[0] ??
      null
    );
  }, [ref, intent]);

  const perShotMg = useMemo(() => {
    const override = parseFloat(perShotOverride);
    if (Number.isFinite(override) && override > 0) {
      return parseDoseToMg(override, displayUnit);
    }
    return phase ? phase.doseMcg / 1000 : 0;
  }, [perShotOverride, displayUnit, phase]);

  const result = useMemo(() => {
    const mg = parseFloat(peptideMg);
    const dil = parseFloat(diluentMl);
    if (!Number.isFinite(mg) || !Number.isFinite(dil)) return null;
    return calculate({
      peptideMgInVial: mg,
      diluentVolumeMl: dil,
      vialSizeMl,
      perShotDoseMg: perShotMg,
      recommendedReconstitutionMl: meta?.recommendedReconstitutionMl,
    });
  }, [peptideMg, diluentMl, vialSizeMl, perShotMg, meta]);

  const handleSelectPeptide = (id: string) => {
    tapLight();
    setPickerOpen(false);
    setPeptideId(id);
  };

  const handleAddToCalendar = async () => {
    if (!peptideId || !result || result.hardFailures.length > 0) return;
    tapMedium();
    try {
      logDose({
        peptideId,
        amount: perShotMg,
        unit: 'mg',
        route: 'subcutaneous',
        notes: `Calculator (${INTENT_LABELS[intent]}) — ${formatVolumeMl(
          result.drawPerShotMl,
        )} / ${formatUnits(result.drawPerShotUnits)}`,
      });
      Alert.alert(
        'Added to Tracker',
        `${peptideName} · ${formatDose(perShotMg, displayUnit)} logged for today. Open Tracker to see the full week.`,
        [{ text: 'OK' }],
      );
    } catch (err) {
      Alert.alert(
        'Could not log dose',
        err instanceof Error ? err.message : 'Try again.',
      );
    }
  };

  // §8.8 — bulk-schedule every planned dose across the cycle.
  const handleScheduleCycle = () => {
    if (!peptideId || !ref || !phase || !result || result.hardFailures.length > 0) return;
    tapMedium();
    const startISO = cycleStartDate;
    const dates = generateCycleDates(startISO, ref.cycleLength, phase.frequency);
    if (dates.length === 0) {
      Alert.alert(
        'Nothing to schedule',
        'Could not parse this protocol into a planned cadence. Log doses manually from Tracker.',
      );
      return;
    }
    Alert.alert(
      'Schedule cycle?',
      `${dates.length} planned doses across ~${Math.ceil(dates.length / 7) || 1} week${dates.length > 7 ? 's' : ''}. They'll appear in Tracker as planned — confirm each as you take it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Schedule',
          onPress: () => {
            const written = scheduleCycle({
              peptideId,
              amount: perShotMg,
              unit: 'mg',
              route: 'subcutaneous',
              dates,
              notes: `Planned: ${INTENT_LABELS[intent]} (${formatDose(perShotMg, displayUnit)} per shot)`,
            });
            Alert.alert(
              'Scheduled',
              `${written} planned dose${written === 1 ? '' : 's'} added to Tracker.${dates.length - written > 0 ? ` ${dates.length - written} skipped (already on file).` : ''}`,
            );
          },
        },
      ],
    );
  };

  return (
    <V3DetailShell
      title="Calculator"
      observation={
        peptideId
          ? `${peptideName} at ${vialSizeMl} mL vial — ${formatDose(perShotMg, displayUnit)} per shot.`
          : 'Pick a peptide and I will pre-fill the math.'
      }
      intent="doses_calculator"
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1 — Peptide picker */}
        <Pressable onPress={() => setPickerOpen(true)}>
          <GlassCard style={styles.cardSpacing}>
            <Text style={[styles.fieldLabel, { color: t.colors.textSecondary as string, fontFamily: t.typography.body }]}>
              Peptide
            </Text>
            <View style={styles.peptideRow}>
              <Text
                style={[
                  styles.peptideValue,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.isDark
                      ? t.typography.headlineMale
                      : t.typography.headlineFemale,
                  },
                ]}
              >
                {peptideName ?? 'Choose a peptide'}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={t.colors.textSecondary as string}
              />
            </View>
            {meta?.diluentType === 'aceticAcid' ? (
              <View style={styles.aceticBanner}>
                <Ionicons
                  name="warning"
                  size={14}
                  color={(t.colors as any).semanticDanger as string}
                />
                <Text
                  style={[
                    styles.aceticBannerText,
                    { color: (t.colors as any).semanticDanger as string },
                  ]}
                >
                  Acetic acid diluent — see modal warning
                </Text>
              </View>
            ) : null}
          </GlassCard>
        </Pressable>

        {/* mg / mcg toggle + vial size */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.rowBetween}>
            <Text
              style={[
                styles.fieldLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Display unit
            </Text>
            <View
              style={[
                styles.toggle,
                { backgroundColor: (t.colors as any).divider as string },
              ]}
            >
              {(['mg', 'mcg'] as const).map((u) => {
                const active = displayUnit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => {
                      tapLight();
                      setDisplayUnit(u);
                    }}
                    style={[
                      styles.toggleSeg,
                      {
                        backgroundColor: active
                          ? (t.colors.textPrimary as string)
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active
                          ? (t.colors.bgBase1 as string)
                          : (t.colors.textSecondary as string),
                        fontFamily: t.typography.bodyBold,
                        fontSize: 11,
                        letterSpacing: 0.4,
                      }}
                    >
                      {u.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[styles.rowBetween, { marginTop: 14 }]}>
            <Text
              style={[
                styles.fieldLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Vial size (mL)
            </Text>
            <View style={styles.chipRow}>
              {VIAL_SIZES.map((s) => (
                <Chip
                  key={s}
                  label={`${s} mL`}
                  primary={vialSizeMl === s}
                  onPress={() => {
                    tapLight();
                    setVialSizeMl(s);
                    // Clamp diluent to new vial cap.
                    const cur = parseFloat(diluentMl);
                    if (Number.isFinite(cur) && cur > s) setDiluentMl(String(s));
                  }}
                />
              ))}
            </View>
          </View>
        </GlassCard>

        {/* mg in vial + diluent volume */}
        <GlassCard style={styles.cardSpacing}>
          <NumericField
            label="mg in vial"
            value={peptideMg}
            onChange={setPeptideMg}
            suffix="mg"
          />
          <NumericField
            label="Diluent volume"
            value={diluentMl}
            onChange={(v) => {
              const n = parseFloat(v);
              if (Number.isFinite(n) && n > vialSizeMl) {
                setDiluentMl(String(vialSizeMl));
                return;
              }
              setDiluentMl(v);
            }}
            suffix={meta?.diluentType === 'aceticAcid' ? 'mL acetic' : 'mL BAC'}
          />
        </GlassCard>

        {/* Protocol intent */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.fieldLabel,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            Protocol intent
          </Text>
          <View style={[styles.chipRow, { marginTop: 8 }]}>
            {(Object.keys(INTENT_LABELS) as ProtocolIntent[]).map((k) => (
              <Chip
                key={k}
                label={INTENT_LABELS[k]}
                primary={intent === k}
                onPress={() => {
                  tapLight();
                  setIntent(k);
                }}
              />
            ))}
          </View>

          <Pressable
            onPress={() => {
              tapLight();
              setShowAdvanced((v) => !v);
            }}
            style={{ marginTop: 14 }}
          >
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
              }}
            >
              {showAdvanced ? '−' : '+'} Per-shot override (advanced)
            </Text>
          </Pressable>
          {showAdvanced ? (
            <NumericField
              label={`Override (${displayUnit})`}
              value={perShotOverride}
              onChange={setPerShotOverride}
              suffix={displayUnit}
            />
          ) : null}
        </GlassCard>

        {/* Reconstitute output card */}
        {result && peptideId ? (
          <ReconstituteCard
            isAcetic={meta?.diluentType === 'aceticAcid'}
            mgInVial={parseFloat(peptideMg) || 0}
            diluentMl={parseFloat(diluentMl) || 0}
            concentrationMgPerMl={result.concentrationMgPerMl}
            warnings={[...result.warnings, ...result.hardFailures]}
          />
        ) : null}

        {/* Draw card */}
        {result && peptideId ? (
          <DrawCard
            displayUnit={displayUnit}
            perShotMg={perShotMg}
            drawMl={result.drawPerShotMl}
            drawUnits={result.drawPerShotUnits}
            dosesPerVial={result.dosesPerVial}
            warnings={result.warnings}
          />
        ) : null}

        {/* Full protocol expander */}
        {ref && peptideId ? (
          <Pressable
            onPress={() => {
              tapLight();
              setShowProtocol((v) => !v);
            }}
          >
            <GlassCard style={styles.cardSpacing}>
              <View style={styles.rowBetween}>
                <Text
                  style={[
                    styles.sectionTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Full Protocol
                </Text>
                <Ionicons
                  name={showProtocol ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={t.colors.textSecondary as string}
                />
              </View>
              {showProtocol ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {ref.schedule.map((p, i) => {
                    const mg = p.doseMcg / 1000;
                    const conc =
                      parseFloat(peptideMg) /
                      (parseFloat(diluentMl) || 1);
                    const drawMl = conc > 0 ? mg / conc : 0;
                    return (
                      <View key={i} style={styles.scheduleRow}>
                        <Text
                          style={[
                            styles.scheduleLabel,
                            {
                              color: t.colors.textPrimary as string,
                              fontFamily: t.typography.bodyBold,
                            },
                          ]}
                        >
                          {p.label}
                          {p.weeks ? ` (${p.weeks})` : ''}
                        </Text>
                        <Text
                          style={[
                            styles.scheduleValue,
                            {
                              color: t.colors.textSecondary as string,
                              fontFamily: t.typography.body,
                            },
                          ]}
                        >
                          {formatDose(mg, displayUnit)} ·{' '}
                          {formatVolumeMl(drawMl)} · {p.frequency}
                        </Text>
                      </View>
                    );
                  })}
                  <Text
                    style={{
                      fontSize: 11,
                      lineHeight: 16,
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      marginTop: 6,
                      fontStyle: 'italic',
                    }}
                  >
                    Cycle: {ref.cycleLength}
                    {ref.cycleOff ? ` · Off: ${ref.cycleOff}` : ''}
                  </Text>
                  {/* Master dosing-table envelope (research reference) —
                      adds at-a-glance weekly frequency / time-off / fasted
                      from src/data/peptideDosingTable.ts when available. */}
                  {(() => {
                    const te = peptideId ? getDosingTableEntry(peptideId) : null;
                    if (!te) return null;
                    const bits: string[] = [];
                    if (te.frequencyWeekly) bits.push(te.frequencyWeekly);
                    if (te.timeOffBetweenCycles) bits.push(`${te.timeOffBetweenCycles} off`);
                    if (te.fasted !== undefined) bits.push(te.fasted ? 'Fasted' : 'No fasting');
                    if (bits.length === 0) return null;
                    return (
                      <Text
                        style={{
                          fontSize: 11,
                          lineHeight: 16,
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                          marginTop: 2,
                          fontStyle: 'italic',
                        }}
                      >
                        Reference: {bits.join(' · ')}
                      </Text>
                    );
                  })()}
                </View>
              ) : null}
            </GlassCard>
          </Pressable>
        ) : null}

        {/* Edward's disclaimer — always pinned at the bottom */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={{
              fontSize: 11,
              lineHeight: 16,
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
              fontStyle: 'italic',
            }}
          >
            {PEPTALK_DOSING_DISCLAIMER}
          </Text>
        </GlassCard>

        {/* Cycle start date — lets the user back-date or start later before
            scheduling the full cycle (BUG 2). */}
        {peptideId && result && ref ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={[
                styles.fieldLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Cycle start date
            </Text>
            <Text
              style={{
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 14,
                marginTop: 4,
                marginBottom: 8,
              }}
            >
              {new Date(cycleStartDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <View style={styles.chipRow}>
              {START_DATE_OPTIONS.map((opt) => {
                const value = addDaysKey(opt.delta);
                return (
                  <Chip
                    key={opt.label}
                    label={opt.label}
                    primary={cycleStartDate === value}
                    onPress={() => {
                      tapLight();
                      setCycleStartDate(value);
                    }}
                  />
                );
              })}
            </View>
          </GlassCard>
        ) : null}

        {/* CTAs — log today, or schedule the whole cycle. */}
        {peptideId && result ? (
          <View style={styles.ctaStack}>
            <Pressable
              onPress={handleAddToCalendar}
              disabled={result.hardFailures.length > 0}
              style={[
                styles.cta,
                {
                  backgroundColor:
                    result.hardFailures.length > 0
                      ? (t.colors.textSecondary as string)
                      : (t.colors.textPrimary as string),
                  opacity: result.hardFailures.length > 0 ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log today's dose to Tracker"
            >
              <Text
                style={{
                  color: t.colors.bgBase1 as string,
                  fontFamily: t.typography.bodyBold,
                  fontSize: 13,
                  letterSpacing: 0.3,
                }}
              >
                Log today's dose
              </Text>
            </Pressable>
            <Pressable
              onPress={handleScheduleCycle}
              disabled={result.hardFailures.length > 0}
              style={[
                styles.ctaSecondary,
                {
                  borderColor: t.colors.textPrimary as string,
                  opacity: result.hardFailures.length > 0 ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Schedule the entire protocol cycle to Tracker"
            >
              <Text
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.bodyBold,
                  fontSize: 13,
                  letterSpacing: 0.3,
                }}
              >
                Schedule cycle
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Peptide picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        transparent
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[
              styles.pickerSheet,
              {
                backgroundColor: t.colors.bgBase2 as string,
                borderTopLeftRadius: t.radius.card,
                borderTopRightRadius: t.radius.card,
              },
            ]}
            onPress={() => {}}
          >
            <Text
              style={[
                styles.pickerTitle,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              Choose a peptide
            </Text>
            <ScrollView style={{ marginTop: 10 }}>
              {PEPTIDES.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => handleSelectPeptide(p.id)}
                  style={styles.peptideOption}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                      fontSize: 14,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {p.abbreviation ?? ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Acetic-acid red-flag modal */}
      <FlagModal
        visible={showAceticFlag}
        title="Hydrophobic peptide"
        body={`${peptideName ?? 'This peptide'} is hydrophobic. Do NOT reconstitute with bacteriostatic water — use 0.6% bacteriostatic acetic acid only. The calculator pre-fills the diluent label and flags this in the Reconstitute card.`}
        onDismiss={() => setShowAceticFlag(false)}
      />
    </V3DetailShell>
  );
}

function NumericField({
  label,
  value,
  onChange,
  suffix,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const t = useV3Theme();
  // 2026-05-17 a11y: explicit label for VoiceOver — fall back to visual label + suffix
  const a11yLabel =
    accessibilityLabel ?? (suffix ? `${label}, ${suffix}` : label);
  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={[
          styles.fieldLabel,
          {
            color: t.colors.textSecondary as string,
            fontFamily: t.typography.body,
          },
        ]}
      >
        {label}
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
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          style={{
            flex: 1,
            color: t.colors.textPrimary as string,
            fontFamily: t.typography.bodyBold,
            fontSize: 18,
            paddingVertical: 6,
          }}
          placeholderTextColor={t.colors.textSecondary as string}
          accessibilityLabel={a11yLabel}
          accessibilityHint={accessibilityHint}
        />
        {suffix ? (
          <Text
            style={{
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
              fontSize: 12,
              marginLeft: 6,
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ReconstituteCard({
  isAcetic,
  mgInVial,
  diluentMl,
  concentrationMgPerMl,
  warnings,
}: {
  isAcetic: boolean | undefined;
  mgInVial: number;
  diluentMl: number;
  concentrationMgPerMl: number;
  warnings: CalculatorWarning[];
}) {
  const t = useV3Theme();
  const danger = (t.colors as any).semanticDanger as string;
  const accent = isAcetic ? danger : (t.colors.textPrimary as string);
  return (
    <View style={[styles.cardSpacing]}>
      <GlassCard
        style={
          isAcetic
            ? { borderWidth: 1, borderColor: danger }
            : undefined
        }
      >
        <Text
          style={[
            styles.sectionTitle,
            {
              color: accent,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          Reconstitute
        </Text>
        <Text
          style={[
            styles.sectionBody,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Add {formatVolumeMl(diluentMl)} of{' '}
          {isAcetic ? '0.6% bacteriostatic acetic acid' : 'BAC water'} to
          the {mgInVial} mg vial.
        </Text>
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <SyringeSVG
            fillMl={Math.min(1, diluentMl)}
            capacityMl={1}
            width={240}
          />
        </View>
        <Text
          style={[
            styles.outputMeta,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Concentration: {concentrationMgPerMl.toFixed(2)} mg/mL
        </Text>
        {warnings.map((w, i) => (
          <WarningLine key={i} warning={w} />
        ))}
      </GlassCard>
    </View>
  );
}

function DrawCard({
  displayUnit,
  perShotMg,
  drawMl,
  drawUnits,
  dosesPerVial,
  warnings,
}: {
  displayUnit: 'mg' | 'mcg';
  perShotMg: number;
  drawMl: number;
  drawUnits: number;
  dosesPerVial: number;
  warnings: CalculatorWarning[];
}) {
  const t = useV3Theme();
  return (
    <View style={[styles.cardSpacing]}>
      <GlassCard>
        <Text
          style={[
            styles.sectionTitle,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          Draw your dose
        </Text>
        <Text
          style={[
            styles.bigNumber,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          {formatDose(perShotMg, displayUnit)}
        </Text>
        <Text
          style={[
            styles.sectionBody,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Draw to {formatUnits(drawUnits)} — that's {formatVolumeMl(drawMl)} on a U-100 syringe.
        </Text>
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <SyringeSVG fillMl={drawMl} capacityMl={1} width={240} />
        </View>
        <Text
          style={[
            styles.outputMeta,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          {dosesPerVial.toFixed(1)} doses per vial
        </Text>
        {warnings.map((w, i) => (
          <WarningLine key={i} warning={w} />
        ))}
      </GlassCard>
    </View>
  );
}

function WarningLine({ warning }: { warning: CalculatorWarning }) {
  const t = useV3Theme();
  const text = (() => {
    switch (warning.kind) {
      case 'diluent_exceeds_vial':
        return `Diluent ${warning.diluentMl.toFixed(2)} mL exceeds the ${warning.vialSizeMl} mL vial — clamp before continuing.`;
      case 'draw_exceeds_u100':
        return `Draw ${warning.drawMl.toFixed(2)} mL is over a single U-100. Split into ${warning.suggestedSplit} injections at separate sites.`;
      case 'diluent_deviates_from_recommendation':
        return `Reference recommends ${warning.recommendedMl.toFixed(1)} mL of diluent — you set ${warning.gotMl.toFixed(1)}.`;
      case 'dose_outside_protocol_range':
        return `Per-shot ${warning.gotMg.toFixed(2)} mg is outside the protocol range ${warning.minMg.toFixed(2)}–${warning.maxMg.toFixed(2)} mg.`;
    }
  })();
  const danger = (t.colors as any).semanticDanger as string;
  return (
    <View style={styles.warningRow}>
      <Ionicons name="alert-circle" size={14} color={danger} />
      <Text
        style={{
          color: danger,
          fontFamily: t.typography.body,
          fontSize: 11,
          lineHeight: 15,
          marginLeft: 6,
          flex: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  peptideRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peptideValue: { fontSize: 20, flex: 1 },
  aceticBanner: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Color is theme-derived at the call site (semanticDanger token).
  aceticBannerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    flexDirection: 'row',
    // backgroundColor set inline from t.colors.divider so the toggle
    // matches the active palette (female/male) instead of a fixed grey.
    borderRadius: 999,
    padding: 2,
  },
  toggleSeg: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  inputBox: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  sectionTitle: {
    fontSize: 16,
  },
  sectionBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  bigNumber: {
    marginTop: 4,
    fontSize: 34,
    letterSpacing: -0.5,
  },
  outputMeta: {
    marginTop: 6,
    fontSize: 11,
  },
  scheduleRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  scheduleLabel: {
    fontSize: 13,
  },
  scheduleValue: {
    marginTop: 2,
    fontSize: 12,
  },
  warningRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ctaStack: {
    marginTop: 18,
    gap: 10,
  },
  cta: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 999,
  },
  ctaSecondary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    maxHeight: '75%',
    padding: 20,
    paddingTop: 28,
  },
  pickerTitle: {
    fontSize: 20,
  },
  peptideOption: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
});
