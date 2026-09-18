/**
 * The persisted blob is untrusted input.
 *
 * zustand's default `merge` is `{ ...current, ...persisted }` with no checks,
 * so anything in storage becomes state. On web that storage is localStorage,
 * which is user-editable, and a partial write from an app kill produces the
 * same shapes. One `.map is not a function` in a render, with a single root
 * error boundary, is the whole app gone on every launch.
 *
 * These lock down the rule that makes that survivable: a value whose SHAPE does
 * not match the store's own default is refused and the default stands. It can
 * drop a key; it can never invent one.
 */

import {
  shapeCompatible,
  safeMergeWithReport,
  makeSafeMerge,
  passthroughMigrate,
} from '../persistSafety';

describe('shapeCompatible', () => {
  it('refuses the swaps that actually throw', () => {
    expect(shapeCompatible('nope', [])).toBe(false); // .map is not a function
    expect(shapeCompatible('nope', {})).toBe(false);
    expect(shapeCompatible([], {})).toBe(false); // an array is not a record
    expect(shapeCompatible({}, [])).toBe(false);
    expect(shapeCompatible('12', 0)).toBe(false); // string maths
    expect(shapeCompatible(1, false)).toBe(false);
    expect(shapeCompatible(0, '')).toBe(false);
  });

  it('accepts a matching shape', () => {
    expect(shapeCompatible([1, 2], [])).toBe(true);
    expect(shapeCompatible({ a: 1 }, {})).toBe(true);
    expect(shapeCompatible('x', '')).toBe(true);
    expect(shapeCompatible(5, 0)).toBe(true);
    expect(shapeCompatible(true, false)).toBe(true);
  });

  it('refuses a non-finite number', () => {
    // JSON turns these into null, but a hand-edited entry or a bad migration
    // can still deliver one, and it poisons every sum downstream.
    expect(shapeCompatible(NaN, 0)).toBe(false);
    expect(shapeCompatible(Infinity, 0)).toBe(false);
    expect(shapeCompatible(-Infinity, 0)).toBe(false);
  });

  it('accepts anything where the default is null — it says nothing about the shape', () => {
    // `user: null`, `expiresAt: null`. Refusing these would wipe every nullable
    // field in the app on the first launch after this shipped.
    expect(shapeCompatible({ id: 'x' }, null)).toBe(true);
    expect(shapeCompatible('2026-01-01', null)).toBe(true);
    expect(shapeCompatible(7, undefined)).toBe(true);
  });

  it('accepts a null persisted value against any default', () => {
    // "not set yet" cannot be the cause of a type error.
    expect(shapeCompatible(null, [])).toBe(true);
    expect(shapeCompatible(undefined, 0)).toBe(true);
  });
});

describe('safeMergeWithReport', () => {
  const current = {
    doses: [] as unknown[],
    profile: {} as Record<string, unknown>,
    tier: 'free',
    count: 0,
    enabled: false,
    user: null as unknown,
    addDose: () => {},
  };

  it('keeps a well-shaped blob intact', () => {
    const { merged, report } = safeMergeWithReport(
      { doses: [1], profile: { a: 1 }, tier: 'pro', count: 3, enabled: true },
      current,
    );
    expect(merged.doses).toEqual([1]);
    expect(merged.tier).toBe('pro');
    expect(merged.count).toBe(3);
    expect(report.dropped).toEqual([]);
  });

  it('drops a mis-shaped key and keeps the default', () => {
    const { merged, report } = safeMergeWithReport({ doses: 'corrupt', tier: 'pro' }, current);
    expect(merged.doses).toEqual([]); // the default, not the string
    expect(merged.tier).toBe('pro'); // the good key still lands
    expect(report.dropped).toEqual(['doses']);
  });

  it('never lets storage replace an action', () => {
    // Actions sit on the same object as state in zustand. A persisted string
    // where an action belongs turns every call site into "not a function".
    const { merged, report } = safeMergeWithReport({ addDose: 'hacked' }, current);
    expect(typeof merged.addDose).toBe('function');
    expect(report.unknown).toContain('addDose');
  });

  it('drops keys the store no longer has', () => {
    const { merged, report } = safeMergeWithReport({ betaUserIds: [] }, current);
    expect('betaUserIds' in merged).toBe(false);
    expect(report.unknown).toEqual(['betaUserIds']);
  });

  it('falls back to defaults entirely when the blob is not a state object', () => {
    for (const junk of [null, undefined, 'string', 42, [], true]) {
      const { merged } = safeMergeWithReport(junk, current);
      expect(merged).toBe(current);
    }
  });

  it('does not mutate the current state it was handed', () => {
    const snapshot = { ...current, doses: [...current.doses] };
    safeMergeWithReport({ doses: 'corrupt', count: 9 }, current);
    expect(current.doses).toEqual(snapshot.doses);
    expect(current.count).toBe(snapshot.count);
  });

  it('cannot invent a key that was not declared', () => {
    const { merged } = safeMergeWithReport({ somethingNew: 1 }, current);
    expect(Object.keys(merged).sort()).toEqual(Object.keys(current).sort());
  });

  it('survives a prototype-pollution shaped blob', () => {
    const { merged } = safeMergeWithReport(JSON.parse('{"__proto__":{"polluted":true}}'), current);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(merged.doses).toEqual([]);
  });
});

describe('makeSafeMerge', () => {
  it('reports only when something was refused', () => {
    const seen: string[] = [];
    const merge = makeSafeMerge<{ a: unknown[] }>('testStore', (name) => seen.push(name));
    merge({ a: [1] }, { a: [] });
    expect(seen).toEqual([]);
    merge({ a: 'bad' }, { a: [] });
    expect(seen).toEqual(['testStore']);
  });

  it('names the store and the keys, so the log is actionable', () => {
    let captured: { name: string; dropped: string[] } | null = null;
    const merge = makeSafeMerge<{ a: unknown[]; b: number }>('doseLog', (name, r) => {
      captured = { name, dropped: r.dropped };
    });
    merge({ a: 'bad', b: NaN }, { a: [], b: 0 });
    expect(captured).toEqual({ name: 'doseLog', dropped: ['a', 'b'] });
  });
});

describe('passthroughMigrate', () => {
  it('returns the old state untouched', () => {
    const old = { a: 1 };
    expect(passthroughMigrate(old)).toBe(old);
  });

  it('returns something rather than undefined for any input', () => {
    // The whole point. zustand destructures the migration result; returning
    // undefined is what leaves a store unhydrated forever.
    for (const v of [null, undefined, 0, '', false]) {
      expect(() => passthroughMigrate(v)).not.toThrow();
    }
  });
});
