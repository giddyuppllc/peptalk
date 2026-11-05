#!/usr/bin/env node
/**
 * Generate a VAPID key pair for PWA dose reminders (Web Push).
 *
 *   node scripts/generate-vapid-keys.mjs [mailto:you@example.com]
 *
 * Prints the commands to set them — it sets nothing itself. The public key is
 * needed in two places: the edge function secret (to sign) and the web build
 * (EXPO_PUBLIC_VAPID_PUBLIC_KEY in .env, inlined at build time, public by
 * design). The private key is a secret: only `supabase secrets set` gets it.
 *
 * Generate ONCE. Rotating the pair invalidates every existing browser
 * subscription; users would have to re-enable reminders.
 */
import { generateKeyPairSync } from 'node:crypto';

const subject = process.argv[2] || 'mailto:support@peptalk.bio';
if (!/^mailto:.+@.+|^https:\/\//.test(subject)) {
  console.error('VAPID subject must be mailto:… or https://…');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

const b64u = (buf) => Buffer.from(buf).toString('base64url');
// Uncompressed EC point: 0x04 || X || Y — what PushManager.subscribe expects.
const publicRaw = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]));
const privateRaw = priv.d; // already base64url, 32 bytes

console.log(`\n# 1) Edge function secrets (run from the repo, linked project):`);
console.log(`supabase secrets set VAPID_PUBLIC_KEY=${publicRaw} VAPID_PRIVATE_KEY=${privateRaw} VAPID_SUBJECT=${subject}\n`);
console.log(`# 2) Web build — add to .env (keep the trailing newline):`);
console.log(`EXPO_PUBLIC_VAPID_PUBLIC_KEY=${publicRaw}\n`);
