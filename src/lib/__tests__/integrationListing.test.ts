/**
 * Apple Health was listed under "COMING SOON" wherever HealthKit data was
 * unavailable — Android, web, and an iPad (iPadOS has no Health data layer),
 * where App Review sometimes runs. A platform store that cannot exist on the
 * device is not coming. See src/lib/integrationListing.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listUnderComingSoon } from '../integrationListing';

describe('listUnderComingSoon', () => {
  it.each(['ios', 'android', 'web'])('never lists an unavailable Apple Health on %s', (os) => {
    expect(listUnderComingSoon('apple_health', false, os)).toBe(false);
  });

  it('does not list Health Connect on iOS', () => {
    expect(listUnderComingSoon('health_connect', false, 'ios')).toBe(false);
  });

  it('still lists genuinely pending third-party integrations', () => {
    for (const os of ['ios', 'android']) {
      expect(listUnderComingSoon('oura', false, os)).toBe(true);
      expect(listUnderComingSoon('whoop', false, os)).toBe(true);
    }
  });

  it('never lists an available integration as coming soon', () => {
    expect(listUnderComingSoon('apple_health', true, 'ios')).toBe(false);
    expect(listUnderComingSoon('oura', true, 'ios')).toBe(false);
  });
});

describe('app/settings/integrations.tsx uses the rule', () => {
  const code = fs
    .readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'settings', 'integrations.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('builds the COMING SOON list from listUnderComingSoon', () => {
    expect(code).toMatch(
      /const darkScaffold = ADAPTERS\.filter\(\(a\) => listUnderComingSoon\(a\.source, a\.available\(\), Platform\.OS\)\);/,
    );
    expect(code.split('const darkScaffold').length - 1).toBe(1);
  });
});
