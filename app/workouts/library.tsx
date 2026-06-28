/**
 * Workout Library → redirects to the instruction-based Exercise Library.
 *
 * The old standalone video catalog was retired in favour of the full
 * exercise library (app/workouts/exercises.tsx), which leads with Jamie's
 * written form instructions, cues, and safety notes for every move and
 * surfaces a demo video automatically when one exists in the manifest.
 * This route is kept as a redirect so existing deep links / entry points
 * (and Aimee navigation) still resolve. The per-clip player at
 * app/workouts/library/[slug].tsx and the admin tagger remain intact.
 */

import { Redirect } from 'expo-router';

export default function WorkoutLibraryScreen() {
  return <Redirect href="/workouts/exercises" />;
}
