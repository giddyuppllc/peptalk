import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStackStore } from '../../src/store/useStackStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { getPeptideById } from '../../src/data/peptides';
import { PEPTIDES } from '../../src/data/peptides';
import { GlassCard } from '../../src/components/GlassCard';
import { CoachMark } from '../../src/components/tutorial/CoachMark';
import { getCategoryColor } from '../../src/constants/categories';
import { Colors } from '../../src/constants/theme';
import { PeptideStack, PeptideCategory, GoalType, Peptide } from '../../src/types';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { PeptideDisclaimerModal } from '../../src/components/PeptideDisclaimerModal';
import {
  calculateReconstitution,
  suggestBacWaterForRoundUnits,
} from '../../src/services/doseCalculator';
import { useTourTarget } from '../../src/hooks/useTourTarget';

// ─── Category meta-groups (for the educational browsing grid) ─────────────
interface CategoryMeta {
  id: PeptideCategory;
  label: string;
  icon: string;
}

interface CategoryGroup {
  id: string;
  label: string;
  categories: CategoryMeta[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'performance',
    label: 'Performance',
    categories: [
      { id: 'Metabolic', label: 'Metabolic', icon: 'flame-outline' },
      { id: 'Growth Hormone', label: 'Growth Hormone', icon: 'trending-up-outline' },
      { id: 'Nootropic', label: 'Nootropic', icon: 'bulb-outline' },
    ],
  },
  {
    id: 'recovery',
    label: 'Recovery',
    categories: [
      { id: 'Recovery', label: 'Recovery', icon: 'bandage-outline' },
      { id: 'Anti-inflammatory', label: 'Anti-inflammatory', icon: 'snow-outline' },
      { id: 'Sleep', label: 'Sleep', icon: 'moon-outline' },
    ],
  },
  {
    id: 'longevity',
    label: 'Longevity',
    categories: [
      { id: 'Longevity', label: 'Longevity', icon: 'hourglass-outline' },
      { id: 'Mitochondrial', label: 'Mitochondrial', icon: 'flash-outline' },
      { id: 'Immune', label: 'Immune', icon: 'shield-outline' },
    ],
  },
  {
    id: 'aesthetics',
    label: 'Aesthetics',
    categories: [
      { id: 'Cosmetic', label: 'Skin & Hair', icon: 'sparkles-outline' },
      { id: 'Tanning', label: 'Tanning', icon: 'sunny-outline' },
    ],
  },
  {
    id: 'other',
    label: 'Specialized',
    categories: [
      { id: 'Reproductive', label: 'Reproductive', icon: 'heart-circle-outline' },
      { id: 'Sexual Health', label: 'Sexual Health', icon: 'heart-outline' },
      { id: 'Neuropeptide', label: 'Neuropeptide', icon: 'pulse-outline' },
      { id: 'Antimicrobial', label: 'Antimicrobial', icon: 'medkit-outline' },
    ],
  },
];

const GOAL_FILTERS: { id: GoalType; label: string; icon: string }[] = [
  { id: 'weight_loss', label: 'Weight Loss', icon: 'flame-outline' },
  { id: 'recovery', label: 'Recovery', icon: 'bandage-outline' },
  { id: 'cognitive', label: 'Cognitive', icon: 'bulb-outline' },
  { id: 'longevity', label: 'Longevity', icon: 'hourglass-outline' },
  { id: 'immune', label: 'Immune', icon: 'shield-outline' },
  { id: 'sleep', label: 'Sleep', icon: 'moon-outline' },
  { id: 'skin_hair', label: 'Skin & Hair', icon: 'sparkles-outline' },
  { id: 'energy', label: 'Energy', icon: 'flash-outline' },
  { id: 'muscle_gain', label: 'Muscle', icon: 'barbell-outline' },
  { id: 'body_recomp', label: 'Recomp', icon: 'body-outline' },
  { id: 'gut_health', label: 'Gut Health', icon: 'leaf-outline' },
];

function getEvidenceBadge(level: string): { label: string; color: string } {
  switch (level) {
    case 'established':
      return { label: 'Established', color: '#22c55e' };
    case 'moderate':
      return { label: 'Moderate', color: '#CADEE5' };
    case 'preliminary':
      return { label: 'Preliminary', color: '#f97316' };
    default:
      return { label: level, color: '#6B7280' };
  }
}

