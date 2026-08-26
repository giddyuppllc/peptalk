/**
 * Every "fix your own mistake" capability has a way to reach it.
 *
 * WHY THIS EXISTS
 * A sweep of all 39 stores found 82 actions with no caller anywhere in the app.
 * Most were internal helpers, but one cluster was real: roughly a dozen
 * delete/edit capabilities that were written, worked, and had no button. People
 * could log a period on the wrong day, record a body scan twice, or mistype a
 * side-effect severity, and had no way to correct it.
 *
 * That is not cosmetic. A stray period shifts every cycle prediction after it,
 * a duplicate scan bends every trend line, and a severity typo lands in the
 * history the safety copy reads from.
 *
 * The failure mode is silent — nothing errors, the code just sits there — so it
 * needs a test rather than a convention. This asserts the WIRING (a screen
 * references the action), not the visual design.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');

/** Every .tsx under app/ plus the shared components, as one blob. */
function appSurface(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        walk(p);
      } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
        out.push(fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'src', 'components'));
  return out.join('\n');
}

const SURFACE = appSurface();

/**
 * Source with line comments stripped.
 *
 * Negative assertions must run against CODE. This guard first failed because
 * the comment explaining why Alert.prompt is avoided itself contained the
 * string — the check fired on its own rationale.
 */
function codeOnly(src: string): string {
  const NL = String.fromCharCode(10);
  return src
    .split(NL)
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join(NL);
}

/**
 * Actions that MUST stay reachable, with what breaks if they are not.
 *
 * Deliberately not the full orphan list — only the ones where an uncorrectable
 * record corrupts something the user can see.
 */
/**
 * Does `src` reference the symbol `name` — as a whole identifier?
 *
 * A plain toContain() is not enough here: it matches `deletePeriodX` when
 * looking for `deletePeriod`, so renaming an action away would silently keep
 * the guard green. Proved by mutation — two checks survived before this.
 */
function referencesSymbol(src: string, name: string): boolean {
  const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);
  let from = 0;
  for (;;) {
    const i = src.indexOf(name, from);
    if (i < 0) return false;
    const after = src[i + name.length] ?? ' ';
    const before = src[i - 1] ?? ' ';
    if (!isIdentChar(after) && !isIdentChar(before)) return true;
    from = i + 1;
  }
}

const WIRED: [string, string][] = [
  ['deletePeriod', 'a period on the wrong day shifts every later cycle prediction'],
  ['deleteDayLog', 'a mis-logged day stays in symptom and mood history forever'],
  ['deleteScan', 'a duplicate body scan bends every trend line above it'],
  ['removeAppetite', 'a mis-tapped appetite chip logs instantly and cannot be undone'],
  ['removeReport', 'weekly reports accumulate with no way to clear one'],
  ['renameChat', 'a thread auto-titled from a typo keeps that title forever'],
  ['updateSideEffect', 'a severity typo lands in the history the safety copy reads'],
  ['updatePhoto', 'a caption could only ever be set at capture time'],
];

describe('records the user got wrong can be corrected', () => {
  it.each(WIRED)('%s is reachable — otherwise %s', (action) => {
    expect(referencesSymbol(SURFACE, action)).toBe(true);
  });
});

describe('destructive actions ask first', () => {
  const helper = fs.readFileSync(
    path.join(ROOT, 'src', 'lib', 'confirmDelete.ts'),
    'utf8',
  );

  it('there is one shared confirm, not one prompt per screen', () => {
    // Twelve slightly different confirmations train people to stop reading
    // them, which is worse than none.
    expect(helper).toContain('export function confirmDelete');
    expect(helper).toContain("style: 'destructive'");
    expect(helper).toContain("{ text: 'Cancel', style: 'cancel' }");
  });

  it.each([
    'app/cycle/history.tsx',
    'app/cycle/index.tsx',
    'app/body-composition/index.tsx',
    'app/aimee/reports.tsx',
    'app/nutrition/index.tsx',
    'app/doses/side-effects.tsx',
  ])('%s deletes through the shared confirm', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toContain('confirmDelete');
  });

  it('the side-effect delete is no longer immediate', () => {
    // It used to call removeSideEffect straight from onPress, so one stray tap
    // destroyed a clinical record with no way back.
    const src = fs.readFileSync(path.join(ROOT, 'app/doses/side-effects.tsx'), 'utf8');
    const onPress = src.slice(src.indexOf('accessibilityLabel={`Delete ${e.symptom}') - 900);
    expect(onPress).toContain('confirmDelete');
  });
});

describe('the rename flow works off iOS', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'ChatHistoryDrawer.tsx'),
    'utf8',
  );

  it('uses a real modal, not Alert.prompt', () => {
    // Alert.prompt exists only on iOS. On Android and web it is a silent
    // no-op, so the menu item would appear to do nothing at all.
    // The CALL form, not the bare name: the JSX comment above the modal
    // explains why Alert.prompt is avoided and would otherwise trip this.
    expect(codeOnly(src)).not.toContain('Alert.prompt(');
    // The JSX element, not the import — a mutation that renamed only the
    // usage left the import intact and slipped past a bare-name check.
    expect(referencesSymbol(src, '<TextInput')).toBe(true);
  });

  it('refuses to save a blank title', () => {
    // An empty row in the drawer would be unclickable and unfixable.
    expect(src).toContain('next.length > 0');
  });
});
