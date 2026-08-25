/**
 * preflight — probe the LIVE system, not the source.
 *
 * WHY THIS EXISTS
 * Every expensive failure in this project has had the same shape: correct code
 * that was never connected, or a config change that never reached the thing it
 * was meant to configure. A diff review sees nothing wrong, because nothing is
 * wrong with the diff.
 *
 *   - `.easignore` did not exclude android/, so builds used a 16-day-old
 *     manifest and shipped without health.WRITE_WEIGHT. app.json was correct.
 *   - Google Play RTDN had a topic and nothing subscribed to it. A real
 *     customer paid and the server never heard about it. The code was correct.
 *   - The PWA served a 4-day-old bundle while the repo was green.
 *   - The live build shipped Square SANDBOX, so no real card could ever work.
 *
 * Every one of those was found by checking an OUTCOME — curl the header, unzip
 * the artifact, query the row. That is all this script does, in one command,
 * before a release instead of after.
 *
 * READ-ONLY BY CONSTRUCTION
 * It writes nothing, anywhere. It does not send a Pub/Sub test notification, it
 * does not deploy, and it never POSTs a payload that could be acted on. The
 * edge-function probes send `{}` unauthenticated, and every one of those
 * functions verifies a JWT, an OIDC token or an HMAC signature BEFORE touching
 * the database — a rejected probe cannot create a row.
 *
 * Checks that cannot run (no network, no linked project) SKIP loudly rather
 * than passing quietly. A check that passes without looking at anything is
 * worse than no check.
 *
 *   npm run preflight
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const SUPABASE = 'https://zniucpbeepxysvkshpir.supabase.co';
const PWA = 'https://app.peptalk.bio';

let pass = 0, fail = 0, skip = 0, warn = 0;
const failures = [];

const ok = (m, d) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`); if (d) console.log(`      ${d}`); };
const bad = (m, d) => { fail++; failures.push(m); console.log(`  \x1b[31m✗\x1b[0m ${m}`); if (d) console.log(`      ${d}`); };
const wrn = (m, d) => { warn++; console.log(`  \x1b[33m!\x1b[0m ${m}`); if (d) console.log(`      ${d}`); };
const skp = (m, d) => { skip++; console.log(`  \x1b[90m–\x1b[0m ${m} — SKIPPED`); if (d) console.log(`      ${d}`); };
const head = (t) => console.log(`\n\x1b[1m— ${t} —\x1b[0m\n`);

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. Is the deployed PWA the code we think it is? ─────────────────────────
head('deployed web bundle');

let localHead = null;
try {
  localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch { /* not a git checkout */ }

