import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHealthProfileStore } from '../src/store/useHealthProfileStore';
import {
  GoalType,
  ActivityLevel,
  DietType,
  SleepPattern,
  ConnectedDevice,
  BiologicalSex,
} from '../src/types';
import { Colors, FontSizes, Spacing, BorderRadius } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEP_TITLES = [
  'Your Body',
  'Health History',
  'Your Goals',
  'Nutrition',
  'Sleep',
  'Lifestyle & Devices',
  'Peptide Experience',
];

const GOALS: Array<{ id: GoalType; label: string; icon: string }> = [
  { id: 'weight_loss', label: 'Weight Loss', icon: 'trending-down' },
  { id: 'muscle_gain', label: 'Muscle Gain', icon: 'barbell' },
  { id: 'body_recomp', label: 'Body Recomp', icon: 'body' },
  { id: 'recovery', label: 'Recovery', icon: 'bandage' },
  { id: 'longevity', label: 'Longevity', icon: 'hourglass' },
  { id: 'cognitive', label: 'Cognitive', icon: 'bulb' },
  { id: 'sleep', label: 'Better Sleep', icon: 'moon' },
  { id: 'energy', label: 'More Energy', icon: 'flash' },
  { id: 'immune', label: 'Immune Support', icon: 'shield-checkmark' },
  { id: 'gut_health', label: 'Gut Health', icon: 'leaf' },
  { id: 'skin_hair', label: 'Skin & Hair', icon: 'sparkles' },
  { id: 'hormonal', label: 'Hormonal Balance', icon: 'pulse' },
  { id: 'general_wellness', label: 'General Wellness', icon: 'heart' },
];

const DIET_OPTIONS: Array<{ id: DietType; label: string }> = [
  { id: 'no_restriction', label: 'No Restrictions' },
  { id: 'keto', label: 'Keto' },
  { id: 'paleo', label: 'Paleo' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'carnivore', label: 'Carnivore' },
  { id: 'intermittent_fasting', label: 'Intermittent Fasting' },
  { id: 'other', label: 'Other' },
];

const ACTIVITY_OPTIONS: Array<{ id: ActivityLevel; label: string; desc: string }> = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Desk job, little exercise' },
  { id: 'light', label: 'Light', desc: '1-2 days/week' },
  { id: 'moderate', label: 'Moderate', desc: '3-4 days/week' },
  { id: 'active', label: 'Active', desc: '5-6 days/week' },
  { id: 'very_active', label: 'Very Active', desc: 'Daily + physically demanding' },
];

const SLEEP_PATTERNS: Array<{ id: SleepPattern; label: string }> = [
  { id: 'early_bird', label: 'Early Bird (asleep by 10pm)' },
  { id: 'night_owl', label: 'Night Owl (past midnight)' },
  { id: 'irregular', label: 'Irregular Schedule' },
  { id: 'shift_work', label: 'Shift Worker' },
];

const DEVICES: Array<{ id: ConnectedDevice; label: string }> = [
  { id: 'apple_watch', label: 'Apple Watch' },
  { id: 'apple_health', label: 'Apple Health' },
  { id: 'google_fit', label: 'Google Fit' },
  { id: 'fitbit', label: 'Fitbit' },
  { id: 'whoop', label: 'WHOOP' },
  { id: 'oura', label: 'Oura Ring' },
  { id: 'garmin', label: 'Garmin' },
  { id: 'samsung_health', label: 'Samsung Health' },
];

const COMMON_CONDITIONS = [
  'Diabetes (Type 1)', 'Diabetes (Type 2)', 'Hypertension',
  'Thyroid disorder', 'Heart disease', 'Asthma',
  'Autoimmune condition', 'Depression/Anxiety', 'PCOS',
  'Chronic pain', 'IBS/IBD', 'Cancer (history)',
];

const COMMON_ALLERGIES = [
  'Penicillin', 'Sulfa drugs', 'NSAIDs', 'Latex',
  'Shellfish', 'Tree nuts', 'Peanuts', 'Dairy',
  'Gluten', 'Soy', 'Eggs', 'Sesame',
];

const COMMON_SUPPLEMENTS = [
  'Vitamin D', 'Magnesium', 'Omega-3 / Fish Oil', 'Creatine',
  'Zinc', 'B-Complex', 'Vitamin C', 'Probiotics',
  'Collagen', 'Ashwagandha', 'CoQ10', 'Melatonin',
];

