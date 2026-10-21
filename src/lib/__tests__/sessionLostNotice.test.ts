/**
 * The 2.1(a) death loop has to explain itself.
 *
 * Two App Review rejections were "sent back to the login page after logging
 * in", and both times every individual step was correct: the session failed to
 * persist, getSession() found nothing, the store cleared the user, and the
 * route guard sent a signed-out visitor to /auth. The loop was silent because
 * no step owned saying so.
 *
 * These lock down the two halves of the fix: the copy says the right thing for
 * the right cause, and the wiring that carries it actually exists end to end.
 */

import fs from 'fs';
import path from 'path';
import { sessionLostNotice, shouldShowSessionLost } from '../sessionLostNotice';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('shouldShowSessionLost', () => {
  it('says nothing on a cold start with nobody signed in', () => {
    expect(shouldShowSessionLost(null)).toBe(false);
  });

  it('says nothing for a zero or negative timestamp', () => {
    // A falsy-but-present value is the shape a half-initialised store produces;
    // rendering an alarming banner off it would be worse than staying quiet.
    expect(shouldShowSessionLost(0)).toBe(false);
    expect(shouldShowSessionLost(-1)).toBe(false);
  });

  it('speaks up once a session has actually been lost', () => {
    expect(shouldShowSessionLost(Date.now())).toBe(true);
  });
});

describe('sessionLostNotice', () => {
  it('names the cause when we actually know it', () => {
    const n = sessionLostNotice(false);
    expect(n.body).toMatch(/private browsing|site data/i);
    expect(n.willRecur).toBe(true);
  });

  it('does not invent a cause when we do not know it', () => {
    // Telling someone their browser blocks storage when it does not sends them
    // to change a setting that was never the problem.
    const n = sessionLostNotice(true);
    expect(n.body).not.toMatch(/private browsing|site data|incognito/i);
    expect(n.willRecur).toBe(false);
  });

  it('gives a way out when the cause is unknown', () => {
    expect(sessionLostNotice(true).body).toContain('support@peptalk.bio');
  });

  it('never blames the user', () => {
    for (const healthy of [true, false]) {
      const n = sessionLostNotice(healthy);
      expect(`${n.title} ${n.body}`).not.toMatch(/you (did|must have|should have|forgot)/i);
    }
  });

  it('is honest that signing in again will not stick when it will not', () => {
    const blocked = sessionLostNotice(false);
    expect(blocked.body).toMatch(/signed out when the app\s+reloads|until/i);
    // …and does not promise it will hold, which is the claim that would send
    // someone round the loop a third time expecting a different result.
    expect(blocked.body).not.toMatch(/should hold/i);
  });
});

describe('the notice is wired from the failure to the screen', () => {
  it('the store records the loss only for a session it was holding', () => {
    const src = read('src/store/useAuthStore.ts');
    // `hadUser` is the distinction that matters: a cold start with nobody
    // signed in is not a failure and must not accuse itself of one.
    expect(src).toContain('sessionLostAt: hadUser ? Date.now() : null');
  });

  it('a deliberate sign-out clears it, and a login does not', () => {
    const src = read('src/store/useAuthStore.ts');
    const logoutAt = src.indexOf('logout: async () => {');
    expect(logoutAt).toBeGreaterThan(-1);
    expect(src.slice(logoutAt)).toContain('sessionLostAt: null');

    // In the loop this exists to explain, the login SUCCEEDS and the session is
    // gone again moments later. Clearing on the way in erases the message on
    // the way out.
    //
    // Asserted by enumerating every mention rather than by slicing a window
    // around `login:` — the first draft did that and the window ran on into
    // the session-restore function, which legitimately sets the field. The
    // whole file should mention it exactly four times, and each one is named:
    const mentions = src.match(/sessionLostAt/g) ?? [];
    expect(mentions).toHaveLength(4);
    expect(src).toContain('sessionLostAt: number | null;'); //  1. declared
    expect(src.split('sessionLostAt: null,')).toHaveLength(3); //  2. default, 4. cleared on logout
    expect(src).toContain('sessionLostAt: hadUser ? Date.now() : null'); // 3. set on loss
  });

  it('is never persisted — it describes this launch, not last week', () => {
    const src = read('src/store/useAuthStore.ts');
    const at = src.indexOf('partialize: (state) => ({');
    const block = src.slice(at, at + 300);
    expect(block).not.toContain('sessionLostAt');
  });

  it('the persistence flag is observable, not just readable', () => {
    // A plain boolean read is no use to a screen: the flip happens inside a
    // storage write, long after the component rendered.
    const src = read('src/services/supabase.ts');
    expect(src).toContain('export function subscribeSessionPersistence');
    // Every write goes through the setter, or listeners silently stop firing.
    const bareAssignments = (src.match(/^\s+sessionPersistOk = (true|false);/gm) ?? []).filter(
      (line) => !line.includes('next'),
    );
    expect(bareAssignments).toEqual([]);
  });

  it('the auth screen subscribes and renders it', () => {
    const src = read('app/auth.tsx');
    expect(src).toContain('subscribeSessionPersistence(setPersistHealthy)');
    expect(src).toContain('shouldShowSessionLost(sessionLostAt)');
    expect(src).toMatch(/\{lostNotice && \(/);
  });

  it('renders on both the login and the sign-up tab', () => {
    // They are separate branches of the same screen. The guard sends a signed
    // -out visitor to /auth without choosing a tab for them.
    const src = read('app/auth.tsx');
    expect(src.split('{lostNotice && (').length - 1).toBe(2);
  });

  it('does not soften the redirect that the loop is made of', () => {
    // Letting an unverifiable session through would trade a confusing screen
    // for a real hole — the one closed on 2026-09-12. Rule 3 stays exactly as
    // it is; only the silence is fixed.
    const guard = read('src/lib/routeGuard.ts');
    expect(guard).toContain("if (!s.isAuthenticated) {");
    expect(guard).toContain("return s.inAuth || s.inOnboarding ? null : '/auth';");
    expect(guard).not.toContain('sessionLost');
  });
});