let servedHtml = null;
try {
  // Cache-bust. A plain request hits the CDN edge cache and can return the
  // PREVIOUS deploy — which is exactly how a stale bundle stayed invisible.
  const r = await get(`${PWA}/?preflight=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  servedHtml = await r.text();
  if (!r.ok) bad(`${PWA} returned HTTP ${r.status}`);
} catch (e) {
  skp('web bundle checks', `could not reach ${PWA}: ${e.message}`);
}

if (servedHtml) {
  const m = servedHtml.match(/peptalk-build-commit"\s+content="([a-f0-9]+)"/);
  if (!m) {
    bad('served page has no build-commit stamp', 'inject-pwa did not run, or an unexpected page is being served');
  } else if (!localHead) {
    wrn(`served commit ${m[1].slice(0, 7)}`, 'not a git checkout — cannot compare to HEAD');
  } else if (m[1] === localHead) {
    ok(`served bundle matches HEAD (${localHead.slice(0, 7)})`);
  } else {
    bad(
      `served bundle is NOT HEAD — serving ${m[1].slice(0, 7)}, HEAD is ${localHead.slice(0, 7)}`,
      'the deploy did not land, or dist/ was built from an older commit',
    );
  }

  // The self-update path. Without it an installed PWA never learns a new
  // version exists, so a fix can ship and reach nobody.
  if (servedHtml.includes('controllerchange') && servedHtml.includes('hadController')) {
    ok('served bundle carries the self-update path');
  } else {
    bad('served bundle has no self-update path', 'installed PWAs will never pick up future deploys');
  }

  // Payment environment, read from what is actually SERVED.
  //
  // This must fetch the JS bundle, not index.html. The first version tested
  // index.html, where the Square application id never appears — so NEITHER
  // branch matched and the check printed nothing at all while looking like it
  // had run. A check that can silently no-op is the thing this script exists
  // to prevent.
  const scriptSrc = servedHtml.match(/<script[^>]+src="([^"]*_expo[^"]*\.js)"/)?.[1];
  if (!scriptSrc) {
    bad('could not find the JS bundle in the served page', 'cannot determine the payment environment');
  } else {
    try {
      const br = await get(scriptSrc.startsWith('http') ? scriptSrc : `${PWA}${scriptSrc}`);
      const js = await br.text();
      if (/sandbox-sq0idb-|squareupsandbox\.com|sandbox\.web\.squarecdn\.com/.test(js)) {
        wrn('served bundle ships Square SANDBOX', 'no real card can complete a payment on this build');
      } else if (/web\.squarecdn\.com|sq0idp-/.test(js)) {
        ok('served bundle is on the Square production SDK');
      } else {
        wrn('no Square web checkout found in the served bundle', 'that may be deliberate — saying so rather than passing silently');
      }
    } catch (e) {
      skp('payment environment', `could not fetch the JS bundle: ${e.message}`);
    }
  }
}

// ── 2. Security headers, as actually served ─────────────────────────────────
head('security headers');

if (servedHtml === null) {
  skp('header checks', 'web host unreachable');
} else {
  try {
    const r = await get(`${PWA}/?preflight=${Date.now()}`, { method: 'HEAD' });
    const required = [
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
      'content-security-policy',
    ];
    const missing = required.filter((h) => !r.headers.get(h));
    if (missing.length) bad(`missing headers: ${missing.join(', ')}`);
    else ok('all six security headers present');

    const csp = r.headers.get('content-security-policy') ?? '';
    const cspRO = r.headers.get('content-security-policy-report-only') ?? '';
    if (cspRO && !csp.includes('script-src')) {
      wrn('CSP is Report-Only for everything except frame-ancestors', 'it is collecting, not blocking');
      if (!cspRO.includes('report-uri') && !cspRO.includes('report-to')) {
        bad('Report-Only CSP has no reporting endpoint', 'it blocks nothing AND collects nothing');
      }
    }
  } catch (e) {
    skp('header checks', e.message);
  }
}

// ── 3. Edge functions: reachable, and refusing anonymous callers ────────────
head('edge functions');

// Every one of these verifies auth/signature BEFORE any database work, so an
// unauthenticated probe cannot create anything. A 200 here would mean an
// endpoint is doing work for an anonymous caller.
const PROBES = [
  'square-subscribe', 'square-webhook', 'google-rtdn', 'apple-notifications',
  'validate-purchase', 'aimee-chat-stream', 'community-create-post', 'delete-user',
];
let probed = 0;
for (const fn of PROBES) {
  try {
    const r = await get(`${SUPABASE}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    probed++;
    if (r.status >= 500) bad(`${fn} returned HTTP ${r.status}`, 'the function is throwing before it can reject the caller');
    else if (r.status === 200) bad(`${fn} returned 200 to an ANONYMOUS caller`, 'it is doing work without authentication');
    else if (r.status === 404) bad(`${fn} is not deployed (404)`);
  } catch (e) {
    skp(`probe ${fn}`, e.message);
  }
}
if (probed === PROBES.length && !failures.some((f) => PROBES.some((p) => f.startsWith(p)))) {
  ok(`${probed} functions reachable, all refusing anonymous callers`);
}

// ── 4. Is money actually arriving? ──────────────────────────────────────────
head('store notification delivery');

const sql = `
  select platform, count(*) as n, max(created_at)::date as last
  from public.subscription_events group by platform;
`;
let rows = null;
try {
  const tmp = '.preflight.sql';
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmp, sql);
  try {
    const raw = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', tmp], {
      encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    rows = JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];
  } finally {
    try { unlinkSync(tmp); } catch { /* already gone */ }
  }
} catch (e) {
  skp('store notification delivery', `needs a linked Supabase project: ${String(e.message).split('\n')[0]}`);
}

if (rows) {
  const byPlatform = Object.fromEntries(rows.map((r) => [r.platform, r]));
  for (const p of ['ios', 'android']) {
    const r = byPlatform[p];
    if (!r || Number(r.n) === 0) {
      bad(
        `ZERO ${p} subscription events have ever arrived`,
        p === 'android'
          ? 'Play has a Pub/Sub topic but nothing is delivering from it — purchases are invisible to the server'
          : 'App Store Server Notifications are not reaching apple-notifications',
      );
    } else {
      ok(`${p}: ${r.n} events, most recent ${r.last}`);
    }
  }
}

// ── 5. Does the built Android artifact match app.json? ──────────────────────
head('android build inputs');

// The check that would have caught WRITE_WEIGHT going missing. Cheap version:
// confirm the native project cannot silently override app.json.
if (!existsSync('.easignore')) {
  ok('no .easignore — .gitignore governs the EAS upload');
} else {
  const eas = readFileSync('.easignore', 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/^\/+/, '').replace(/\/+$/, ''));
  const leaked = ['android', 'ios'].filter((d) => existsSync(d) && !eas.includes(d));
  if (leaked.length) {
    bad(
      `.easignore does not exclude ${leaked.join(', ')}/`,
      'EAS will upload the local native project and SKIP prebuild, so app.json changes will not reach the build',
    );
  } else {
    ok('native projects excluded from the EAS upload — prebuild regenerates them');
  }
}

// ── verdict ─────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${pass} passed · ${fail} failed · ${warn} warning · ${skip} skipped\x1b[0m\n`);
if (skip > 0) {
  console.log('  Skipped checks proved nothing. Re-run with network and a linked project.\n');
}
if (fail > 0) {
  console.log('  \x1b[31mDo not release.\x1b[0m Each ✗ above is a live-system fact, not a lint opinion.\n');
  process.exit(1);
}
console.log('  Live system matches what the repo believes.\n');
