/**
 * Workouts — hub for active program, custom workout generation, Jamie's programs, and videos.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing } from '../../src/constants/theme';
import { WORKOUT_PROGRAMS } from '../../src/data/workoutPrograms';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import type { WorkoutProgram } from '../../src/types/fitness';
import { PaywallGate, useFeatureGate } from '../../src/hooks/useFeatureGate';
import { LockedFeatureCard } from '../../src/components/LockedFeatureCard';
import { LockBadge } from '../../src/components/LockBadge';
import { CoachMark } from '../../src/components/tutorial/CoachMark';
import { WorkoutReadinessBanner } from '../../src/components/WorkoutReadinessBanner';
import { PaywallModal } from '../../src/components/PaywallModal';
import { MaxYourStackCard } from '../../src/components/MaxYourStackCard';
import { useTourTarget } from '../../src/hooks/useTourTarget';
import { useWorkoutTemplateStore } from '../../src/store/useWorkoutTemplateStore';
import { getExerciseById } from '../../src/data/exercises';
import {
  getTemplates,
  getTemplatesForUser,
  generateWorkout,
  GOAL_LABELS,
  type ProgramTemplate,
} from '../../src/services/workoutGenerator';
import type { ExerciseLocation, ExerciseGender } from '../../src/types/fitness';

// ---------------------------------------------------------------------------
// Custom Workout Generator Sheet
// ---------------------------------------------------------------------------

type Goal = 'transformation' | 'weight_loss' | 'circuit' | 'hypertrophy' | 'strength';
type Days = 3 | 4 | 5;
type Loc = 'any' | 'gym' | 'home';
type Lvl = 'beginner' | 'intermediate' | 'advanced';

interface GeneratorSheetProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (template: ProgramTemplate, filters: { location: Loc; level: Lvl }) => void;
  gender: 'male' | 'female';
}

function GeneratorSheet({ visible, onClose, onGenerate, gender }: GeneratorSheetProps) {
  const t = useTheme();
  const accent = useSectionAccent();
  const [goal, setGoal] = useState<Goal>(gender === 'female' ? 'transformation' : 'hypertrophy');
  const [days, setDays] = useState<Days>(4);
  const [location, setLocation] = useState<Loc>('any');
  const [level, setLevel] = useState<Lvl>('beginner');

  const availableGoals = useMemo(() => {
    const set = new Set<string>();
    getTemplates().forEach((tpl) => {
      if (tpl.gender === 'anyone' || tpl.gender === gender) set.add(tpl.goal);
    });
    return Array.from(set) as Goal[];
  }, [gender]);

  const handleGenerate = () => {
    // Find the best matching template
    const matches = getTemplatesForUser({ gender, goal, daysPerWeek: days });
    if (matches.length === 0) {
      Alert.alert(
        'No template found',
        `No ${days}-day template for ${GOAL_LABELS[goal]?.label ?? goal}. Try a different combination.`,
      );
      return;
    }
    onGenerate(matches[0], { location, level });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.sheetContent, { backgroundColor: t.bg }]}>
          <View style={s.sheetHandle} />
          <Text style={[s.sheetTitle, { color: t.text }]}>Generate Custom Program</Text>
          <Text style={[s.sheetSub, { color: t.textSecondary }]}>
            Built from Jamie's exercise pool using her P1/P2/P3 priority system
          </Text>

          <ScrollView
            style={{ maxHeight: 440 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 20 }}
          >
            {/* Goal */}
            <Text style={[s.fieldLabel, { color: t.textSecondary }]}>GOAL</Text>
            <View style={s.chipRow}>
              {availableGoals.map((g) => {
                const active = goal === g;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[
                      s.chip,
                      { backgroundColor: active ? accent.deep : t.surface, borderColor: active ? accent.deep : t.cardBorder },
                    ]}
                    onPress={() => setGoal(g)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, { color: active ? '#fff' : t.text }]}>
                      {GOAL_LABELS[g]?.label ?? g}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Days */}
            <Text style={[s.fieldLabel, { color: t.textSecondary }]}>DAYS PER WEEK</Text>
            <View style={s.chipRow}>
              {([3, 4, 5] as Days[]).map((d) => {
                const active = days === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[
                      s.chip,
                      { backgroundColor: active ? accent.deep : t.surface, borderColor: active ? accent.deep : t.cardBorder },
                    ]}
                    onPress={() => setDays(d)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, { color: active ? '#fff' : t.text }]}>{d} days</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Location */}
            <Text style={[s.fieldLabel, { color: t.textSecondary }]}>LOCATION</Text>
            <View style={s.chipRow}>
              {([
                { key: 'any', label: 'Anywhere', icon: 'globe-outline' },
                { key: 'gym', label: 'Gym', icon: 'barbell-outline' },
                { key: 'home', label: 'Home', icon: 'home-outline' },
              ] as const).map((l) => {
                const active = location === l.key;
                return (
                  <TouchableOpacity
                    key={l.key}
                    style={[
                      s.chip,
                      { backgroundColor: active ? accent.deep : t.surface, borderColor: active ? accent.deep : t.cardBorder },
                    ]}
                    onPress={() => setLocation(l.key as Loc)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={l.icon} size={14} color={active ? '#fff' : t.text} />
                    <Text style={[s.chipText, { color: active ? '#fff' : t.text, marginLeft: 4 }]}>
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Level */}
            <Text style={[s.fieldLabel, { color: t.textSecondary }]}>LEVEL</Text>
            <View style={s.chipRow}>
              {(['beginner', 'intermediate', 'advanced'] as Lvl[]).map((lv) => {
                const active = level === lv;
                return (
                  <TouchableOpacity
                    key={lv}
                    style={[
                      s.chip,
                      { backgroundColor: active ? accent.deep : t.surface, borderColor: active ? accent.deep : t.cardBorder },
                    ]}
                    onPress={() => setLevel(lv)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipText, { color: active ? '#fff' : t.text }]}>
                      {lv.charAt(0).toUpperCase() + lv.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Generate button */}
          <TouchableOpacity
            style={[s.generateBtn, { backgroundColor: accent.deep }]}
            onPress={handleGenerate}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={s.generateBtnText}>Generate Custom Program</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sheetCancel} onPress={onClose}>
            <Text style={[s.sheetCancelText, { color: t.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Program Card
// ---------------------------------------------------------------------------

function ProgramCard({ program }: { program: WorkoutProgram }) {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const { activeProgram } = useWorkoutStore();
  const isActive = activeProgram?.programId === program.id;

  const handlePress = () => {
    if (isActive) {
      router.push(`/workouts/player?programId=${program.id}`);
    } else {
      router.push(`/workouts/program?programId=${program.id}`);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress}>
      <View style={[s.programCard, { backgroundColor: t.surface, borderColor: isActive ? accent.deep : t.cardBorder }]}>
        {program.imageUrl && (
          <View style={s.programImageWrap}>
            <Image source={{ uri: program.imageUrl }} style={s.programImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)']}
              style={s.programImageOverlay}
            />
            {program.isPremium && (
              <View style={[s.proBadge, { backgroundColor: accent.deep }]}>
                <Text style={s.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
        )}

        <View style={s.programBody}>
          <Text style={[s.programTitle, { color: t.text }]}>{program.name}</Text>
          <Text style={[s.programCreator, { color: t.textSecondary }]}>by {program.createdBy}</Text>

          <Text style={[s.programDesc, { color: t.textSecondary }]} numberOfLines={2}>
            {program.description}
          </Text>

          <View style={s.programMeta}>
            <View style={s.programMetaItem}>
              <Ionicons name="calendar-outline" size={13} color={accent.deep} />
              <Text style={[s.programMetaText, { color: t.textSecondary }]}>
                {program.durationWeeks} weeks
              </Text>
            </View>
            <View style={s.programMetaItem}>
              <Ionicons name="fitness-outline" size={13} color={accent.deep} />
              <Text style={[s.programMetaText, { color: t.textSecondary }]}>
                {program.weeks[0]?.days.length ?? 0} days/wk
              </Text>
            </View>
            <View style={s.programMetaItem}>
              <Ionicons name="trophy-outline" size={13} color={accent.deep} />
              <Text style={[s.programMetaText, { color: t.textSecondary }]}>
                {program.difficulty}
              </Text>
            </View>
          </View>

          {isActive && activeProgram && (
            <View style={[s.activeBanner, { backgroundColor: `${accent.deep}18`, borderColor: `${accent.deep}40` }]}>
              <Ionicons name="play-circle" size={16} color={accent.deep} />
              <Text style={[s.activeBannerText, { color: accent.deep }]}>
                Week {activeProgram.currentWeek}, Day {activeProgram.currentDay + 1} — Continue
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Stats Bar
// ---------------------------------------------------------------------------

function StatsBar() {
  const t = useTheme();
  const accent = useSectionAccent();
  const { logs, getStreak } = useWorkoutStore();
  const streak = getStreak();
  const thisWeek = logs.filter((l) => {
    const d = new Date(l.date);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return d >= weekAgo;
  }).length;

  return (
    <View style={s.statsRow}>
      <View style={[s.statCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <Text style={[s.statNumber, { color: t.text }]}>{logs.length}</Text>
        <Text style={[s.statLabel, { color: t.textSecondary }]}>Total</Text>
      </View>
      <View style={[s.statCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <Text style={[s.statNumber, { color: t.text }]}>{thisWeek}</Text>
        <Text style={[s.statLabel, { color: t.textSecondary }]}>This Week</Text>
      </View>
      <View style={[s.statCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <Text style={[s.statNumber, { color: accent.deep }]}>{streak}</Text>
        <Text style={[s.statLabel, { color: t.textSecondary }]}>Streak</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function WorkoutsScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const { activeProgram } = useWorkoutStore();
  const saveGeneratedWorkout = useWorkoutStore((st) => st.saveGeneratedWorkout);
  const savedGeneratedWorkouts = useWorkoutStore((st) => st.savedGeneratedWorkouts);
  const { profile } = useOnboardingStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [workoutPaywallFeature, setWorkoutPaywallFeature] = useState<string | null>(null);
  const hasCustomGenerator = useFeatureGate('custom_workout_generator');
  const programsSectionRef = useTourTarget('workouts_programs_section');
  const workoutTemplates = useWorkoutTemplateStore((s) => s.templates);

  const gender: 'male' | 'female' = profile.gender === 'Male' ? 'male' : 'female';

  const activeProgramDetails = activeProgram
    ? WORKOUT_PROGRAMS.find((p) => p.id === activeProgram.programId)
    : null;

  const handleGenerated = (
    template: ProgramTemplate,
    filters: { location: Loc; level: Lvl },
  ) => {
    // Map UI gender ('male' | 'female') to ExerciseGender ('men' | 'women' | 'anyone')
    const exerciseGender: ExerciseGender = gender === 'male' ? 'men' : 'women';
    const exerciseLocation: ExerciseLocation =
      filters.location === 'any' ? 'any' : (filters.location as ExerciseLocation);

    // Actually fill the template with real exercises from jamieExercises.json
    const generated = generateWorkout(template.id, {
      location: exerciseLocation,
      gender: exerciseGender,
    });

    if (!generated) {
      Alert.alert(
        'Generation failed',
        'Could not generate a workout from this template. Try a different combination.',
      );
      return;
    }

    // Detect empty or partially-empty days and warn the user
    const emptyDays = generated.days.filter((d) => d.exercises.length === 0);
    if (emptyDays.length === generated.days.length) {
      Alert.alert(
        'No exercises found',
        `No exercises matched your filters (${filters.location === 'any' ? 'anywhere' : filters.location}, ${exerciseGender}). Try changing location or level.`,
      );
      return;
    }
    if (generated.warnings && generated.warnings.length > 0) {
      Alert.alert(
        'Partial workout generated',
        `Some slots couldn't be filled:\n\n${generated.warnings.slice(0, 5).join('\n')}${generated.warnings.length > 5 ? `\n\n(+${generated.warnings.length - 5} more)` : ''}\n\nThis usually means your filter combination is too narrow.`,
        [{ text: 'Use Anyway' }, { text: 'Cancel', style: 'cancel', onPress: () => { return; } }],
      );
    }

    // Derive a friendly name: "{Goal} · {Days}-Day" + short timestamp so they're distinguishable
    const goalLabel = GOAL_LABELS[template.goal]?.label ?? template.goal;
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const name = `${goalLabel} · ${template.daysPerWeek}-Day (${dateStr})`;

    // Save to store
    const newId = saveGeneratedWorkout({
      name,
      goal: template.goal,
      daysPerWeek: template.daysPerWeek,
      location: filters.location,
      level: filters.level,
      workout: generated,
    });

    // Navigate to My Workouts with the new one highlighted and expanded
    router.push({
      pathname: '/workouts/my-workouts' as any,
      params: { highlight: newId },
    });
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Workouts</Text>
        <TouchableOpacity
          onPress={() => router.push('/workouts/exercises')}
          style={s.iconBtn}
        >
          <Ionicons name="search" size={22} color={t.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
      >
        <CoachMark
          id="first_workouts_visit"
          title="Train your way"
          body="Pick one of Jamie's programs, generate a custom workout, or build your own from 451 exercises."
          icon="barbell-outline"
        />

        {/* Coming-soon tease — sits at the top so it's the first thing
            users see when they land on the fitness side. The actual
            programs/library/generator below remain accessible per their
            existing tier gates. */}
        <MaxYourStackCard />

        {/* Readiness-aware suggestion — only renders for high or low
            readiness states. Hidden in the "hold" middle band. */}
        <View style={s.section}>
          <WorkoutReadinessBanner />
        </View>

        {/* Stats */}
        <View style={s.section}>
          <StatsBar />
        </View>

        {/* Today's Workout / Active Program hero */}
        {activeProgram ? (
          <View style={s.section}>
            <View style={[s.heroCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}>
              <LinearGradient
                colors={[`${accent.deep}18`, `${accent.pastel}08`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.heroCardGradient}
              >
                <Text style={[s.heroCardLabel, { color: accent.deep }]}>ACTIVE PROGRAM</Text>
                <Text style={[s.heroCardTitle, { color: t.text }]}>
                  {activeProgramDetails?.name ?? 'Your Program'}
                </Text>
                <Text style={[s.heroCardSub, { color: t.textSecondary }]}>
                  Week {activeProgram.currentWeek} · Day {activeProgram.currentDay + 1}
                </Text>
                <TouchableOpacity
                  style={[s.heroCardBtn, { backgroundColor: accent.deep }]}
                  onPress={() => router.push(`/workouts/player?programId=${activeProgram.programId}`)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={s.heroCardBtnText}>Start Today's Workout</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        ) : null}

        {/* Generate Custom Program */}
        <View style={s.section}>
          <TouchableOpacity
            style={[s.generateCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}
            onPress={() => {
              if (hasCustomGenerator) {
                setSheetOpen(true);
              } else {
                setWorkoutPaywallFeature('custom_workout_generator');
              }
            }}
            activeOpacity={0.85}
          >
            <View style={[s.generateIcon, { backgroundColor: `${accent.deep}18` }]}>
              <Ionicons name="sparkles" size={22} color={accent.deep} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.generateTitle, { color: t.text }]}>Generate Custom Program</Text>
                {!hasCustomGenerator && <LockBadge tier="pro" size="sm" />}
              </View>
              <Text style={[s.generateSub, { color: t.textSecondary }]}>
                Pick your goal, days, and location
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* My Workouts entry point */}
        {savedGeneratedWorkouts.length > 0 && (
          <View style={s.section}>
            <TouchableOpacity
              style={[s.generateCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push('/workouts/my-workouts' as any)}
              activeOpacity={0.85}
            >
              <View style={[s.generateIcon, { backgroundColor: `${accent.deep}10` }]}>
                <Ionicons name="bookmark" size={20} color={accent.deep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.generateTitle, { color: t.text }]}>My Workouts</Text>
                <Text style={[s.generateSub, { color: t.textSecondary }]}>
                  {savedGeneratedWorkouts.length} saved workout{savedGeneratedWorkouts.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        <View style={s.section}>
          <View style={s.quickRow}>
            <TouchableOpacity
              style={[s.quickBtn, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push('/workouts/build-workout')}
              activeOpacity={0.8}
            >
              <View style={[s.quickIcon, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="hammer-outline" size={18} color={accent.deep} />
              </View>
              <Text style={[s.quickLabel, { color: t.text }]}>Build</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.quickBtn, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push('/workouts/player')}
              activeOpacity={0.8}
            >
              <View style={[s.quickIcon, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="play-outline" size={18} color={accent.deep} />
              </View>
              <Text style={[s.quickLabel, { color: t.text }]}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.quickBtn, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push('/workouts/exercises')}
              activeOpacity={0.8}
            >
              <View style={[s.quickIcon, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="list-outline" size={18} color={accent.deep} />
              </View>
              <Text style={[s.quickLabel, { color: t.text }]}>Exercises</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.quickBtn, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
              onPress={() => router.push('/workouts/history')}
              activeOpacity={0.8}
            >
              <View style={[s.quickIcon, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="time-outline" size={18} color={accent.deep} />
              </View>
              <Text style={[s.quickLabel, { color: t.text }]}>History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* My Workout Templates */}
        {workoutTemplates.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: t.text }]}>My Workouts</Text>
            {workoutTemplates.map((tmpl) => {
              const exerciseNames = tmpl.exercises
                .map((e) => getExerciseById(e.exerciseId)?.name ?? e.exerciseId)
                .slice(0, 3)
                .join(', ');
              return (
                <TouchableOpacity
                  key={tmpl.id}
                  style={[s.templateCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}
                  onPress={() => router.push(`/workouts/player?templateId=${tmpl.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.templateName, { color: t.text }]}>{tmpl.name}</Text>
                    <Text style={[s.templateMeta, { color: t.textMuted }]}>
                      {tmpl.exercises.length} exercises · {tmpl.exercises.reduce((sum, e) => sum + e.targetSets, 0)} sets
                    </Text>
                    <Text style={[s.templateExercises, { color: t.textSecondary }]} numberOfLines={1}>
                      {exerciseNames}
                    </Text>
                  </View>
                  <Ionicons name="play-circle" size={28} color={accent.deep} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Workout Library entry — opens the R2-backed video library
            (Pro-gated). Replaces the old "Coming soon" placeholder carousel. */}
        <View style={s.section}>
          <TouchableOpacity
            style={[s.generateCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}
            onPress={() => router.push('/workouts/library')}
            activeOpacity={0.85}
          >
            <View style={[s.generateIcon, { backgroundColor: `${accent.deep}18` }]}>
              <Ionicons name="play-circle" size={22} color={accent.deep} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.generateTitle, { color: t.text }]}>Workout Video Library</Text>
                {!hasCustomGenerator && <LockBadge tier="pro" size="sm" />}
              </View>
              <Text style={[s.generateSub, { color: t.textSecondary }]}>
                Jamie's guided clips — form, programs, recovery
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Curated Programs */}
        <View style={[s.sectionHeaderRow, { marginTop: 24 }]}>
          <Text style={[s.sectionTitle, { color: t.text }]}>Curated Programs</Text>
        </View>
        <View ref={programsSectionRef} style={s.section}>
          {WORKOUT_PROGRAMS.map((program) => (
            <View key={program.id} style={{ marginBottom: 14 }}>
              <LockedFeatureCard feature="workout_programs" tier="pro">
                <ProgramCard program={program} />
              </LockedFeatureCard>
            </View>
          ))}
          <View
            style={[
              s.comingSoonCard,
              { backgroundColor: t.surface, borderColor: t.cardBorder },
            ]}
          >
            <Ionicons name="add-circle-outline" size={28} color={t.textSecondary} />
            <Text style={[s.comingSoonTitle, { color: t.text }]}>More Programs Coming</Text>
            <Text style={[s.comingSoonDesc, { color: t.textSecondary }]}>
              Jamie is building HIIT and postpartum recovery programs next.
            </Text>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Custom Workout Generator Sheet */}
      <GeneratorSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGenerate={handleGenerated}
        gender={gender}
      />

      {/* Paywall for locked workout features */}
      {workoutPaywallFeature && (
        <PaywallModal
          visible
          feature={workoutPaywallFeature}
          onDismiss={() => setWorkoutPaywallFeature(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },

  scroll: { paddingBottom: 40 },

  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Hero card (active program)
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroCardGradient: {
    padding: 20,
  },
  heroCardLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroCardTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroCardSub: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    marginBottom: 16,
  },
  heroCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  heroCardBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },

  // Generate custom card
  generateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  generateIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  generateSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },

  // Quick actions
  quickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
  },

  // Template cards
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  templateName: {
    fontSize: 15,
    fontFamily: 'DMSans-SemiBold',
  },
  templateMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  templateExercises: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 3,
  },

  // Program card
  programCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  programImageWrap: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  programImage: {
    width: '100%',
    height: '100%',
  },
  programImageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  proBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  proBadgeText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  programBody: {
    padding: 14,
  },
  programTitle: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
  },
  programCreator: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
    marginBottom: 8,
  },
  programDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    lineHeight: 19,
    marginBottom: 10,
  },
  programMeta: {
    flexDirection: 'row',
    gap: 14,
  },
  programMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  programMetaText: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  activeBannerText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
  },

  // Video cards
  videoCard: {
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  videoThumbWrap: {
    width: '100%',
    height: 124,
    position: 'relative',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
  },
  videoPlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  videoDurationText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },
  videoInfo: {
    padding: 10,
  },
  videoCategory: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  videoTitle: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    lineHeight: 17,
  },

  // Coming soon
  comingSoonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  comingSoonTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    marginTop: 4,
  },
  comingSoonDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },

  // Generator sheet
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
    maxHeight: '90%',
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
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 20,
  },
  generateBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
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
});
