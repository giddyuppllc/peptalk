/**
 * "Have a discount code?" rendered on every platform, but
 * presentCodeRedemption() returns false and does nothing off iOS (our codes are
 * Apple offer codes; there is no Play promo code, and web has no store sheet).
 * A button that silently does nothing is a 2.1 / Play "broken functionality"
 * finding. It must render on iOS only.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const strip = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('discount-code link', () => {
  it('presentCodeRedemption only acts on iOS (the reason for the gate)', () => {
    const svc = strip(fs.readFileSync(path.join(ROOT, 'src', 'services', 'iapService.ts'), 'utf8'));
    const fn = svc.slice(svc.indexOf('export async function presentCodeRedemption'));
    expect(fn).toMatch(/if \(Platform\.OS === 'ios'\)/);
  });

  it('renders on the subscription screen only inside a Platform.OS === ios gate', () => {
    const code = strip(fs.readFileSync(path.join(ROOT, 'app', 'subscription.tsx'), 'utf8'));
    const label = code.indexOf('Have a discount code?');
    expect(label).toBeGreaterThan(-1);
    // The nearest JSX expression opening before the button must be the iOS gate.
    const before = code.slice(0, label);
    const gate = before.lastIndexOf("{Platform.OS === 'ios' && (");
    const touchable = before.lastIndexOf('<TouchableOpacity');
    expect(gate).toBeGreaterThan(-1);
    expect(touchable).toBeGreaterThan(gate);
    // Nothing closes the gate between it and the button.
    expect(code.slice(gate, touchable)).not.toMatch(/\)\}/);
    // And it is the only place the label appears.
    expect(code.split('Have a discount code?').length - 1).toBe(1);
  });
});
