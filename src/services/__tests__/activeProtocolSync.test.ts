/**
 * active_protocols sync — column mapping.
 *
 * aimee-chat-stream reads public.active_protocols to tell Aimee what the user
 * is currently running. The table was read from the day it shipped and written
 * by NOTHING, so that context was permanently empty — Aimee has never known a
 * single user's protocol while confidently discussing their stack.
 *
 * Two things made it silent rather than loud:
 *   1. nobody called syncRecord for protocols at all;
 *   2. active_protocols.id was still UUID while every other client-owned table
 *      had been widened to TEXT, and the client mints `proto-active-<ts>` —
 *      so even an attempt would have failed the cast.
 *      (fixed by migration 20260825000000_active_protocols_text_id)
 *
 * This pins the mapping, because the failure mode is invisible: PostgREST
 * rejects the WHOLE row on one unknown key. That is exactly how dose sync
 * broke before — an earlier version wrote `dose_mcg` instead of `amount` and
 * every dose stayed local-only with no error anywhere. A test that only
 * checked "sync was called" would not have caught it, so this asserts the
 * exact key set.
 */

import { useDoseLogStore } from '../../store/useDoseLogStore';

// The real column list, from
// supabase/migrations/20260420000000_initial_schema.sql (plus user_id, which
// syncRecord attaches itself).
const REAL_COLUMNS = new Set([
  'id',
  'user_id',
  'peptide_id',
  'peptide_name',
  'dose_amount',
  'dose_unit',
  'route',
  'frequency',
  'start_date',
  'end_date',
  'is_active',
  'created_at',
]);

const mockSyncRecord = jest.fn();
const mockDeleteRecord = jest.fn();

jest.mock('../syncService', () => ({
  syncRecord: (...a: unknown[]) => mockSyncRecord(...a),
  deleteRecord: (...a: unknown[]) => mockDeleteRecord(...a),
  hydrateFromServer: jest.fn().mockResolvedValue([]),
}));
// The store persists through secureStorage → AsyncStorage, which has no native
// module under jest. Stub it: this test is about the column mapping, not
// persistence.
jest.mock('../secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../notificationService', () => ({
  cancelDoseRemindersFor: jest.fn().mockResolvedValue(undefined),
  fireCycleCompleteNudge: jest.fn().mockResolvedValue(undefined),
  scheduleDoseReminder: jest.fn().mockResolvedValue(undefined),
  isAvailable: () => false,
}));

type ProtocolInput = Parameters<
  ReturnType<typeof useDoseLogStore.getState>['addProtocol']
>[0];

const BASE: ProtocolInput = {
  peptideId: 'bpc-157',
  dose: 250,
  unit: 'mcg',
  route: 'subcutaneous',
  frequency: 'daily',
  startDate: '2026-08-25',
};

const addOne = () => useDoseLogStore.getState().addProtocol(BASE);

beforeEach(() => {
  jest.clearAllMocks();
  useDoseLogStore.setState({ protocols: [], doses: [] } as never);
});

describe('addProtocol → active_protocols', () => {
  it('writes the protocol to the table Aimee reads', () => {
    addOne();
    expect(mockSyncRecord).toHaveBeenCalled();
    const [table] = mockSyncRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe('active_protocols');
  });

  it('sends ONLY real columns — one unknown key rejects the whole row', () => {
    addOne();
    const [, record] = mockSyncRecord.mock.calls[0] as [string, Record<string, unknown>];
    const unknown = Object.keys(record).filter((k) => !REAL_COLUMNS.has(k));
    expect(unknown).toEqual([]);
  });

  it('does not leak fields that have no column (notes, templateId)', () => {
    useDoseLogStore.getState().addProtocol({
      ...BASE,
      notes: 'should not be sent',
      templateId: 'proto-bpc157-subq',
    });
    const [, record] = mockSyncRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(record).not.toHaveProperty('notes');
    expect(record).not.toHaveProperty('templateId');
    expect(record).not.toHaveProperty('template_id');
  });

  it('maps the values across correctly, in snake_case', () => {
    addOne();
    const [, record] = mockSyncRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(record).toMatchObject({
      peptide_id: 'bpc-157',
      dose_amount: 250,
      dose_unit: 'mcg',
      route: 'subcutaneous',
      frequency: 'daily',
      start_date: '2026-08-25',
      is_active: true,
    });
    // peptide_name is resolved from the catalog so the row is readable
    // server-side without joining to the app's peptide data.
    expect(String(record.peptide_name).toLowerCase()).toContain('bpc');
  });
});

describe('lifecycle mirroring', () => {
  it('mirrors a deactivation, so Aimee stops citing a finished protocol', () => {
    addOne();
    const id = useDoseLogStore.getState().protocols[0].id;
    mockSyncRecord.mockClear();

    useDoseLogStore.getState().deactivateProtocol(id);

    expect(mockSyncRecord).toHaveBeenCalled();
    const [table, record] = mockSyncRecord.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe('active_protocols');
    expect(record.is_active).toBe(false);
    expect(record.id).toBe(id);
  });

  it('deletes the row when the protocol is deleted', () => {
    addOne();
    const id = useDoseLogStore.getState().protocols[0].id;

    useDoseLogStore.getState().deleteProtocol(id);

    expect(mockDeleteRecord).toHaveBeenCalledWith('active_protocols', id);
  });
});
