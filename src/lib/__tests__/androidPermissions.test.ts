/**
 * Android permissions that come from Expo's prebuild template rather than from
 * anything PepTalk does. Play asks for a justification for SYSTEM_ALERT_WINDOW
 * ("display over other apps"); the only code that uses it is React Native's
 * DevSupport DebugOverlayController, which does not run in a release build.
 *
 * WRITE_EXTERNAL_STORAGE is deliberately NOT blocked. expo-image-picker
 * requests it for launchCameraAsync below API 29
 * (ImagePickerModule.ensureCameraPermissionsAreGranted), and the app calls
 * launchCameraAsync from four screens with minSdkVersion 26. Blocking it would
 * make the camera fail on Android 8 and 9. The second test fails if someone
 * blocks it while that is still true.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const android = appJson.expo.android;
const blocked: string[] = android.blockedPermissions ?? [];

function minSdk(): number | null {
  const plugins: unknown[] = appJson.expo.plugins ?? [];
  for (const p of plugins) {
    if (Array.isArray(p) && p[0] === 'expo-build-properties' && p[1]?.android?.minSdkVersion != null) {
      return Number(p[1].android.minSdkVersion);
    }
  }
  return null;
}

function launchCameraCallers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && /launchCameraAsync\(/.test(fs.readFileSync(p, 'utf8'))) out.push(p);
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'src'));
  return out;
}

describe('android.blockedPermissions', () => {
  it('blocks SYSTEM_ALERT_WINDOW, which only the debug overlay uses', () => {
    expect(blocked).toContain('android.permission.SYSTEM_ALERT_WINDOW');
    expect(android.permissions ?? []).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('does not block WRITE_EXTERNAL_STORAGE while the image-picker camera needs it on API < 29', () => {
    const sdk = minSdk();
    expect(sdk).not.toBeNull(); // read the real value, not a guess
    const needsWrite = (sdk as number) < 29 && launchCameraCallers().length > 0;
    if (needsWrite) expect(blocked).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });
});
