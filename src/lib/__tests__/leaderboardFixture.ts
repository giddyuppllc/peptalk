/**
 * One fixture, used by BOTH sides of the leaderboard:
 *   - jest (leaderboardMetrics.test.ts) computes expectations with the pure TS rules
 *   - scripts/test-leaderboard-sql.ts seeds it into a throwaway Postgres, runs the
 *     real migration, and fails on any number that differs from the TS rules.
 *
 * Dates are offsets from "today" (UTC) so the public functions, which use now(),
 * see the same calendar the TS side is given.
 *
 * Every user carries sensitive sentinels (email, names, weight, compound name,
 * notes). The SQL run fails if any sentinel string shows up in a payload.
 */

import type { ProtocolFrequency } from '../../types';
import { addDays, type DoseInput, type ProtocolInput, type WorkoutInput } from '../leaderboardMetrics';

export interface FixtureUser {
  key: string;
  id: string;
  /** undefined = never touched the setting (column default). */
  optIn?: boolean;
  username: string | null;
  displayName: string | null;
  checkinOffsets: number[];
  protocols: { peptideId: string; frequency: ProtocolFrequency; startOffset: number; endOffset?: number; isActive: boolean }[];
  doses: { peptideId: string; offset: number; source: 'user' | 'planned' }[];
  /** offset in days (completed at 12:00 UTC), or null for a planned workout. */
  workoutOffsets: (number | null)[];
}

export const SENTINELS = {
  email: 'sentinel-private@example.invalid',
  firstName: 'SENTINELFIRSTNAME',
  lastName: 'SENTINELLASTNAME',
  peptideName: 'SENTINEL-COMPOUND-NAME',
  peptideId: 'sentinel-compound-id',
  notes: 'SENTINEL-PRIVATE-NOTE',
  weightLbs: 187.25,
  ageRange: '30-45-sentinel',
} as const;

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let i = from; i >= to; i--) out.push(i);
  return out;
};

const pep = SENTINELS.peptideId;

export const FIXTURE_USERS: FixtureUser[] = [
  {
    // Opted in. Current 10-day streak + an older 4-day run. 12 workouts.
    key: 'alice',
    id: '00000000-0000-4000-8000-00000000000a',
    optIn: true,
    username: 'alice_lb',
    displayName: 'Alice',
    checkinOffsets: [...range(0, -9), ...range(-20, -23)],
    protocols: [
      { peptideId: pep, frequency: 'daily', startOffset: -40, isActive: true },
      { peptideId: 'weekly-thing', frequency: 'weekly', startOffset: -9, isActive: true },
      { peptideId: 'old-thing', frequency: 'daily', startOffset: -90, endOffset: -60, isActive: true },
      { peptideId: 'paused-thing', frequency: 'daily', startOffset: -20, isActive: false },
    ],
    doses: [
      ...range(0, -23).map((o) => ({ peptideId: pep, offset: o, source: 'user' as const })),
      ...range(-24, -26).map((o) => ({ peptideId: pep, offset: o, source: 'planned' as const })),
      { peptideId: pep, offset: -45, source: 'user' },
      { peptideId: 'weekly-thing', offset: -1, source: 'user' },
      { peptideId: 'weekly-thing', offset: -2, source: 'user' },
      { peptideId: 'paused-thing', offset: -3, source: 'user' },
    ],
    workoutOffsets: [...range(-1, -12), null],
  },
  {
    // Opted in. 7-day streak that ended YESTERDAY (grace). eod protocol, 1 of 3.
    key: 'bob',
    id: '00000000-0000-4000-8000-00000000000b',
    optIn: true,
    username: 'bob_lb',
    displayName: null,
    checkinOffsets: range(-1, -7),
    protocols: [{ peptideId: pep, frequency: 'eod', startOffset: -5, isActive: true }],
    doses: [{ peptideId: pep, offset: -2, source: 'user' }, { peptideId: pep, offset: 3, source: 'planned' }],
    workoutOffsets: [-3, -2, -1],
  },
  {
    // Opted in, but ALICE has blocked her. Visible to others, never to Alice.
    key: 'carol',
    id: '00000000-0000-4000-8000-00000000000c',
    optIn: true,
    username: 'carol_lb',
    displayName: 'Carol',
    checkinOffsets: [0, -1, -2, -3, -4],
    protocols: [],
    doses: [],
    workoutOffsets: [-5],
  },
  {
    // NEVER opted in (column default). The best numbers in the fixture, so a
    // broken gate would put him at #1 on every board.
    key: 'dave',
    id: '00000000-0000-4000-8000-00000000000d',
    username: 'dave_private',
    displayName: 'Dave Private',
    checkinOffsets: range(0, -40),
    protocols: [{ peptideId: pep, frequency: 'daily', startOffset: -60, isActive: true }],
    doses: range(0, -29).map((o) => ({ peptideId: pep, offset: o, source: 'user' as const })),
    workoutOffsets: range(0, -14),
  },
  {
    // Explicitly opted OUT (false written).
    key: 'erin',
    id: '00000000-0000-4000-8000-00000000000e',
    optIn: false,
    username: 'erin_private',
    displayName: 'Erin',
    checkinOffsets: range(0, -30),
    protocols: [],
    doses: [],
    workoutOffsets: range(-1, -10),
  },
  {
    // Opted in. Streak lapsed 3 days ago → 0, but its 3/7-day milestones are
    // recent enough to shout out. Workouts all older than the window.
    key: 'frank',
    id: '00000000-0000-4000-8000-00000000000f',
    optIn: true,
    username: 'frank_lb',
    displayName: 'Frank',
    checkinOffsets: range(-3, -10),
    protocols: [],
    doses: [],
    workoutOffsets: [-31, -40],
  },
  {
    // Opted in. A check-in dated TOMORROW (east of UTC) still counts.
    key: 'grace',
    id: '00000000-0000-4000-8000-000000000011',
    optIn: true,
    username: null,
    displayName: 'Grace',
    checkinOffsets: [1, 0, -1],
    protocols: [{ peptideId: pep, frequency: 'monthly', startOffset: -13, isActive: true }],
    doses: [],
    workoutOffsets: [],
  },
];

/** Blocks in the fixture: [blocker, blocked]. */
export const FIXTURE_BLOCKS: [string, string][] = [['alice', 'carol']];

export function userInputs(u: FixtureUser, today: string): {
  checkinDates: string[];
  protocols: ProtocolInput[];
  doses: DoseInput[];
  workouts: WorkoutInput[];
} {
  return {
    checkinDates: u.checkinOffsets.map((o) => addDays(today, o)),
    protocols: u.protocols.map((p) => ({
      peptideId: p.peptideId,
      frequency: p.frequency,
      startDate: addDays(today, p.startOffset),
      endDate: p.endOffset == null ? null : addDays(today, p.endOffset),
      isActive: p.isActive,
    })),
    doses: u.doses.map((d) => ({ peptideId: d.peptideId, date: addDays(today, d.offset), source: d.source })),
    workouts: u.workoutOffsets.map((o) => ({
      completedAt: o == null ? null : `${addDays(today, o)}T12:00:00.000Z`,
    })),
  };
}
