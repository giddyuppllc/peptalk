import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/*
 * Every persisted store holds per-user data unless it is listed here as
 * device-level. Sign-out must wipe the rest — four were missed (side effects,
 * body-composition scans, AI consent, community prefs), so the next person to
 * sign in on a shared device saw the previous user's health data and inherited
 * their AI consent. A new persisted store now fails this test until it is
 * either wiped at logout or added below with a reason.
 */
const DEVICE_LEVEL: Record<string, string> = {
  useAuthStore: 'the store doing the logout; it resets itself',
  useThemeStore: 'light/dark preference belongs to the device',
  useVideoTaggerStore: 'admin-only workout video tagging tool, no user health data',
};

const STORE_DIR = join(__dirname, '..');

test('sign-out wipes every persisted per-user store', () => {
  const auth = readFileSync(join(STORE_DIR, 'useAuthStore.ts'), 'utf8');
  const logout = auth.slice(auth.indexOf('logout: async'));
  const persisted = readdirSync(STORE_DIR)
    .filter((f) => /^use[A-Za-z]+Store\.ts$/.test(f))
    .map((f) => f.replace(/\.ts$/, ''))
    .filter((name) => /\bpersist\(/.test(readFileSync(join(STORE_DIR, `${name}.ts`), 'utf8')));
  expect(persisted.length).toBeGreaterThan(10);
  const notWiped = persisted.filter(
    (name) => !(name in DEVICE_LEVEL) && !new RegExp(`\\b${name}\\b`).test(logout),
  );
  expect(notWiped).toEqual([]);
});
