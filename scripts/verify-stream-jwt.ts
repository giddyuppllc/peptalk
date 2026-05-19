/**
 * Verification harness for the Cloudflare Stream JWT signer used by
 * supabase/functions/get-workout-video/_stream-jwt.ts.
 *
 * Stream rejects malformed tokens silently (the player just returns
 * 401), which makes prod debugging miserable. This script proves the
 * signer end-to-end *before* you point real secrets at it:
 *   - Generate a fresh RSA-2048 keypair locally with Web Crypto.
 *   - Sign a token with the private key.
 *   - Verify the signature with the matching public key.
 *   - Decode the claims and assert kid/sub/exp/nbf match.
 *   - Exercise the error paths for malformed / empty PEMs.
 *
 * Run:
 *   npx tsx scripts/verify-stream-jwt.ts
 *
 * Exits 0 on pass, 1 on any failure. Prints a summary table.
 */

import {
  signStreamToken,
  _resetStreamKeyCache,
} from '../supabase/functions/get-workout-video/_stream-jwt';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}
const checks: Check[] = [];
function pass(name: string, detail?: string) {
  checks.push({ name, ok: true, detail });
}
function fail(name: string, detail: string) {
  checks.push({ name, ok: false, detail });
}

const enc = new TextEncoder();

function b64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Uint8Array.from(atob(padded + pad), (c) => c.charCodeAt(0));
}
function b64urlDecodeJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(input))) as T;
}

async function generateKeyPairAndPem() {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const { privateKey, publicKey } = keys as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  let b64 = '';
  for (let i = 0; i < pkcs8.length; i++) b64 += String.fromCharCode(pkcs8[i]!);
  b64 = btoa(b64);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { privateKey, publicKey, pem };
}

async function verifyToken(token: string, publicKey: CryptoKey): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`token has ${parts.length} parts, expected 3`);
  const [h, p, s] = parts as [string, string, string];
  const sig = b64urlDecode(s);
  const data = enc.encode(`${h}.${p}`);
  // Cast for the same Uint8Array<ArrayBufferLike> vs ArrayBuffer typing
  // nit that bites in _stream-jwt.ts — runtime value is identical.
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    sig as unknown as ArrayBuffer,
    data as unknown as ArrayBuffer,
  );
}

async function main() {
  const { publicKey, pem } = await generateKeyPairAndPem();

  // 1. Happy path — sign a token, verify the signature.
  _resetStreamKeyCache();
  const before = Math.floor(Date.now() / 1000);
  let token: string;
  try {
    token = await signStreamToken({
      videoUid: 'test-uid-001',
      keyId: 'test-kid',
      privateKeyPem: pem,
      ttlSec: 60,
    });
    pass('sign returns a 3-part JWT', `${token.split('.').length} parts`);
  } catch (err) {
    fail('signStreamToken happy path', err instanceof Error ? err.message : String(err));
    summary();
    return;
  }
  const after = Math.floor(Date.now() / 1000);

  // 2. Verify with public key.
  let valid = false;
  try {
    valid = await verifyToken(token, publicKey);
    if (valid) pass('signature verifies with matching public key');
    else fail('signature verifies with matching public key', 'verify returned false');
  } catch (err) {
    fail('signature verifies', err instanceof Error ? err.message : String(err));
  }

  if (valid) {
    // 3. Header claims.
    const [h, p] = token.split('.');
    const header = b64urlDecodeJson<{ alg?: string; kid?: string; typ?: string }>(h!);
    if (header.alg === 'RS256') pass('header.alg = RS256');
    else fail('header.alg', `got ${header.alg}`);
    if (header.kid === 'test-kid') pass('header.kid is set');
    else fail('header.kid', `got ${header.kid}`);
    if (header.typ === 'JWT') pass('header.typ = JWT');
    else fail('header.typ', `got ${header.typ}`);

    // 4. Payload claims.
    const payload = b64urlDecodeJson<{
      sub?: string;
      kid?: string;
      exp?: number;
      nbf?: number;
    }>(p!);
    if (payload.sub === 'test-uid-001') pass('payload.sub matches videoUid');
    else fail('payload.sub', `got ${payload.sub}`);
    if (payload.kid === 'test-kid') pass('payload.kid matches keyId');
    else fail('payload.kid', `got ${payload.kid}`);
    if (payload.exp && payload.exp >= before + 60 && payload.exp <= after + 60) {
      pass(`payload.exp = now + 60s`);
    } else {
      fail(
        'payload.exp window',
        `got ${payload.exp}, expected ${before + 60}–${after + 60}`,
      );
    }
    if (payload.nbf && payload.nbf >= before - 60 && payload.nbf <= after - 60) {
      pass(`payload.nbf = now - 60s (clock skew tolerance)`);
    } else {
      fail(
        'payload.nbf window',
        `got ${payload.nbf}, expected ${before - 60}–${after - 60}`,
      );
    }
  }

  // 5. Tampered signature must not verify.
  const tampered = token.slice(0, -4) + 'AAAA';
  try {
    const ok = await verifyToken(tampered, publicKey);
    if (!ok) pass('tampered signature rejected');
    else fail('tampered signature rejected', 'verify returned true');
  } catch {
    pass('tampered signature rejected (threw)');
  }

  // 6. Wrong-key verification must fail.
  const { publicKey: otherPub } = await generateKeyPairAndPem();
  const okOther = await verifyToken(token, otherPub).catch(() => false);
  if (!okOther) pass('signature rejected by unrelated public key');
  else fail('signature rejected by unrelated public key', 'verify returned true');

  // 7. Malformed PEM → descriptive error.
  _resetStreamKeyCache();
  try {
    await signStreamToken({
      videoUid: 'x',
      keyId: 'k',
      privateKeyPem: 'not-a-real-pem',
      ttlSec: 60,
    });
    fail('malformed PEM errors', 'no error thrown');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('stream_signing_key_pem')) pass('malformed PEM error mentions stream_signing_key_pem');
    else fail('malformed PEM error message', `got: ${msg}`);
  }

  // 8. Empty PEM → descriptive error.
  _resetStreamKeyCache();
  try {
    await signStreamToken({ videoUid: 'x', keyId: 'k', privateKeyPem: '', ttlSec: 60 });
    fail('empty PEM errors', 'no error thrown');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('empty')) pass('empty PEM error mentions empty');
    else fail('empty PEM error message', `got: ${msg}`);
  }

  // 9. PEM with literal \n escapes (the env-var case) → still works.
  _resetStreamKeyCache();
  try {
    const escaped = pem.replace(/\n/g, '\\n');
    const t2 = await signStreamToken({
      videoUid: 'env-style',
      keyId: 'k',
      privateKeyPem: escaped,
      ttlSec: 60,
    });
    const ok = await verifyToken(t2, publicKey);
    if (ok) pass('PEM with literal \\n escapes (env-var form) signs + verifies');
    else fail('escaped-newline PEM verifies', 'sig did not verify');
  } catch (err) {
    fail('escaped-newline PEM signs', err instanceof Error ? err.message : String(err));
  }

  summary();
}

function summary() {
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  console.log('');
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    const tag = c.detail ? ` — ${c.detail}` : '';
    console.log(`${mark} ${c.name}${tag}`);
  }
  console.log('');
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
