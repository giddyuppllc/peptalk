/**
 * The OS notification prompt must never appear from sign-in, a foreground
 * sync, or logout. It used to: registerForPushNotifications requested
 * permission whenever it was not granted, and it was called from the sign-in
 * effect in app/_layout.tsx, from syncPushToken (sign-in + every foreground),
 * and from clearPushToken DURING LOGOUT.
 *
 * It may appear only where the user is dealing with notifications:
 * Settings → Notifications, and confirming "Activate protocol", whose dialog
 * says it schedules reminders.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('shouldRequestNotificationPermission', () => {
  const { shouldRequestNotificationPermission } = require('../notificationService');

  it('never prompts in ifGranted mode, whatever the status', () => {
    for (const status of ['undetermined', 'denied', 'granted']) {
      expect(shouldRequestNotificationPermission('ifGranted', { status, canAskAgain: true })).toBe(false);
    }
  });

  it('prompts in prompt mode only when not granted and the OS can still ask', () => {
    expect(shouldRequestNotificationPermission('prompt', { status: 'undetermined', canAskAgain: true })).toBe(true);
    expect(shouldRequestNotificationPermission('prompt', { status: 'granted', canAskAgain: true })).toBe(false);
    expect(shouldRequestNotificationPermission('prompt', { status: 'denied', canAskAgain: false })).toBe(false);
  });
});

describe('registerForPushNotifications against a mocked expo-notifications', () => {
  let requestPermissionsAsync: jest.Mock;
  let getPermissionsAsync: jest.Mock;

  function load(status: string) {
    jest.resetModules();
    requestPermissionsAsync = jest.fn(async () => ({ status: 'granted', canAskAgain: true }));
    getPermissionsAsync = jest.fn(async () => ({ status, canAskAgain: true }));
    jest.doMock('expo-notifications', () => ({
      getPermissionsAsync,
      requestPermissionsAsync,
      setNotificationChannelAsync: jest.fn(async () => {}),
      getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
      AndroidImportance: { HIGH: 4, DEFAULT: 3 },
    }));
    jest.doMock('expo-device', () => ({ isDevice: true }));
    return require('../notificationService');
  }

  it('does not prompt by default when permission was never answered', async () => {
    const svc = load('undetermined');
    await expect(svc.registerForPushNotifications()).resolves.toBeNull();
    expect(getPermissionsAsync).toHaveBeenCalled();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns a token without prompting when already granted', async () => {
    const svc = load('granted');
    await expect(svc.registerForPushNotifications('ifGranted')).resolves.toBe('ExponentPushToken[test]');
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("prompts in 'prompt' mode", async () => {
    const svc = load('undetermined');
    await expect(svc.registerForPushNotifications('prompt')).resolves.toBe('ExponentPushToken[test]');
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('call sites', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const PROMPT_ALLOWED = new Set([
    'app/settings/notifications.tsx',
    'src/components/ActivateProtocolButton.tsx',
  ]);

  const calls: { file: string; arg: string }[] = [];
  const requesters: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const rel = path.relative(ROOT, p).split(path.sep).join('/');
        const code = strip(fs.readFileSync(p, 'utf8'));
        for (const m of code.matchAll(/registerForPushNotifications\(([^)]*)\)/g)) {
          if (/mode/.test(m[1])) continue; // the definition
          calls.push({ file: rel, arg: m[1].trim() });
        }
        if (/requestPermissionsAsync\(/.test(code) && /Notifications/.test(code) && rel !== 'src/services/notificationService.ts') {
          // Audio.requestPermissionsAsync (voice) is not a notification prompt.
          if (/Notifications\.requestPermissionsAsync\(/.test(code)) requesters.push(rel);
        }
      }
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'src'));

  it('finds the call sites (not vacuous)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("only Settings → Notifications and protocol activation pass 'prompt'", () => {
    const prompting = calls.filter((c) => c.arg !== '' && c.arg !== "'ifGranted'").map((c) => c.file);
    for (const f of prompting) expect(PROMPT_ALLOWED.has(f)).toBe(true);
  });

  it('sign-in (_layout) and push-token sync/clear never prompt', () => {
    for (const c of calls.filter((x) => x.file === 'app/_layout.tsx' || x.file === 'src/services/pushTokenSync.ts')) {
      expect(c.arg).toBe("'ifGranted'");
    }
    expect(calls.filter((x) => x.file === 'src/services/pushTokenSync.ts')).toHaveLength(2);
  });

  it('nothing else calls Notifications.requestPermissionsAsync directly', () => {
    expect(requesters).toEqual([]);
  });
});
