/**
 * verify-build — refuse to deploy a stale dist/.
 *
 * WHY THIS EXISTS
 * On 2026-08-08 `dist/` was four commits behind HEAD. It contained the Alert
 * fix but NOT the dose-unit fix, the peptide back button, the TB-500
 * correction or the Aimee banner fix. It looked complete, it had been
 * "verified" — headers, service worker, bundle hash all checked out — and it
 * was one command away from being deployed and reported as those fixes
 * shipping. Nothing in the artifact could contradict the claim, because a
 * build has no memory of its source.
 *
 * That is the whole failure mode: a patch that solves for an inaccurate
 * picture of the system. So the artifact now carries its commit, and this
 * checks it.
 *
 * Also verifies the deploy-critical headers, because a bundle built from the
 * right commit but served without CSP/HSTS is its own kind of silent wrong.
 *
 * Run before any web deploy:  npm run verify:build
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const INDEX = 'dist/index.html';
let failures = 0;

function fail(msg: string, detail?: string) {
  failures++;
  console.log(`  ✗ ${msg}`);
  if (detail) console.log(`      ${detail}`);
}
function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

console.log('\n— build freshness —\n');

if (!existsSync(INDEX)) {
  console.log(`  ✗ ${INDEX} not found — run "npm run export:web" first.\n`);
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');

// ── 1. Does the artifact match HEAD? ───────────────────────────────────────
const stamped = html.match(/name="peptalk-build-commit"\s+content="([0-9a-f]{7,40}|unknown)"/)?.[1];
let head = '';
try {
  head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout */
}

if (!stamped) {
  fail(
    'no build stamp in dist/index.html',
    'Built by an older inject-pwa. Re-run "npm run export:web" to stamp it.',
  );
} else if (stamped === 'unknown') {
  fail('build stamp is "unknown"', 'Built outside a git checkout — freshness cannot be confirmed.');
} else if (!head) {
  console.log('  ~ cannot compare (not a git checkout); stamp is ' + stamped.slice(0, 7));
} else if (stamped !== head) {
  const behind = (() => {
    try {
      return execSync(`git rev-list --count ${stamped}..${head}`, { encoding: 'utf8' }).trim();
    } catch {
      return '?';
    }
  })();
  fail(
    `dist/ was built from ${stamped.slice(0, 7)}, HEAD is ${head.slice(0, 7)} (${behind} commit(s) ahead)`,
    'Re-run "npm run export:web" before deploying, or you will ship missing fixes.',
  );
  try {
    const missing = execSync(
      `git log --format="  %h %s" ${stamped}..${head} -- app src supabase/functions assets`,
      { encoding: 'utf8' },
    ).trim();
    if (missing) {
      console.log('      user-facing commits NOT in this build:');
      for (const line of missing.split('\n').slice(0, 15)) console.log(`    ${line}`);
    }
  } catch {
    /* best effort */
  }
} else {
  pass(`dist/ matches HEAD (${head.slice(0, 7)})`);
}

// ── 2. Deploy-critical artifacts ───────────────────────────────────────────
console.log('\n— deploy artifacts —\n');

const REQUIRED_IN_HTML: [string, RegExp][] = [
  ['manifest linked', /rel="manifest"/],
  ['service worker registered', /serviceWorker/],
  ['viewport is app-like', /viewport-fit=cover/],
];
for (const [label, re] of REQUIRED_IN_HTML) {
  if (re.test(html)) pass(label);
  else fail(`${label} missing from dist/index.html`);
}

if (!existsSync('dist/vercel.json')) {
  fail('dist/vercel.json missing', 'Security headers would not be applied on deploy.');
} else {
  const cfg = JSON.parse(readFileSync('dist/vercel.json', 'utf8'));
  const keys = new Set(
    (cfg.headers ?? []).flatMap((e: any) => (e.headers ?? []).map((h: any) => h.key)),
  );
  for (const h of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    // Added 2026-08-21. Absent from the live site until then; listed here so
    // they cannot quietly fall out of public/vercel.json again.
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
  ]) {
    if (keys.has(h)) pass(`header ${h}`);
    else fail(`header ${h} missing from dist/vercel.json`);
  }
}

