/**
 * Nutrition Dashboard — macro tracking, meal log, water intake.
 * Supports quick-log, food-search logging, and inline meal editing.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Colors, Gradients, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealEntry, MealType } from '../../src/types/fitness';
import { tapLight } from '../../src/utils/haptics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay();
  const start = new Date(referenceDate);
  start.setDate(start.getDate() - day);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const MAIN_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_ICONS: Record<MealType, string> = {
  breakfast:    'sunny-outline',
  lunch:        'restaurant-outline',
  dinner:       'moon-outline',
  snack:        'cafe-outline',
  pre_workout:  'flash-outline',
  post_workout: 'fitness-outline',
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast:    'Breakfast',
  lunch:        'Lunch',
  dinner:       'Dinner',
  snack:        'Snack',
  pre_workout:  'Pre-Workout',
  post_workout: 'Post-Workout',
};

/** Derive a display calorie total from a meal entry (quickLog or itemized foods). */
function mealCalories(meal: MealEntry): number {
  if (meal.quickLog) return meal.quickLog.calories;
  return meal.foods.reduce((sum, f) => sum + f.calories, 0);
}

/** Derive a display description from a meal entry. */
function mealDescription(meal: MealEntry): string {
  if (meal.quickLog?.description) return meal.quickLog.description;
  if (meal.foods.length > 0) {
    return meal.foods.map((f) => f.foodName).join(', ');
  }
  return 'Itemized meal';
}

// ---------------------------------------------------------------------------
// Macro Bar
// ---------------------------------------------------------------------------

