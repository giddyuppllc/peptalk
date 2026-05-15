/**
 * Dosing Calculator — calculate exactly what to draw up per injection,
 * how many days each vial lasts, and how many vials you'll need per month.
 *
 * Shows actionable, user-facing metrics:
 *   - Draw to X units (on a U-100 insulin syringe)
 *   - Volume per injection in mL
 *   - Ticks to draw to
 *   - Concentration (mcg per tick)
 *   - Doses per vial
 *   - Days per vial (at the chosen frequency)
 *   - Vials per month (using the user's actual vial size, not hardcoded)
 *
 * Math matches peptidedosages.com.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  FlatList,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius, Gradients } from '../../src/constants/theme';
import { PEPTIDES } from '../../src/data/peptides';
import { PROTOCOL_TEMPLATES } from '../../src/data/protocols';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { TitrationScheduleCard } from '../../src/components/TitrationScheduleCard';
import { PeptideGuide } from '../../src/components/PeptideGuide';
import { ProtocolPlanCard } from '../../src/components/ProtocolPlanCard';
import { SuppliesEstimatorCard } from '../../src/components/SuppliesEstimatorCard';
import {
  ProtocolIntensityPicker,
  intensityToDoseMcg,
  type ProtocolIntensity,
} from '../../src/components/ProtocolIntensityPicker';
import { ReconstitutionGuideCard } from '../../src/components/ReconstitutionGuideCard';
import { ActivateProtocolButton } from '../../src/components/ActivateProtocolButton';
import { CollapsibleSection, type CollapsibleSectionRef } from '../../src/components/CollapsibleSection';
import { CalculatorSectionTabs, type CalculatorTab } from '../../src/components/CalculatorSectionTabs';
import { mlToTsp, mlToFlOz } from '../../src/utils/unitConversions';
import type { Peptide } from '../../src/types';

type WeightUnit = 'lbs' | 'kg';
type DoseUnit = 'mcg' | 'mg';
type VialUnit = 'mg' | 'mcg';
type Frequency = 'daily' | 'eod' | '2x_week' | '3x_week' | 'weekly';

const FREQUENCY_OPTIONS: { key: Frequency; label: string; perWeek: number }[] = [
  { key: 'daily', label: 'Daily', perWeek: 7 },
  { key: 'eod', label: 'Every Other Day', perWeek: 3.5 },
  { key: '2x_week', label: '2x / Week', perWeek: 2 },
  { key: '3x_week', label: '3x / Week', perWeek: 3 },
  { key: 'weekly', label: 'Weekly', perWeek: 1 },
];

const VIAL_PRESETS = [2, 5, 10, 15, 30];
// Most peptide vials hold 2-3 ml of BAC water. The 5 ml preset stays in
// the list because some larger research vials accept it, but a warning
// fires below the input whenever the user picks/types >3 ml so they
// know not to try forcing 5 ml into a standard 3 ml vial — that was
// the failure mode in the competitor screenshot Edward flagged
// (their app suggested 4 ml without checking vial capacity).
const WATER_PRESETS = [1, 2, 3, 5];
const BAC_WATER_VIAL_TYPICAL_MAX_ML = 3;

export default function DosingCalculatorScreen() {
  const router = useRouter();
  const t = useTheme();
  // Optional deep-link params from peptide detail page Beginner/Advanced
  // pills: pre-select the peptide and the intensity tier so the user lands
  // straight on the dose they tapped.
  const params = useLocalSearchParams<{ peptideId?: string; intensity?: string }>();

  // Inputs
  const [selectedPeptide, setSelectedPeptide] = useState<Peptide | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vialSize, setVialSize] = useState('');
  const [vialUnit, setVialUnit] = useState<VialUnit>('mg');
  const [waterVolume, setWaterVolume] = useState('');
  const [targetDose, setTargetDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mcg');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  // Pre-populate from health profile so the user doesn't re-type their
  // weight every time they open the calculator. They can still edit
  // inline if they're calculating for someone else.
  const profileWeightLbs = useHealthProfileStore(
    (s) => s.profile?.bodyMetrics?.weightLbs,
  );
  const [bodyWeight, setBodyWeight] = useState(
    profileWeightLbs ? String(profileWeightLbs) : '',
  );
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs');

  // Protocol intensity tier — Mild / Standard / Aggressive. Drives dose
  // range used by ProtocolPlanCard + SuppliesEstimatorCard. Default is
  // Standard so existing behavior is unchanged for users who don't
  // touch the picker.
  const [intensity, setIntensity] = useState<ProtocolIntensity>('standard');

  // Simple mode — hides intensity picker, titration ladder, weight-based
  // dosing, and the supplies estimator. The user explicitly asked for
  // this toggle back ("the pill switch"); defaults ON because most users
  // don't need the deep-research surface and it's overwhelming. Persisted
  // per-account so the choice sticks across launches.
  const simpleMode = useOnboardingStore((s) => s.simpleCalculatorMode);
  const setSimpleMode = useOnboardingStore((s) => s.setSimpleCalculatorMode);

  // Results visibility
  const [showResults, setShowResults] = useState(false);

  // Carousel-style section navigation. Each post-results section
  // registers its onLayout y so tab-tap can scroll to it. Active tab
  // tracks the most recently focused section.
  const scrollRef = useRef<ScrollView>(null);
  const sectionYsRef = useRef<Record<string, number>>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, CollapsibleSectionRef | null>>({});

  const recordSectionY = useCallback((id: string, y: number) => {
    sectionYsRef.current[id] = y;
  }, []);

  const handleTabSelect = useCallback((id: string) => {
    setActiveTabId(id);
    sectionRefs.current[id]?.expand();
    const y = sectionYsRef.current[id];
    if (typeof y === 'number') {
      // Offset so the section title sits below the tab strip + a bit of breathing room.
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  }, []);

  const setSectionRef = useCallback(
    (id: string) => (r: CollapsibleSectionRef | null) => {
      sectionRefs.current[id] = r;
    },
    [],
  );

  // Reset results whenever an input changes
  const resetResults = useCallback(() => setShowResults(false), []);

  const filteredPeptides = useMemo(() => {
    if (!searchQuery.trim()) return PEPTIDES;
    // Strip non-alphanumerics so "MOTSC" finds "MOTS-c", "BPC157" finds
    // "BPC-157", etc. Real-world users frequently omit the dash.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(searchQuery);
    if (!q) return PEPTIDES;
    return PEPTIDES.filter(
      (p) =>
        norm(p.name).includes(q) ||
        (p.abbreviation && norm(p.abbreviation).includes(q)) ||
        norm(p.id).includes(q),
    );
  }, [searchQuery]);

  const protocolsForPeptide = useMemo(() => {
    if (!selectedPeptide) return [];
    return PROTOCOL_TEMPLATES.filter((pt) => pt.peptideId === selectedPeptide.id);
  }, [selectedPeptide]);

  // When the user picks a peptide whose primary protocol is naturally
  // dosed in mg (Selank, Cerebrolysin, GLP-1s, etc.), flip the unit
  // toggle to mg so they don't have to think in micrograms. Same for
  // vial unit. Only fires when the user hasn't manually entered a dose
  // yet — otherwise it would clobber their input.
  useEffect(() => {
    const proto = protocolsForPeptide[0];
    if (!proto) return;
    if (!targetDose) {
      setDoseUnit(proto.typicalDose?.unit === 'mg' ? 'mg' : 'mcg');
    }
  }, [selectedPeptide?.id]);

  // One-shot deep-link handler. Pre-selects the peptide + intensity from
  // route params and auto-fills the target dose from the chosen tier so
  // taps from the peptide-detail Beginner/Advanced pills land on the
  // calculator already pointed at the right number.
  const appliedDeepLinkRef = useRef(false);
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    const pid = typeof params.peptideId === 'string' ? params.peptideId : undefined;
    const intent = typeof params.intensity === 'string' ? params.intensity : undefined;
    if (!pid && !intent) return;
    if (pid && !selectedPeptide) {
      const found = PEPTIDES.find((p) => p.id === pid);
      if (found) setSelectedPeptide(found);
    }
    if (intent === 'mild' || intent === 'standard' || intent === 'aggressive') {
      setIntensity(intent);
      // Resolve the matching protocol via the same filter the screen uses
      // and seed targetDose with that intensity's midpoint dose.
      const targetPid = pid ?? selectedPeptide?.id;
      const proto = targetPid
        ? PROTOCOL_TEMPLATES.find((pt) => pt.peptideId === targetPid)
        : undefined;
      if (proto) {
        const { mcg, displayUnit } = intensityToDoseMcg(proto, intent);
        // The protocol's display unit can technically be IU/ml in the
        // shared DoseUnit type, but the calculator only supports mcg/mg.
        // Default to mcg for any non-mg unit so the input is always valid.
        const localUnit: DoseUnit = displayUnit === 'mg' ? 'mg' : 'mcg';
        const value = localUnit === 'mg' ? mcg / 1000 : mcg;
        setTargetDose(String(Number(value.toFixed(2))));
        setDoseUnit(localUnit);
      }
    }
    appliedDeepLinkRef.current = true;
  }, [params.peptideId, params.intensity, selectedPeptide]);

  // If the user has an ACTIVE PROTOCOL for the selected peptide, figure out
  // which titration step they're on so the calculator can pre-fill the
  // right dose for their current week. Beats making them remember "am I
  // on the 5mg step or 7.5mg step?".
  const activeProtocols = useDoseLogStore((s) => s.protocols);
  const activeForSelected = useMemo(() => {
    if (!selectedPeptide) return null;
    return activeProtocols.find(
      (p) => p.isActive && p.peptideId === selectedPeptide.id,
    );
  }, [activeProtocols, selectedPeptide]);

  const currentTitrationStep = useMemo(() => {
    if (!activeForSelected || !activeForSelected.startDate) return null;
    const template = protocolsForPeptide[0];
    if (!template?.titrationSchedule) return null;
    const start = new Date(activeForSelected.startDate + 'T12:00:00');
    if (isNaN(start.getTime())) return null;
    const today = new Date();
    const dayOfCycle = Math.max(
      1,
      Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    );
    const weekOfCycle = Math.ceil(dayOfCycle / 7);
    return (
      template.titrationSchedule.find(
        (s) =>
          weekOfCycle >= s.weekStart && (s.weekEnd == null || weekOfCycle <= s.weekEnd),
      ) ?? template.titrationSchedule[template.titrationSchedule.length - 1]
    );
  }, [activeForSelected, protocolsForPeptide]);

  const frequencyOption = FREQUENCY_OPTIONS.find((f) => f.key === frequency)!;

  // All calculations in mcg internally
  const vialRaw = parseFloat(vialSize) || 0;
  const waterMl = parseFloat(waterVolume) || 0;
  const doseRaw = parseFloat(targetDose) || 0;
  const vialMcg = vialUnit === 'mg' ? vialRaw * 1000 : vialRaw;
  const doseMcg = doseUnit === 'mg' ? doseRaw * 1000 : doseRaw;

  // Core reconstitution math (same formulas as peptidedosages.com)
  const concentrationPerMl = waterMl > 0 ? vialMcg / waterMl : 0;   // mcg per 1mL
  const concentrationPerTick = concentrationPerMl / 10;              // mcg per 0.1mL tick
  const volumeToInjectMl = concentrationPerMl > 0 ? doseMcg / concentrationPerMl : 0;
  const syringeUnits = volumeToInjectMl * 100;                       // U-100 syringe units
  const ticksToDrawTo = volumeToInjectMl * 10;                       // 0.1mL ticks
  const dosesPerVial = doseMcg > 0 && volumeToInjectMl > 0 ? waterMl / volumeToInjectMl : 0;

  // Frequency-aware supply math
  const injectionsPerWeek = frequencyOption.perWeek;
  const daysPerVial = dosesPerVial > 0 ? dosesPerVial / injectionsPerWeek * 7 : 0;
  const weeklyTotalMcg = doseMcg * injectionsPerWeek;
  const monthlyTotalMcg = weeklyTotalMcg * 4.33;
  const vialsPerMonth = dosesPerVial > 0
    ? Math.ceil((injectionsPerWeek * 4.33) / dosesPerVial)
    : 0;

  // Optional: weight-normalized dose
  const bodyWeightKg = useMemo(() => {
    const raw = parseFloat(bodyWeight) || 0;
    return weightUnit === 'lbs' ? raw * 0.4536 : raw;
  }, [bodyWeight, weightUnit]);

  const syringeFillPercent = useMemo(() => {
    if (!showResults || volumeToInjectMl <= 0) return 0;
    return Math.min(volumeToInjectMl * 100, 100);
  }, [showResults, volumeToInjectMl]);

  const canCalculate = vialRaw > 0 && waterMl > 0 && doseRaw > 0;

  const handleCalculate = useCallback(() => {
    setShowResults(true);
  }, []);

  const formatDose = (mcg: number): string => {
    if (mcg >= 1000) return `${(mcg / 1000).toFixed(2)} mg`;
    return `${mcg.toFixed(1)} mcg`;
  };

  // Round to nearest practical syringe tick. U-100 syringes have 1-unit
  // marks, with half-unit estimation between them.
  const roundSyringeUnits = (units: number): number => {
    if (units < 0.5) return 0;
    if (units < 2) return Math.round(units * 2) / 2; // half-units for tiny doses
    return Math.round(units);
  };

  const roundedUnits = roundSyringeUnits(syringeUnits);

  // Compact dose formatter for inline warning text
  function formatDoseInline(mcg: number): string {
    if (mcg >= 10000) return `${(mcg / 1000).toFixed(1)} mg`;
    if (mcg >= 1000) return `${(mcg / 1000).toFixed(2)} mg`;
    return `${Math.round(mcg)} mcg`;
  }

  // Build up safety warnings — ordered most severe to least
  const warnings: string[] = [];
  if (showResults) {
    // Dose larger than the entire vial
    if (doseMcg > vialMcg) {
      warnings.push(
        'Your dose is larger than the total peptide in the vial. Double-check your numbers — this usually means the dose unit (mg vs mcg) is wrong.'
      );
    }

    // Dose outside the selected peptide's typical research range
    const proto = protocolsForPeptide[0];
    if (proto && proto.typicalDose) {
      const { min, max, unit } = proto.typicalDose;
      const minMcg = unit === 'mg' ? min * 1000 : min;
      const maxMcg = unit === 'mg' ? max * 1000 : max;
      if (doseMcg > 0 && (doseMcg < minMcg || doseMcg > maxMcg)) {
        warnings.push(
          `Your dose (${formatDoseInline(doseMcg)}) is outside the typical research range for ${selectedPeptide?.name ?? 'this peptide'} (${min}–${max} ${unit}). Verify with your protocol.`
        );
      }
    }

    // Unusually high dose when no peptide is selected for range-checking
    if (!proto && doseMcg > 5000) {
      warnings.push(
        `${formatDoseInline(doseMcg)} is a very high dose for most peptides. Double-check the unit (mg vs mcg) before drawing.`
      );
    }

    // Volume larger than a U-100 syringe holds
    if (volumeToInjectMl > 1) {
      warnings.push(
        'This dose is more than 1mL — it won\'t fit in a standard U-100 insulin syringe. Use less BAC water to increase concentration, or split the injection.'
      );
    }

    // Volume too small to measure accurately on a standard insulin syringe
    if (volumeToInjectMl > 0 && syringeUnits < 0.5) {
      warnings.push(
        'This dose would be less than half a unit on a U-100 syringe — too small to draw accurately. Reconstitute with less BAC water for a higher concentration.'
      );
    }
  }

  // Tabs are derived from what will actually render in the post-results
  // area. We hide the strip until the user has Calculated; once visible,
  // entries appear/disappear based on whether a peptide is selected and
  // a protocol template exists for it.
  const calcTabs = useMemo<CalculatorTab[]>(() => {
    if (!showResults || !canCalculate) return [];
    const list: CalculatorTab[] = [
      { id: 'action', label: 'Per injection', icon: 'medkit-outline' },
    ];
    if (selectedPeptide && protocolsForPeptide.length > 0) {
      list.push({ id: 'cycle', label: 'Cycle plan', icon: 'calendar-outline' });
      list.push({ id: 'supplies', label: 'Supplies', icon: 'cube-outline' });
      list.push({ id: 'activate', label: 'Activate', icon: 'play-circle-outline' });
    }
    list.push({ id: 'pervial', label: 'Per-vial', icon: 'flask-outline' });
    if (selectedPeptide) {
      list.push({ id: 'mixing', label: 'Mixing', icon: 'water-outline' });
      list.push({ id: 'about', label: 'About', icon: 'information-circle-outline' });
    }
    return list;
  }, [showResults, canCalculate, selectedPeptide, protocolsForPeptide]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Dosing Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Unit system master switch — flips weight (lbs/kg) and surfaces
            plain-English explanations. Vial / dose / volume always stay
            metric since insulin syringes are U-100 mL globally; there's
            no imperial equivalent that would help here. */}
        <View style={styles.section}>
          <View style={[styles.unitMasterRow, { borderColor: t.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.unitMasterLabel, { color: t.text }]}>Units</Text>
              <Text style={[styles.unitMasterHint, { color: t.textSecondary }]}>
                {weightUnit === 'lbs'
                  ? 'Standard — pounds. Vials & doses stay metric.'
                  : 'Metric — kilograms. Vials & doses already metric.'}
              </Text>
            </View>
            <View style={styles.unitToggle}>
              <TouchableOpacity
                style={[
                  styles.unitToggleBtn,
                  weightUnit === 'lbs' && { backgroundColor: t.primary },
                ]}
                onPress={() => setWeightUnit('lbs')}
                accessibilityRole="button"
                accessibilityLabel="Use standard units (pounds)"
              >
                <Text style={[styles.unitToggleText, { color: weightUnit === 'lbs' ? '#fff' : t.textSecondary }]}>
                  Standard
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.unitToggleBtn,
                  weightUnit === 'kg' && { backgroundColor: t.primary },
                ]}
                onPress={() => setWeightUnit('kg')}
                accessibilityRole="button"
                accessibilityLabel="Use metric units (kilograms)"
              >
                <Text style={[styles.unitToggleText, { color: weightUnit === 'kg' ? '#fff' : t.textSecondary }]}>
                  Metric
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Peptide (optional, for protocol typical-range display) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide (optional)</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            Select one to see typical research ranges alongside your numbers.
          </Text>
          <GlassCard>
            <TouchableOpacity style={styles.pickerTrigger} onPress={() => setPickerOpen(true)}>
              <Text
                style={[
                  styles.pickerText,
                  { color: t.text },
                  !selectedPeptide && [styles.pickerPlaceholder, { color: t.textSecondary }],
                ]}
              >
                {selectedPeptide ? selectedPeptide.name : 'Choose a peptide...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={t.textSecondary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Simple mode toggle — the user explicitly asked for this back
            ("the pill switch"). When on, hides intensity picker,
            titration ladder, weight-based dosing, supplies estimator
            so the calculator stays to four inputs: peptide → dose →
            frequency → BAC water. Choice persists per account. */}
        <View style={styles.section}>
          <GlassCard>
            <View style={styles.simpleModeRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.simpleModeTitle, { color: t.text }]}>
                  Simple mode {simpleMode ? '· on' : '· off'}
                </Text>
                <Text style={[styles.simpleModeHint, { color: t.textSecondary }]}>
                  {simpleMode
                    ? 'Just the basics. Toggle off to see intensity tiers, titration ladders, body-weight scaling, and supplies math.'
                    : 'Showing every advanced input. Toggle on for the four-field starter view.'}
                </Text>
              </View>
              <Switch
                value={simpleMode}
                onValueChange={setSimpleMode}
                accessibilityRole="switch"
                accessibilityLabel="Simple mode"
              />
            </View>
          </GlassCard>
        </View>

        {/* Protocol intensity — Mild / Standard / Aggressive. Visible the
            moment a peptide is selected so the user picks their tier
            before plugging in dose numbers. Standard is pre-selected
            (matches typical research protocols). Hidden in simple mode. */}
        {!simpleMode && selectedPeptide && protocolsForPeptide.length > 0 && (
          <View style={styles.section}>
            <ProtocolIntensityPicker
              protocol={protocolsForPeptide[0]}
              value={intensity}
              onChange={(next) => {
                setIntensity(next);
                // Auto-fill the target dose with the chosen intensity's
                // mid-point so the rest of the calculator math reflects
                // the picked tier without an extra tap.
                const { mcg, displayUnit } = intensityToDoseMcg(protocolsForPeptide[0], next);
                if (displayUnit === 'mg') {
                  setTargetDose(String((mcg / 1000).toFixed(2).replace(/\.?0+$/, '')));
                  setDoseUnit('mg');
                } else {
                  setTargetDose(String(Math.round(mcg)));
                  setDoseUnit('mcg');
                }
                resetResults();
              }}
            />
          </View>
        )}

        {/* Titration ladder — shown only for peptides with structured weekly steps
            (GLP-1 family, TB-500, etc.). Lets the user pick the right step for
            their week-of-cycle without leaving the calculator. Hidden in simple mode. */}
        {!simpleMode && selectedPeptide && protocolsForPeptide[0]?.titrationSchedule && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Recommended schedule</Text>
            <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
              Standard titration for {selectedPeptide.name}. Tap any step to load that dose.
            </Text>
            <TitrationScheduleCard protocol={protocolsForPeptide[0]} />
          </View>
        )}

        {/* Vial Size */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Peptide Vial Size</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            The amount of peptide in your vial before mixing.
          </Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 5"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={vialSize}
                onChangeText={(v) => { setVialSize(v); resetResults(); }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: vialUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, vialUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setVialUnit('mcg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: vialUnit === 'mcg' ? '#fff' : t.textSecondary }]}>mcg</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.presetRow}>
              {VIAL_PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: t.glass },
                    vialSize === String(v) && vialUnit === 'mg' && styles.presetBtnActive,
                  ]}
                  onPress={() => {
                    setVialSize(String(v));
                    setVialUnit('mg');
                    resetResults();
                  }}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: t.textSecondary },
                      vialSize === String(v) && vialUnit === 'mg' && styles.presetBtnTextActive,
                    ]}
                  >
                    {v}mg
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* BAC Water */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>BAC Water Volume</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            How much bacteriostatic water you add to the vial.
            {waterMl > 0 ? ` ${waterMl.toFixed(1)} mL ≈ ${mlToTsp(waterMl).toFixed(2)} tsp / ${mlToFlOz(waterMl).toFixed(2)} fl oz.` : ''}
          </Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 2"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={waterVolume}
                onChangeText={(v) => { setWaterVolume(v); resetResults(); }}
              />
              <Text style={[styles.unitLabel, { color: t.textSecondary }]}>mL</Text>
            </View>
            <View style={styles.presetRow}>
              {WATER_PRESETS.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: t.glass },
                    waterVolume === String(v) && styles.presetBtnActive,
                  ]}
                  onPress={() => { setWaterVolume(String(v)); resetResults(); }}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: t.textSecondary },
                      waterVolume === String(v) && styles.presetBtnTextActive,
                    ]}
                  >
                    {v}mL
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Vial-capacity warning. Most peptide vials are 2-3 ml;
                some research vials accept more, but check the rubber
                stopper / vial neck before forcing extra BAC water in. */}
            {waterMl > BAC_WATER_VIAL_TYPICAL_MAX_ML && (
              <View style={styles.bacWarn}>
                <Ionicons name="warning-outline" size={14} color="#B45309" />
                <Text style={styles.bacWarnText}>
                  Most peptide vials hold {BAC_WATER_VIAL_TYPICAL_MAX_ML} ml or less. Check your vial's capacity before adding {waterMl.toFixed(1)} ml — you may need to split across vials.
                </Text>
              </View>
            )}
          </GlassCard>
        </View>

        {/* Target Dose */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Dose Per Injection</Text>

          {/* Active-protocol auto-step banner — when the user is on a
              titrated peptide, suggest the dose for their current week. */}
          {currentTitrationStep && activeForSelected && (
            <TouchableOpacity
              onPress={() => {
                const step = currentTitrationStep;
                const value = step.unit === doseUnit
                  ? String(step.dose)
                  : doseUnit === 'mg'
                    ? String(step.dose / 1000)
                    : String(step.dose * 1000);
                setTargetDose(value);
                resetResults();
              }}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#3E7CB118',
                borderColor: '#3E7CB180',
                borderWidth: 1,
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use this week's titration step: ${currentTitrationStep.dose} ${currentTitrationStep.unit}`}
            >
              <Ionicons name="trending-up" size={16} color="#3E7CB1" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3E7CB1' }}>
                  Tap to use your current step
                </Text>
                <Text style={{ fontSize: 11, color: '#3E7CB1', marginTop: 1 }}>
                  Your active protocol is on Week {currentTitrationStep.weekStart}
                  {currentTitrationStep.weekEnd ? `–${currentTitrationStep.weekEnd}` : '+'} →{' '}
                  {currentTitrationStep.dose} {currentTitrationStep.unit} {currentTitrationStep.frequencyLabel.toLowerCase()}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Typical research dose range — bubble with min/max + tap-to-fill.
              When the protocol is weight_based AND user has a body weight,
              compute the personalized range live (mcg/kg × kg). Otherwise
              fall back to the published flat range. */}
          {protocolsForPeptide[0]?.typicalDose && (() => {
            const proto = protocolsForPeptide[0]!;
            const isWeightBased = proto.dosingMode === 'weight_based' && !!proto.dosePerKg && bodyWeightKg > 0;

            // Compute the displayed min/max + the unit they're shown in.
            // Weight-based ranges multiply per-kg by user kg, ROUND for
            // readability (no one wants to see 412.7 mcg as a target).
            const range = isWeightBased
              ? {
                  min: Math.round(proto.dosePerKg!.min * bodyWeightKg),
                  max: Math.round(proto.dosePerKg!.max * bodyWeightKg),
                  unit: proto.dosePerKg!.unit,
                }
              : {
                  min: proto.typicalDose.min,
                  max: proto.typicalDose.max,
                  unit: proto.typicalDose.unit,
                };

            return (
              <View
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: `${t.primary}10`,
                  borderWidth: 1,
                  borderColor: `${t.primary}30`,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flask-outline" size={16} color={t.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: t.textSecondary }}>
                      {isWeightBased ? 'YOUR WEIGHT-BASED RANGE' : 'TYPICAL RESEARCH RANGE'}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: t.text, marginTop: 2 }}>
                      {range.min}–{range.max} {range.unit}
                      {isWeightBased && proto.frequencyLabel ? ` · ${proto.frequencyLabel.toLowerCase()}` : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['min', 'max'] as const).map((edge) => (
                      <TouchableOpacity
                        key={edge}
                        onPress={() => {
                          const v = edge === 'min' ? range.min : range.max;
                          const value = range.unit === doseUnit
                            ? String(v)
                            : doseUnit === 'mg' ? String(v / 1000) : String(v * 1000);
                          setTargetDose(value);
                          resetResults();
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: t.primary,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${edge} dose ${edge === 'min' ? range.min : range.max} ${range.unit}`}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11, letterSpacing: 0.4 }}>
                          {edge === 'min' ? 'Min' : 'Max'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Sub-line: explain the weight math, or prompt for weight
                    when missing for a peptide that's actually weight-sensitive. */}
                {isWeightBased && (
                  <Text style={{ fontSize: 11, color: t.textSecondary, marginTop: 6, lineHeight: 14 }}>
                    {proto.dosePerKg!.min}–{proto.dosePerKg!.max} {proto.dosePerKg!.unit}/kg · scaled to {bodyWeightKg.toFixed(0)} kg
                  </Text>
                )}
                {proto.dosingMode === 'weight_based' && bodyWeightKg <= 0 && (
                  <Text style={{ fontSize: 11, color: t.textSecondary, marginTop: 6, lineHeight: 14, fontStyle: 'italic' }}>
                    Add your weight below for a range scaled to your body — this peptide is conventionally dosed in {proto.dosePerKg?.unit ?? 'mcg'}/kg.
                  </Text>
                )}
              </View>
            );
          })()}
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="e.g. 250"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={targetDose}
                onChangeText={(v) => { setTargetDose(v); resetResults(); }}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mcg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mcg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mcg' ? '#fff' : t.textSecondary }]}>mcg</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, doseUnit === 'mg' && { backgroundColor: t.primary }]}
                  onPress={() => { setDoseUnit('mg'); resetResults(); }}
                >
                  <Text style={[styles.unitToggleText, { color: doseUnit === 'mg' ? '#fff' : t.textSecondary }]}>mg</Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Frequency */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Injection Frequency</Text>
          <GlassCard>
            <View style={styles.freqGrid}>
              {FREQUENCY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.freqBtn, { backgroundColor: t.glass }, frequency === opt.key && styles.freqBtnActive]}
                  onPress={() => { setFrequency(opt.key); resetResults(); }}
                >
                  <Text
                    style={[
                      styles.freqBtnText,
                      { color: t.textSecondary },
                      frequency === opt.key && styles.freqBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* Body weight (optional — for mcg/kg). Hidden in simple mode —
            most users don't need weight-based scaling, and the few who
            do can flip simple mode off. */}
        {!simpleMode && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Body Weight (optional)</Text>
          <Text style={[styles.sectionHint, { color: t.textSecondary }]}>
            Used to show your dose as mcg per kg body weight.
          </Text>
          <GlassCard>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                placeholder="Enter weight"
                placeholderTextColor={t.placeholder}
                keyboardType="numeric"
                value={bodyWeight}
                onChangeText={setBodyWeight}
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, weightUnit === 'lbs' && { backgroundColor: t.primary }]}
                  onPress={() => setWeightUnit('lbs')}
                >
                  <Text style={[styles.unitToggleText, { color: weightUnit === 'lbs' ? '#fff' : t.textSecondary }]}>lbs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitToggleBtn, weightUnit === 'kg' && { backgroundColor: t.primary }]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text style={[styles.unitToggleText, { color: weightUnit === 'kg' ? '#fff' : t.textSecondary }]}>kg</Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </View>
        )}

        {/* Quick concentration preview. Phrased around U-100 unit marks
            (each small line on an insulin syringe = 1 unit = 0.01 mL),
            which is how the peptide community talks about doses. The
            old "per tick (0.1 mL)" wording mixed unit marks and the
            larger labeled gradations and confused users. */}
        {vialRaw > 0 && waterMl > 0 && (
          <View style={styles.section}>
            <GlassCard variant="gradient">
              <Text style={[styles.previewLabel, { color: t.textSecondary }]}>Concentration</Text>
              <Text style={styles.previewValue}>
                {(concentrationPerMl / 100).toFixed(1)} mcg per unit mark
              </Text>
              <Text style={[styles.previewSub, { color: t.textSecondary }]}>
                Each unit = 0.01 mL on a U-100 syringe · {concentrationPerMl.toFixed(0)} mcg per 1 mL total
              </Text>
            </GlassCard>
          </View>
        )}

        {/* Calculate */}
        <View style={styles.section}>
          <GradientButton
            label="Calculate"
            onPress={handleCalculate}
            disabled={!canCalculate}
          />
        </View>

        {/* Warnings */}
        {showResults && warnings.length > 0 && (
          <View style={styles.section}>
            {warnings.map((w, i) => (
              <View key={i} style={[styles.warnBox, i > 0 && { marginTop: 8 }]}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.warnText}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Section tabs — horizontal swipeable nav for the post-results
            cards. Renders only after Calculate so the pre-input flow
            isn't cluttered. Tap a tab → expand + scroll-to that
            section. */}
        {calcTabs.length > 0 && (
          <View style={{ marginBottom: Spacing.md }}>
            <CalculatorSectionTabs
              tabs={calcTabs}
              activeId={activeTabId}
              onSelect={handleTabSelect}
            />
          </View>
        )}

        {/* Per-injection results — plain-language labels for non-technical
            users. Each row uses everyday language up top with the
            technical term as a secondary hint so the math stays
            verifiable. */}
        {showResults && canCalculate && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('action', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="action"
              title="What to do per injection"
              hint='Plain steps for the syringe. Tap "About" below for the science.'
              icon="medkit-outline"
              ref={setSectionRef('action')}
            >
            <GlassCard variant="glow">
              <ResultRow
                label="Pull syringe up to"
                value={`${roundedUnits} mark${roundedUnits === 1 ? '' : 's'}`}
                hint={`U-100 insulin syringe · the small unit lines · precise: ${syringeUnits.toFixed(2)} units`}
                highlight
              />
              <ResultRow
                label="Liquid amount per shot"
                value={`${volumeToInjectMl.toFixed(3)} mL`}
                hint={`≈${mlToTsp(volumeToInjectMl).toFixed(3)} tsp · how much fluid goes into the needle`}
              />
              <ResultRow
                label="Actual peptide dose"
                value={formatDose(doseMcg)}
                hint="how much active peptide is in this shot"
              />
              {bodyWeightKg > 0 && (
                <ResultRow
                  label="Dose per kg body weight"
                  value={`${(doseMcg / bodyWeightKg).toFixed(2)} mcg/kg`}
                  hint="useful for protocols that scale by weight"
                />
              )}
            </GlassCard>
            </CollapsibleSection>
          </View>
        )}

        {/* Syringe visual */}
        {showResults && canCalculate && volumeToInjectMl > 0 && volumeToInjectMl <= 1 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Syringe (1mL U-100)</Text>
            <GlassCard>
              <View style={styles.syringeContainer}>
                <View style={[styles.syringeBarrel, {
                  backgroundColor: t.isDark ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.04)',
                  borderColor: t.isDark ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.15)',
                }]}>
                  {Array.from({ length: 11 }, (_, i) => {
                    const pct = (i / 10) * 100;
                    const isMajor = i % 5 === 0;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.tick,
                          isMajor && styles.tickMajor,
                          { bottom: `${pct}%` },
                        ]}
                      >
                        {isMajor && (
                          <Text style={styles.tickLabel}>{(i / 10).toFixed(1)}</Text>
                        )}
                      </View>
                    );
                  })}
                  <LinearGradient
                    colors={[Gradients.primary[0], Gradients.primary[1]]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={[styles.syringeFill, { height: `${syringeFillPercent}%` }]}
                  />
                  {syringeFillPercent > 0 && syringeFillPercent <= 100 && (
                    <View style={[styles.drawLine, { bottom: `${syringeFillPercent}%` }]}>
                      <Text style={styles.drawLineLabel}>
                        Draw to here ({volumeToInjectMl.toFixed(2)} mL)
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.needleTip, { backgroundColor: t.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)' }]} />
              </View>
            </GlassCard>
          </View>
        )}

        {/* ─── Post-Calculate display order ─────────────────────────
            Per Injection (action) → Syringe visual (how) → Cycle plan
            (full cycle picture) → Supplies estimator (what to buy) →
            Per-vial economics (doses/days per vial — quick numbers
            kept in case the user is comparing vial sizes) → About this
            peptide (deep dive) → Safety. The previous "Your Supply"
            card duplicated the Supplies estimator's vial counts — those
            specific cells now live there; the trimmed Per-vial card
            keeps the math the estimator doesn't show (days per vial,
            doses per vial, weekly/monthly totals).
            ─────────────────────────────────────────────────────────── */}

        {/* Cycle plan — full-cycle math, goal-aware. Only renders when
            a protocol template exists. Independent of the Calculate
            button — shows the moment a peptide is selected so users
            see the protocol shape before plugging in numbers. */}
        {selectedPeptide && protocolsForPeptide.length > 0 && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('cycle', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="cycle"
              title="Cycle plan"
              hint="How much you'll need start-to-finish, framed for your goal."
              icon="calendar-outline"
              ref={setSectionRef('cycle')}
            >
              <ProtocolPlanCard
                peptide={selectedPeptide}
                protocol={protocolsForPeptide[0]}
                vialMcg={vialMcg > 0 ? vialMcg : undefined}
                intensity={intensity}
              />
            </CollapsibleSection>
          </View>
        )}

        {/* Supplies estimator — concrete shopping list at 1 wk / 2 wks
            / full cycle. Hidden in simple mode — most users buy a
            single vial at a time. */}
        {!simpleMode && selectedPeptide && protocolsForPeptide.length > 0 && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('supplies', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="supplies"
              title="Supplies"
              hint="Vials, syringes, and BAC water for each planning horizon."
              icon="cube-outline"
              ref={setSectionRef('supplies')}
            >
              <SuppliesEstimatorCard
                protocol={protocolsForPeptide[0]}
                vialMcg={vialMcg > 0 ? vialMcg : undefined}
                bacWaterMl={waterMl > 0 ? waterMl : undefined}
                intensity={intensity}
              />
            </CollapsibleSection>
          </View>
        )}

        {/* Activate protocol — adds the protocol to dose log + schedules
            dose reminders, vial-expiry alert, cycle-end check-in. Only
            shown after the user has run a calculation so the activated
            dose matches what's on screen. */}
        {showResults && canCalculate && selectedPeptide && protocolsForPeptide.length > 0 && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('activate', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="activate"
              title="Start tracking"
              hint="Add this protocol to your calendar with reminders for every dose."
              icon="play-circle-outline"
              ref={setSectionRef('activate')}
            >
              <ActivateProtocolButton
                peptideId={selectedPeptide.id}
                peptideName={selectedPeptide.name}
                protocol={protocolsForPeptide[0]}
                doseMcg={doseMcg}
                frequency={frequency}
              />
            </CollapsibleSection>
          </View>
        )}

        {/* Per-vial economics — only the numbers Supplies estimator
            DOESN'T show. Doses per vial + days per vial + weekly /
            monthly totals are the math users compare when sizing up
            different vial options. Vial count + injections per week
            already live in the cards above. */}
        {showResults && canCalculate && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('pervial', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="pervial"
              title="Per-vial economics"
              hint="Math for comparing vial sizes side-by-side."
              icon="flask-outline"
              ref={setSectionRef('pervial')}
            >
              <GlassCard>
                <ResultRow
                  label="Doses per vial"
                  value={dosesPerVial.toFixed(1)}
                  highlight
                />
                <ResultRow
                  label="Days each vial lasts"
                  value={`${daysPerVial.toFixed(0)} days`}
                />
                <ResultRow
                  label="Weekly total"
                  value={formatDose(weeklyTotalMcg)}
                />
                <ResultRow
                  label="Monthly total (est.)"
                  value={formatDose(monthlyTotalMcg)}
                />
              </GlassCard>
            </CollapsibleSection>
          </View>
        )}

        {/* Reconstitution + sterility guide — procedural steps with
            "swirl don't shake," alcohol-pad reminders, storage windows.
            Surfaced as its own card (not buried inside PeptideGuide) so
            it gets read. */}
        {selectedPeptide && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('mixing', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="mixing"
              title="How to mix safely"
              hint="Sterile technique keeps the peptide active and you safe."
              icon="water-outline"
              ref={setSectionRef('mixing')}
            >
              <ReconstitutionGuideCard
                protocol={protocolsForPeptide[0]}
                vialMg={vialUnit === 'mg' ? vialRaw : vialRaw / 1000}
                bacWaterMl={waterMl}
              />
            </CollapsibleSection>
          </View>
        )}

        {/* Full peptide deep-dive — protocol templates, mechanism, recon
            math, dose-table examples, storage, lifestyle/timing, side
            effects, contraindications, references, disclaimer. */}
        {showResults && selectedPeptide && (
          <View
            style={styles.section}
            onLayout={(e) => recordSectionY('about', e.nativeEvent.layout.y)}
          >
            <CollapsibleSection
              id="about"
              title={`About ${selectedPeptide.name}`}
              hint="Why your numbers above look the way they do — protocol, mechanism, storage, and safety."
              icon="information-circle-outline"
              ref={setSectionRef('about')}
              defaultExpanded={false}
            >
              <PeptideGuide
                peptide={selectedPeptide}
                vial_mg={vialUnit === 'mg' ? vialRaw : vialRaw / 1000}
                bac_water_ml={waterMl}
              />
            </CollapsibleSection>
          </View>
        )}

        {/* Safety reminder */}
        {showResults && (
          <View style={styles.section}>
            <GlassCard variant="accent">
              <View style={styles.storageRow}>
                <Ionicons name="shield-checkmark-outline" size={22} color={Colors.rose} />
                <View style={styles.storageContent}>
                  <Text style={styles.storageTitle}>Safety Reminders</Text>
                  <Text style={[styles.storageText, { color: t.textSecondary }]}>
                    • Use a fresh sterile needle for every injection.{'\n'}
                    • Swab the vial stopper with alcohol before drawing.{'\n'}
                    • Refrigerate reconstituted peptide at 2–8°C.{'\n'}
                    • Use within 28–30 days of reconstitution.{'\n'}
                    • Do not freeze — and keep out of direct light.
                  </Text>
                </View>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color={t.textSecondary} />
          <Text style={[styles.disclaimerText, { color: t.textSecondary }]}>
            This calculator is for informational purposes only. Always consult a licensed healthcare provider
            for dosing guidance specific to your situation.
          </Text>
        </View>
      </ScrollView>

      {/* Peptide Picker Modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: t.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Select Peptide</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: t.inputBg }]}>
              <Ionicons name="search" size={18} color={t.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: t.text }]}
                placeholder="Search peptides..."
                placeholderTextColor={t.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={t.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredPeptides}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.peptideItem,
                    selectedPeptide?.id === item.id && styles.peptideItemActive,
                  ]}
                  onPress={() => {
                    setSelectedPeptide(item);
                    setPickerOpen(false);
                    setSearchQuery('');
                    resetResults();
                  }}
                >
                  <Text style={[styles.peptideItemName, { color: t.text }]}>{item.name}</Text>
                  <Text style={[styles.peptideItemCat, { color: t.textSecondary }]}>
                    {item.categories.join(', ')}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: t.glassBorder }]} />}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  hint?: string;
}) {
  const t = useTheme();
  return (
    <View style={[styles.resultRow, { borderBottomColor: t.glassBorder }]}>
      <Text style={[styles.resultLabel, { color: t.textSecondary }]}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.resultValue, { color: t.text }, highlight && styles.resultHighlight]}>{value}</Text>
        {hint && (
          <Text style={[styles.resultHint, { color: t.textSecondary }]}>{hint}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  scroll: { paddingBottom: 40 },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  // Simple-mode toggle row + the in-line BAC water warning are small UX
  // additions for the v1.9.9 wave; styles live alongside section/* so
  // they pick up the same horizontal padding.
  simpleModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  simpleModeTitle: { fontSize: FontSizes.md, fontWeight: '700' },
  simpleModeHint: { fontSize: FontSizes.xs, lineHeight: 16, marginTop: 2 },
  bacWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  bacWarnText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: '#9A3412',
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },

  // Picker trigger
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  pickerPlaceholder: {
    color: Colors.darkTextSecondary,
    fontWeight: '400',
  },

  // Inputs
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    height: 44,
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.iceMeltDeep,
  },
  unitLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
    width: 36,
  },

  // Toggle
  unitToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  unitToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    minWidth: 38,
    alignItems: 'center',
  },
  unitToggleText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  unitMasterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  unitMasterLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginBottom: 2,
  },
  unitMasterHint: {
    fontSize: 11,
    lineHeight: 14,
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetBtnActive: {
    backgroundColor: Colors.glassBlue,
    borderColor: Colors.glassBlueBorder,
  },
  presetBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  presetBtnTextActive: {
    color: Colors.pepBlueLight,
  },

  // Frequency
  freqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  freqBtnActive: {
    backgroundColor: Colors.glassBlue,
    borderColor: Colors.glassBlueBorder,
  },
  freqBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  freqBtnTextActive: {
    color: Colors.iceMelt,
  },

  // Preview
  previewLabel: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.iceMeltDeep,
  },
  previewSub: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },

  // Warnings
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.md,
  },
  warnText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: '#B91C1C',
    lineHeight: 18,
    fontWeight: '600',
  },

  // Results
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  resultLabel: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    flex: 1,
  },
  resultValue: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  resultHighlight: {
    color: Colors.iceMeltDeep,
    fontSize: FontSizes.lg,
  },
  resultHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Syringe
  syringeContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  syringeBarrel: {
    width: 60,
    height: 220,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  tick: {
    position: 'absolute',
    left: 0,
    width: 12,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tickMajor: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tickLabel: {
    position: 'absolute',
    left: 24,
    top: -7,
    fontSize: 10,
    color: Colors.darkTextSecondary,
    width: 30,
  },
  syringeFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.6,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  drawLine: {
    position: 'absolute',
    left: 0,
    right: -100,
    height: 2,
    backgroundColor: Colors.iceMeltDeep,
  },
  drawLineLabel: {
    position: 'absolute',
    left: 68,
    top: -8,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.iceMeltDeep,
    width: 160,
  },
  needleTip: {
    width: 4,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },

  // Protocol
  protoCard: { marginBottom: Spacing.sm },
  protoName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.iceMelt,
    marginBottom: 8,
  },
  protoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  protoLabel: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },
  protoValue: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
  },
  protoNote: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Safety/storage
  storageRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  storageContent: { flex: 1 },
  storageTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.rose,
    marginBottom: 4,
  },
  storageText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
  },
  peptideItem: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  peptideItemActive: {
    backgroundColor: Colors.glassBlue,
  },
  peptideItemName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  peptideItemCat: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: Spacing.lg,
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    lineHeight: 16,
  },
});
