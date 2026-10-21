/**
 * App Review 5.1.2 — the health-data toggle (profile.aiDataConsent) must reach
 * every AI edge function, not only Aimee chat.
 *
 * Until 2026-09-16 the only two consumers of that toggle were
 * llmService.buildServerContext and app/(tabs)/peptalk.tsx. Accepting the
 * launch AI modal (a DIFFERENT consent) was enough for nine other functions to
 * receive lab values, a photo of a lab report, dose logs, side-effect
 * severities, check-in moods, medical and food allergies, the active peptide
 * stack, goals, age and sex.
 *
 * These tests assert the rule on both halves and that each edge function is
 * actually wired to it — a registry nothing calls would pass silently.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  AI_FEATURE_HEALTH_FIELDS as CLIENT_FIELDS,
  CONSENT_REQUIRED_FUNCTIONS as CLIENT_REQUIRED,
  stripHealthFields as clientStrip,
  withHealthConsent,
  healthConsentGranted,
} from '../aiFeatureConsent';
import {
  AI_FEATURE_HEALTH_FIELDS as SERVER_FIELDS,
  CONSENT_REQUIRED_FUNCTIONS as SERVER_REQUIRED,
  stripHealthFields as serverStrip,
  applyFeatureConsent,
  hasHealthConsent,
  HEALTH_CONSENT_REFUSAL,
} from '../../../supabase/functions/_shared/aiFeatureConsent';

// The health toggle lives behind the health-profile store, which pulls
// AsyncStorage. Only the toggle's VALUE matters here, so stand it in.
// babel-plugin-jest-hoist lifts this above the imports; the stub reads
// `mockConsent` lazily, so the factory can run before it is assigned.
const mockConsent = { value: true };
jest.mock('../../services/privacyGuard', () => ({
  canSendToCloud: () => mockConsent.value,
}));

const ROOT = path.join(__dirname, '..', '..', '..');

/** A representative body per function, with every health field populated. */
const BODIES: Record<string, Record<string, unknown>> = {
  'aimee-lab-interpret': {
    results: [{ markerId: 'ldl', value: 160 }],
    activePeptides: ['bpc-157'],
    profile: { age: 34, biologicalSex: 'female', primaryGoals: ['lose weight'] },
  },
  'lab-scan': { imageBase64: 'QUJD' },
  'aimee-report-rewrite': {
    body: 'You logged 3 doses of BPC-157. 2 side-effect entries at severity 4+.',
    headline: 'Week of Sep 8',
    recommendation: 'Flag those severe side effects in Aimee chat.',
  },
  'aimee-pantry-meal': {
    pantryItems: [{ name: 'rice' }],
    allergens: ['peanuts', 'shellfish'],
    activeStackPeptides: ['tirzepatide'],
    count: 3,
  },
  'aimee-plan': { days: 5, allergens: ['dairy'], goals: ['fat loss'], dietType: 'keto' },
  'aimee-recipe': { mealType: 'lunch', constraints: ['vegetarian'], allergens: ['gluten'] },
  'aimee-workout': { goal: 'transformation', daysPerWeek: 4, gender: 'women' },
  'aimee-voice': {},
  'food-scan': { imageBase64: 'QUJD' },
  'aimee-pantry-scan': { imageBase64: 'QUJD' },
};

describe('client and server registries are the same rule', () => {
  it('list the same functions', () => {
    expect(Object.keys(CLIENT_FIELDS).sort()).toEqual(Object.keys(SERVER_FIELDS).sort());
  });

  it.each(Object.keys(SERVER_FIELDS))('%s lists the same health fields', (fn) => {
    expect([...(CLIENT_FIELDS[fn] ?? [])].sort()).toEqual([...(SERVER_FIELDS[fn] ?? [])].sort());
  });

  it('agree on which functions refuse outright', () => {
    expect([...CLIENT_REQUIRED].sort()).toEqual([...SERVER_REQUIRED].sort());
  });

  it('covers the AI surface, so a shrunken registry is not a pass', () => {
    expect(Object.keys(SERVER_FIELDS).length).toBeGreaterThanOrEqual(10);
    expect(SERVER_REQUIRED).toEqual(
      expect.arrayContaining(['aimee-lab-interpret', 'lab-scan', 'aimee-report-rewrite']),
    );
  });

  it('every test body above covers a registered function', () => {
    expect(Object.keys(BODIES).sort()).toEqual(Object.keys(SERVER_FIELDS).sort());
  });
});

describe.each([
  ['client', clientStrip],
  ['server', serverStrip],
])('%s stripHealthFields', (_label, strip) => {
  it.each(Object.keys(SERVER_FIELDS))('%s keeps everything with consent', (fn) => {
    const input = { ...BODIES[fn], hasConsent: true };
    expect(strip(fn, input, true)).toEqual(input);
  });

  it.each(Object.keys(SERVER_FIELDS))('%s drops every health field without consent', (fn) => {
    const out = strip(fn, { ...BODIES[fn], hasConsent: false }, false) as Record<string, unknown>;
    for (const field of SERVER_FIELDS[fn]) expect(out).not.toHaveProperty(field);
    expect(out.hasConsent).toBe(false);
  });

  it('leaves non-health fields alone', () => {
    const out = strip('aimee-plan', { ...BODIES['aimee-plan'], hasConsent: false }, false) as Record<string, unknown>;
    expect(out.days).toBe(5);
  });

  it('does not mutate its input', () => {
    const input: Record<string, unknown> = { ...BODIES['aimee-plan'], hasConsent: false };
    strip('aimee-plan', input, false);
    expect(input.allergens).toEqual(['dairy']);
  });

  it('an unknown function name strips nothing but still marks no consent', () => {
    const out = strip('not-a-function', { x: 1, hasConsent: false }, false) as Record<string, unknown>;
    expect(out).toEqual({ x: 1, hasConsent: false });
  });
});

