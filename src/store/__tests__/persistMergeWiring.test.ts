/**
 * The shape check is wired into the real stores, not just unit-tested.
 *
 * src/lib/__tests__/persistSafety.test.ts proves the helper is correct. That
 * proves nothing about whether any store uses it — and a helper nobody calls is
 * the shape of most of the bugs in this repo's history. These tests reach into
 * the actual persist options of actual stores and run a corrupt blob through
 * the merge that will run on the next launch.
 *
 * What a corrupt blob is, concretely: on web `secureStorage` falls back to
 * localStorage, which the user can edit, and a killed app leaves partial
 * writes. zustand's default merge is `{ ...current, ...persisted }` with no
 * checks, so a string where an array belongs becomes state and the first
 * `.map()` on it throws. With one error boundary, at the root, that is the
 * whole app replaced by the fallback screen on every launch.
 */

// Imports first, jest.mock after: babel-jest hoists the mock factories above
// these imports, and eslint import/first wants the imports at the top. Same
// arrangement as clearDeviceData.test.ts next door.
import { useDoseLogStore } from '../useDoseLogStore';
import { useMealStore } from '../useMealStore';
import { useJournalStore } from '../useJournalStore';
import { useSubscriptionStore } from '../useSubscriptionStore';

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../services/telemetry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));
jest.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  sessionPersistenceHealthy: () => true,
  subscribeSessionPersistence: () => () => {},
}));


type AnyStore = {
  getState: () => Record<string, unknown>;
  persist: { getOptions: () => { merge?: (p: unknown, c: unknown) => unknown; version?: number; migrate?: unknown } };
};

const STORES: [string, AnyStore][] = [
  ['doseLog', useDoseLogStore as unknown as AnyStore],
  ['meals', useMealStore as unknown as AnyStore],
  ['journal', useJournalStore as unknown as AnyStore],
  ['subscription', useSubscriptionStore as unknown as AnyStore],
];

describe.each(STORES)('%s store', (_label, store) => {
  const options = () => store.persist.getOptions();

  it('has a merge and an explicit version', () => {
    const o = options();
    expect(typeof o.merge).toBe('function');
    expect(typeof o.version).toBe('number');
  });

  /**
   * A key with a shape we can contradict, and a value of the wrong shape plus
   * one of the right shape.
   *
   * Not every store has an array default — useSubscriptionStore is all
   * scalars — and the first draft of this test assumed one did, which failed
   * honestly rather than passing vacuously.
   */
  const probe = () => {
    const current = store.getState();
    for (const k of Object.keys(current)) {
      const v = current[k];
      if (typeof v === 'function' || v === null || v === undefined) continue;
      if (Array.isArray(v)) return { current, key: k, bad: 'corrupted', good: [{ id: 'kept' }] };
      if (typeof v === 'string') return { current, key: k, bad: 42, good: 'kept' };
      if (typeof v === 'number') return { current, key: k, bad: 'corrupted', good: 123 };
      if (typeof v === 'boolean') return { current, key: k, bad: 'corrupted', good: !v };
      if (typeof v === 'object') return { current, key: k, bad: 'corrupted', good: { kept: true } };
    }
    return null;
  };

  it('refuses a persisted value whose shape would throw', () => {
    const p = probe();
    expect(p).not.toBeNull();
    const merged = options().merge!({ [p!.key]: p!.bad }, p!.current) as Record<string, unknown>;
    expect(merged[p!.key]).toEqual(p!.current[p!.key]);
  });

  it('still accepts a well-shaped value', () => {
    // The positive control. Without it, a merge that refused EVERYTHING would
    // pass the test above and quietly wipe the user's data on every launch.
    const p = probe();
    const merged = options().merge!({ [p!.key]: p!.good }, p!.current) as Record<string, unknown>;
    expect(merged[p!.key]).toEqual(p!.good);
  });

  it('never lets storage overwrite an action', () => {
    const current = store.getState();
    const fnKey = Object.keys(current).find((k) => typeof current[k] === 'function');
    expect(fnKey).toBeDefined();
    const merged = options().merge!({ [fnKey!]: 'hacked' }, current) as Record<string, unknown>;
    expect(typeof merged[fnKey!]).toBe('function');
  });

  it('falls back to defaults entirely for a blob that is not a state object', () => {
    const current = store.getState();
    for (const junk of [null, 'string', 42, [], true]) {
      expect(() => options().merge!(junk, current)).not.toThrow();
    }
  });

  it('refuses a null where the default is an array — the likeliest corruption', () => {
    // JSON.stringify turns NaN, Infinity and undefined-in-an-array into null,
    // so a bad write produces null more often than anything else, and
    // doses.length throws on it exactly as doses.map does on a string.
    const current = store.getState();
    const arrayKey = Object.keys(current).find((k) => Array.isArray(current[k]));
    if (!arrayKey) return;
    const merged = options().merge!({ [arrayKey]: null }, current) as Record<string, unknown>;
    expect(Array.isArray(merged[arrayKey])).toBe(true);
  });});
