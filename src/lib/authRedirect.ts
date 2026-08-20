/**
 * Where an emailed auth link (confirmation, password reset) should return to.
 *
 * Native and web need different answers, and getting this wrong is silent: a
 * `peptalk://` scheme link cannot be opened by a browser, so sending one to a
 * web user strands them completely — the account exists, the email arrives,
 * the link does nothing, and there is no route back. Native needs exactly that
 * scheme, because it is what reopens the app.
 *
 * On web the Supabase client is created with `detectSessionInUrl: true` (see
 * services/supabase.ts), so simply landing back on an app URL is enough:
 * supabase-js consumes the `?code=` or `#access_token=` from the URL itself
 * and establishes the session. That is why this returns the origin root and
 * not a dedicated callback route — normal entry routing then decides where the
 * now-authenticated user belongs.
 *
 * ⚠️ Whatever this returns must also be whitelisted in the Supabase dashboard
 * under Auth → URL Configuration → Redirect URLs, or Supabase refuses to embed
 * it in the email and silently falls back to the Site URL.
 */
import { Platform } from 'react-native';

export const NATIVE_AUTH_REDIRECT = 'peptalk://auth/callback';

export function authRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/`;
  }
  return NATIVE_AUTH_REDIRECT;
}
