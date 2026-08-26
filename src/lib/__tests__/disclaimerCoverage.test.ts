/**
 * Every surface presenting dosing, lab or clinical content carries a disclaimer.
 *
 * PepTalk is a peptide app: Apple's physical-harm guideline and Google's health
 * policy both look for this, and a screen showing a dose range without one is
 * the kind of gap a reviewer finds by opening the app rather than by reading a
 * declaration.
 *
 * The WORDING is not written here. Each screen renders the shared Disclaimer
 * component, which carries the app's three existing approved variants —
 * default (SHORT_DISCLAIMER), dosing, and safety. No new copy was introduced;
 * placement was the gap, not language.
 *
 * calculators/reconstitution.tsx is deliberately in the second list: it already
 * had its own inline wording ("informational purposes only… follow your
 * healthcare provider's instructions"). The first audit missed it because the
 * pattern looked for "educational purposes" and "not medical advice" — a
 * coverage check is only ever as good as its pattern, so this pins the screen
 * rather than the phrasing.
 *
 * Assertions use plain string matching on purpose. An earlier version built
 * these with `new RegExp` inside template literals and the escaping collapsed,
 * producing a pattern that matched nothing while looking correct.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Screens that must render the shared component, with the variant each needs. */
const COMPONENT_SCREENS: [string, string][] = [
  ['app/doses/library.tsx', 'dosing'],
  ['app/doses/side-effects.tsx', 'safety'],
  ['app/doses/tracker.tsx', 'dosing'],
  ['app/health-report/labs.tsx', 'default'],
  ['app/aimee/report/[id].tsx', 'default'],
  ['app/cycle/index.tsx', 'default'],
];

/** Screens carrying their own inline wording that predates the component. */
const INLINE_SCREENS = ['app/calculators/reconstitution.tsx'];

describe('clinical surfaces carry a disclaimer', () => {
  it.each(COMPONENT_SCREENS)('%s renders the %s variant', (file, variant) => {
    const src = read(file);
    // Guards against passing vacuously if a screen is emptied or moved.
    expect(src.length).toBeGreaterThan(400);
    expect(src).toContain(`<Disclaimer variant="${variant}" />`);
    expect(src).toContain('components/Disclaimer');
  });

  it.each(INLINE_SCREENS)('%s keeps its own inline disclaimer', (file) => {
    const src = read(file);
    expect(src).toContain('informational purposes only');
    expect(src.toLowerCase()).toContain('healthcare');
  });
});

describe('the shared component still carries all three variants', () => {
  const src = read('src/components/Disclaimer.tsx');

  it('is the file we think it is', () => {
    expect(src).toContain('SHORT_DISCLAIMER');
    expect(src).toContain('VARIANT_TEXT');
  });

  it.each(['default', 'dosing', 'safety'])('defines the %s variant', (v) => {
    expect(src).toContain(`${v}:`);
  });

  it('no variant resolves to something empty', () => {
    // A blank variant renders an invisible disclaimer — present in the tree,
    // useless to a reviewer and to a user.
    const block = src.slice(
      src.indexOf('VARIANT_TEXT'),
      src.indexOf('export const Disclaimer'),
    );
    expect(block).toContain('Consult your healthcare provider');
    expect(block.length).toBeGreaterThan(200);
  });
});
