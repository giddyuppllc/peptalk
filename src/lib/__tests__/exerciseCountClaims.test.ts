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
