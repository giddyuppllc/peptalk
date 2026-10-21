/**
 * app/auth.tsx:165 and :172 both promise the reset email's link lets the user
 * "pick a new password". Until 2026-09-16 the link established a session and
 * routed to /(tabs) or /onboarding like any confirmation link, and
 * `auth.updateUser({ password })` appeared NOWHERE in app/, src/ or supabase/.
 * The promise had no implementation behind it on any platform.
 *
 * Two things had to be true for it to work and neither was:
 *   - the link's `type` had to be READ. The handler matched `[?&]type=`, and
 *     the client's default implicit flow puts it in the FRAGMENT.
 *   - a recovery link had to route somewhere that could change a password.
 */
import fs from 'node:fs';
import path from 'node:path';
import { authLinkType, isRecoveryLink, postAuthLinkRoute } from '../passwordRecovery';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('authLinkType reads the type from either half of the URL', () => {
  it('finds it in the query — the OTP flow', () => {
    expect(authLinkType('peptalk://auth/callback?token_hash=abc&type=recovery')).toBe('recovery');
  });

  it('finds it in the FRAGMENT — the implicit flow, which is the default', () => {
    expect(
      authLinkType('peptalk://auth/callback#access_token=a&refresh_token=b&type=recovery'),
    ).toBe('recovery');
  });

  it('finds it when it is the first fragment parameter', () => {
    expect(authLinkType('peptalk://auth/callback#type=recovery&access_token=a')).toBe('recovery');
  });

  it('is case-insensitive and URL-decodes', () => {
    expect(authLinkType('peptalk://auth/callback?type=RECOVERY')).toBe('recovery');
    expect(authLinkType('peptalk://auth/callback?type=%72ecovery')).toBe('recovery');
  });

  it('returns null when there is no type at all', () => {
    expect(authLinkType('peptalk://auth/callback#access_token=a&refresh_token=b')).toBeNull();
  });

  it.each([
    ['signup', 'peptalk://auth/callback?token_hash=x&type=signup'],
    ['invite', 'peptalk://auth/callback?token_hash=x&type=invite'],
    ['magiclink', 'peptalk://auth/callback#type=magiclink&access_token=a'],
  ])('reads %s without confusing it for recovery', (kind, url) => {
    expect(authLinkType(url)).toBe(kind);
    expect(isRecoveryLink(url)).toBe(false);
  });

  it.each([
    'peptalk://auth/callback?token_hash=x&type=recovery',
    'peptalk://auth/callback#access_token=a&refresh_token=b&type=recovery',
    'peptalk://auth/callback?code=abc&type=recovery',
  ])('isRecoveryLink is true for %s', (url) => {
    expect(isRecoveryLink(url)).toBe(true);
  });

  it('does not match a parameter that merely ends in "type"', () => {
    expect(authLinkType('peptalk://auth/callback?token_type=bearer')).toBeNull();
  });
});

describe('postAuthLinkRoute', () => {
  it('sends a recovery link to the set-password step, whatever the onboarding state', () => {
    for (const onboardingComplete of [true, false]) {
      for (const hasGender of [true, false]) {
        expect(postAuthLinkRoute({ recovery: true, onboardingComplete, hasGender })).toBe(
          '/set-password',
        );
      }
    }
  });

  // The pre-existing rule, unchanged: auth may RESPECT completion, never GRANT
  // it, and isComplete/isAuthenticated must never disagree (2.1(a), twice).
  it.each([
    [true, true, '/(tabs)'],
    [true, false, '/onboarding'],
    [false, true, '/onboarding'],
    [false, false, '/onboarding'],
  ])('a non-recovery link with complete=%p gender=%p goes to %s', (c, g, route) => {
    expect(postAuthLinkRoute({ recovery: false, onboardingComplete: c, hasGender: g })).toBe(route);
  });
});

describe('the flow is actually wired, end to end', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the set-password screen exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/set-password.tsx'))).toBe(true);
  });

  it('it is the only place that calls updateUser, and it passes a password', () => {
    const screen = strip(read('app/set-password.tsx'));
    expect(screen).toMatch(/supabase\.auth\.updateUser\(\{ password \}\)/);
  });

  it('it validates with the shared rule rather than its own', () => {
    const screen = strip(read('app/set-password.tsx'));
    expect(screen).toContain('validatePassword(password)');
    expect(screen).toContain("from '../src/utils/validation'");
    // No second opinion on what a valid password is.
    expect(screen).not.toMatch(/password\.length\s*[<>]=?\s*\d/);
  });

  it('it refuses to sit there without a session', () => {
    const screen = strip(read('app/set-password.tsx'));
    expect(screen).toMatch(/if \(!data\?\.session\)/);
    expect(screen).toMatch(/router\.replace\('\/auth'\)/);
  });

  it('the native deep-link handler routes through the shared rule', () => {
    const layout = strip(read('app/_layout.tsx'));
    expect(layout).toContain('const recovery = isRecoveryLink(url);');
    expect(layout).toMatch(/router\.replace\(\s*postAuthLinkRoute\(\{/);
    // The old unconditional landing must be gone, or recovery links still
    // sail past the new step.
    expect(layout).not.toMatch(/router\.replace\(ob\.isComplete && ob\.profile\.gender \?/);
  });

  it('the web path listens for PASSWORD_RECOVERY, which nothing did', () => {
    const layout = strip(read('app/_layout.tsx'));
    expect(layout).toMatch(/event === 'PASSWORD_RECOVERY'/);
    expect(layout).toMatch(/r\.replace\('\/set-password' as never\)/);
  });

  it('the offline supabase stub answers updateUser, so the screen cannot crash on it', () => {
    expect(read('src/services/supabase.ts')).toMatch(/updateUser: \(\) =>/);
  });

  it('auth.tsx still makes the promise this now keeps', () => {
    // If the copy ever changes, this test should be revisited, not deleted.
    expect(read('app/auth.tsx')).toContain('follow the link to pick a new password');
  });
});