const EXERCISE_TYPES = [
  'Weight Training', 'Cardio / Running', 'HIIT', 'Yoga / Pilates',
  'Swimming', 'Cycling', 'Walking', 'Martial Arts',
  'Team Sports', 'CrossFit', 'Calisthenics', 'Stretching / Mobility',
];

const SLEEP_ISSUES = [
  'Trouble falling asleep', 'Waking up at night', 'Waking too early',
  'Sleep apnea', 'Snoring', 'Restless legs',
  'Vivid dreams/nightmares', 'Not feeling rested',
];

const STRESS_SOURCES = [
  'Work / Career', 'Finances', 'Relationships', 'Health concerns',
  'Family', 'Social pressure', 'Lack of purpose', 'Information overload',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const store = useHealthProfileStore();
  const { profile, currentStep } = store;
  const [step, setStep] = useState(currentStep);

  // Local form state for text inputs
  const [weightInput, setWeightInput] = useState(
    profile.bodyMetrics.weightLbs?.toString() || ''
  );
  const [heightFeet, setHeightFeet] = useState(
    profile.bodyMetrics.heightInches
      ? Math.floor(profile.bodyMetrics.heightInches / 12).toString()
      : ''
  );
  const [heightIn, setHeightIn] = useState(
    profile.bodyMetrics.heightInches
      ? (profile.bodyMetrics.heightInches % 12).toString()
      : ''
  );
  const [bodyFatInput, setBodyFatInput] = useState(
    profile.bodyMetrics.bodyFatPercent?.toString() || ''
  );
  const [goalWeightInput, setGoalWeightInput] = useState(
    profile.bodyMetrics.goalWeightLbs?.toString() || ''
  );
  const [conditionInput, setConditionInput] = useState('');
  const [medicationInput, setMedicationInput] = useState('');
  const [allergyInput, setAllergyInput] = useState('');
  const [supplementInput, setSupplementInput] = useState('');
  const [sleepHoursInput, setSleepHoursInput] = useState(
    profile.sleep.averageHours?.toString() || ''
  );
  const [proteinInput, setProteinInput] = useState(
    profile.nutrition.dailyProteinGrams?.toString() || ''
  );

  const totalSteps = STEP_TITLES.length;

  const nextStep = () => {
    saveCurrentStep();
    if (step < totalSteps - 1) {
      const next = step + 1;
      setStep(next);
      store.setStep(next);
    } else {
      store.completeSetup();
      router.back();
    }
  };

  const prevStep = () => {
    if (step > 0) {
      saveCurrentStep();
      setStep(step - 1);
      store.setStep(step - 1);
    } else {
      router.back();
    }
  };

  const saveCurrentStep = () => {
    switch (step) {
      case 0: { // Body
        const w = parseFloat(weightInput);
        const ft = parseInt(heightFeet) || 0;
        const inches = parseInt(heightIn) || 0;
        const totalInches = ft * 12 + inches;
        const bf = parseFloat(bodyFatInput);
        const gw = parseFloat(goalWeightInput);
        store.setBodyMetrics({
          weightLbs: isNaN(w) ? undefined : w,
          heightInches: totalInches || undefined,
          bodyFatPercent: isNaN(bf) ? undefined : bf,
          goalWeightLbs: isNaN(gw) ? undefined : gw,
        });
        break;
      }
      case 4: { // Sleep
        const hrs = parseFloat(sleepHoursInput);
        store.setSleep({ averageHours: isNaN(hrs) ? undefined : hrs });
        break;
      }
      case 3: { // Nutrition
        const protein = parseInt(proteinInput);
        store.setNutrition({
          dailyProteinGrams: isNaN(protein) ? undefined : protein,
        });
        break;
      }
    }
  };

  const toggleInList = (
    list: string[],
    item: string,
    addFn: (v: string) => void,
    removeFn: (v: string) => void
  ) => {
    if (list.includes(item)) removeFn(item);
    else addFn(item);
  };

  const toggleGoal = (goal: GoalType) => {
    const current = profile.primaryGoals;
    const next = current.includes(goal)
      ? current.filter((g) => g !== goal)
      : [...current, goal];
    store.setGoals(next);
  };

  const toggleDevice = (device: ConnectedDevice) => {
    const current = profile.devices.connectedDevices;
    const next = current.includes(device)
      ? current.filter((d) => d !== device)
      : [...current, device];
    store.setDevices({ connectedDevices: next });
  };

  // ---------------------------------------------------------------------------
  // Render steps
  // ---------------------------------------------------------------------------

  const renderStep = () => {
    switch (step) {
      case 0: return renderBodyStep();
      case 1: return renderMedicalStep();
      case 2: return renderGoalsStep();
      case 3: return renderNutritionStep();
      case 4: return renderSleepStep();
      case 5: return renderLifestyleStep();
      case 6: return renderPeptideStep();
      default: return null;
    }
  };

  const renderBodyStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        This helps us personalize protocols and understand your baseline.
      </Text>

      {/* Biological sex */}
      <Text style={styles.fieldLabel}>Biological Sex</Text>
      <View style={styles.chipRow}>
        {(['male', 'female', 'other'] as BiologicalSex[]).map((sex) => (
          <TouchableOpacity
            key={sex}
            style={[styles.chip, profile.biologicalSex === sex && styles.chipActive]}
            onPress={() => store.setBasicInfo(sex)}
          >
            <Text style={[styles.chipText, profile.biologicalSex === sex && styles.chipTextActive]}>
              {sex.charAt(0).toUpperCase() + sex.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Weight */}
      <Text style={styles.fieldLabel}>Weight (lbs)</Text>
      <TextInput
        style={styles.input}
        value={weightInput}
        onChangeText={setWeightInput}
        placeholder="e.g. 185"
        placeholderTextColor={Colors.darkTextSecondary}
        keyboardType="decimal-pad"
      />

      {/* Height */}
      <Text style={styles.fieldLabel}>Height</Text>
      <View style={styles.heightRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={heightFeet}
          onChangeText={setHeightFeet}
          placeholder="ft"
          placeholderTextColor={Colors.darkTextSecondary}
          keyboardType="number-pad"
        />
        <Text style={styles.heightSep}>ft</Text>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={heightIn}
          onChangeText={setHeightIn}
          placeholder="in"
          placeholderTextColor={Colors.darkTextSecondary}
          keyboardType="number-pad"
        />
        <Text style={styles.heightSep}>in</Text>
      </View>

      {/* Body fat */}
      <Text style={styles.fieldLabel}>Body Fat % (optional)</Text>
      <TextInput
        style={styles.input}
        value={bodyFatInput}
        onChangeText={setBodyFatInput}
        placeholder="e.g. 22"
        placeholderTextColor={Colors.darkTextSecondary}
        keyboardType="decimal-pad"
      />

      {/* Goal weight */}
      <Text style={styles.fieldLabel}>Goal Weight (optional)</Text>
      <TextInput
        style={styles.input}
        value={goalWeightInput}
        onChangeText={setGoalWeightInput}
        placeholder="e.g. 170"
        placeholderTextColor={Colors.darkTextSecondary}
        keyboardType="decimal-pad"
      />
    </View>
  );

  const renderMedicalStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        This ensures our bot and protocols never suggest anything that conflicts
        with your health. All data is encrypted on your device.
      </Text>

      {/* Conditions */}
      <Text style={styles.fieldLabel}>Health Conditions</Text>
      <View style={styles.chipRow}>
        {COMMON_CONDITIONS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chipSm, profile.medical.conditions.includes(c) && styles.chipActive]}
            onPress={() => toggleInList(profile.medical.conditions, c, store.addCondition, store.removeCondition)}
          >
            <Text style={[styles.chipSmText, profile.medical.conditions.includes(c) && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={conditionInput}
          onChangeText={setConditionInput}
          placeholder="Add other condition..."
          placeholderTextColor={Colors.darkTextSecondary}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { if (conditionInput.trim()) { store.addCondition(conditionInput.trim()); setConditionInput(''); } }}
        >
          <Ionicons name="add" size={20} color={Colors.darkBg} />
        </TouchableOpacity>
      </View>

      {/* Medications */}
      <Text style={styles.fieldLabel}>Current Medications</Text>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={medicationInput}
          onChangeText={setMedicationInput}
          placeholder="Add medication..."
          placeholderTextColor={Colors.darkTextSecondary}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { if (medicationInput.trim()) { store.addMedication(medicationInput.trim()); setMedicationInput(''); } }}
        >
          <Ionicons name="add" size={20} color={Colors.darkBg} />
        </TouchableOpacity>
      </View>
      {profile.medical.medications.length > 0 && (
        <View style={styles.chipRow}>
          {profile.medical.medications.map((m) => (
            <TouchableOpacity key={m} style={styles.chipActive} onPress={() => store.removeMedication(m)}>
              <Text style={styles.chipTextActive}>{m} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Allergies */}
      <Text style={styles.fieldLabel}>Allergies (drugs, food, environmental)</Text>
      <View style={styles.chipRow}>
        {COMMON_ALLERGIES.map((a) => (
          <TouchableOpacity
            key={a}
            style={[styles.chipSm, profile.medical.allergies.includes(a) && styles.chipActive]}
            onPress={() => toggleInList(profile.medical.allergies, a, store.addAllergy, store.removeAllergy)}
          >
            <Text style={[styles.chipSmText, profile.medical.allergies.includes(a) && styles.chipTextActive]}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={allergyInput}
          onChangeText={setAllergyInput}
          placeholder="Add other allergy..."
          placeholderTextColor={Colors.darkTextSecondary}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { if (allergyInput.trim()) { store.addAllergy(allergyInput.trim()); setAllergyInput(''); } }}
        >
          <Ionicons name="add" size={20} color={Colors.darkBg} />
        </TouchableOpacity>
      </View>

      {/* Pregnant */}
      <Text style={styles.fieldLabel}>Pregnant or nursing?</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, profile.medical.pregnantOrNursing === true && styles.chipDanger]}
          onPress={() => store.setMedicalHistory({ pregnantOrNursing: true })}
        >
          <Text style={[styles.chipText, profile.medical.pregnantOrNursing === true && styles.chipTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, profile.medical.pregnantOrNursing === false && styles.chipActive]}
          onPress={() => store.setMedicalHistory({ pregnantOrNursing: false })}
        >
          <Text style={[styles.chipText, profile.medical.pregnantOrNursing === false && styles.chipTextActive]}>No</Text>
        </TouchableOpacity>
      </View>

      {/* Provider supervision */}
      <Text style={styles.fieldLabel}>Working with a healthcare provider?</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, profile.medical.hasProviderSupervision && styles.chipActive]}
          onPress={() => store.setMedicalHistory({ hasProviderSupervision: true })}
        >
          <Text style={[styles.chipText, profile.medical.hasProviderSupervision && styles.chipTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !profile.medical.hasProviderSupervision && styles.chipActive]}
          onPress={() => store.setMedicalHistory({ hasProviderSupervision: false })}
        >
          <Text style={[styles.chipText, !profile.medical.hasProviderSupervision && styles.chipTextActive]}>No</Text>
        </TouchableOpacity>
      </View>
      {!profile.medical.hasProviderSupervision && (
        <View style={styles.warningBox}>
          <Ionicons name="medkit" size={16} color={Colors.warning} />
          <Text style={styles.warningText}>
            We strongly recommend working with a qualified healthcare provider,
            especially when using peptides. PepTalk is building telemedicine
            connections to help.
          </Text>
        </View>
      )}
    </View>
  );

  const renderGoalsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        Select your primary health and wellness goals. This helps us suggest
        relevant peptides, protocols, and lifestyle recommendations.
      </Text>

      <Text style={styles.fieldLabel}>Your Goals (select all that apply)</Text>
      <View style={styles.goalGrid}>
        {GOALS.map((goal) => {
          const active = profile.primaryGoals.includes(goal.id);
          return (
            <TouchableOpacity
              key={goal.id}
              style={[styles.goalCard, active && styles.goalCardActive]}
              onPress={() => toggleGoal(goal.id)}
            >
              <Ionicons
                name={goal.icon as any}
                size={24}
                color={active ? Colors.darkBg : Colors.darkTextSecondary}
              />
              <Text style={[styles.goalLabel, active && styles.goalLabelActive]}>
                {goal.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderNutritionStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        Nutrition is a critical pillar for peptide effectiveness. This helps our
        protocol engine suggest complementary dietary guidance.
      </Text>

      <Text style={styles.fieldLabel}>Diet Type</Text>
      <View style={styles.chipRow}>
        {DIET_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.chipSm, profile.nutrition.dietType === d.id && styles.chipActive]}
            onPress={() => store.setNutrition({ dietType: d.id })}
          >
            <Text style={[styles.chipSmText, profile.nutrition.dietType === d.id && styles.chipTextActive]}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Daily Protein Target (grams, optional)</Text>
      <TextInput
        style={styles.input}
        value={proteinInput}
        onChangeText={setProteinInput}
        placeholder="e.g. 150"
        placeholderTextColor={Colors.darkTextSecondary}
        keyboardType="number-pad"
      />

      <Text style={styles.fieldLabel}>Current Supplements</Text>
      <View style={styles.chipRow}>
        {COMMON_SUPPLEMENTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chipSm, profile.nutrition.supplementsUsed.includes(s) && styles.chipActive]}
            onPress={() => {
              const list = profile.nutrition.supplementsUsed;
              store.setNutrition({
                supplementsUsed: list.includes(s) ? list.filter((x) => x !== s) : [...list, s],
              });
            }}
          >
            <Text style={[styles.chipSmText, profile.nutrition.supplementsUsed.includes(s) && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={supplementInput}
          onChangeText={setSupplementInput}
          placeholder="Add other supplement..."
          placeholderTextColor={Colors.darkTextSecondary}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (supplementInput.trim()) {
              store.setNutrition({
                supplementsUsed: [...profile.nutrition.supplementsUsed, supplementInput.trim()],
              });
              setSupplementInput('');
            }
          }}
        >
          <Ionicons name="add" size={20} color={Colors.darkBg} />
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>Food Allergies / Intolerances</Text>
      <View style={styles.chipRow}>
        {['Gluten', 'Dairy', 'Soy', 'Eggs', 'Shellfish', 'Tree Nuts', 'Peanuts'].map((a) => (
          <TouchableOpacity
            key={a}
            style={[styles.chipSm, profile.nutrition.foodAllergies.includes(a) && styles.chipDanger]}
            onPress={() => {
              if (profile.nutrition.foodAllergies.includes(a)) store.removeFoodAllergy(a);
              else store.addFoodAllergy(a);
            }}
          >
            <Text style={[styles.chipSmText, profile.nutrition.foodAllergies.includes(a) && styles.chipTextActive]}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderSleepStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        Sleep quality directly impacts peptide effectiveness and recovery.
        Many peptides (DSIP, Epithalon, GH secretagogues) are timed around sleep.
      </Text>

      <Text style={styles.fieldLabel}>Average Hours of Sleep</Text>
      <TextInput
        style={styles.input}
        value={sleepHoursInput}
        onChangeText={setSleepHoursInput}
        placeholder="e.g. 7"
        placeholderTextColor={Colors.darkTextSecondary}
        keyboardType="decimal-pad"
      />

      <Text style={styles.fieldLabel}>Sleep Pattern</Text>
      <View style={styles.chipRow}>
        {SLEEP_PATTERNS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, profile.sleep.sleepPattern === p.id && styles.chipActive]}
            onPress={() => store.setSleep({ sleepPattern: p.id })}
          >
            <Text style={[styles.chipText, profile.sleep.sleepPattern === p.id && styles.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Sleep Issues (if any)</Text>
      <View style={styles.chipRow}>
        {SLEEP_ISSUES.map((issue) => (
          <TouchableOpacity
            key={issue}
            style={[styles.chipSm, profile.sleep.sleepIssues.includes(issue) && styles.chipActive]}
            onPress={() => {
              const list = profile.sleep.sleepIssues;
              store.setSleep({
                sleepIssues: list.includes(issue) ? list.filter((x) => x !== issue) : [...list, issue],
              });
            }}
          >
            <Text style={[styles.chipSmText, profile.sleep.sleepIssues.includes(issue) && styles.chipTextActive]}>{issue}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Using sleep aids?</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, profile.sleep.usesSleepAids && styles.chipActive]}
          onPress={() => store.setSleep({ usesSleepAids: true })}
        >
          <Text style={[styles.chipText, profile.sleep.usesSleepAids && styles.chipTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !profile.sleep.usesSleepAids && styles.chipActive]}
          onPress={() => store.setSleep({ usesSleepAids: false })}
        >
          <Text style={[styles.chipText, !profile.sleep.usesSleepAids && styles.chipTextActive]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLifestyleStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        Exercise, stress, and connected devices help us optimize your protocol
        timing and lifestyle recommendations.
      </Text>

      <Text style={styles.fieldLabel}>Activity Level</Text>
      {ACTIVITY_OPTIONS.map((a) => (
        <TouchableOpacity
          key={a.id}
          style={[styles.radioCard, profile.lifestyle.activityLevel === a.id && styles.radioCardActive]}
          onPress={() => store.setLifestyle({ activityLevel: a.id })}
        >
          <Text style={[styles.radioLabel, profile.lifestyle.activityLevel === a.id && styles.radioLabelActive]}>{a.label}</Text>
          <Text style={styles.radioDesc}>{a.desc}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.fieldLabel}>Exercise Types</Text>
      <View style={styles.chipRow}>
        {EXERCISE_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chipSm, profile.lifestyle.exerciseTypes.includes(t) && styles.chipActive]}
            onPress={() => {
              const list = profile.lifestyle.exerciseTypes;
              store.setLifestyle({
                exerciseTypes: list.includes(t) ? list.filter((x) => x !== t) : [...list, t],
              });
            }}
          >
            <Text style={[styles.chipSmText, profile.lifestyle.exerciseTypes.includes(t) && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Stress Sources</Text>
      <View style={styles.chipRow}>
        {STRESS_SOURCES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chipSm, profile.lifestyle.stressSources.includes(s) && styles.chipActive]}
            onPress={() => {
              const list = profile.lifestyle.stressSources;
              store.setLifestyle({
                stressSources: list.includes(s) ? list.filter((x) => x !== s) : [...list, s],
              });
            }}
          >
            <Text style={[styles.chipSmText, profile.lifestyle.stressSources.includes(s) && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Connected Health Devices</Text>
      <View style={styles.chipRow}>
        {DEVICES.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.chip, profile.devices.connectedDevices.includes(d.id) && styles.chipActive]}
            onPress={() => toggleDevice(d.id)}
          >
            <Text style={[styles.chipText, profile.devices.connectedDevices.includes(d.id) && styles.chipTextActive]}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPeptideStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDesc}>
        Your experience level helps us calibrate how we communicate — from
        foundational education to advanced protocol optimization.
      </Text>

      <Text style={styles.fieldLabel}>Peptide Experience</Text>
      {([
        { id: 'none', label: 'Brand New', desc: "I've never used peptides" },
        { id: 'beginner', label: 'Beginner', desc: "I've tried 1-2 peptides" },
        { id: 'intermediate', label: 'Intermediate', desc: "I've run several protocols" },
        { id: 'experienced', label: 'Experienced', desc: 'I know my way around peptides well' },
      ] as const).map((exp) => (
        <TouchableOpacity
          key={exp.id}
          style={[styles.radioCard, profile.peptideExperience === exp.id && styles.radioCardActive]}
          onPress={() => store.setPeptideExperience(exp.id)}
        >
          <Text style={[styles.radioLabel, profile.peptideExperience === exp.id && styles.radioLabelActive]}>{exp.label}</Text>
          <Text style={styles.radioDesc}>{exp.desc}</Text>
        </TouchableOpacity>
      ))}

      {/* AI Data Consent */}
      <View style={styles.consentBox}>
        <View style={styles.consentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.consentTitle}>AI-Powered Responses</Text>
            <Text style={styles.consentDesc}>
              Allow PepTalk to use your health profile for personalized AI
              responses. Your data is sent securely and never stored by the AI
              provider. Without this, you'll get local-only responses.
            </Text>
          </View>
          <Switch
            value={profile.aiDataConsent}
            onValueChange={(val) => store.setAiConsent(val)}
            trackColor={{ false: '#333', true: 'rgba(227, 167, 161, 0.5)' }}
            thumbColor={profile.aiDataConsent ? Colors.rose : '#888'}
          />
        </View>
      </View>

      {/* Completeness summary */}
      <View style={[styles.completenessBox, { backgroundColor: t.card, borderColor: t.glassBorder }]}>
        <Text style={[styles.completenessTitle, { color: t.text }]}>
          Profile Completeness: {profile.profileCompleteness}%
        </Text>
        <View style={[styles.progressBar, { backgroundColor: t.glass }]}>
          <View style={[styles.progressFill, { width: `${profile.profileCompleteness}%` }]} />
        </View>
        <Text style={[styles.completenessNote, { color: t.textSecondary }]}>
          The more you share, the better PepTalk can serve you. You can always
          update this from your Profile tab.
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: t.glassBorder }]}>
          <TouchableOpacity onPress={prevStep} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={t.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: t.text }]}>{STEP_TITLES[step]}</Text>
            <Text style={[styles.headerSub, { color: t.textSecondary }]}>Step {step + 1} of {totalSteps}</Text>
          </View>
          <TouchableOpacity onPress={() => { saveCurrentStep(); router.back(); }}>
            <Text style={styles.skipText}>Save & Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          {STEP_TITLES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i <= step && styles.progressDotActive,
                i === step && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>

        {/* Step content */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextBtn} onPress={nextStep}>
            <Text style={styles.nextBtnText}>
              {step === totalSteps - 1 ? 'Complete Profile' : 'Continue'}
            </Text>
            <Ionicons
              name={step === totalSteps - 1 ? 'checkmark' : 'arrow-forward'}
              size={20}
              color={Colors.darkBg}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.darkCardBorder,
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  headerSub: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 1 },
  skipText: { fontSize: FontSizes.sm, color: Colors.rose, fontWeight: '600' },

  progressRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  progressDot: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.darkCard,
  },
  progressDotActive: { backgroundColor: 'rgba(227, 167, 161, 0.4)' },
  progressDotCurrent: { backgroundColor: Colors.rose },

  scrollArea: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: 40 },

  stepContent: { gap: Spacing.sm },
  stepDesc: {
    fontSize: FontSizes.sm, color: Colors.darkTextSecondary, lineHeight: 20,
    marginBottom: Spacing.sm,
  },

  fieldLabel: {
    fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkText,
    marginTop: Spacing.md, marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, color: Colors.darkText, fontSize: FontSizes.md,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  heightRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  heightSep: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs + 2 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: BorderRadius.full, backgroundColor: Colors.darkCard,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  chipActive: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  chipDanger: { backgroundColor: Colors.error, borderColor: Colors.error },
  chipText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontWeight: '500' },
  chipTextActive: { color: Colors.darkBg, fontWeight: '600' },

  chipSm: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: BorderRadius.full, backgroundColor: Colors.darkCard,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  chipSmText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },

  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  addBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.rose, alignItems: 'center', justifyContent: 'center',
  },

  goalGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  goalCard: {
    width: '47%', alignItems: 'center', paddingVertical: 16,
    borderRadius: BorderRadius.md, backgroundColor: Colors.darkCard,
    borderWidth: 1, borderColor: Colors.darkCardBorder, gap: 6,
  },
  goalCardActive: { backgroundColor: Colors.rose, borderColor: Colors.rose },
  goalLabel: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontWeight: '600' },
  goalLabelActive: { color: Colors.darkBg },

  radioCard: {
    padding: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: Colors.darkCard, borderWidth: 1,
    borderColor: Colors.darkCardBorder, marginBottom: Spacing.xs,
  },
  radioCardActive: { borderColor: Colors.rose, backgroundColor: 'rgba(227, 167, 161, 0.1)' },
  radioLabel: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  radioLabelActive: { color: Colors.rose },
  radioDesc: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 2 },

  warningBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)',
    marginTop: Spacing.sm,
  },
  warningText: { flex: 1, fontSize: FontSizes.xs, color: Colors.warning, lineHeight: 18 },

  consentBox: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(227, 167, 161, 0.3)',
  },
  consentRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  consentTitle: {
    fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText, marginBottom: 4,
  },
  consentDesc: {
    fontSize: FontSizes.xs, color: Colors.darkTextSecondary, lineHeight: 18,
  },
  completenessBox: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.darkCardBorder,
  },
  completenessTitle: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  progressBar: {
    height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: Spacing.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.rose },
  completenessNote: {
    fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: Spacing.sm, lineHeight: 18,
  },

  footer: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.rose,
    borderRadius: BorderRadius.md, paddingVertical: 16,
  },
  nextBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkBg },
});
