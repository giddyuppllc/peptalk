/**
 * The failure this guards against is silent: a `peptalk://` link mailed to a
 * web user is unopenable in a browser, so the account exists, the email
 * arrives, and confirmation is impossible. Nothing throws.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { Platform } from 'react-native';
import { authRedirectUrl, NATIVE_AUTH_REDIRECT } from '../authRedirect';

describe('authRedirectUrl', () => {
  const origWindow = (global as any).window;
  afterEach(() => { (global as any).window = origWindow; });

  it('uses the app scheme on iOS', () => {
    (Platform as any).OS = 'ios';
    expect(authRedirectUrl()).toBe('peptalk://auth/callback');
  });

  it('uses the app scheme on Android', () => {
    (Platform as any).OS = 'android';
    expect(authRedirectUrl()).toBe('peptalk://auth/callback');
  });

  it('uses an https origin on web, never the scheme', () => {
    (Platform as any).OS = 'web';
    (global as any).window = { location: { origin: 'https://app.peptalk.bio' } };
    const url = authRedirectUrl();
    expect(url).toBe('https://app.peptalk.bio/');
    expect(url.startsWith('peptalk://')).toBe(false);
  });

  it('falls back to the scheme on web if window is unavailable (SSR/export)', () => {
    (Platform as any).OS = 'web';
    (global as any).window = undefined;
    expect(authRedirectUrl()).toBe(NATIVE_AUTH_REDIRECT);
  });
});
