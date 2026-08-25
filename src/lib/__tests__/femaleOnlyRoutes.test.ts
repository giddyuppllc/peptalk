/**
 * Menstrual-cycle tracking must not be reachable from a male profile.
 *
 * Edward's requirement: "no male ever sees the female layout, no female sees
 * the male layout." The visual half of that was already correct — useTheme
 * derives the palette from onboarding gender. The CONTENT half was not: the
 * "Cycle tracking" row rendered for every authenticated user, and none of the
 * four app/cycle screens checked gender at all.
 *
 * Hiding the row alone is not enough, which is why the guard sits on the
 * destination: `/cycle` is in both Aimee nav allowlists and is a plain deep
 * link, so an entry-point-only gate leaves the surface reachable by anyone who
 * arrives another way.
 *
 * The nav allowlist is deliberately left untouched — it is a pure function so
 * the app and `npm run verify:aimee` evaluate identical code, and reading a
 * store from it would break that for both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isFemaleOnlyRouteAllowed } from '../femaleOnlyRoute';

const ROOT = path.join(__dirname, '..', '..', '..');
const CYCLE_SCREENS = ['index.tsx', 'log.tsx', 'setup.tsx', 'history.tsx'];

describe('isFemaleOnlyRouteAllowed', () => {
  it('allows a female profile', () => {
    expect(isFemaleOnlyRouteAllowed('Female')).toBe(true);
  });

  it('denies a male profile', () => {
    expect(isFemaleOnlyRouteAllowed('Male')).toBe(false);
  });

  it('denies an unset profile, matching how useTheme resolves null', () => {
    expect(isFemaleOnlyRouteAllowed(null)).toBe(false);
    expect(isFemaleOnlyRouteAllowed(undefined)).toBe(false);
  });

  it('denies by default rather than matching loosely', () => {
    // A case-insensitive or truthy check would let these through.
    for (const v of ['female', 'FEMALE', 'f', true, 1, {}, 'Male ']) {
      expect(isFemaleOnlyRouteAllowed(v)).toBe(false);
    }
  });
});

describe('every cycle screen is guarded at the destination', () => {
  it.each(CYCLE_SCREENS)('app/cycle/%s wraps its default export', (file) => {
    const src = fs.readFileSync(path.join(ROOT, 'app', 'cycle', file), 'utf8');
    // Guards against passing vacuously if a screen is emptied or moved.
    expect(src.length).toBeGreaterThan(500);
    expect(src).toMatch(/export default withFemaleOnly\(\w+\);/);
    // The screen must NOT also export an unguarded component as default.
    expect(src).not.toMatch(/export default function/);
  });
});

describe('the Profile entry point is gender-conditional', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', '(tabs)', 'profile.tsx'), 'utf8');

  it('is the file we think it is', () => {
    expect(src).toMatch(/label="Cycle tracking"/);
  });

  it('renders the Cycle tracking row only for a female profile', () => {
    // Anchor on the JSX row, not the string — a prose comment mentioning
    // "Cycle tracking" appears earlier in the file and matched first.
    const i = src.indexOf('label="Cycle tracking"');
    // The conditional must sit in the ~400 chars immediately before the row,
    // not merely somewhere in a 1500-line file.
    expect(src.slice(Math.max(0, i - 400), i)).toMatch(/profileGender === 'Female'/);
  });
});

describe('the guard waits for store hydration before deciding', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'withFemaleOnly.tsx'), 'utf8');

  it('reads hasHydrated', () => {
    // useOnboardingStore persists through async storage, so gender is null for
    // the first frames of a cold start no matter who the user is. Deciding
    // then would bounce a FEMALE user out of her own cycle tracker.
    expect(src).toMatch(/hasHydrated/);
  });

  it('does not redirect before hydration completes', () => {
    expect(src).toMatch(/if \(!hasHydrated \|\| allowed\) return;/);
  });

  it('renders nothing rather than the screen while unhydrated', () => {
    expect(src).toMatch(/if \(!hasHydrated \|\| !allowed\) return null;/);
  });
});
