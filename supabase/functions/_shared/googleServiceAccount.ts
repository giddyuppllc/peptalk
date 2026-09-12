/**
 * GOOGLE_SERVICE_ACCOUNT_JSON — parse it, and say so loudly when it is wrong.
 *
 * Why this exists
 * ---------------
 * On 2026-09-12 the secret's entire value was found to be three characters:
 *
 *     {…}
 *
 * an open brace, a Unicode horizontal ellipsis (U+2026), and a close brace —
 * the elided form from a documentation example, pasted in place of the real
 * key file. Every Google Play call had therefore been failing since the secret
 * was set (2026-05-05): purchase validation, reconciliation, and the RTDN
 * handler's read-back of subscription state.
 *
 * It stayed invisible for four months because the guards read
 *
 *     if (!GOOGLE_SERVICE_ACCOUNT_JSON) { ...bail with a clear message... }
 *
 * and "{…}" is a non-empty string, so it sailed through the check that existed
 * to catch exactly this and died later inside JSON.parse, where the failure
 * looked like a transient error rather than a permanent misconfiguration.
 *
 * The lesson is the one already written into CLAUDE.md about env vars: check
 * the SHAPE of a value, not its presence. `Boolean(value)` is not a check.
 *
 * So: parse, and require the two fields a service account cannot work without.
 * Callers get a definite answer and a message that names the problem.
 */

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  [k: string]: unknown;
}

export type ServiceAccountResult =
  | { ok: true; creds: GoogleServiceAccount }
  | { ok: false; reason: string };

/**
 * Parse and structurally validate the secret.
 *
 * Never throws, and never includes the value in `reason` — the file contains a
 * private key. The reason describes the shape only.
 */
export function parseGoogleServiceAccount(raw: string | undefined): ServiceAccountResult {
  if (!raw || !raw.trim()) {
    return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON is not set' };
  }

  const text = raw.trim();

  // The specific failure we actually shipped, named so it is recognisable in a
  // log rather than arriving as a generic parse error.
  if (text.length < 100) {
    return {
      ok: false,
      reason:
        `GOOGLE_SERVICE_ACCOUNT_JSON is ${text.length} characters long — far too short to be a ` +
        `service-account key file. This is almost certainly a placeholder such as "{…}" rather ` +
        `than the JSON downloaded from Google Cloud Console.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      reason: `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (${String(e).slice(0, 120)})`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'GOOGLE_SERVICE_ACCOUNT_JSON did not parse to an object' };
  }

  const creds = parsed as GoogleServiceAccount;

  const missing: string[] = [];
  if (typeof creds.client_email !== 'string' || !creds.client_email) missing.push('client_email');
  if (typeof creds.private_key !== 'string' || !creds.private_key) missing.push('private_key');
  if (missing.length) {
    return {
      ok: false,
      reason: `GOOGLE_SERVICE_ACCOUNT_JSON is missing required field(s): ${missing.join(', ')}`,
    };
  }

  if (!creds.private_key.includes('BEGIN PRIVATE KEY')) {
    return {
      ok: false,
      reason:
        'GOOGLE_SERVICE_ACCOUNT_JSON has a private_key that is not a PEM block — check the ' +
        'newlines survived being stored as a secret.',
    };
  }

  return { ok: true, creds };
}
