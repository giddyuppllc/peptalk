/**
 * Every feature a screen gates on must exist in some tier.
 *
 * computeFeatureAccess returns false for a name no tier lists, for every
 * tier. On 2026-09-07 'meal_plan' and 'exercise_library' were removed from the
 * tier lists while app/nutrition/meal-plan.tsx and app/workouts/exercises.tsx
 * still gated on them, so both screens were paywalled for every user —
 * paying Pro subscribers included — for two months.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { TIER_FEATURES } from '../../types/fitness';

const ROOT = join(__dirname, '..', '..', '..');
const PATTERNS = [
  /PaywallGate\s+feature="([a-z_]+)"/g,
  /useFeatureGate\('([a-z_]+)'\)/g,
  /hasFeature\('([a-z_]+)'\)/g,
  /setPaywallFeature\('([a-z_]+)'\)/g,
];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe('feature gates', () => {
  it('every gated feature name is granted by at least one tier', () => {
    const known = new Set(Object.values(TIER_FEATURES).flat());
    const used = new Map<string, string>();
    for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]) {
      const src = readFileSync(f, 'utf8');
      for (const re of PATTERNS) for (const m of src.matchAll(re)) used.set(m[1], f.replace(ROOT + '/', ''));
    }
    expect(used.size).toBeGreaterThan(5); // the scan actually found the gates
    const orphans = [...used].filter(([name]) => !known.has(name)).map(([n, f]) => `${n} (${f})`);
    expect(orphans).toEqual([]);
  });

  it('the AI meal plan screen is open to Pro, the exercise library to everyone', () => {
    expect(TIER_FEATURES.pro).toContain('aimee_meal_plans');
    const ex = readFileSync(join(ROOT, 'app/workouts/exercises.tsx'), 'utf8');
    expect(ex).not.toMatch(/PaywallGate/);
  });
});
