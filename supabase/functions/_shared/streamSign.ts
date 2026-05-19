/**
 * Cloudflare Stream signed-token minter (RS256 JWT).
 *
 * Shared by get-workout-video + get-learn-video so they sign Stream
 * playback tokens identically.
 *
 * Cloudflare Stream signed URLs work like:
 *   https://customer-<accountSubdomain>.cloudflarestream.com/<JWT>/manifest/video.m3u8
 *
 * where JWT is an RS256-signed JSON Web Token with:
 *   header  { alg: "RS256", kid: <signingKeyId> }
 *   payload { sub: <videoUid>, kid: <signingKeyId>, iat, exp }
 *
 * Returns the signed URL ready to hand to expo-av (HLS via .m3u8).
 *
 * Env required:
 *   CLOUDFLARE_STREAM_SIGNING_KEY_ID
 *   CLOUDFLARE_STREAM_SIGNING_KEY_PEM   (base64-encoded RSA PEM)
 */

const b64urlEncode = (input: string | Uint8Array): string => {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

let _cachedKey: CryptoKey | null = null;
async function importSigningKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  // The PEM was stored base64-encoded (from the Cloudflare create-key API
  // response, which double-base64 encodes it). Decode once to get the
  // raw PEM with -----BEGIN RSA PRIVATE KEY----- + base64 body.
  const pemEncoded = Deno.env.get('CLOUDFLARE_STREAM_SIGNING_KEY_PEM') ?? '';
  if (!pemEncoded) throw new Error('CLOUDFLARE_STREAM_SIGNING_KEY_PEM not set');
  const pemDecoded = atob(pemEncoded);

  // Strip PEM headers + whitespace to get the inner base64 DER blob.
  const inner = pemDecoded
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(inner), (c) => c.charCodeAt(0));

  // Cloudflare gives us a PKCS#1 RSA private key (`BEGIN RSA PRIVATE KEY`).
  // WebCrypto expects PKCS#8. Wrap PKCS#1 in the PKCS#8 framing.
  const pkcs8 = pemDecoded.includes('BEGIN PRIVATE KEY')
    ? der
    : wrapPkcs1InPkcs8(der);

  _cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return _cachedKey;
}

/**
 * Wrap a PKCS#1 RSA key (the format Cloudflare returns from
 * /stream/keys: `-----BEGIN RSA PRIVATE KEY-----`) in the PKCS#8
 * ASN.1 framing WebCrypto needs (`-----BEGIN PRIVATE KEY-----`).
 *
 * Adds the rsaEncryption OID header in front of the existing DER.
 */
function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  // PKCS#8 PrivateKeyInfo SEQUENCE:
  //   version INTEGER 0
  //   algorithm AlgorithmIdentifier { rsaEncryption + NULL }
  //   privateKey OCTET STRING (containing the PKCS#1 RSA private key)
  const algoIdentifier = new Uint8Array([
    0x30, 0x0d, // SEQUENCE, length 13
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID 1.2.840.113549.1.1.1 (rsaEncryption)
    0x05, 0x00, // NULL
  ]);
  // OCTET STRING wrapping the PKCS#1 bytes
  const octet = lengthPrefixed(0x04, pkcs1);
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  const body = concatBytes(version, algoIdentifier, octet);
  return lengthPrefixed(0x30, body); // SEQUENCE
}

function lengthPrefixed(tag: number, body: Uint8Array): Uint8Array {
  const len = body.length;
  let lenBytes: number[];
  if (len < 0x80) lenBytes = [len];
  else if (len < 0x100) lenBytes = [0x81, len];
  else if (len < 0x10000) lenBytes = [0x82, (len >> 8) & 0xff, len & 0xff];
  else lenBytes = [
    0x83,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ];
  const out = new Uint8Array(1 + lenBytes.length + body.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(body, 1 + lenBytes.length);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export async function signStreamToken(
  videoUid: string,
  ttlSeconds: number,
): Promise<string> {
  const kid = Deno.env.get('CLOUDFLARE_STREAM_SIGNING_KEY_ID') ?? '';
  if (!kid) throw new Error('CLOUDFLARE_STREAM_SIGNING_KEY_ID not set');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const payload = {
    sub: videoUid,
    kid,
    iat: now,
    exp: now + ttlSeconds,
  };
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importSigningKey();
  const sigBuf = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = b64urlEncode(new Uint8Array(sigBuf));
  return `${signingInput}.${sigB64}`;
}

export function streamHlsUrl(
  videoUid: string,
  signedToken?: string,
): string {
  // Default subdomain pattern works for any Cloudflare Stream account
  // — `customer-<accountSubdomain>` is implied by using the
  // `videodelivery.net` zone. The signed token form embeds the JWT in
  // the path.
  if (signedToken) {
    return `https://videodelivery.net/${signedToken}/manifest/video.m3u8`;
  }
  return `https://videodelivery.net/${videoUid}/manifest/video.m3u8`;
}