describe('hasHealthConsent is exactly-true, like applyAiDataConsent', () => {
  it.each([true])('accepts %p', (v) => expect(hasHealthConsent({ hasConsent: v })).toBe(true));
  it.each([false, undefined, null, 'true', 1, {}])('rejects %p', (v) =>
    expect(hasHealthConsent({ hasConsent: v as never })).toBe(false),
  );
  it('rejects a body with no flag at all — a stale client', () => {
    expect(hasHealthConsent({ results: [] })).toBe(false);
  });
});

describe('applyFeatureConsent (the single server call)', () => {
  it.each([...SERVER_REQUIRED])('%s refuses a request with no consent flag', (fn) => {
    const r = applyFeatureConsent(fn, { ...BODIES[fn] });
    expect(r.refuse).toBe(true);
  });

  it.each([...SERVER_REQUIRED])('%s runs when consent is true', (fn) => {
    const r = applyFeatureConsent(fn, { ...BODIES[fn], hasConsent: true });
    expect(r.refuse).toBe(false);
    expect(r.body).toEqual({ ...BODIES[fn], hasConsent: true });
  });

  const stripOnly = Object.keys(SERVER_FIELDS).filter(
    (fn) => !SERVER_REQUIRED.includes(fn) && SERVER_FIELDS[fn].length > 0,
  );

  it.each(stripOnly)('%s runs without consent but carries no health field', (fn) => {
    const r = applyFeatureConsent(fn, { ...BODIES[fn] });
    expect(r.refuse).toBe(false);
    const serialised = JSON.stringify(r.body);
    for (const field of SERVER_FIELDS[fn]) expect(r.body).not.toHaveProperty(field);
    expect(serialised).not.toMatch(/peanuts|shellfish|tirzepatide|dairy|gluten|fat loss|keto|women/);
  });

  it('the refusal reuses an existing string rather than new copy', () => {
    expect(HEALTH_CONSENT_REFUSAL.error).toBe(
      'AI features need your consent — you can enable them any time.',
    );
    const client = fs.readFileSync(path.join(ROOT, 'src/services/labAnalysisService.ts'), 'utf8');
    expect(client).toContain(HEALTH_CONSENT_REFUSAL.error);
  });
});

describe('the edge functions are actually wired to it', () => {
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*import\s[\s\S]*?;\s*$/gm, '');

  const wired = Object.keys(SERVER_FIELDS).filter((fn) => SERVER_FIELDS[fn].length > 0);

  it('there are enough wired functions for this to mean something', () => {
    expect(wired.length).toBeGreaterThanOrEqual(7);
  });

  it.each(wired)('%s calls applyFeatureConsent with its own name', (fn) => {
    const code = strip(fs.readFileSync(path.join(ROOT, `supabase/functions/${fn}/index.ts`), 'utf8'));
    expect(code).toMatch(new RegExp(`applyFeatureConsent\\(\\s*'${fn}'`));
  });

  it.each([...SERVER_REQUIRED])('%s returns the refusal on .refuse', (fn) => {
    const code = strip(fs.readFileSync(path.join(ROOT, `supabase/functions/${fn}/index.ts`), 'utf8'));
    expect(code).toMatch(/\.refuse\b[\s\S]{0,120}?HEALTH_CONSENT_REFUSAL/);
  });

  it.each(wired)('%s reads its body from the filtered result, not from req.json directly', (fn) => {
    const code = strip(fs.readFileSync(path.join(ROOT, `supabase/functions/${fn}/index.ts`), 'utf8'));
    // A second bare `await req.json()` outside applyFeatureConsent(...) would
    // be an unfiltered copy of the same payload.
    const bare = [...code.matchAll(/await req\.json\(\)/g)].length;
    const inside = [...code.matchAll(/applyFeatureConsent\([^)]*await req\.json\(\)/g)].length;
    expect(bare).toBe(inside);
  });
});

describe('withHealthConsent stamps the flag the server reads', () => {
  afterEach(() => {
    mockConsent.value = true;
  });

  it('sends the health fields when the toggle is on', () => {
    mockConsent.value = true;
    const out = withHealthConsent('aimee-plan', { ...BODIES['aimee-plan'] }) as any;
    expect(out.hasConsent).toBe(true);
    expect(out.allergens).toEqual(['dairy']);
  });

  it.each(Object.keys(BODIES))('%s sends no health field when the toggle is off', (fn) => {
    mockConsent.value = false;
    const out = withHealthConsent(fn, { ...BODIES[fn] }) as any;
    expect(out.hasConsent).toBe(false);
    for (const field of SERVER_FIELDS[fn]) expect(out).not.toHaveProperty(field);
  });

  it('keeps the non-health fields so the feature still works', () => {
    mockConsent.value = false;
    const out = withHealthConsent('aimee-plan', { ...BODIES['aimee-plan'] }) as any;
    expect(out.days).toBe(5);
    expect(out).not.toHaveProperty('allergens');
    expect(out).not.toHaveProperty('goals');
    expect(out).not.toHaveProperty('dietType');
  });

  it('healthConsentGranted follows the toggle', () => {
    mockConsent.value = false;
    expect(healthConsentGranted()).toBe(false);
    mockConsent.value = true;
    expect(healthConsentGranted()).toBe(true);
  });
});