function MacroBar({
  label,
  current,
  target,
  color,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  unit: string;
}) {
  const t = useTheme();
  const accent = useSectionAccent();
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <View style={styles.macroBar}>
      <View style={styles.macroBarHeader}>
        <Text style={[styles.macroBarLabel, { color: t.text }]}>{label}</Text>
        <Text style={[styles.macroBarValue, { color: t.text }]}>
          {Math.round(current)}{unit}{' '}
          <Text style={[styles.macroBarTarget, { color: t.textSecondary }]}>/ {target}{unit}</Text>
        </Text>
      </View>
      <View style={styles.macroBarTrack}>
        <View
          style={[
            styles.macroBarFill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick Log Modal
// ---------------------------------------------------------------------------

function QuickLogModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    mealType: MealType;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}) {
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [desc, setDesc] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const handleSave = () => {
    if (!desc.trim()) {
      Alert.alert('Missing Info', 'Please describe what you ate.');
      return;
    }
    onSave({
      mealType,
      description: desc.trim(),
      calories:    parseInt(cal,     10) || 0,
      protein:     parseInt(protein, 10) || 0,
      carbs:       parseInt(carbs,   10) || 0,
      fat:         parseInt(fat,     10) || 0,
    });
    setDesc('');
    setCal('');
    setProtein('');
    setCarbs('');
    setFat('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Quick Log Meal</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          {/* Meal type selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealTypeRow}>
            {(Object.keys(MEAL_LABELS) as MealType[]).map((mt) => (
              <TouchableOpacity
                key={mt}
                style={[styles.mealTypeChip, mealType === mt && styles.mealTypeChipActive]}
                onPress={() => setMealType(mt)}
              >
                <Ionicons
                  name={MEAL_ICONS[mt] as any}
                  size={14}
                  color={mealType === mt ? '#fff' : Colors.darkTextSecondary}
                />
                <Text style={[styles.mealTypeText, mealType === mt && styles.mealTypeTextActive]}>
                  {MEAL_LABELS[mt]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Description */}
          <Text style={styles.fieldLabel}>What did you eat?</Text>
          <TextInput
            style={styles.input}
            value={desc}
            onChangeText={setDesc}
            placeholder="e.g. Grilled chicken salad"
            placeholderTextColor={Colors.darkTextSecondary}
          />

          {/* Macros row */}
          <Text style={styles.fieldLabel}>Estimated Macros</Text>
          <View style={styles.macroInputRow}>
            <View style={styles.macroInput}>
              <Text style={styles.macroInputLabel}>Cal</Text>
              <TextInput
                style={styles.macroInputField}
                value={cal}
                onChangeText={setCal}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>
            <View style={styles.macroInput}>
              <Text style={styles.macroInputLabel}>Pro (g)</Text>
              <TextInput
                style={styles.macroInputField}
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>
            <View style={styles.macroInput}>
              <Text style={styles.macroInputLabel}>Carb (g)</Text>
              <TextInput
                style={styles.macroInputField}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>
            <View style={styles.macroInput}>
              <Text style={styles.macroInputLabel}>Fat (g)</Text>
              <TextInput
                style={styles.macroInputField}
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>
          </View>

          <GradientButton label="Log Meal" onPress={handleSave} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit Meal Modal
// ---------------------------------------------------------------------------

const PORTION_MULTIPLIERS: { label: string; value: number }[] = [
  { label: '0.5x',  value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x',    value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x',  value: 1.5 },
  { label: '2x',    value: 2 },
];

interface EditMealModalProps {
  meal: MealEntry | null;
  visible: boolean;
  onClose: () => void;
  onSave:   (mealId: string, updates: Partial<MealEntry>) => void;
  onDelete: (mealId: string) => void;
}

function EditMealModal({ meal, visible, onClose, onSave, onDelete }: EditMealModalProps) {
  const [desc,    setDesc]    = useState('');
  const [cal,     setCal]     = useState('');
  const [protein, setProtein] = useState('');
  const [carbs,   setCarbs]   = useState('');
  const [fat,     setFat]     = useState('');
  const [notes,   setNotes]   = useState('');

  // Seed form when meal changes
  React.useEffect(() => {
    if (!meal) return;
    const foods = meal.foods ?? [];
    const baseCal     = meal.quickLog?.calories     ?? foods.reduce((s, f) => s + f.calories, 0);
    const baseProt    = meal.quickLog?.proteinGrams  ?? foods.reduce((s, f) => s + f.proteinGrams, 0);
    const baseCarbs   = meal.quickLog?.carbsGrams    ?? foods.reduce((s, f) => s + f.carbsGrams, 0);
    const baseFat     = meal.quickLog?.fatGrams      ?? foods.reduce((s, f) => s + f.fatGrams, 0);
    const baseDesc    = meal.quickLog?.description   ?? foods.map((f) => f.foodName).join(', ') ?? '';
    setDesc(baseDesc);
    setCal(String(baseCal));
    setProtein(String(baseProt));
    setCarbs(String(baseCarbs));
    setFat(String(baseFat));
    setNotes(meal.notes ?? '');
  }, [meal?.id]);

  const applyMultiplier = (mult: number) => {
    if (!meal) return;
    const baseCal   = meal.quickLog?.calories     ?? meal.foods.reduce((s, f) => s + f.calories, 0);
    const baseProt  = meal.quickLog?.proteinGrams  ?? meal.foods.reduce((s, f) => s + f.proteinGrams, 0);
    const baseCarbs = meal.quickLog?.carbsGrams    ?? meal.foods.reduce((s, f) => s + f.carbsGrams, 0);
    const baseFat   = meal.quickLog?.fatGrams      ?? meal.foods.reduce((s, f) => s + f.fatGrams, 0);
    setCal(String(Math.round(baseCal * mult)));
    setProtein(String(Math.round(baseProt * mult * 10) / 10));
    setCarbs(String(Math.round(baseCarbs * mult * 10) / 10));
    setFat(String(Math.round(baseFat * mult * 10) / 10));
  };

  const handleSave = () => {
    if (!meal) return;
    const calNum     = parseFloat(cal)     || 0;
    const proteinNum = parseFloat(protein) || 0;
    const carbsNum   = parseFloat(carbs)   || 0;
    const fatNum     = parseFloat(fat)     || 0;

    // Always persist as quickLog so the existing display logic works regardless of origin
    const updates: Partial<MealEntry> = {
      quickLog: {
        description:  desc.trim() || mealDescription(meal),
        calories:     calNum,
        proteinGrams: proteinNum,
        carbsGrams:   carbsNum,
        fatGrams:     fatNum,
      },
      notes: notes.trim() || undefined,
    };
    onSave(meal.id, updates);
    onClose();
  };

  const handleDelete = () => {
    if (!meal) return;
    Alert.alert(
      'Delete Meal',
      'Remove this entry permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(meal.id);
            onClose();
          },
        },
      ],
    );
  };

  if (!meal) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.editModalContent}>
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Meal</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Meal type badge (read-only) */}
            <View style={styles.editMealTypeBadge}>
              <Ionicons name={MEAL_ICONS[meal.mealType] as any} size={16} color="#E89672" />
              <Text style={styles.editMealTypeLabel}>{MEAL_LABELS[meal.mealType]}</Text>
            </View>

            {/* Description */}
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="What did you eat?"
              placeholderTextColor={Colors.darkTextSecondary}
            />

            {/* Macros */}
            <Text style={styles.fieldLabel}>Macros</Text>
            <View style={styles.macroInputRow}>
              <View style={styles.macroInput}>
                <Text style={styles.macroInputLabel}>Cal</Text>
                <TextInput
                  style={styles.macroInputField}
                  value={cal}
                  onChangeText={setCal}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.darkTextSecondary}
                />
              </View>
              <View style={styles.macroInput}>
                <Text style={styles.macroInputLabel}>Pro (g)</Text>
                <TextInput
                  style={styles.macroInputField}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.darkTextSecondary}
                />
              </View>
              <View style={styles.macroInput}>
                <Text style={styles.macroInputLabel}>Carb (g)</Text>
                <TextInput
                  style={styles.macroInputField}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.darkTextSecondary}
                />
              </View>
              <View style={styles.macroInput}>
                <Text style={styles.macroInputLabel}>Fat (g)</Text>
                <TextInput
                  style={styles.macroInputField}
                  value={fat}
                  onChangeText={setFat}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.darkTextSecondary}
                />
              </View>
            </View>

            {/* Portion multipliers */}
            <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Portion Multiplier</Text>
            <Text style={styles.fieldHint}>Applies to all macros proportionally</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.multRow}
            >
              {PORTION_MULTIPLIERS.map((m) => (
                <TouchableOpacity
                  key={m.label}
                  style={styles.multChip}
                  onPress={() => applyMultiplier(m.value)}
                >
                  <Text style={styles.multChipText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Notes */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. substituted Greek yogurt for sour cream"
              placeholderTextColor={Colors.darkTextSecondary}
              multiline
              numberOfLines={2}
            />

            {/* Save */}
            <GradientButton label="Save Changes" onPress={handleSave} style={{ marginTop: 12 }} />

            {/* Delete */}
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={styles.deleteBtnText}>Delete Meal</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Water Tracker — big glass that fills vertically
// ---------------------------------------------------------------------------

const GLASS_OZ = 8;
const CUSTOM_PRESETS = [4, 12, 16, 20];

function WaterTracker() {
  const t = useTheme();
  const accent = useSectionAccent();
  const { logWater, getWater, targets } = useMealStore();
  const dateKey  = today();
  const current  = getWater(dateKey);
  const target   = targets.waterOz ?? 100;
  const pct      = target > 0 ? Math.round((current / target) * 100) : 0;
  const fillPct  = Math.min(100, pct);
  const overOz   = Math.max(0, current - target);
  const reached  = current >= target;
  const [showCustom, setShowCustom] = useState(false);

  const adjust = (oz: number) => {
    const delta = oz > 0 ? oz : Math.max(oz, -current); // don't go below 0
    if (delta === 0) return;
    logWater(dateKey, delta);
    tapLight();
  };

  const addCustom = (oz: number) => {
    logWater(dateKey, oz);
    tapLight();
    setShowCustom(false);
  };

  return (
    <GlassCard>
      {/* Header */}
      <View style={styles.hydHeader}>
        <View style={styles.hydHeaderLeft}>
          <View style={[styles.hydIcon, { backgroundColor: `${accent.deep}18` }]}>
            <Ionicons name="water" size={16} color={accent.deep} />
          </View>
          <Text style={[styles.hydTitle, { color: t.text }]}>Hydration</Text>
        </View>
        <Text style={[styles.hydAmount, { color: t.text }]}>
          {current}
          <Text style={[styles.hydTarget, { color: t.textSecondary }]}> oz of {target}</Text>
        </Text>
      </View>

      {/* Big glass visual */}
      <View style={styles.glassWrap}>
        {/* Overflow droplet badge when over 100% */}
        {overOz > 0 && (
          <View style={[styles.glassOverflowBadge, { backgroundColor: accent.deep }]}>
            <Ionicons name="arrow-up" size={11} color="#FFFFFF" />
            <Text style={styles.glassOverflowText}>+{overOz} oz</Text>
          </View>
        )}
        <View
          style={[
            styles.glassBody,
            {
              borderColor: accent.deep,
              borderWidth: overOz > 0 ? 4 : 3,
            },
          ]}
        >
          {/* Fill from bottom (capped at 100% — the glass is physically full) */}
          <View
            style={[
              styles.glassFill,
              {
                height: `${fillPct}%`,
                backgroundColor: accent.deep,
              },
            ]}
          />
          {/* Subtle tick marks overlay (quarters) */}
          <View style={[styles.glassTick, { top: '25%', backgroundColor: `${accent.deep}30` }]} />
          <View style={[styles.glassTick, { top: '50%', backgroundColor: `${accent.deep}30` }]} />
          <View style={[styles.glassTick, { top: '75%', backgroundColor: `${accent.deep}30` }]} />
          {/* Center percent label */}
          <View style={styles.glassLabel}>
            <Text
              style={[
                styles.glassPct,
                { color: fillPct >= 50 ? '#FFFFFF' : accent.deep },
              ]}
            >
              {pct}%
            </Text>
          </View>
        </View>
      </View>

      {/* − / + controls */}
      <View style={styles.hydControls}>
        <TouchableOpacity
          style={[
            styles.hydCtrlBtn,
            { borderColor: `${accent.deep}55`, opacity: current > 0 ? 1 : 0.4 },
          ]}
          onPress={() => adjust(-GLASS_OZ)}
          disabled={current <= 0}
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={16} color={accent.deep} />
          <Text style={[styles.hydCtrlText, { color: accent.deep }]}>{GLASS_OZ} oz</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hydCtrlBtnPrimary, { backgroundColor: accent.deep }]}
          onPress={() => adjust(GLASS_OZ)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.hydCtrlTextPrimary}>{GLASS_OZ} oz</Text>
        </TouchableOpacity>
      </View>

      {/* Status / hint */}
      {reached && (
        <Text style={[styles.hydHint, { color: accent.deep, textAlign: 'center' }]}>
          {overOz > 0
            ? `${current} oz logged — ${overOz} oz over target`
            : `Daily target reached — ${current} oz logged`}
        </Text>
      )}

      {/* Custom amount */}
      {!showCustom ? (
        <TouchableOpacity
          style={[styles.hydCustomBtn, { borderColor: `${accent.deep}55` }]}
          onPress={() => setShowCustom(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={15} color={accent.deep} />
          <Text style={[styles.hydCustomBtnText, { color: accent.deep }]}>
            Custom amount
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.hydCustomRow}>
          {CUSTOM_PRESETS.map((oz) => (
            <TouchableOpacity
              key={oz}
              style={[styles.hydCustomChip, { borderColor: `${accent.deep}55` }]}
              onPress={() => addCustom(oz)}
              activeOpacity={0.7}
            >
              <Text style={[styles.hydCustomChipText, { color: accent.deep }]}>
                +{oz} oz
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.hydCustomClose}
            onPress={() => setShowCustom(false)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={t.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Add Food Sheet — opens from + Add button, routes to appropriate logger
// ---------------------------------------------------------------------------

interface AddFoodSheetProps {
  visible: boolean;
  mealType: MealType | null;
  onClose: () => void;
  onPickOption: (option: 'search' | 'my_meals' | 'barcode' | 'ai_scanner' | 'quick') => void;
}

function AddFoodSheet({ visible, mealType, onClose, onPickOption }: AddFoodSheetProps) {
  const t = useTheme();
  const accent = useSectionAccent();
  if (!mealType) return null;

  const options = [
    { key: 'search' as const,     icon: 'search-outline' as const,    color: '#E89672', label: 'Search Foods',     sub: 'USDA & common items' },
    { key: 'my_meals' as const,   icon: 'bookmark-outline' as const,  color: '#BADDCB', label: 'My Meals',         sub: 'Recently logged' },
    { key: 'barcode' as const,    icon: 'barcode-outline' as const,   color: '#F4E9A7', label: 'Scan Barcode',     sub: 'Packaged foods' },
    { key: 'ai_scanner' as const, icon: 'camera-outline' as const,    color: '#e3a7a1', label: 'AI Food Scanner',  sub: 'Photo → macros (Pro)' },
    { key: 'quick' as const,      icon: 'create-outline' as const,    color: '#8faa8b', label: 'Quick Log',        sub: 'Enter macros manually' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheetContent, { backgroundColor: t.bg }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: t.text }]}>
            Log {MEAL_LABELS[mealType]}
          </Text>
          <Text style={[styles.sheetSub, { color: t.textSecondary }]}>
            Choose how you'd like to add food
          </Text>
          <View style={{ marginTop: 16 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sheetRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
                onPress={() => onPickOption(opt.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIcon, { backgroundColor: `${opt.color}20` }]}>
                  <Ionicons name={opt.icon} size={20} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetRowLabel, { color: t.text }]}>{opt.label}</Text>
                  <Text style={[styles.sheetRowSub, { color: t.textSecondary }]}>{opt.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={[styles.sheetCancelText, { color: t.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function NutritionScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const { meals, addMeal, removeMeal, updateMeal, getDailyProgress, targets } = useMealStore();

  const [showLog,        setShowLog]        = useState(false);
  const [editingMeal,    setEditingMeal]    = useState<MealEntry | null>(null);
  const [selectedDay,    setSelectedDay]    = useState(today());
  const [weekOffset,     setWeekOffset]     = useState(0);
  const [addSheetMeal,   setAddSheetMeal]   = useState<MealType | null>(null);

  const selectedProgress = getDailyProgress(selectedDay);
  const dayMeals = useMemo(() => meals.filter((m) => m.date === selectedDay), [meals, selectedDay]);

  const mealsByType = useMemo(() => {
    const grouped: Record<MealType, MealEntry[]> = {
      breakfast: [], lunch: [], dinner: [], snack: [], pre_workout: [], post_workout: [],
    };
    dayMeals.forEach((m) => {
      const key = MAIN_MEAL_TYPES.includes(m.mealType) ? m.mealType : 'snack';
      grouped[key].push(m);
    });
    return grouped;
  }, [dayMeals]);

  const weekDays = useMemo(() => {
    const ref = new Date();
    ref.setDate(ref.getDate() + weekOffset * 7);
    return getWeekDays(ref);
  }, [weekOffset]);

  const handleQuickLog = useCallback(
    (data: {
      mealType: MealType;
      description: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      addMeal({
        id:       `meal-${Date.now()}`,
        date:     selectedDay,
        mealType: data.mealType,
        foods:    [],
        quickLog: {
          description:  data.description,
          calories:     data.calories,
          proteinGrams: data.protein,
          carbsGrams:   data.carbs,
          fatGrams:     data.fat,
        },
        timestamp: new Date().toISOString(),
      });
    },
    [addMeal, selectedDay],
  );

  const handleAddOption = useCallback(
    (option: 'search' | 'my_meals' | 'barcode' | 'ai_scanner' | 'quick') => {
      const mt = addSheetMeal;
      setAddSheetMeal(null);
      if (!mt) return;
      const params = { mealType: mt, date: selectedDay } as any;
      if (option === 'search')     router.push({ pathname: '/nutrition/food-search' as any, params });
      if (option === 'my_meals')   router.push({ pathname: '/nutrition/food-search' as any, params: { ...params, tab: 'my_meals' } });
      if (option === 'barcode')    router.push({ pathname: '/nutrition/food-search' as any, params: { ...params, scan: '1' } });
      if (option === 'ai_scanner') router.push({ pathname: '/nutrition/food-scanner' as any, params });
      if (option === 'quick')      setShowLog(true);
    },
    [addSheetMeal, router, selectedDay],
  );

  const selectedDayLabel = useMemo(() => {
    if (selectedDay === today()) return 'Today';
    const d = new Date(selectedDay + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }, [selectedDay]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Nutrition</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            onPress={() => router.push('/nutrition/meal-plan' as any)}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="AI meal plan"
          >
            <Ionicons name="calendar-outline" size={20} color={accent.deep} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/nutrition/recipe-generator' as any)}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="AI recipes"
          >
            <Ionicons name="sparkles-outline" size={20} color={accent.deep} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/nutrition/targets' as any)}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Nutrition targets"
          >
            <Ionicons name="settings-outline" size={22} color={t.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} overScrollMode="never" contentContainerStyle={styles.scroll}>
        {/* Week strip */}
        <View style={styles.section}>
          <View style={styles.weekHeader}>
            <TouchableOpacity onPress={() => setWeekOffset(weekOffset - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={18} color={t.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.weekLabel, { color: t.text }]}>{selectedDayLabel}</Text>
            <TouchableOpacity
              onPress={() => weekOffset < 0 && setWeekOffset(weekOffset + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={weekOffset >= 0}
            >
              <Ionicons name="chevron-forward" size={18} color={weekOffset >= 0 ? 'transparent' : t.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.weekStrip, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            {weekDays.map((d) => {
              const key = dateKey(d);
              const isToday = key === today();
              const isSelected = key === selectedDay;
              const isFuture = d > new Date();
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.weekDayCell,
                    isSelected && { backgroundColor: accent.deep },
                  ]}
                  onPress={() => !isFuture && setSelectedDay(key)}
                  activeOpacity={isFuture ? 1 : 0.7}
                >
                  <Text style={[
                    styles.weekDayLabel,
                    { color: isSelected ? '#fff' : t.textSecondary },
                    isToday && !isSelected && { color: accent.deep, fontFamily: 'DMSans-Bold' },
                  ]}>
                    {DAY_LABELS[d.getDay()]}
                  </Text>
                  <Text style={[
                    styles.weekDayNumber,
                    { color: isSelected ? '#fff' : isFuture ? '#D1D5DB' : t.text },
                    isToday && !isSelected && { color: accent.deep },
                  ]}>
                    {d.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Calorie + macros summary */}
        <View style={styles.section}>
          <View style={[styles.summaryCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <View style={styles.summaryTopRow}>
              <View>
                <Text style={[styles.summaryLabel, { color: t.textSecondary }]}>CALORIES</Text>
                <Text style={[styles.summaryValue, { color: t.text }]}>
                  {Math.round(selectedProgress.totals.calories)}
                </Text>
                <Text style={[styles.summaryTarget, { color: t.textSecondary }]}>
                  of {targets.calories} goal
                </Text>
              </View>
              <View style={styles.summaryRingWrap}>
                <View style={[styles.summaryRing, { borderColor: `${accent.deep}20` }]}>
                  <View
                    style={[
                      styles.summaryRingFill,
                      {
                        borderColor: accent.deep,
                        borderTopColor:    selectedProgress.caloriePercent >= 25 ? accent.deep : `${accent.deep}20`,
                        borderRightColor:  selectedProgress.caloriePercent >= 50 ? accent.deep : `${accent.deep}20`,
                        borderBottomColor: selectedProgress.caloriePercent >= 75 ? accent.deep : `${accent.deep}20`,
                        borderLeftColor:   selectedProgress.caloriePercent >  0  ? accent.deep : `${accent.deep}20`,
                      },
                    ]}
                  />
                  <Text style={[styles.summaryRingPct, { color: t.text }]}>{selectedProgress.caloriePercent}%</Text>
                </View>
              </View>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: t.cardBorder }]} />

            <MacroBar label="Protein" current={selectedProgress.totals.proteinGrams} target={targets.proteinGrams} color="#E89672" unit="g" />
            <MacroBar label="Carbs"   current={selectedProgress.totals.carbsGrams}   target={targets.carbsGrams}   color="#BADDCB" unit="g" />
            <MacroBar label="Fat"     current={selectedProgress.totals.fatGrams}     target={targets.fatGrams}     color="#e3a7a1" unit="g" />
            <MacroBar label="Fiber"   current={selectedProgress.totals.fiberGrams}   target={targets.fiberGrams ?? 25} color="#8faa8b" unit="g" />
          </View>
        </View>

        {/* Hydration (slim) */}
        <View style={styles.section}>
          <WaterTracker />
        </View>

        {/* Meal sections */}
        {MAIN_MEAL_TYPES.map((mealType) => {
          const items = mealsByType[mealType];
          const subtotal = items.reduce((sum, m) => sum + mealCalories(m), 0);
          return (
            <View key={mealType} style={styles.section}>
              <View style={[styles.mealSectionCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
                {/* Meal header */}
                <View style={styles.mealSectionHeader}>
                  <View style={[styles.mealSectionIcon, { backgroundColor: `${accent.deep}18` }]}>
                    <Ionicons name={MEAL_ICONS[mealType] as any} size={18} color={accent.deep} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mealSectionTitle, { color: t.text }]}>{MEAL_LABELS[mealType]}</Text>
                    {items.length > 0 && (
                      <Text style={[styles.mealSectionSub, { color: t.textSecondary }]}>
                        {subtotal} cal · {items.length} item{items.length !== 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.mealAddBtn, { backgroundColor: accent.deep }]}
                    onPress={() => setAddSheetMeal(mealType)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.mealAddBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                {/* Items or empty state */}
                {items.length === 0 ? (
                  <View style={[styles.mealSectionEmpty, { borderColor: t.cardBorder }]}>
                    <Text style={[styles.mealSectionEmptyText, { color: t.textSecondary }]}>
                      Nothing logged yet
                    </Text>
                  </View>
                ) : (
                  <View style={styles.mealItemList}>
                    {items.map((meal, i) => (
                      <TouchableOpacity
                        key={meal.id}
                        style={[
                          styles.mealItemRow,
                          i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.cardBorder },
                        ]}
                        onPress={() => setEditingMeal(meal)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.mealItemName, { color: t.text }]} numberOfLines={1}>
                            {mealDescription(meal)}
                          </Text>
                          {meal.notes ? (
                            <Text style={[styles.mealItemNotes, { color: t.textSecondary }]} numberOfLines={1}>
                              {meal.notes}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.mealItemCal, { color: t.text }]}>{mealCalories(meal)}</Text>
                        <Text style={[styles.mealItemCalUnit, { color: t.textSecondary }]}>cal</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Food Sheet */}
      <AddFoodSheet
        visible={addSheetMeal !== null}
        mealType={addSheetMeal}
        onClose={() => setAddSheetMeal(null)}
        onPickOption={handleAddOption}
      />

      {/* Quick Log Modal */}
      <QuickLogModal
        visible={showLog}
        onClose={() => setShowLog(false)}
        onSave={handleQuickLog}
      />

      {/* Edit Meal Modal */}
      <EditMealModal
        meal={editingMeal}
        visible={editingMeal !== null}
        onClose={() => setEditingMeal(null)}
        onSave={(id, updates) => updateMeal(id, updates)}
        onDelete={(id) => removeMeal(id)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },

  scroll: { paddingBottom: 40 },

  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 4,
  },

  // ── Week strip ─────────────────────────────────────────────────────────
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  weekLabel: {
    fontSize: 16,
    fontFamily: 'DMSans-SemiBold',
  },
  weekStrip: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 6,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 2,
  },
  weekDayLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
  },
  weekDayNumber: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
  },

  // ── Summary card ───────────────────────────────────────────────────────
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 42,
    fontFamily: 'Playfair-Black',
    letterSpacing: -1,
    lineHeight: 46,
  },
  summaryTarget: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  summaryRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRingFill: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 8,
    transform: [{ rotate: '-90deg' }],
  },
  summaryRingPct: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  summaryDivider: {
    height: 1,
    marginBottom: 12,
  },

  // ── Meal sections ──────────────────────────────────────────────────────
  mealSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  mealSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mealSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealSectionTitle: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  mealSectionSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  mealAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  mealAddBtnText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },
  mealSectionEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  mealSectionEmptyText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
  },
  mealItemList: {
    // rows get their own borders
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  mealItemName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  mealItemNotes: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  mealItemCal: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  mealItemCalUnit: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },

  // ── Add Food Sheet ─────────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowLabel: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  sheetRowSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },

  // Hero image
  heroImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 16,
    opacity: 0.8,
  },

  // Calorie card
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calLabel: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },
  calValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.darkText,
    marginTop: 4,
  },
  calTarget: {
    fontSize: FontSizes.lg,
    fontWeight: '500',
    color: Colors.darkTextSecondary,
  },
  calCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.pepTeal,
  },
  calPct: {
    fontSize: FontSizes.md,
    fontWeight: '800',
    color: Colors.pepTeal,
  },

  // Macro bar
  macroBar: { marginBottom: 12 },
  macroBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  macroBarLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
  },
  macroBarValue: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
  },
  macroBarTarget: {
    fontWeight: '400',
    color: Colors.darkTextSecondary,
  },
  macroBarTrack: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Hydration (glass grid)
  hydHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  hydHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hydIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hydTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  hydAmount: {
    fontSize: FontSizes.md,
    fontWeight: '800',
  },
  hydTarget: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  // Big glass visual
  glassWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    position: 'relative',
  },
  glassOverflowBadge: {
    position: 'absolute',
    top: -4,
    right: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  glassOverflowText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  glassBody: {
    width: 110,
    height: 150,
    borderWidth: 3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  glassFill: {
    width: '100%',
  },
  glassTick: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  glassLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassPct: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  // Controls
  hydControls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  hydCtrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  hydCtrlBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  hydCtrlText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  hydCtrlTextPrimary: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  hydHint: {
    fontSize: FontSizes.xs,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  hydCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  hydCustomBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hydCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hydCustomChip: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  hydCustomChipText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  hydCustomClose: {
    padding: 6,
  },

  // Meals section header actions
  mealHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addFoodBtn: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  addFoodBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  addFoodBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: '#fff',
  },

  // Meal card
  mealCard: {
    marginBottom: 0,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealInfo: { flex: 1 },
  mealTypeLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
  },
  mealDesc: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 1,
  },
  mealNotes: {
    fontSize: FontSizes.xs,
    color: Colors.pepTeal,
    marginTop: 2,
    fontStyle: 'italic',
  },
  mealCal: { alignItems: 'center' },
  mealCalNum: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    color: Colors.pepTeal,
  },
  mealCalLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.glassWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // Empty meals
  emptyMeals: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
  },

  // AI row
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiInfo: { flex: 1 },
  aiTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  aiDesc: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // Shared modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
    gap: 12,
  },
  editModalContent: {
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.10)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glassWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypeRow: { marginBottom: 8 },
  mealTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.glassBlue,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  mealTypeChipActive: {
    backgroundColor: Colors.pepTeal,
    borderColor: Colors.pepTeal,
  },
  mealTypeText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  mealTypeTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: -4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    height: 44,
    fontSize: FontSizes.md,
    color: Colors.darkText,
  },
  notesInput: {
    height: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  macroInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  macroInput: { flex: 1 },
  macroInputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
    marginBottom: 4,
    textAlign: 'center',
  },
  macroInputField: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    height: 40,
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
    textAlign: 'center',
  },

  // Edit meal badge
  editMealTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    marginBottom: 14,
  },
  editMealTypeLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.pepTeal,
  },

  // Portion multipliers
  multRow: { marginBottom: 12 },
  multChip: {
    backgroundColor: Colors.glassWhite,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  multChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
  },

  // Delete button
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error + '44',
    backgroundColor: Colors.error + '11',
  },
  deleteBtnText: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.error,
  },
});
