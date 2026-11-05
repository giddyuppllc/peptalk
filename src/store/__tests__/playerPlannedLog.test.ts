import { findPlannedLogFor } from '../useWorkoutStore';
import type { WorkoutLog } from '../../types/fitness';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
}));
jest.mock('../../services/syncService', () => ({ syncRecord: jest.fn(async () => true), fetchUserRecords: jest.fn(async () => []) }));
jest.mock('../../services/secureStorage', () => ({ secureStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));

const log = (id: string, date: string, extra: Partial<WorkoutLog> = {}): WorkoutLog =>
  ({ id, date, programId: 'p1', dayId: 'd1', startedAt: `${date}T08:00:00Z`, sets: [], durationMinutes: 0, ...extra }) as WorkoutLog;

test('finds the oldest undone planned row for the program day, up to today', () => {
  const logs = [
    log('plan-3', '2026-11-12'),
    log('plan-2', '2026-11-05'),
    log('plan-1', '2026-11-01', { completedAt: '2026-11-01T09:00:00Z' }),
    log('plan-x', '2026-11-03', { dayId: 'd2' }),
  ];
  expect(findPlannedLogFor(logs, 'p1', 'd1', '2026-11-06')?.id).toBe('plan-2');
});

test('no program/day, or nothing due → undefined', () => {
  expect(findPlannedLogFor([log('plan-9', '2026-12-01')], 'p1', 'd1', '2026-11-06')).toBeUndefined();
  expect(findPlannedLogFor([log('plan-1', '2026-11-01')], undefined, 'd1', '2026-11-06')).toBeUndefined();
});
