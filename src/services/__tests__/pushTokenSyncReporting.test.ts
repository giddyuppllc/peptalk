/**
 * A refused push-token save must reach Sentry in production, without the token.
 *
 * From 2026-05-17 every save was refused by Postgres (ON CONFLICT target with
 * no matching unique constraint) and the only trace was `if (__DEV__)
 * console.warn`. Production had no signal for four months and push reached
 * nobody. These tests pin two things: a failure is reported, and nothing
 * reported contains the device's push token.
 *
 * syncPushToken loads the Supabase client with a dynamic `import()`, which this
 * jest setup cannot execute. So the reporting helper is tested by behaviour,
 * and its wiring into syncPushToken by reading the source.
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = 'ExponentPushToken[abc123-device-secret]';

function load() {
  jest.resetModules();
  const captureException = jest.fn();
  jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  jest.doMock('../notificationService', () => ({
    notificationsAvailable: () => true,
    registerForPushNotifications: jest.fn(async () => TOKEN),
  }));
  jest.doMock('../telemetry', () => ({ captureException }));
  const mod = require('../pushTokenSync');
  return { ...mod, captureException } as {
    reportSaveFailure: (stage: 'upsert' | 'sync', err: unknown, token: string | null) => void;
    redactPushToken: (text: string, token: string | null) => string;
    captureException: jest.Mock;
  };
}

const everythingReported = (m: jest.Mock) =>
  JSON.stringify(m.mock.calls.map(([err, ctx]) => [err instanceof Error ? err.message : err, ctx]));

describe('reportSaveFailure', () => {
  it('reports a database refusal with its code, and never its details or the token', () => {
    const { reportSaveFailure, captureException } = load();
    reportSaveFailure('upsert', {
      code: '42P10',
      message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      details: `Key (expo_push_token)=(${TOKEN}) already exists.`,
    }, TOKEN);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('ON CONFLICT specification');
    expect(ctx).toEqual({ source: 'pushTokenSync', stage: 'upsert', code: '42P10' });
    expect(everythingReported(captureException)).not.toContain('abc123-device-secret');
  });

  it('scrubs the token when the message itself echoes it', () => {
    const { reportSaveFailure, captureException } = load();
    reportSaveFailure('upsert', { code: '23505', message: `duplicate key: ${TOKEN}` }, TOKEN);
    expect(everythingReported(captureException)).not.toContain('abc123-device-secret');
    expect(everythingReported(captureException)).toContain('[push-token]');
  });

  it('reports a thrown Error, without the token', () => {
    const { reportSaveFailure, captureException } = load();
    reportSaveFailure('sync', new Error(`network down for ${TOKEN}`), TOKEN);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toMatchObject({ stage: 'sync' });
    expect(everythingReported(captureException)).not.toContain('abc123-device-secret');
  });

  it('removes a token that is not Expo-shaped when it is the known token', () => {
    const { redactPushToken } = load();
    expect(redactPushToken('value=opaque-xyz', 'opaque-xyz')).toBe('value=[push-token]');
    expect(redactPushToken('a ExponentPushToken[q] b ExpoPushToken[r]', null)).toBe(
      'a [push-token] b [push-token]',
    );
  });
});

describe('syncPushToken reports in every build', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pushTokenSync.ts'), 'utf8');
  const start = src.indexOf('export async function syncPushToken');
  const body = src.slice(start, src.indexOf('export async function clearPushToken'));

  it('found the function (not vacuous)', () => {
    expect(start).toBeGreaterThan(0);
    expect(body).toContain("onConflict: 'expo_push_token'");
  });

  it('reports the upsert error', () => {
    const block = body.slice(body.indexOf('if (error) {'), body.indexOf('lastSyncedToken = token;'));
    expect(block).toContain("reportSaveFailure('upsert', error, token)");
  });

  it('reports a thrown failure', () => {
    const block = body.slice(body.indexOf('} catch (err) {'));
    expect(block).toContain("reportSaveFailure('sync', err, token)");
  });

  it('no longer gates failure handling behind __DEV__', () => {
    expect(body).not.toContain('__DEV__');
  });
});
