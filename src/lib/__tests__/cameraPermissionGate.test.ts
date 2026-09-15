/**
 * App Review 5.1.1(iv) — camera screens must go straight to the system prompt.
 *
 * food-scanner, meal-scan and the food-search barcode modal each showed a
 * custom screen before the system prompt had ever appeared ("Enable Camera",
 * "Camera permission needed", a back button, a Close X). That is the defect
 * Apple rejected four times on the HealthKit explainer. See
 * src/lib/cameraPermissionGate.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  cameraGateState,
  shouldRequestCamera,
  mayShowCustomPermissionScreen,
} from '../cameraPermissionGate';

const undetermined = { granted: false, canAskAgain: true };
const deniedFinal = { granted: false, canAskAgain: false };
const granted = { granted: true, canAskAgain: true };

describe('cameraGateState', () => {
  it('is loading until the status is known', () => {
    expect(cameraGateState(null, 'idle')).toBe('loading');
    expect(cameraGateState(undefined, 'idle')).toBe('loading');
  });

  it('goes straight to the system prompt when the OS can still ask', () => {
    expect(cameraGateState(undetermined, 'idle')).toBe('request');
    expect(shouldRequestCamera('request', 'idle')).toBe(true);
    expect(mayShowCustomPermissionScreen('request')).toBe(false);
  });

  it('shows no custom screen while the system sheet is up', () => {
    expect(cameraGateState(undetermined, 'requesting')).toBe('request');
    expect(cameraGateState(deniedFinal, 'requesting')).toBe('request');
    expect(shouldRequestCamera('request', 'requesting')).toBe(false);
  });

  it('shows the denied screen only after the system has answered no', () => {
    expect(cameraGateState(deniedFinal, 'done')).toBe('denied');
    expect(mayShowCustomPermissionScreen('denied')).toBe(true);
  });

  it('does not re-prompt in a loop after one denial when Android still allows asking', () => {
    const state = cameraGateState(undetermined, 'done');
    expect(state).toBe('denied');
    expect(shouldRequestCamera(state, 'done')).toBe(false);
  });

  it('shows the denied screen on entry when the OS will never ask again', () => {
    expect(cameraGateState(deniedFinal, 'idle')).toBe('denied');
  });

  it('grants whatever the phase', () => {
    for (const phase of ['idle', 'requesting', 'done'] as const) {
      expect(cameraGateState(granted, phase)).toBe('granted');
    }
  });

  it('does not prompt while disabled (a closed modal, an upsell screen)', () => {
    expect(shouldRequestCamera('request', 'idle', false)).toBe(false);
  });

  it('no state other than denied allows a custom screen', () => {
    for (const s of ['loading', 'request', 'granted'] as const) {
      expect(mayShowCustomPermissionScreen(s)).toBe(false);
    }
  });
});

describe('camera screens are wired to the gate', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const read = (rel: string) =>
    fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  const SCREENS = [
    'app/nutrition/food-scanner.tsx',
    'app/nutrition/meal-scan.tsx',
    'app/nutrition/food-search.tsx',
  ];

  it.each(SCREENS)('%s uses useCameraPermissionGate, not useCameraPermissions', (rel) => {
    const code = read(rel);
    expect(code).toMatch(/useCameraPermissionGate\(/);
    expect(code).not.toMatch(/useCameraPermissions\(/);
    // The old gate keyed the custom screen on "not granted", which includes
    // "never asked".
    expect(code).not.toMatch(/!permission\??\.granted/);
  });

  it('no app screen calls useCameraPermissions directly', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /useCameraPermissions\(/.test(fs.readFileSync(p, 'utf8'))) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    expect(offenders).toEqual([]);
  });

  /** The JSX returned for the pre-answer states, up to the denied branch. */
  function preAnswerBlock(code: string, startRx: RegExp, endRx: RegExp): string {
    const start = code.search(startRx);
    expect(start).toBeGreaterThan(-1);
    const rest = code.slice(start);
    const end = rest.search(endRx);
    expect(end).toBeGreaterThan(0);
    return rest.slice(0, end);
  }

  const NO_CONTROLS = /onPress|Touchable|Pressable|AnimatedPress|GradientButton|router\.back|onClose/;

  it('food-scanner renders no control before the system has answered', () => {
    const code = read('app/nutrition/food-scanner.tsx');
    const block = preAnswerBlock(
      code,
      /if \(cameraState === 'loading' \|\| cameraState === 'request'\)/,
      /if \(cameraState === 'denied'\)/,
    );
    expect(block).not.toMatch(NO_CONTROLS);
  });

  it('meal-scan renders no control before the system has answered', () => {
    const code = read('app/nutrition/meal-scan.tsx');
    const block = preAnswerBlock(
      code,
      /if \(cameraState === 'loading' \|\| cameraState === 'request'\)/,
      /if \(cameraState === 'denied'\)/,
    );
    expect(block).not.toMatch(NO_CONTROLS);
  });

  it('food-search barcode modal renders no control and ignores Android back before the system has answered', () => {
    const code = read('app/nutrition/food-search.tsx');
    expect(code).toMatch(/const awaitingSystemPrompt = cameraState === 'loading' \|\| cameraState === 'request';/);
    expect(code).toMatch(/onRequestClose=\{awaitingSystemPrompt \? \(\) => \{\} : onClose\}/);
    const block = preAnswerBlock(code, /\{awaitingSystemPrompt \? \(\s*</,/\) : cameraState === 'denied' \? \(/);
    expect(block).not.toMatch(NO_CONTROLS);
    expect(code).toMatch(/useCameraPermissionGate\(visible\)/);
  });

  it('food-scanner does not prompt for the camera behind the Plus upsell', () => {
    expect(read('app/nutrition/food-scanner.tsx')).toMatch(/useCameraPermissionGate\(canUseFoodScanner\)/);
  });
});