function getGoalLabel(goal: GoalType): string {
  return GOAL_FILTERS.find((g) => g.id === goal)?.label ?? goal.replace('_', ' ');
}

interface StackCardProps {
  stack: PeptideStack;
  onLoad: () => void;
  onDelete?: () => void;
}

const StackCard: React.FC<StackCardProps> = ({ stack, onLoad, onDelete }) => {
  const t = useTheme();
  const accent = useSectionAccent();
  const peptideNames = stack.peptideIds
    .map((id) => getPeptideById(id)?.name ?? id)
    .join(', ');

  const evidence = stack.evidenceLevel ? getEvidenceBadge(stack.evidenceLevel) : null;

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(
      'Delete Stack',
      `Are you sure you want to delete "${stack.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  // Build subtitle: "3 peptides · Moderate · By Dr. Smith"
  const subtitleParts: string[] = [];
  subtitleParts.push(`${stack.peptideIds.length} peptides`);
  if (evidence) subtitleParts.push(evidence.label);
  if (stack.curatedBy) subtitleParts.push(`By ${stack.curatedBy}`);
  const subtitle = subtitleParts.join(' · ');

  return (
    <TouchableOpacity
      style={[styles.stackCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}
      onPress={onLoad}
      activeOpacity={0.7}
    >
      <View style={styles.stackCardInner}>
        {/* Left accent strip for curated stacks */}
        {stack.isCurated && (
          <View style={[styles.stackAccentStrip, { backgroundColor: accent.deep }]} />
        )}

        <View style={styles.stackContent}>
          {/* Name */}
          <Text style={[styles.stackName, { color: t.text }]} numberOfLines={1}>
            {stack.name}
          </Text>

          {/* One-line subtitle */}
          <Text style={[styles.stackSubtitle, { color: t.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>

          {/* Peptide names (condensed) */}
          <Text style={[styles.stackPeptides, { color: t.textMuted }]} numberOfLines={1}>
            {peptideNames}
          </Text>
        </View>

        {/* Right side: delete or chevron */}
        <View style={styles.stackTrailing}>
          {!stack.isCurated && onDelete && (
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.stackDeleteBtn}
              accessibilityRole="button"
              accessibilityLabel={`Delete stack ${stack.name}`}
            >
              <Ionicons name="trash-outline" size={16} color={t.textMuted} />
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Calculator Tab — reconstitution + dosing calculator
// ═══════════════════════════════════════════════════════════════════════════

function CalculatorTab() {
  const t = useTheme();
  const accent = useSectionAccent();

  const [selectedPeptideId, setSelectedPeptideId] = useState<string | null>(null);
  const [peptideSearch, setPeptideSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [vialMg, setVialMg] = useState('10');
  const [bacMl, setBacMl] = useState('2');
  const [doseMcg, setDoseMcg] = useState('250');
  const [syringe, setSyringe] = useState<'U-100' | 'U-40'>('U-100');
  const [autoBac, setAutoBac] = useState(true);

  const selectedPeptide = selectedPeptideId
    ? PEPTIDES.find((p) => p.id === selectedPeptideId)
    : null;

  const filteredPeptides = useMemo(() => {
    const q = peptideSearch.trim().toLowerCase();
    if (!q) return PEPTIDES.slice(0, 30);
    return PEPTIDES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.abbreviation?.toLowerCase().includes(q),
    ).slice(0, 30);
  }, [peptideSearch]);

  const numericVialMg = parseFloat(vialMg) || 0;
  const numericBacMl = parseFloat(bacMl) || 0;
  const numericDoseMcg = parseFloat(doseMcg) || 0;

  // If "auto BAC" is on, recompute BAC volume to give a round unit count
  const effectiveBacMl = autoBac
    ? suggestBacWaterForRoundUnits(numericVialMg, numericDoseMcg, syringe)
    : numericBacMl;

  const result = calculateReconstitution({
    vialMg: numericVialMg,
    bacWaterMl: effectiveBacMl,
    desiredDoseMcg: numericDoseMcg,
    syringe,
  });

  // Syringe fill percentage for the visual (U-100 max = 100 units = 1ml)
  const fillPct = Math.min(100, (result.syringeUnits / 100) * 100);

  return (
    <View style={calcStyles.wrap}>
      {/* Peptide picker */}
      <Text style={[calcStyles.fieldLabel, { color: t.textSecondary }]}>PEPTIDE</Text>
      <TouchableOpacity
        style={[calcStyles.pickerRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
        onPress={() => setShowPicker(!showPicker)}
        activeOpacity={0.7}
      >
        <View style={[calcStyles.pickerIcon, { backgroundColor: `${accent.deep}18` }]}>
          <Ionicons name="flask-outline" size={18} color={accent.deep} />
        </View>
        <View style={{ flex: 1 }}>
          {selectedPeptide ? (
            <>
              <Text style={[calcStyles.pickerValue, { color: t.text }]} numberOfLines={1}>
                {selectedPeptide.name}
              </Text>
              <Text style={[calcStyles.pickerMeta, { color: t.textSecondary }]} numberOfLines={1}>
                {selectedPeptide.categories[0]}
              </Text>
            </>
          ) : (
            <Text style={[calcStyles.pickerValue, { color: t.textMuted }]}>Select a peptide (optional)</Text>
          )}
        </View>
        <Ionicons
          name={showPicker ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={t.textSecondary}
        />
      </TouchableOpacity>

      {showPicker && (
        <View style={[calcStyles.pickerDropdown, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
          <View style={[calcStyles.searchRow, { borderBottomColor: t.cardBorder }]}>
            <Ionicons name="search" size={14} color={t.textMuted} />
            <TextInput
              style={[calcStyles.searchInput, { color: t.text }]}
              placeholder="Search peptides..."
              placeholderTextColor={t.textMuted}
              value={peptideSearch}
              onChangeText={setPeptideSearch}
            />
          </View>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {filteredPeptides.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[calcStyles.dropdownItem, { borderBottomColor: t.cardBorder }]}
                onPress={() => {
                  setSelectedPeptideId(p.id);
                  setShowPicker(false);
                  setPeptideSearch('');
                }}
                activeOpacity={0.7}
              >
                <Text style={[calcStyles.dropdownItemText, { color: t.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[calcStyles.dropdownItemMeta, { color: t.textSecondary }]} numberOfLines={1}>
                  {p.categories[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Vial strength */}
      <Text style={[calcStyles.fieldLabel, { color: t.textSecondary }]}>VIAL STRENGTH</Text>
      <View style={[calcStyles.inputRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <TextInput
          style={[calcStyles.input, { color: t.text }]}
          value={vialMg}
          onChangeText={setVialMg}
          keyboardType="decimal-pad"
          placeholder="10"
          placeholderTextColor={t.textMuted}
        />
        <Text style={[calcStyles.inputUnit, { color: t.textSecondary }]}>mg</Text>
      </View>
      {/* Vial preset chips */}
      <View style={calcStyles.presetRow}>
        {['2', '5', '10', '15', '30'].map((preset) => (
          <TouchableOpacity
            key={preset}
            style={[
              calcStyles.presetChip,
              { borderColor: vialMg === preset ? accent.deep : t.cardBorder, backgroundColor: vialMg === preset ? `${accent.deep}18` : 'transparent' },
            ]}
            onPress={() => setVialMg(preset)}
          >
            <Text
              style={[
                calcStyles.presetText,
                { color: vialMg === preset ? accent.deep : t.textSecondary },
              ]}
            >
              {preset}mg
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Desired dose */}
      <Text style={[calcStyles.fieldLabel, { color: t.textSecondary }]}>DESIRED DOSE</Text>
      <View style={[calcStyles.inputRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <TextInput
          style={[calcStyles.input, { color: t.text }]}
          value={doseMcg}
          onChangeText={setDoseMcg}
          keyboardType="decimal-pad"
          placeholder="250"
          placeholderTextColor={t.textMuted}
        />
        <Text style={[calcStyles.inputUnit, { color: t.textSecondary }]}>mcg</Text>
      </View>

      {/* BAC water — suggested or manual */}
      <View style={calcStyles.labelRow}>
        <Text style={[calcStyles.fieldLabel, { color: t.textSecondary }]}>BAC WATER</Text>
        <TouchableOpacity
          onPress={() => setAutoBac(!autoBac)}
          style={[
            calcStyles.autoToggle,
            {
              backgroundColor: autoBac ? `${accent.deep}18` : 'transparent',
              borderColor: autoBac ? accent.deep : t.cardBorder,
            },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons name={autoBac ? 'sparkles' : 'create-outline'} size={11} color={autoBac ? accent.deep : t.textSecondary} />
          <Text
            style={[
              calcStyles.autoToggleText,
              { color: autoBac ? accent.deep : t.textSecondary },
            ]}
          >
            {autoBac ? 'Suggested for you' : 'Enter manually'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* BAC recommendation banner */}
      {autoBac && effectiveBacMl > 0 && (
        <View style={[calcStyles.bacBanner, { backgroundColor: `${accent.deep}12`, borderColor: `${accent.deep}30` }]}>
          <View style={[calcStyles.bacBannerIcon, { backgroundColor: accent.deep }]}>
            <Ionicons name="water" size={14} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[calcStyles.bacBannerTitle, { color: t.text }]}>
              Add {effectiveBacMl.toFixed(1)} ml of BAC water
            </Text>
            <Text style={[calcStyles.bacBannerSub, { color: t.textSecondary }]}>
              to your {numericVialMg}mg vial for {Math.round(result.syringeUnits)} units per dose
            </Text>
          </View>
        </View>
      )}

      <View style={[calcStyles.inputRow, { backgroundColor: t.surface, borderColor: t.cardBorder, opacity: autoBac ? 0.5 : 1 }]}>
        <TextInput
          style={[calcStyles.input, { color: t.text }]}
          value={autoBac ? effectiveBacMl.toString() : bacMl}
          onChangeText={(v) => {
            if (autoBac) setAutoBac(false);
            setBacMl(v);
          }}
          keyboardType="decimal-pad"
          placeholder="2"
          placeholderTextColor={t.textMuted}
          editable={!autoBac}
        />
        <Text style={[calcStyles.inputUnit, { color: t.textSecondary }]}>ml</Text>
      </View>

      {/* Syringe type */}
      <Text style={[calcStyles.fieldLabel, { color: t.textSecondary }]}>SYRINGE TYPE</Text>
      <View style={calcStyles.segmentRow}>
        {(['U-100', 'U-40'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[
              calcStyles.segmentBtn,
              {
                backgroundColor: syringe === s ? accent.deep : 'transparent',
                borderColor: syringe === s ? accent.deep : t.cardBorder,
              },
            ]}
            onPress={() => setSyringe(s)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                calcStyles.segmentText,
                { color: syringe === s ? '#fff' : t.textSecondary },
              ]}
            >
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Results */}
      <View style={[calcStyles.resultsCard, { backgroundColor: t.surface, borderColor: `${accent.deep}40` }]}>
        <Text style={[calcStyles.resultsHeader, { color: t.textSecondary }]}>YOUR RESULT</Text>

        <View style={calcStyles.bigResultRow}>
          <View style={calcStyles.bigResult}>
            <Text style={[calcStyles.bigResultValue, { color: accent.deep }]}>
              {result.syringeUnits || '—'}
            </Text>
            <Text style={[calcStyles.bigResultLabel, { color: t.textSecondary }]}>
              units per draw
            </Text>
          </View>
          <View style={[calcStyles.resultDivider, { backgroundColor: t.cardBorder }]} />
          <View style={calcStyles.bigResult}>
            <Text style={[calcStyles.bigResultValue, { color: t.text }]}>
              {result.dosesPerVial || '—'}
            </Text>
            <Text style={[calcStyles.bigResultLabel, { color: t.textSecondary }]}>
              doses per vial
            </Text>
          </View>
        </View>

        {/* Syringe visual */}
        <View style={calcStyles.syringeWrap}>
          <View style={[calcStyles.syringeBarrel, { borderColor: t.cardBorder }]}>
            <View
              style={[
                calcStyles.syringeFill,
                {
                  width: `${fillPct}%`,
                  backgroundColor: accent.deep,
                },
              ]}
            />
            {/* Tick marks */}
            {[25, 50, 75].map((pct) => (
              <View key={pct} style={[calcStyles.syringeTick, { left: `${pct}%`, backgroundColor: t.cardBorder }]} />
            ))}
          </View>
          <Text style={[calcStyles.syringeLabel, { color: t.textSecondary }]}>
            Fill to {Math.round(result.syringeUnits)} units on a {syringe} insulin syringe
          </Text>
        </View>

        {/* Detail rows */}
        <View style={[calcStyles.detailRow, { borderTopColor: t.cardBorder }]}>
          <Text style={[calcStyles.detailLabel, { color: t.textSecondary }]}>BAC water to add</Text>
          <Text style={[calcStyles.detailValue, { color: t.text }]}>{effectiveBacMl.toFixed(1)} ml</Text>
        </View>
        <View style={[calcStyles.detailRow, { borderTopColor: t.cardBorder }]}>
          <Text style={[calcStyles.detailLabel, { color: t.textSecondary }]}>Concentration</Text>
          <Text style={[calcStyles.detailValue, { color: t.text }]}>
            {result.concentrationMgPerMl.toFixed(2)} mg/ml
          </Text>
        </View>
        <View style={[calcStyles.detailRow, { borderTopColor: t.cardBorder }]}>
          <Text style={[calcStyles.detailLabel, { color: t.textSecondary }]}>Volume per dose</Text>
          <Text style={[calcStyles.detailValue, { color: t.text }]}>
            {result.volumePerDoseMl.toFixed(3)} ml
          </Text>
        </View>
      </View>

      {/* Educational framing */}
      <View style={[calcStyles.eduBanner, { backgroundColor: `${accent.deep}0A`, borderColor: `${accent.deep}30` }]}>
        <Ionicons name="information-circle-outline" size={14} color={accent.deep} style={{ marginTop: 1 }} />
        <Text style={[calcStyles.eduText, { color: t.textSecondary }]}>
          Educational calculator only. Not medical advice. Consult a licensed healthcare provider before using any peptide. PepTalk is not liable for actions taken based on this tool.
        </Text>
      </View>

      {/* How the math works — expandable */}
      <View style={[calcStyles.mathCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <Text style={[calcStyles.mathTitle, { color: t.text }]}>How the math works</Text>
        <Text style={[calcStyles.mathLine, { color: t.textSecondary }]}>
          concentration = vial mg ÷ bac water ml
        </Text>
        <Text style={[calcStyles.mathLine, { color: t.textSecondary }]}>
          volume per dose = desired dose mcg ÷ (concentration × 1000)
        </Text>
        <Text style={[calcStyles.mathLine, { color: t.textSecondary }]}>
          units = volume ml × {syringe === 'U-40' ? '40' : '100'}
        </Text>
      </View>

      <View style={{ height: 60 }} />
    </View>
  );
}

const calcStyles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValue: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  pickerMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 1,
  },
  pickerDropdown: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    padding: 0,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  dropdownItemMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Playfair-Black',
    padding: 0,
    letterSpacing: -0.3,
  },
  inputUnit: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
  },
  autoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  autoToggleText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
  },
  bacBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  bacBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bacBannerTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
  },
  bacBannerSub: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },

  // Results
  resultsCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  resultsHeader: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  bigResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bigResult: {
    alignItems: 'center',
    flex: 1,
  },
  bigResultValue: {
    fontSize: 40,
    fontFamily: 'Playfair-Black',
    letterSpacing: -1,
  },
  bigResultLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: -2,
  },
  resultDivider: {
    width: 1,
    height: 40,
  },

  // Syringe visual
  syringeWrap: {
    marginTop: 18,
    marginBottom: 4,
  },
  syringeBarrel: {
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  syringeFill: {
    height: '100%',
    borderRadius: 12,
  },
  syringeTick: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: '100%',
  },
  syringeLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
    marginTop: 8,
  },

  // Detail rows
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },

  // Edu banner
  eduBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
  },
  eduText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    lineHeight: 15,
  },

  // How the math works
  mathCard: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  mathTitle: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  mathLine: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});

type PeptideTab = 'library' | 'stacks' | 'calculator';

export default function MyStacksScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const { savedStacks, loadStack, deleteStack } = useStackStore();
  const protocols = useDoseLogStore((s) => s.protocols);
  const activeProtocols = useMemo(() => protocols.filter((p) => p.isActive), [protocols]);
  const [selectedGoal, setSelectedGoal] = useState<GoalType | null>(null);
  const [activeTab, setActiveTab] = useState<PeptideTab>('library');
  const peptideTabBarRef = useTourTarget('peptide_tab_bar');

  const curatedStacks = useMemo(() => {
    let stacks = savedStacks.filter((s) => s.isCurated);
    if (selectedGoal) {
      stacks = stacks.filter((s) => s.targetGoals?.includes(selectedGoal));
    }
    return stacks;
  }, [savedStacks, selectedGoal]);

  const userStacks = useMemo(
    () => savedStacks.filter((s) => !s.isCurated),
    [savedStacks]
  );

  // Count peptides per category for the tile labels
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PEPTIDES.forEach((p) => {
      p.categories.forEach((cat) => {
        counts[cat] = (counts[cat] ?? 0) + 1;
      });
    });
    return counts;
  }, []);

  // Auto-pick featured peptides: highest evidence grade first, stable order.
  // Peptide.evidenceGrade allows both the letter scale ('A'..'E') and named
  // tiers ('established' | 'moderate' | 'preliminary'); both must be in the
  // ranking table or `order[grade]` returns `undefined` and tsc rejects the
  // implicit-any. Fallback to 5 (worst) for unknown / missing values.
  const featuredPeptides = useMemo(() => {
    const order: Record<string, number> = {
      A: 0, B: 1, C: 2, D: 3, E: 4,
      established: 0, moderate: 1, preliminary: 2,
    };
    return [...PEPTIDES]
      .sort((a, b) => {
        const av = order[a.evidenceGrade ?? ''] ?? 5;
        const bv = order[b.evidenceGrade ?? ''] ?? 5;
        if (av !== bv) return av - bv;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, []);

  const handleLoadStack = (stack: PeptideStack) => {
    loadStack(stack);
    router.push('/(tabs)/stack-builder');
  };

  const handleCategoryTap = (categoryId: PeptideCategory) => {
    router.push({
      pathname: '/peptide/category/[slug]' as any,
      params: { slug: categoryId },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        <CoachMark
          id="first_peptides_visit"
          title="Explore before you stack"
          body="Tap any peptide to learn mechanisms, dosing, and safety. Build stacks with the 🔬 calculator to check synergies."
          icon="flask-outline"
        />
        {/* ── Editorial Header ── */}
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, { color: t.text }]}>Peptides</Text>
          <View style={[styles.heroAccent, { backgroundColor: accent.deep }]} />
          <Text style={[styles.heroSub, { color: t.textSecondary }]}>
            Research peptides, explained
          </Text>
        </View>

        {/* ── Educational Disclaimer Banner ── */}
        <View style={[styles.disclaimerBanner, { backgroundColor: `${accent.deep}10`, borderColor: `${accent.deep}30` }]}>
          <View style={[styles.disclaimerIcon, { backgroundColor: `${accent.deep}20` }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={accent.deep} />
          </View>
          <Text style={[styles.disclaimerText, { color: t.text }]}>
            Educational research reference only.{' '}
            <Text style={{ color: t.textSecondary }}>
              Always consult a licensed healthcare provider for any medical decisions.
            </Text>
          </Text>
        </View>

        {/* ── 3-Tab bar (Library / Stacks / Calculator) ── */}
        <View ref={peptideTabBarRef} style={[styles.peptideTabBar, { borderBottomColor: t.cardBorder }]}>
          {(['library', 'stacks', 'calculator'] as const).map((tab) => {
            const labels = { library: 'Library', stacks: 'Stacks', calculator: 'Calculator' };
            const icons = { library: 'book-outline', stacks: 'layers-outline', calculator: 'calculator-outline' } as const;
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={styles.peptideTab}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={icons[tab] as any}
                  size={15}
                  color={active ? accent.deep : t.textSecondary}
                />
                <Text
                  style={[
                    styles.peptideTabText,
                    { color: active ? t.text : t.textSecondary },
                    active && { fontFamily: 'DMSans-Bold' },
                  ]}
                >
                  {labels[tab]}
                </Text>
                {active && <View style={[styles.peptideTabUnderline, { backgroundColor: accent.deep }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─────────────────── LIBRARY TAB ─────────────────── */}
        {activeTab === 'library' && <>

        {/* ── Category Carousel ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>EXPLORE</Text>
          <Text style={[styles.sectionHeadline, { color: t.text }]}>Browse by Category</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          overScrollMode="never"
          decelerationRate="fast"
          snapToInterval={130}
          snapToAlignment="start"
        >
          {CATEGORY_GROUPS.flatMap((group) =>
            group.categories.map((cat) => {
              const count = categoryCounts[cat.id] ?? 0;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.carouselCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                  onPress={() => handleCategoryTap(cat.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.carouselIcon, { backgroundColor: `${accent.deep}15` }]}>
                    <Ionicons name={cat.icon as any} size={20} color={accent.deep} />
                  </View>
                  <Text style={[styles.carouselLabel, { color: t.text }]} numberOfLines={1}>
                    {cat.label}
                  </Text>
                  <Text style={[styles.carouselCount, { color: t.textSecondary }]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* ── Featured Peptides (horizontal scroll) ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>MOST RESEARCHED</Text>
          <Text style={[styles.sectionHeadline, { color: t.text }]}>Featured Peptides</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredScroll}
          overScrollMode="never"
        >
          {featuredPeptides.map((peptide) => (
            <TouchableOpacity
              key={peptide.id}
              style={[styles.featuredCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push(`/peptide/${peptide.id}` as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.featuredGradient, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="flask" size={24} color={accent.deep} />
                {peptide.evidenceGrade === 'established' && (
                  <View style={[styles.evidenceBadge, { backgroundColor: accent.deep }]}>
                    <Text style={styles.evidenceBadgeText}>ESTABLISHED</Text>
                  </View>
                )}
              </View>
              <View style={styles.featuredBody}>
                <Text style={[styles.featuredName, { color: t.text }]} numberOfLines={1}>
                  {peptide.name}
                </Text>
                <Text style={[styles.featuredCategory, { color: accent.deep }]} numberOfLines={1}>
                  {peptide.categories[0]}
                </Text>
                <Text style={[styles.featuredSnippet, { color: t.textSecondary }]} numberOfLines={3}>
                  {peptide.researchSummary.split('.')[0] + '.'}
                </Text>
                <View style={styles.featuredFooter}>
                  <Text style={[styles.featuredLearnMore, { color: accent.deep }]}>Learn more</Text>
                  <Ionicons name="arrow-forward" size={12} color={accent.deep} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        </>}
        {/* ───────────────── END LIBRARY TAB ───────────────── */}

        {/* ─────────────────── STACKS TAB ─────────────────── */}
        {activeTab === 'stacks' && <>

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
          overScrollMode="never"
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: !selectedGoal ? `${accent.deep}15` : 'transparent' },
            ]}
            onPress={() => setSelectedGoal(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, { color: !selectedGoal ? accent.deep : t.textSecondary }]}>
              All
            </Text>
          </TouchableOpacity>
          {GOAL_FILTERS.map((goal) => {
            const active = selectedGoal === goal.id;
            return (
              <TouchableOpacity
                key={goal.id}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? `${accent.deep}15` : 'transparent' },
                ]}
                onPress={() => setSelectedGoal(active ? null : goal.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, { color: active ? accent.deep : t.textSecondary }]}>
                  {goal.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Research Stacks ── */}
        {curatedStacks.length > 0 && (
          <View style={styles.stackSection}>
            <Text style={[styles.stackSectionLabel, { color: t.textSecondary }]}>RESEARCH STACKS</Text>
            {curatedStacks.map((stack) => (
              <StackCard
                key={stack.id}
                stack={stack}
                onLoad={() => handleLoadStack(stack)}
              />
            ))}
          </View>
        )}

        {selectedGoal && curatedStacks.length === 0 && (
          <View style={[styles.noResultsCard, { backgroundColor: t.surface }]}>
            <Text style={[styles.noResultsText, { color: t.textSecondary }]}>
              No stacks for "{getGoalLabel(selectedGoal)}"
            </Text>
          </View>
        )}

        {/* ── Your Stacks ── */}
        <View style={styles.stackSection}>
          <Text style={[styles.stackSectionLabel, { color: t.textSecondary }]}>
            YOUR STACKS{userStacks.length > 0 ? ` (${userStacks.length})` : ''}
          </Text>
          {userStacks.length > 0 ? (
            userStacks.map((stack) => (
              <StackCard
                key={stack.id}
                stack={stack}
                onLoad={() => handleLoadStack(stack)}
                onDelete={() => deleteStack(stack.id)}
              />
            ))
          ) : (
            <TouchableOpacity
              style={[styles.emptyAction, { borderColor: `${accent.deep}40` }]}
              onPress={() => router.push('/(tabs)/stack-builder')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={accent.deep} />
              <Text style={[styles.emptyActionText, { color: accent.deep }]}>Build your first stack</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Active Protocols ── */}
        <View style={styles.stackSection}>
          <Text style={[styles.stackSectionLabel, { color: t.textSecondary }]}>
            ACTIVE PROTOCOLS{activeProtocols.length > 0 ? ` (${activeProtocols.length})` : ''}
          </Text>
          {activeProtocols.length > 0 ? (
            activeProtocols.map((proto) => (
              <View key={proto.id} style={[styles.protocolRow, { borderBottomColor: t.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.protocolName, { color: t.text }]}>{proto.peptideId}</Text>
                  <Text style={[styles.protocolInfo, { color: t.textSecondary }]}>
                    {proto.dose} {proto.unit} · {proto.route} · {proto.frequency}
                  </Text>
                </View>
                <Text style={[styles.protocolDate, { color: t.textMuted }]}>
                  {proto.startDate}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyHint, { color: t.textMuted }]}>
              No active protocols yet
            </Text>
          )}
        </View>

        </>}
        {/* ───────────────── END STACKS TAB ─────────────────── */}

        {/* ─────────────────── CALCULATOR TAB ─────────────────── */}
        {activeTab === 'calculator' && <CalculatorTab />}
        {/* ───────────────── END CALCULATOR TAB ───────────────── */}
      </ScrollView>

      {/* First-visit research & education disclaimer — blocks until accepted */}
      <PeptideDisclaimerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDE6D6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },

  // ── 3-Tab bar (Library / Stacks / Calculator) ──────────────
  peptideTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  peptideTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    position: 'relative',
  },
  peptideTabText: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
  },
  peptideTabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 2,
  },

  // ── Editorial Hero ─────────────────────────────────────────
  heroSection: {
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontSize: 36,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  heroAccent: {
    width: 44,
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 10,
  },
  heroSub: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },

  // ── Disclaimer banner ──────────────────────────────────────
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  disclaimerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    lineHeight: 15,
  },

  // ── Section wrappers ───────────────────────────────────────
  sectionWrap: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionHeadline: {
    fontSize: 24,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
  },

  // ── Category tiles ─────────────────────────────────────────
  groupWrap: {
    marginBottom: 18,
  },
  carouselContent: {
    paddingLeft: 20,
    paddingRight: 10,
    gap: 10,
    paddingBottom: 4,
  },
  carouselCard: {
    width: 120,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  carouselIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
  },
  carouselCount: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },

  // ── Featured peptide cards ─────────────────────────────────
  featuredScroll: {
    paddingRight: 20,
    gap: 12,
  },
  featuredCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featuredGradient: {
    height: 70,
    padding: 14,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  evidenceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  evidenceBadgeText: {
    fontSize: 9,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.4,
    color: '#fff',
  },
  featuredBody: {
    padding: 12,
    gap: 3,
  },
  featuredName: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  featuredCategory: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  featuredSnippet: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 16,
    minHeight: 48,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  featuredLearnMore: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
  },

  // ── Stack Sections ────────────────────────────────────────
  stackSection: {
    marginBottom: 20,
  },
  stackSectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // ── Goal Filters ──────────────────────────────────────────
  filterScroll: {
    marginTop: 4,
    marginBottom: 16,
  },
  filterContent: {
    gap: 4,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
  },

  // ── Stack Card (minimal) ──────────────────────────────────
  stackCard: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stackCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 12,
  },
  stackAccentStrip: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  stackContent: {
    flex: 1,
    paddingLeft: 14,
    gap: 2,
  },
  stackName: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
  },
  stackSubtitle: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
  },
  stackPeptides: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  stackTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  stackDeleteBtn: {
    padding: 4,
  },
  curatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  curatedText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Meta Row ──────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  evidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // ── No Results ────────────────────────────────────────────
  noResultsCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 12,
  },
  noResultsText: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
  },

  // ── Empty States ───────────────────────────────────────────
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  emptyActionText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    fontStyle: 'italic',
    paddingVertical: 8,
  },

  // ── Protocol rows ──────────────────────────────────────────
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  protocolName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  protocolInfo: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  protocolDate: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
  },
  scheduleDates: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginLeft: 44,
  },
});
