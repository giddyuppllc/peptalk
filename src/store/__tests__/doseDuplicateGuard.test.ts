/**
 * The same dose logged twice within seconds is one tap, not two doses.
 *
 * Production (2026-08 → 11): 68 duplicate dose_logs rows, 64 of them from
 * Stack Builder's "Add to Tracker" — a 4-peptide stack logged 7× in 2.6 s.
 */
import { useDoseLogStore, findRecentDuplicate, DUPLICATE_DOSE_WINDOW_MS } from '../useDoseLogStore';

const mockSyncRecord = jest.fn().mockResolvedValue(true);
jest.mock('../../services/syncService', () => ({
  syncRecord: (...a: unknown[]) => mockSyncRecord(...a),
  deleteRecord: jest.fn(),
  hydrateFromServer: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../services/notificationService', () => ({
  cancelDoseRemindersFor: jest.fn().mockResolvedValue(undefined),
  fireCycleCompleteNudge: jest.fn().mockResolvedValue(undefined),
  scheduleDoseReminder: jest.fn().mockResolvedValue(undefined),
  isAvailable: () => false,
}));

const STACK = ['bpc-157', 'tb-500', 'ghk-cu', 'kpv'];
const input = (peptideId: string) => ({
  peptideId,
  amount: 0.333,
  unit: 'mg' as const,
  route: 'subcutaneous' as const,
  date: '2026-08-03',
  time: '17:05',
  notes: 'Stack Builder · 4 peptides',
});

beforeEach(() => {
  useDoseLogStore.getState().clearAll();
  mockSyncRecord.mockClear();
});

describe('dose duplicate guard', () => {
  it('seven rapid taps of a 4-peptide stack log 4 doses, not 28', () => {
    for (let tap = 0; tap < 7; tap++) for (const p of STACK) useDoseLogStore.getState().logDose(input(p));
    expect(useDoseLogStore.getState().doses).toHaveLength(4);
    expect(mockSyncRecord.mock.calls.filter((c) => c[0] === 'dose_logs')).toHaveLength(4);
  });

  it('a repeat returns the existing entry', () => {
    const a = useDoseLogStore.getState().logDose(input('bpc-157'));
    const b = useDoseLogStore.getState().logDose(input('bpc-157'));
    expect(b.id).toBe(a.id);
  });

  it('a different amount, time, date or peptide is a real second dose', () => {
    const s = useDoseLogStore.getState();
    s.logDose(input('bpc-157'));
    s.logDose({ ...input('bpc-157'), amount: 0.5 });
    s.logDose({ ...input('bpc-157'), time: '18:05' });
    s.logDose({ ...input('bpc-157'), date: '2026-08-04' });
    s.logDose(input('tb-500'));
    expect(useDoseLogStore.getState().doses).toHaveLength(5);
  });

  it('the same dose again after the window is logged (a real repeat dose)', () => {
    const now = Date.parse('2026-08-03T17:05:30Z');
    const earlier = { id: 'd1', createdAt: new Date(now - DUPLICATE_DOSE_WINDOW_MS - 1).toISOString(), ...input('bpc-157') };
    expect(findRecentDuplicate([earlier], input('bpc-157'), now)).toBeUndefined();
    const recent = { ...earlier, createdAt: new Date(now - 2000).toISOString() };
    expect(findRecentDuplicate([recent], input('bpc-157'), now)?.id).toBe('d1');
  });

  it('planned doses never swallow a real log', () => {
    const now = Date.now();
    const planned = { id: 'p1', planned: true, createdAt: new Date(now).toISOString(), ...input('bpc-157') };
    expect(findRecentDuplicate([planned], input('bpc-157'), now)).toBeUndefined();
  });
});

describe('protocol duplicate guard', () => {
  const proto = {
    peptideId: 'bpc-157',
    dose: 250,
    unit: 'mcg' as const,
    route: 'subcutaneous' as const,
    frequency: 'daily' as const,
    startDate: '2026-11-05',
  };

  it('activating the same peptide from the same start date twice keeps one active protocol', () => {
    useDoseLogStore.getState().addProtocol(proto);
    useDoseLogStore.getState().addProtocol({ ...proto, dose: 300 });
    const active = useDoseLogStore.getState().protocols.filter((p) => p.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].dose).toBe(300);
  });

  it('a different start date is a separate protocol', () => {
    useDoseLogStore.getState().addProtocol(proto);
    useDoseLogStore.getState().addProtocol({ ...proto, startDate: '2026-12-01' });
    expect(useDoseLogStore.getState().protocols.filter((p) => p.isActive)).toHaveLength(2);
  });
});
