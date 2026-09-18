/**
 * The Quick Dose screen told users their weight was "used for dose
 * calculations" and showed "Based on your weight: …" under the dose, while no
 * calculation in the file read weight at all. A false claim of personalised
 * dosing is exactly what App Review 1.4.1 looks for on a dose calculator.
 *
 * If weight-based dosing is ever added for real, this test should be changed
 * together with the calculation that uses it — not deleted.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CLAIMS = [/used for dose calculations/i, /based on your weight/i];

describe('Quick Dose makes no weight-based dosing claim', () => {
  const code = strip(fs.readFileSync(path.join(ROOT, 'app', 'calculators', 'quick-dose.tsx'), 'utf8'));

  it('is the file we think it is', () => {
    expect(code).toMatch(/export default function QuickDoseScreen/);
  });

  it.each(CLAIMS)('does not render %p', (rx) => {
    expect(code).not.toMatch(rx);
  });

  it('does not read body weight it does not use', () => {
    expect(code).not.toMatch(/bodyMetrics\?*\.weightLbs/);
  });
});

describe('no screen claims weight is used for dose calculations', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const code = strip(fs.readFileSync(p, 'utf8'));
        if (/used for dose calculations/i.test(code)) offenders.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'src'));

  it('finds none', () => {
    expect(offenders).toEqual([]);
  });
});
