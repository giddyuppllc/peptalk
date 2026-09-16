/**
 * Paywall copy sold "Jamie's 451-exercise library" while the library the
 * workout generator draws from held 384 (2.3 / 3.1.2: a paid claim that does
 * not match the app). The number is now derived from EXERCISES, the way
 * PEPTIDES.length already is. This keeps a typed count from coming back on any
 * user-facing surface.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXERCISES } from '../../data/exercises';

const ROOT = path.join(__dirname, '..', '..', '..');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// "451-exercise", "451 exercises", "384+ exercises" typed as a literal.
const TYPED_COUNT = /\b\d{2,4}\+?[- ]exercises?\b/i;

describe('exercise counts on user-facing surfaces are derived, not typed', () => {
  it('the library is non-trivial (the scan below is not vacuous)', () => {
    expect(EXERCISES.length).toBeGreaterThan(100);
  });

  it('PaywallModal derives the count from EXERCISES', () => {
    const code = strip(fs.readFileSync(path.join(ROOT, 'src', 'components', 'PaywallModal.tsx'), 'utf8'));
    expect(code).toContain('${EXERCISES.length}-exercise library');
    expect(code).not.toMatch(TYPED_COUNT);
  });

  it('no screen or component types an exercise count', () => {
    const offenders: string[] = [];
    let scanned = 0;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) {
          scanned++;
          if (TYPED_COUNT.test(strip(fs.readFileSync(p, 'utf8')))) offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'src', 'components'));
    expect(scanned).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});

/**
 * The same number also sat in four INTERNAL docstrings — exercises.ts said 436,
 * workoutPrograms.ts and videoService.ts said 451, app/workouts/new.tsx said
 * 436, against a real EXERCISES.length. The scan above could not see any of
 * them: it strips comments, and three of the four live outside app/ and
 * src/components/. A stale docstring is the number the next person types into
 * copy, so it is worth the same guard.
 *
 * The fix was to DELETE the counts rather than refresh them — a number in a
 * comment cannot be derived, so it can only go stale again. This asserts they
 * stay deleted.
 */
describe('internal docstrings do not restate the library size', () => {
  const INTERNAL = [
    'src/data/exercises.ts',
    'src/data/workoutPrograms.ts',
    'src/services/videoService.ts',
    'app/workouts/new.tsx',
  ];

  // Comments are NOT stripped — they are the thing under test. Matches
  // "436-exercise library", "451 exercises", "436 unique entries". Deliberately
  // does NOT match a bare "N entries": videoService's alias index says "40 of
  // the 142 entries in EXERCISE_VIDEO_SLUG_MAP", which counts the MAP and is
  // checked against the map by the alias tests, not a library claim.
  const LIBRARY_CLAIM = /\b\d{2,4}\+?-exercises?\b|\b\d{2,4}\+? exercises\b|\b\d{2,4}\+? unique entries\b/gi;

  it.each(INTERNAL)('%s names no exercise count', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = [...src.matchAll(LIBRARY_CLAIM)];
    // videoService's auto-regeneration banner ("141 exercises × 292 takes") is
    // written by scripts/regen-video-service-maps.mjs from the map itself, so
    // it is rewritten whenever the data changes and cannot drift.
    const stale = hits
      .filter((m) => !/^\d+ exercises × \d+ takes/.test(src.slice(m.index ?? 0, (m.index ?? 0) + 40)))
      .map((m) => m[0]);
    expect(stale).toEqual([]);
  });

  it('the matcher still recognises the counts that were there (not a dead regex)', () => {
    const wasThere = ['436-exercise library', '451-exercise library', '436 unique entries', '97 exercises mapped'];
    for (const s of wasThere) expect(s).toMatch(new RegExp(LIBRARY_CLAIM.source, 'i'));
    expect('40 of the 142 entries in EXERCISE_VIDEO_SLUG_MAP').not.toMatch(
      new RegExp(LIBRARY_CLAIM.source, 'i'),
    );
  });

  it('the scan actually read those files', () => {
    for (const rel of INTERNAL) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8').length).toBeGreaterThan(500);
    }
  });
});

/**
 * Aimee was told the library held 451 exercises (and, in the dev fallback
 * prompt, 289) while it holds EXERCISES.length. The edge function cannot import
 * src/data without dragging app code into a Deno bundle, so these prompts carry
 * a literal, and this pins every literal to the real count.
 */
describe('model-facing exercise counts match EXERCISES.length', () => {
  const MODEL_FACING = [
    'supabase/functions/aimee-chat-stream/_prompt.ts',
    'supabase/functions/aimee-chat-stream/_tools.ts',
    'src/services/llmService.ts',
  ];
  // Prose, so comments are NOT stripped: the prompt text lives in strings.
  const COUNT = /\b(\d{2,4})\+?(?:-exercise\b| exercises\b)/g;

  it.each(MODEL_FACING)('%s states the real count, and only the real count', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const counts = [...src.matchAll(COUNT)].map((m) => Number(m[1]));
    expect(counts.length).toBeGreaterThan(0);
    expect(counts).toEqual(counts.map(() => EXERCISES.length));
  });
});
