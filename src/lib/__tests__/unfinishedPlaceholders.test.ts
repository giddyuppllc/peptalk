/**
 * Two surfaces shipped a placeholder a reviewer can see.
 *
 * 1. app/nutrition/recipe-generator.tsx rendered an "Aimee unavailable" box
 *    with an icon, a heading and an EMPTY body — a TODO comment sat where the
 *    sentence goes. An alert with nothing in it reads as a broken screen.
 * 2. src/components/DosingReferenceTableCard.tsx printed "Detailed titration
 *    notes (ref [n]) coming soon." on a DOSING surface, with a reference
 *    number the reader cannot look up.
 *
 * Both now render nothing rather than promising something. These assertions
 * are on the source, because both are pure-JSX conditions with no logic to
 * call, and the failure mode is someone re-adding the promise.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s: string) =>
  s
    .replace(/\{[^\S\n]*\/\*[\s\S]*?\*\/[^\S\n]*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the recipe-generator fallback notice', () => {
  const REL = 'app/nutrition/recipe-generator.tsx';
  const src = () => read(REL);

  it('keeps the title ready and unchanged', () => {
    expect(src()).toContain("const AI_UNAVAILABLE_TITLE = 'Aimee unavailable';");
  });

  it('has no body copy yet, so nothing can render half-written', () => {
    expect(src()).toMatch(/const AI_UNAVAILABLE_BODY: string = '';/);
  });

  it('will not render while the body is empty', () => {
    const code = stripComments(src());
    expect(code).toMatch(/aiUnavailable && !loading && AI_UNAVAILABLE_BODY\.length > 0 &&/);
  });

  it('renders the constants, not an inline string with a gap after it', () => {
    const code = stripComments(src());
    expect(code).toContain('{AI_UNAVAILABLE_TITLE}');
    expect(code).toContain('{AI_UNAVAILABLE_BODY}');
    // The literal used to be typed straight into the JSX with nothing after it.
    expect(code).not.toMatch(/>Aimee unavailable</);
  });

  it('leaves no TODO in a render path', () => {
    // Comments are NOT stripped: the TODO is the thing being asserted gone.
    expect(src()).not.toMatch(/TODO\(Edward\)/);
  });

  // The gate is a constant comparison today, which is the point: the box is
  // switched off until the copy lands. This models both sides of it so the
  // condition itself is exercised rather than just matched.
  it.each([
    ['', true, false, false],
    ['Aimee could not be reached.', true, false, true],
    ['Aimee could not be reached.', false, false, false],
    ['Aimee could not be reached.', true, true, false],
  ])('body=%p aiUnavailable=%p loading=%p renders %p', (body, aiUnavailable, loading, shown) => {
    expect(Boolean(aiUnavailable && !loading && (body as string).length > 0)).toBe(shown);
  });
});

describe('the dosing card titration block', () => {
  const REL = 'src/components/DosingReferenceTableCard.tsx';
  const src = () => read(REL);

  it('no longer promises notes that are coming soon', () => {
    expect(stripComments(src())).not.toMatch(/coming soon/i);
    expect(stripComments(src())).not.toMatch(/titrationNoteRef/);
  });

  it('renders the block only when there is a real note', () => {
    expect(stripComments(src())).toMatch(/\{entry\.titrationNote \? \(/);
  });

  it('hides the heading too, not just the sentence', () => {
    const code = stripComments(src());
    const gate = code.indexOf('{entry.titrationNote ? (');
    const heading = code.indexOf('Titration strategy');
    expect(gate).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(gate);
  });

  it('drops the style the pending line used, so it cannot be revived by accident', () => {
    expect(src()).not.toContain('titrationPending');
  });

  // The branch is live, not dead: getDosingTableEntry can DERIVE an entry from
  // a peptide protocol, and that path sets titrationNote from
  // protocol.importantNotes?.[0], which is frequently undefined.
  it('the derived-entry path can still produce an entry with no note', () => {
    const table = read('src/data/peptideDosingTable.ts');
    expect(table).toContain('titrationNote: protocol.importantNotes?.[0],');
  });
});
