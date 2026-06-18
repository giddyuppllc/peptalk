/**
 * workoutOverrides — sync layer for the workout-video manifest.
 *
 * Replaces the old clipboard → commit-to-workoutVideos.json flow with a
 * runtime overrides table in Supabase (public.workout_video_overrides).
 *
 *   WRITE  (tagger → DB):   saveWorkoutOverrides(edits)
 *     Calls the admin-gated `save-workout-overrides` edge function, which
 *     upserts each edited entry keyed by slug. The clipboard export stays in
 *     the tagger UI as a fallback, but this is the real persistence so tags
 *     are never stranded on one device again.
 *
 *   READ   (DB → app):      fetchWorkoutOverrides()
 *     Reads the table directly (RLS allows any authenticated user to SELECT)
 *     and pushes the result into useVideoTaggerStore.remoteEdits. The store
 *     caches it to AsyncStorage, so an offline cold start still merges the
 *     last-known overrides. On a failed/offline fetch we keep whatever was
 *     cached and the app falls back to the bundled JSON.
 *
 * The merge itself happens in useVideoTaggerStore (combineEdits + applyEdits):
 *   static JSON  <  remoteEdits  <  local session edits
 */

import { supabase } from './supabase';
import {
  useVideoTaggerStore,
  type VideoEdit,
} from '../store/useVideoTaggerStore';
import type { WorkoutVideoCategory } from '../data/workoutVideos';

/** Shape of a row in public.workout_video_overrides. */
interface OverrideRow {
  slug: string;
  title: string | null;
  description: string | null;
  exercise_id: string | null;
  category: string | null;
  duration_sec: number | null;
  needs_review: boolean | null;
}

/** Convert a DB row into the VideoEdit shape used by the merge. Only
 *  non-null fields become overrides so a row that only sets `category`
 *  doesn't blank out the JSON's title. */
function rowToEdit(row: OverrideRow): VideoEdit {
  const edit: VideoEdit = {};
  if (row.title != null) edit.title = row.title;
  if (row.description != null) edit.description = row.description;
  // exercise_id is intentionally allowed through as null too — a tagger can
  // un-assign an exercise. But we only override when the column is present
  // (non-undefined). Postgres returns null for "no value", which here means
  // "no override", so we treat null as "don't touch the base".
  if (row.exercise_id != null) edit.exerciseId = row.exercise_id;
  if (row.category != null) edit.category = row.category as WorkoutVideoCategory;
  if (row.duration_sec != null) edit.durationSec = row.duration_sec;
  if (row.needs_review != null) edit.needsReview = row.needs_review;
  return edit;
}

/**
 * Pull overrides from Supabase and merge them into the tagger store.
 * Safe to call on app load. Never throws — on any failure it leaves the
 * cached remoteEdits untouched so the app keeps working offline.
 *
 * @returns number of override rows applied, or null on failure.
 */
export async function fetchWorkoutOverrides(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('workout_video_overrides')
      .select('slug, title, description, exercise_id, category, duration_sec, needs_review');

    if (error) {
      if (__DEV__) console.warn('[workoutOverrides] fetch failed:', error.message);
      return null;
    }

    const rows = (data ?? []) as OverrideRow[];
    const remote: Record<string, VideoEdit> = {};
    for (const row of rows) {
      if (!row?.slug) continue;
      remote[row.slug] = rowToEdit(row);
    }
    useVideoTaggerStore.getState().setRemoteEdits(remote);
    return rows.length;
  } catch (err) {
    if (__DEV__) console.warn('[workoutOverrides] fetch threw:', err);
    return null;
  }
}

export type SaveResult =
  | { ok: true; saved: number }
  | { ok: false; reason: 'not_signed_in' | 'forbidden' | 'network'; message?: string };

/**
 * Persist the local tagging session to the DB via the admin-gated edge
 * function. The caller (video-tagger) keeps the clipboard export as a
 * fallback, but this is the durable write.
 */
export async function saveWorkoutOverrides(
  edits: Record<string, VideoEdit>,
): Promise<SaveResult> {
  if (Object.keys(edits).length === 0) return { ok: true, saved: 0 };

  let session;
  try {
    const result = await supabase.auth.getSession();
    session = result.data?.session;
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!session?.access_token) return { ok: false, reason: 'not_signed_in' };

  try {
    const { data, error } = await supabase.functions.invoke('save-workout-overrides', {
      body: { edits },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) return { ok: false, reason: 'not_signed_in' };
      if (status === 403) return { ok: false, reason: 'forbidden' };
      return { ok: false, reason: 'network', message: error.message };
    }
    const saved = typeof data?.saved === 'number' ? data.saved : 0;
    // Reflect the just-saved edits into remoteEdits so a subsequent fetch
    // (or none) still shows them, and so the merge is immediately consistent.
    const store = useVideoTaggerStore.getState();
    store.setRemoteEdits({ ...store.remoteEdits, ...edits });
    return { ok: true, saved };
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
