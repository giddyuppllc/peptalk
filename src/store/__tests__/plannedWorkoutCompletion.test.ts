/** Finishing a planned calendar day completes that row, not a duplicate beside it. */
import { useWorkoutStore } from '../useWorkoutStore';

const mockSync = jest.fn().mockResolvedValue(true);
jest.mock('../../services/syncService', () => ({
  ...jest.requireActual('../../services/syncService'),
  syncRecord: (...a: unknown[]) => mockSync(...a),
  deleteRecord: jest.fn(),
  hydrateFromServer: jest.fn(async (_t: string, l: unknown[]) => l),
}));
jest.mock('../../services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const PLANNED = {
  id: 'plan-ll-body-recomp-3-1783099289480',
  date: '2026-11-05',
  programId: 'll-body-recomp',
  dayId: 'Upper A',
  sets: [],
  durationMinutes: 0,
  workoutName: 'Lusciously Lean · Upper A',
  startedAt: '2026-11-05T08:00:00.000Z',
};

beforeEach(() => {
  useWorkoutStore.setState({ logs: [PLANNED as never], inProgress: null, pendingSyncs: [] });
  mockSync.mockClear();
});

it('completes the planned row in place (same id, one row)', () => {
  const s = useWorkoutStore.getState();
  s.beginWorkout(undefined, undefined, 'Upper A');
  s.finishWorkout(undefined, undefined, undefined, 'saved name', { plannedLogId: PLANNED.id });
  const logs = useWorkoutStore.getState().logs;
  expect(logs).toHaveLength(1);
  expect(logs[0].id).toBe(PLANNED.id);
  expect(logs[0].completedAt).toBeTruthy();
  expect(mockSync).toHaveBeenCalledWith('workout_logs', expect.objectContaining({ id: PLANNED.id, completed_at: expect.any(String) }));
});

it('without a planned id it still logs a separate workout (unchanged behaviour)', () => {
  const s = useWorkoutStore.getState();
  s.beginWorkout(undefined, undefined, 'Free session');
  s.finishWorkout();
  const logs = useWorkoutStore.getState().logs;
  expect(logs).toHaveLength(2);
  expect(logs.find((l) => l.id === PLANNED.id)?.completedAt).toBeUndefined();
});
