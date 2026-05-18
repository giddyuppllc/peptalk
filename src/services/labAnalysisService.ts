/**
 * Lab interpretation client — calls aimee-lab-interpret with the
 * user's logged labs + active peptide context, returns markdown.
 *
 * UX note: this is a Pro-tier feature. The edge function returns a
 * 403 with `upgrade: true` for non-Pro users; callers should surface
 * a paywall in that case rather than treating it as an error.
 */

import { useLabResultsStore, type LabValue } from '../store/useLabResultsStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';

const FN_NAME = 'aimee-lab-interpret';

export interface LabInterpretation {
  markdown: string;
  /** ISO timestamp this interpretation was produced. Lets the UI cache. */
  generatedAt: string;
}

export interface LabInterpretationError {
  error: string;
  upgrade?: boolean;
}

export type LabInterpretationResult = LabInterpretation | LabInterpretationError;

function isError(r: LabInterpretationResult): r is LabInterpretationError {
  return 'error' in r;
}
export { isError as isLabInterpretError };

/**
 * Pull the latest reading for each marker the user has logged. Sending
 * only the latest keeps the prompt compact; if the user wants trend
 * analysis we can extend to send the last N draws per marker.
 */
function latestPerMarker(results: LabValue[]): LabValue[] {
  const byMarker = new Map<string, LabValue>();
  for (const r of results) {
    const prev = byMarker.get(r.markerId);
    if (!prev || r.date > prev.date) {
      byMarker.set(r.markerId, r);
    }
  }
  return Array.from(byMarker.values());
}

/**
 * Interpret the user's lab panel. Pulls active peptides and demographic
 * profile from local stores so callers don't need to assemble them.
 */
export async function interpretLatestLabs(): Promise<LabInterpretationResult> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'You must be signed in to use lab interpretation.' };
  }

  const allResults = useLabResultsStore.getState().results;
  if (allResults.length === 0) {
    return { error: 'Log at least one lab value first — there\'s nothing to interpret yet.' };
  }
  const results = latestPerMarker(allResults);

  const activePeptides = (useDoseLogStore.getState().protocols ?? [])
    .filter((p) => p.isActive)
    .map((p) => p.peptideId);

  const profileSnapshot = useHealthProfileStore.getState().profile;
  let age: number | undefined;
  if (profileSnapshot?.dateOfBirth) {
    const dob = new Date(profileSnapshot.dateOfBirth + 'T00:00:00Z');
    if (!isNaN(dob.getTime())) {
      age = Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    }
  }
  const profile = profileSnapshot
    ? {
        age,
        biologicalSex: profileSnapshot.biologicalSex,
        primaryGoals: profileSnapshot.primaryGoals,
      }
    : undefined;

  try {
    const { data, error } = await supabase.functions.invoke(FN_NAME, {
      body: {
        results,
        activePeptides,
        profile,
      },
    });
    if (error) {
      // Surface upgrade hint if the function returned 403.
      // 2026-05-17 fix: same supabase-js v2 Response.body stream bug
      // we fixed in useCommunityStore + referralService.
      const ctx: any = (error as any)?.context;
      let parsed: any = null;
      try {
        if (ctx && typeof ctx.text === 'function') {
          const text = await ctx.text();
          if (text) parsed = JSON.parse(text);
        } else if (ctx?.body && typeof ctx.body === 'string') {
          parsed = JSON.parse(ctx.body);
        } else if (ctx?.body && typeof ctx.body.text === 'function') {
          const text = await ctx.body.text();
          if (text) parsed = JSON.parse(text);
        }
      } catch { /* ignore */ }
      if (parsed?.upgrade) {
        return { error: parsed.error ?? 'Lab interpretation requires PepTalk Pro.', upgrade: true };
      }
      return { error: parsed?.error ?? error.message ?? 'Lab interpretation failed.' };
    }
    const payload = data as { markdown?: string; error?: string; upgrade?: boolean };
    if (payload?.error) {
      return { error: payload.error, upgrade: !!payload.upgrade };
    }
    if (!payload?.markdown) {
      return { error: 'Empty interpretation response.' };
    }
    return {
      markdown: payload.markdown,
      generatedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return { error: err?.message ?? 'Lab interpretation failed.' };
  }
}
