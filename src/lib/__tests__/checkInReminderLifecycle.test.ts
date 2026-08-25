/**
 * Turning the daily check-in reminder off must actually stop it.
 *
 * The reminder is scheduled under a FIXED identifier and repeats daily. Boot
 * scheduled it when the preference was on and did nothing when it was off, the
 * settings toggle only wrote the preference, and no cancel function existed
 * anywhere in the service. So a user who turned it off kept receiving a 9 AM
 * push every day, indefinitely, with no way to stop it short of revoking
 * notifications for the entire app. Changing the time also did nothing until
 * the next cold start.
 *
 * The weekly report sitting directly below it in the same boot block already
 * had the correct shape — schedule when on, cancel when off. The check-in
 * reminder simply never got its other half.
 *
 * Source-level because scheduling is an OS-level side effect with no native
 * module under jest. What can be pinned is that every path which can turn the
 * preference off also cancels.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const service = fs.readFileSync(path.join(ROOT, 'src', 'services', 'notificationService.ts'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(ROOT, 'app', 'settings', 'notifications.tsx'), 'utf8');

describe('notificationService', () => {
  it('is the file we think it is', () => {
    expect(service).toMatch(/scheduleDailyCheckInReminder/);
    expect(service).toMatch(/DAILY_CHECKIN_REMINDER_ID/);
  });

  it('exposes a cancel for the daily check-in reminder', () => {
    expect(service).toMatch(/export async function cancelDailyCheckInReminder/);
  });

  it('cancels the same identifier it schedules', () => {
    // A cancel that targets a different id silently does nothing.
    const fn = service.slice(service.indexOf('export async function cancelDailyCheckInReminder'));
    expect(fn.slice(0, 600)).toMatch(/DAILY_CHECKIN_REMINDER_ID/);
  });
});

describe('boot', () => {
  it('cancels the reminder when the preference is off', () => {
    const i = layout.indexOf('prefs.dailyCheckInReminder && prefs.enabled');
    expect(i).toBeGreaterThan(-1);
    // The else branch must cancel, not merely skip scheduling.
    expect(layout.slice(i, i + 700)).toMatch(/else\s*\{[\s\S]*cancelDailyCheckInReminder\(\)/);
  });
});

describe('settings screen', () => {
  it('does not bind the raw store setter to the toggle', () => {
    // Binding the setter alone is the original bug: the preference changes and
    // the scheduled notification does not.
    expect(settings).not.toMatch(/onValueChange=\{setDailyCheckInReminder\}/);
  });

  it('takes effect immediately when toggled', () => {
    expect(settings).toMatch(/onValueChange=\{handleToggleCheckIn\}/);
    const h = settings.slice(settings.indexOf('const handleToggleCheckIn'));
    expect(h.slice(0, 500)).toMatch(/cancelDailyCheckInReminder\(\)/);
    expect(h.slice(0, 500)).toMatch(/scheduleDailyCheckInReminder\(/);
  });

  it('reschedules when the time changes', () => {
    expect(settings).toMatch(/onCommit=\{handleCheckInTime\}/);
    const h = settings.slice(settings.indexOf('const handleCheckInTime'));
    expect(h.slice(0, 400)).toMatch(/scheduleDailyCheckInReminder\(time\)/);
  });
});