if (existsSync('dist/sw.js')) {
  const sw = readFileSync('dist/sw.js', 'utf8');
  if (/peptalk-shell-v\d+/.test(sw)) pass('service worker has a versioned cache');
  else fail('service worker cache is unversioned', 'A stale shell can never be evicted.');
} else {
  fail('dist/sw.js missing');
}

// ---------------------------------------------------------------------------
// Payments environment.
//
// 2026-08-21: the live PWA was found shipping Square's SANDBOX SDK and the
// sandbox Application ID. src/config/square.ts defaults SQUARE_ENV to
// 'sandbox' when EXPO_PUBLIC_SQUARE_ENV is unset, and it was unset on the
// build machine — so every web build silently produced a checkout that cannot
// take a real payment. Nothing failed, nothing warned; the subscribe button
// rendered a card form wired to sandbox.
//
// EXPO_PUBLIC_* values are inlined into the bundle at export time, so the
// built artifact is the only honest place to check this.
// ---------------------------------------------------------------------------
console.log('\n— payments environment —\n');
{
  // readdirSync, not a shell glob: `ls dist/.../*.js` is not portable and on
  // Windows returned "cannot find the path", which made this report "no web
  // bundle" instead of actually checking the bundle that was about to ship.
  const BUNDLE_DIR = 'dist/_expo/static/js/web';
  const bundles = existsSync(BUNDLE_DIR)
    ? readdirSync(BUNDLE_DIR)
        .filter((f) => f.endsWith('.js'))
        .map((f) => `${BUNDLE_DIR}/${f}`)
    : [];

  if (bundles.length === 0) {
    // Positive control. This check reads a corpus it discovers, so an empty
    // corpus means it verified nothing — which must never look like a pass.
    // verify-scanner-controls enforces that every discovering verifier says so.
    console.log(
      '  ✗ SELF-CHECK FAILED — found 0 bundles in dist/_expo/static/js/web; ' +
        'cannot tell which Square environment shipped.',
    );
    fail('no web bundle found in dist/', 'cannot tell which Square environment shipped');
  } else {
    const js = bundles.map(b => readFileSync(b, 'utf8')).join('');
    const sandboxSdk = js.includes('sandbox.web.squarecdn.com');
    const sandboxAppId = /sandbox-sq0idb-/.test(js);
    const prodSdk = /(?<!sandbox\.)web\.squarecdn\.com/.test(js);

    if (sandboxSdk || sandboxAppId) {
      // Escape hatch. Without it this gate holds every unrelated fix hostage
      // to the Square configuration — a security header or a crash fix could
      // not ship while payments were misconfigured. Explicit, loud, and opt-in
      // per invocation, so it cannot become the silent default.
      if (process.env.ALLOW_SANDBOX_PAYMENTS === '1') {
        console.log('  ! Square SANDBOX in this build — allowed via ALLOW_SANDBOX_PAYMENTS=1');
        console.log('      Web checkout CANNOT take a real payment in this deploy.');
      } else {
        fail(
          'this build ships Square SANDBOX — it cannot take a real payment',
          'set EXPO_PUBLIC_SQUARE_ENV=production, EXPO_PUBLIC_SQUARE_APPLICATION_ID and ' +
            'EXPO_PUBLIC_SQUARE_LOCATION_ID to their production values, then re-export. ' +
            'To ship an unrelated fix meanwhile: ALLOW_SANDBOX_PAYMENTS=1 npm run deploy:web',
        );
      }
    } else if (!prodSdk) {
      // Neither present: the form may have been removed, which is a decision,
      // not a defect — but say so rather than passing silently.
      pass('no Square web checkout in this build');
    } else {
      pass('Square web checkout is on the production SDK');
    }
  }
}

console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} problem(s) — do NOT deploy this build.\n`);
  process.exit(1);
}
console.log('✓ Build is current and deployable.\n');
