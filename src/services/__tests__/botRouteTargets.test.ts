/**
 * Every route the local bot offers must exist.
 *
 * Four Aimee action buttons pushed `/(tabs)/index` — including the one on the
 * DEFAULT intent, so any unclassified message showed it. In Expo Router an
 * `index.tsx` maps to the EMPTY path segment, so `/(tabs)/index` is not a
 * route: tapping "Browse Peptides" landed the user on +not-found. The rest of
 * the app had always used `/(tabs)`.
 *
 * It survived because the repo's route scanner only checks the reverse
 * direction — "is every screen linked from somewhere" — and treats any
 * `/`-prefixed string literal as a link. NOTHING validated that a push target
 * resolves to a real screen. This does.
 */
import fs from 'node:fs';
import path from 'node:path';

const APP_DIR = path.join(__dirname, '..', '..', '..', 'app');
const BOT_FILE = path.join(__dirname, '..', 'peptalkBot.ts');

/** Every URL path Expo Router will serve, in both group-qualified and bare form. */
function buildValidPaths(): Set<string> {
  const valid = new Set<string>(['/']);

  const walk = (dir: string, rel: string[] = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('+')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, [...rel, entry.name]);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;

      const base = entry.name.replace(/\.tsx?$/, '');
      const segs = base === 'index' ? [...rel] : [...rel, base];

      // Expo Router addresses a group either way: /(tabs)/calendar and
      // /calendar both resolve. Register both so neither reads as broken.
      const withGroups = '/' + segs.join('/');
      const withoutGroups = '/' + segs.filter((s) => !/^\(.+\)$/.test(s)).join('/');
      valid.add(withGroups.replace(/\/+$/, '') || '/');
      valid.add(withoutGroups.replace(/\/+$/, '') || '/');
    }
  };
  walk(APP_DIR);
  return valid;
}

/** A dynamic route like /peptide/[id] matches /peptide/anything. */
function matches(target: string, valid: Set<string>): boolean {
  if (valid.has(target)) return true;
  const tSegs = target.split('/').filter(Boolean);
  for (const v of valid) {
    const vSegs = v.split('/').filter(Boolean);
    if (vSegs.length !== tSegs.length) continue;
    if (vSegs.every((s, i) => /^\[.+\]$/.test(s) || s === tSegs[i])) return true;
  }
  return false;
}

const VALID = buildValidPaths();
const source = fs.readFileSync(BOT_FILE, 'utf8');

// Static route literals the bot hands to router.push. Template literals
// (`/peptide/${id}`) are excluded — their shape is covered by the dynamic
// match above and their value isn't knowable statically.
const targets = [...source.matchAll(/route:\s*'([^']+)'/g)]
  .map((m) => m[1])
  .filter((r) => !r.includes('${'));

describe('bot action routes', () => {
  it('finds the route literals it is supposed to check', () => {
    // Guards against this test silently passing on an empty set if the shape
    // of peptalkBot.ts ever changes.
    expect(targets.length).toBeGreaterThan(10);
    expect(VALID.size).toBeGreaterThan(50);
  });

  it('resolves every static bot route to a real screen', () => {
    const broken = targets.filter((t) => !matches(t.split('?')[0], VALID));
    expect(broken).toEqual([]);
  });

  it('rejects a route that does not exist (the check is real)', () => {
    expect(matches('/(tabs)/index', VALID)).toBe(false);
    expect(matches('/definitely/not/a/screen', VALID)).toBe(false);
  });

  it('accepts the forms the app actually uses', () => {
    expect(matches('/(tabs)', VALID)).toBe(true);
    expect(matches('/doses/library', VALID)).toBe(true);
    expect(matches('/(tabs)/check-in', VALID)).toBe(true);
    expect(matches('/peptide/bpc-157', VALID)).toBe(true); // dynamic [id]
  });
});
