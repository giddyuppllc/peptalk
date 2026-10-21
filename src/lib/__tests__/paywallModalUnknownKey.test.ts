/**
 * PaywallModal.getRequiredTier used to answer 'free' for a key NO tier grants.
 *
 * That is not a fallback, it is a false statement: the modal rendered
 * "Available with Free ($0)" and "Upgrade to Free" over a gate that no
 * purchase can open, and the user — including a paying one — was stuck behind
 * it. Seven FEATURE_META rows (calendar, workout_programs, exercise_library,
 * ai_meal_plans, nutrition_planning, grocery_from_plans, meal_plan) were in
 * exactly that state, left behind when d9859bc removed their keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getRequiredTier } from '../../components/PaywallModal';
import { TIER_FEATURES } from '../../types/fitness';

// PaywallModal pulls the subscription store and analyticsEvents, both of which
// reach secureStorage → AsyncStorage, whose native module does not exist under
// jest. Only the pure getRequiredTier is under test here, so use the library's
// own jest mock rather than booting a persistence layer.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ROOT = path.join(__dirname, '..', '..', '..');
const MODAL = path.join(ROOT, 'src/components/PaywallModal.tsx');

const source = () =>
  fs.readFileSync(MODAL, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function featureMetaKeys(): string[] {
  const block = source().match(/const FEATURE_META[^=]*=\s*\{([\s\S]*?)\n\};/);
  expect(block).not.toBeNull();
  return [...block![1].matchAll(/^ {2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

describe('getRequiredTier', () => {
  it('returns the MINIMUM tier that grants the key', () => {
    expect(getRequiredTier('peptide_library')).toBe('free');
    expect(getRequiredTier('lab_scan')).toBe('plus');
    expect(getRequiredTier('recipe_generator')).toBe('pro');
  });

  // PRO_FEATURES spreads PLUS_FEATURES, so a pro-first walk matched 'pro' on
  // the first step for EVERY granted key and this modal demanded Pro for a
  // Plus feature.
  it.each(['lab_scan', 'meal_scan', 'ad_free', 'community_live_chat'])(
    '"%s" is a Plus feature and does not demand Pro',
    (key) => {
      expect(TIER_FEATURES.plus).toContain(key);
      expect(getRequiredTier(key)).toBe('plus');
    },
  );

  it('never names a tier that does not actually grant the key', () => {
    for (const key of Object.values(TIER_FEATURES).flat()) {
      const answer = getRequiredTier(key);
      expect(answer).not.toBeNull();
      expect(TIER_FEATURES[answer!]).toContain(key);
    }
  });

  it('agrees with the subscription screen about which plan to highlight', () => {
    // app/subscription.tsx tierForFeature(): Plus first, then Pro. The modal
    // said Pro for every key, so it sent users to a screen highlighting Plus.
    const tierForFeature = (f: string) =>
      TIER_FEATURES.plus.includes(f) ? 'plus' : TIER_FEATURES.pro.includes(f) ? 'pro' : 'plus';
    for (const key of [...TIER_FEATURES.plus, ...TIER_FEATURES.pro]) {
      const modal = getRequiredTier(key);
      const screen = tierForFeature(key);
      // Free keys are the one legitimate difference: the screen folds them
      // into Plus for highlighting; the modal names Free and never renders,
      // because a Free key never blocks anyone.
      if (TIER_FEATURES.free.includes(key)) continue;
      expect(modal).toBe(screen);
    }
  });

  it.each([
    'workout_programs',
    'exercise_library',
    'meal_plan',
    'research_feed_premium',
    'not_a_real_feature',
    '',
  ])('returns null for "%s", which no tier grants', (key) => {
    expect(getRequiredTier(key)).toBeNull();
  });

  it('never claims Free for a key Free does not carry', () => {
    for (const key of ['recipe_generator', 'lab_scan', 'not_a_real_feature']) {
      const answer = getRequiredTier(key);
      if (answer === 'free') expect(TIER_FEATURES.free).toContain(key);
    }
  });
});

describe('FEATURE_META carries no dead rows', () => {
  const granted = new Set(Object.values(TIER_FEATURES).flat());
  const keys = featureMetaKeys();

  it('parsed a real table, so this is not a vacuous pass', () => {
    expect(keys.length).toBeGreaterThanOrEqual(20);
    expect(keys).toContain('recipe_generator');
  });

  it.each(featureMetaKeys())('"%s" is granted by at least one tier', (key) => {
    expect(granted.has(key)).toBe(true);
  });

  it.each([
    'calendar',
    'workout_programs',
    'exercise_library',
    'ai_meal_plans',
    'nutrition_planning',
    'grocery_from_plans',
    'meal_plan',
  ])('the dead row "%s" is gone', (key) => {
    expect(keys).not.toContain(key);
  });
});

describe('the modal refuses to render an unsatisfiable gate', () => {
  const code = source();

  it('bails out of render when no tier grants the key', () => {
    expect(code).toMatch(/if \(requiredTier === null\) return null;/);
  });

  it('is loud about it rather than silent', () => {
    expect(code).toMatch(/if \(__DEV__\) throw err;/);
    expect(code).toMatch(/captureException\(err, \{ feature \}\)/);
  });

  it('never prints a tier label without having checked for null first', () => {
    const renderStart = code.indexOf('if (requiredTier === null) return null;');
    expect(renderStart).toBeGreaterThan(-1);
    const before = code.slice(0, renderStart);
    expect(before).not.toMatch(/TIER_LABELS\[requiredTier\]/);
    expect(before).not.toMatch(/TIER_PRICES\[requiredTier\]/);
  });
});
