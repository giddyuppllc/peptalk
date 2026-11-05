/**
 * Web (Square) subscribers must be able to cancel from the PWA. On web,
 * "Manage Subscription" used to open Google Play, and no Square cancel path
 * existed. These hold the wiring in place.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('web subscription cancel', () => {
  it('Manage Subscription handles web before any store URL', () => {
    const src = read('app/subscription.tsx');
    const fn = src.slice(src.indexOf('async function openManageSubscriptions('));
    const webIdx = fn.indexOf("Platform.OS === 'web'");
    const playIdx = fn.indexOf('play.google.com');
    expect(webIdx).toBeGreaterThan(-1);
    expect(webIdx).toBeLessThan(playIdx);
    expect(src).toContain('cancelWebSubscription');
  });

  it('square-cancel only cancels the caller\'s own web rows, from the JWT', () => {
    const src = read('supabase/functions/square-cancel/index.ts');
    expect(src).toContain("auth.getUser()");
    expect(src).toContain(".eq('user_id', user.id)");
    expect(src).toContain(".eq('platform', 'web')");
    expect(src).toMatch(/\/v2\/subscriptions\/\$\{encodeURIComponent\(row\.original_transaction_id\)\}\/cancel/);
    // No user id is read from the request body.
    expect(src).not.toMatch(/req\.json\(\)/);
  });

  it('the client service calls square-cancel and is web-only', () => {
    const src = read('src/services/squareService.ts');
    expect(src).toContain("functions.invoke('square-cancel'");
    expect(src).toContain("Platform.OS !== 'web'");
  });
});
