/**
 * Workouts dashboard — simplified for Jamie feedback round 1, phase 1A.
 *
 * Previous version surfaced 12 curated programs, a "Generate Custom Program"
 * sheet, a 4-tile quick-action row, a video library entry, a stats bar, and
 * a "more programs coming soon" placeholder. Per Jamie's feedback the only
 * program currently in scope is Lusciously Lean BODYreCOMP, and the
 * "build your own" path moved out of a goal/days picker and into a direct
 * exercise-by-exercise builder (/workouts/new).
 *
 * This screen now shows, top-to-bottom:
 *   1. Active-program banner (only if the user has one enrolled — survives
 *      the visibility cull because getProgramById still resolves hidden ids)
 *   2. Big "Build a new workout" CTA → /workouts/new
 *   3. "My saved" list of user-built workout templates (long-press to delete)
 *   4. One row pointing back at Jamie's Lusciously Lean program
 *
 * Anything advanced (RPE, tempo, %1RM, rest intervals, generator sheet,
 * stats, history, exercise browser) is reachable from elsewhere — we just
 * don't shove it in the user's face on the landing.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius } from '../../src/constants/theme';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import {
  useWorkoutTemplateStore,
  type WorkoutTemplate,
} from '../../src/store/useWorkoutTemplateStore';
import { getExerciseById } from '../../src/data/exercises';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import {
  getProgramById,
  getRecommendedProgramId,
  PROGRAM_SHORT_LABEL,
  PROGRAM_TAGLINE,
} from '../../src/data/workoutPrograms';
import { tapMedium, selectionTick } from '../../src/utils/haptics';

// ---------------------------------------------------------------------------
// Active program banner
// ---------------------------------------------------------------------------

function ActiveProgramBanner() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const activeProgram = useWorkoutStore((s) => s.activeProgram);

  if (!activeProgram) return null;

  // getProgramById resolves hidden ids too, so users with an active
  // pre-cull program still see their banner.
  const details = getProgramById(activeProgram.programId);
  const name = details?.name ?? 'Your Program';

  return (
    <View style={[s.heroCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}>
      <LinearGradient
        colors={[`${accent.deep}18`, `${accent.pastel}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.heroCardGradient}
      >
        <Text style={[s.heroCardLabel, { color: accent.deep }]}>ACTIVE PROGRAM</Text>
        <Text style={[s.heroCardTitle, { color: t.text }]}>{name}</Text>
        <Text style={[s.heroCardSub, { color: t.textSecondary }]}>
          Week {activeProgram.currentWeek} · Day {activeProgram.currentDay + 1}
        </Text>
        <TouchableOpacity
          style={[s.heroCardBtn, { backgroundColor: accent.deep }]}
          onPress={() => {
            tapMedium();
            router.push(`/workouts/player-v2?programId=${activeProgram.programId}` as never);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={s.heroCardBtnText}>Start Today's Workout</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Saved workout row
// ---------------------------------------------------------------------------

function SavedWorkoutRow({
  template,
  onPress,
  onDelete,
}: {
  template: WorkoutTemplate;
  onPress: () => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const accent = useSectionAccent();

  const totalSets = template.exercises.reduce((sum, e) => sum + e.targetSets, 0);
  const first = template.exercises
    .slice(0, 2)
    .map((e) => getExerciseById(e.exerciseId)?.name ?? e.exerciseId)
    .join(' · ');

  return (
    <TouchableOpacity
      style={[s.savedRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
      onPress={onPress}
      onLongPress={onDelete}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={[s.savedIcon, { backgroundColor: `${accent.deep}18` }]}>
        <Ionicons name="barbell" size={20} color={accent.deep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.savedTitle, { color: t.text }]} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={[s.savedMeta, { color: t.textSecondary }]} numberOfLines={1}>
          {template.exercises.length} exercises · {totalSets} sets
        </Text>
        {first ? (
          <Text style={[s.savedFirst, { color: t.textSecondary }]} numberOfLines={1}>
            {first}
            {template.exercises.length > 2 ? ` · +${template.exercises.length - 2}` : ''}
          </Text>
        ) : null}
      </View>
      <Ionicons name="play-circle" size={28} color={accent.deep} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function WorkoutsScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const templates = useWorkoutTemplateStore((st) => st.templates);
  const deleteTemplate = useWorkoutTemplateStore((st) => st.deleteTemplate);

  // Gendered marquee program: men → Men's BUILD, women → Lusciously Lean.
  // Unset sex → offer BOTH so the user opts into a track (no female default).
  const biologicalSex = useHealthProfileStore((st) => st.profile.biologicalSex);
  const recommendedProgramId = getRecommendedProgramId(biologicalSex);
  const programRowIds = recommendedProgramId
    ? [recommendedProgramId]
    : ['ll-body-recomp-1', 'mens-build'];

  const go = (path: string) => {
    selectionTick();
    router.push(path as never);
  };

  const goPrimary = (path: string) => {
    tapMedium();
    router.push(path as never);
  };

  const confirmDelete = (template: WorkoutTemplate) => {
    Alert.alert(
      'Delete workout?',
      `Remove "${template.name}" from your saved workouts. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTemplate(template.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Your Workouts</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
      >
        {/* Active program (only if enrolled) */}
        <View style={s.section}>
          <ActiveProgramBanner />
        </View>

        {/* Build a new workout — primary CTA */}
        <View style={s.section}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => goPrimary('/workouts/new')}
            style={s.bigCta}
            accessibilityRole="button"
            accessibilityLabel="Build a new workout"
          >
            <LinearGradient
              colors={['#E89672', '#D98C86']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.bigCtaGrad}
            >
              <Ionicons name="hammer" size={32} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={s.bigCtaTitle}>Build a new workout</Text>
                <Text style={s.bigCtaSub}>
                  Pick exercises, set sets and reps, save it.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* My saved */}
        {templates.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: t.text }]}>My saved</Text>
            <Text style={[s.sectionHint, { color: t.textSecondary }]}>
              Long-press a workout to delete it.
            </Text>
            {templates.map((tmpl) => (
              <SavedWorkoutRow
                key={tmpl.id}
                template={tmpl}
                onPress={() => {
                  tapMedium();
                  router.push(`/workouts/player-v2?templateId=${tmpl.id}` as never);
                }}
                onDelete={() => confirmDelete(tmpl)}
              />
            ))}
          </View>
        )}

        {/* Jamie's programs — gendered marquee row(s). Tap to opt in. */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: t.text }]}>Following a program?</Text>
          {programRowIds.map((pid) => {
            const program = getProgramById(pid);
            if (!program) return null;
            return (
              <TouchableOpacity
                key={pid}
                style={[s.programRow, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}
                onPress={() => go(`/workouts/program/${pid}`)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#7ABED0', '#5BA9A7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.programIcon}
                >
                  <Ionicons name="star" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[s.programTitle, { color: t.text }]}>
                    {PROGRAM_SHORT_LABEL[pid] ?? program.name}
                  </Text>
                  <Text style={[s.programSub, { color: t.textSecondary }]}>
                    {PROGRAM_TAGLINE[pid] ?? `${program.durationWeeks}-week program`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1 },

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
    fontSize: 26,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.4,
  },

  scroll: { paddingBottom: 40 },

  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginBottom: 12,
  },

  // Active program hero
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

  // Big CTA
  bigCta: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bigCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
  },
  bigCtaTitle: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  bigCtaSub: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    marginTop: 3,
  },

  // Saved workouts
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  savedIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  savedMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  savedFirst: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 3,
  },

  // Program row
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  programIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  programSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
});
