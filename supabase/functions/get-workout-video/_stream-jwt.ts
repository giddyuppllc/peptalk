/**
 * Cloudflare Stream signed-URL token generator.
 *
 * Stream playback URLs accept a `?token=<jwt>` query param. The JWT is
 * RS256-signed by us using a private key that's registered against a
 * key id (kid) in Stream. Stream verifies signatures with the matching
 * public key it generated.
 *
 * Setup (one-time, do it in Cloudflare's dashboard or via API):
 *
 *   curl -X POST \
 *     "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/stream/keys" \
 *     -H "Authorization: Bearer <CF_API_TOKEN>" \
 *     -H "Content-Type: application/json"
 *
 *   That returns { result: { id, pem, jwk, ... } }. Stash `id` as
 *   CLOUDFLARE_STREAM_SIGNING_KEY_ID and `pem` as
 *   CLOUDFLARE_STREAM_SIGNING_KEY_PEM in Supabase secrets.
 *
 * Token payload contract:
 *   sub  — the video UID being authorized
 *   kid  — the signing key id
 *   exp  — unix-seconds expiry (we use 6 hours, matching the existing R2 TTL)
 *   nbf  — not-before, set to (now - 60s) to tolerate clock skew
 *   accessRules — optional IP/country/referer rules. We don't use them today.
 */

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlString(input: string): string {
  return base64url(enc.encode(input));
}

/**
 * Parse a PEM-encoded PKCS#8 RSA private key into a CryptoKey. The
 * Stream API returns the key with `\n` literal escapes when it's set as
 * an env var; we normalize either form.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  if (!cleaned) throw new Error('stream_signing_key_pem_empty');
  let binary: Uint8Array;
  try {
    binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  } catch (err) {
    throw new Error(
      'stream_signing_key_pem_malformed — ' +
        'CLOUDFLARE_STREAM_SIGNING_KEY_PEM must be a PKCS#8 PEM block ' +
        '(BEGIN PRIVATE KEY / END PRIVATE KEY). ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  try {
    // Cast around the lib-dom typing nit: Uint8Array.from() yields
    // Uint8Array<ArrayBufferLike>, but importKey wants the stricter
    // Uint8Array<ArrayBuffer>. The runtime value is identical.
    return await crypto.subtle.importKey(
      'pkcs8',
      binary as unknown as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (err) {
    throw new Error(
      'stream_signing_key_pem_import_failed — the PEM decoded but is ' +
        'not a valid PKCS#8 RSA private key. ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

let _keyPromise: Promise<CryptoKey> | null = null;
function getKey(pem: string): Promise<CryptoKey> {
  if (!_keyPromise) _keyPromise = importPrivateKey(pem);
  return _keyPromise;
}

export interface SignStreamTokenInput {
  videoUid: string;
  keyId: string;
  privateKeyPem: string;
  /** seconds from now. */
  ttlSec?: number;
}

export async function signStreamToken({
  videoUid,
  keyId,
  privateKeyPem,
  ttlSec = 6 * 60 * 60,
}: SignStreamTokenInput): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: keyId, typ: 'JWT' };
  const payload = {
    sub: videoUid,
    kid: keyId,
    exp: now + ttlSec,
    nbf: now - 60,
  };
  const signingInput =
    base64urlString(JSON.stringify(header)) +
    '.' +
    base64urlString(JSON.stringify(payload));
  const key = await getKey(privateKeyPem);
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput)),
  );
  return `${signingInput}.${base64url(sig)}`;
}

/** Test hook — force re-import on the next sign call. Used only by
 *  unit tests; production code should hit the cached key. */
export function _resetStreamKeyCache(): void {
  _keyPromise = null;
}
