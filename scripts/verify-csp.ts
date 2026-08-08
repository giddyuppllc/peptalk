/**
 * verify-csp — assert the Content-Security-Policy actually allows the hosts
 * this app talks to.
 *
 * WHY THIS EXISTS
 * A CSP that omits a host fails SILENTLY and only in the browser: the request
 * is blocked, no server log records it, and the feature just does nothing.
 * That is the same shape as every other bug this app keeps hitting.
 *
 * It was found the honest way. Sentry was enabled for the PWA on 2026-08-07 by
 * adding EXPO_PUBLIC_SENTRY_DSN to the local .env, and nobody updated
 * connect-src. Because the strict policy currently ships as Report-Only, the
 * events still flowed — but the day anyone promotes it to enforced, every web
 * crash report would vanish with no warning. This check makes that impossible
 * to land again.
 *
 * Skips cleanly when a value cannot be resolved, so CI stays green without
 * secrets (same contract as verify:square).
 */
import { readFileSync, existsSync } from 'node:fs';

type Header = { key: string; value: string };
type Entry = { source: string; headers: Header[] };

const VERCEL_JSON = 'public/vercel.json';

let failures = 0;
let checks = 0;
const skipped: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  checks++;
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${detail}`);
  }
}

/** Read a KEY=value out of .env without pulling in a dotenv dependency. */
function envValue(key: string): string | null {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  if (!existsSync('.env')) return null;
  // Split on /\r?\n/, NOT '\n'. On a CRLF checkout every line would keep a
  // trailing \r, and in JS regex `.` does NOT match \r (it is a line
  // terminator), so `(.*)$` never matches and this returned null for a value
  // that was plainly there. The check then SKIPPED instead of failing — a
  // silently-skipping verifier is worse than no verifier. Caught exactly that
  // way while writing this file.
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    // Trim BOTH sides: an untrimmed value with a trailing \r or space has
    // caused real outages here before, and would silently fail to match a host.
    if (m && m[1] === key && m[2].trim()) return m[2].trim();
  }
  return null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Pull one directive's source list out of a CSP string. */
function directive(csp: string, name: string): string[] | null {
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (trimmed === name || trimmed.startsWith(name + ' ')) {
      return trimmed.slice(name.length).trim().split(/\s+/).filter(Boolean);
    }
  }
  return null;
}

console.log('\n— CSP harness —\n');

if (!existsSync(VERCEL_JSON)) {
  console.error(`${VERCEL_JSON} not found`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as { headers?: Entry[] };
const allHeaders = (config.headers ?? []).flatMap((e) => e.headers ?? []);

const enforced = allHeaders.find((h) => h.key === 'Content-Security-Policy')?.value ?? null;
const reportOnly =
  allHeaders.find((h) => h.key === 'Content-Security-Policy-Report-Only')?.value ?? null;

if (!reportOnly) {
  console.error('No Content-Security-Policy-Report-Only header found — nothing to verify.');
  process.exit(1);
}

// The strict policy is the one that must be complete: it is the candidate for
// enforcement, and promoting an incomplete policy is what breaks things.
const policy = reportOnly;

// ── connect-src must cover every origin the app fetches from ────────────────
const connect = directive(policy, 'connect-src');
check('connect-src is declared', connect != null, 'no connect-src directive in the policy');

function requireConnect(label: string, origin: string | null) {
  if (!origin) {
    skipped.push(label);
    return;
  }
  check(
    `connect-src allows ${label}`,
    !!connect && connect.includes(origin),
    `${origin} missing from connect-src — requests would be blocked once the policy is enforced`,
  );
}

const sentryDsn = envValue('EXPO_PUBLIC_SENTRY_DSN');
requireConnect('Sentry ingest', sentryDsn ? hostOf(sentryDsn) : null);

const supabaseUrl = envValue('EXPO_PUBLIC_SUPABASE_URL');
requireConnect('Supabase REST', supabaseUrl ? hostOf(supabaseUrl) : null);
if (supabaseUrl) {
  const wss = hostOf(supabaseUrl)?.replace(/^https:/, 'wss:') ?? null;
  check(
    'connect-src allows Supabase Realtime (wss)',
    !!connect && !!wss && connect.includes(wss),
    `${wss} missing — Realtime subscriptions would be blocked`,
  );
}

// ── script-src / frame-src must cover the Square Web Payments SDK ───────────
// Read the literals straight out of the config module so a URL change there
// cannot silently drift away from the policy.
const squareSrc = existsSync('src/config/square.ts')
  ? readFileSync('src/config/square.ts', 'utf8')
  : '';
const squareHosts = [...squareSrc.matchAll(/https:\/\/[a-z0-9.-]*squarecdn\.com/g)].map((m) => m[0]);
const uniqueSquare = [...new Set(squareHosts)];

const script = directive(policy, 'script-src');
if (uniqueSquare.length === 0) {
  skipped.push('Square SDK hosts (none found in src/config/square.ts)');
} else {
  for (const host of uniqueSquare) {
    check(
      `script-src allows ${host}`,
      !!script && script.includes(host),
      `${host} missing from script-src — the card form would never load, so nobody could pay`,
    );
  }
}

// ── the enforced policy must never be broader than the strict one ──────────
check(
  'enforced policy still pins frame-ancestors',
  !!enforced && /frame-ancestors\s+'none'/.test(enforced),
  'the enforced CSP no longer denies framing — clickjacking protection lost',
);

console.log('');
console.log(`Total checks: ${checks}`);
console.log(`Passed:       ${checks - failures}`);
console.log(`Failed:       ${failures}`);
if (skipped.length) {
  console.log(`Skipped:      ${skipped.length} (value not resolvable here)`);
  for (const s of skipped) console.log(`  - ${s}`);
}

if (failures > 0) {
  console.log('\n✗ CSP checks failed.\n');
  process.exit(1);
}
console.log('\n✓ All CSP checks passed.\n');
