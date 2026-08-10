/**
 * verify:functions — catch edge-function drift between the repo and the project.
 *
 * WHY THIS EXISTS
 * ---------------
 * `square-subscribe` sat in the repo, fully written, committed and tested, and
 * was never deployed. `squareService.ts` invoked it, so the PWA card form
 * tokenized a card and then POSTed to a function that returned 404. The web
 * payment path was dead and nothing anywhere said so — the same silent-drop
 * shape as the peptide data (see DATA_RECOVERY_BACKLOG.md): the caller exists,
 * the callee doesn't, and the failure only shows up to a real user.
 *
 * Checks three directions:
 *   1. a function directory in the repo with no deployed counterpart
 *   2. a deployed function with no source in the repo (orphan, unmaintainable)
 *   3. a client `functions.invoke('name')` or `/functions/v1/name` call whose
 *      target is neither deployed nor on disk — a guaranteed runtime 404
 *
 * Needs SUPABASE_ACCESS_TOKEN to query the project. Without it the remote half
 * is skipped and only the local call-graph check runs, so this stays safe to
 * call from CI that has no secrets.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'zniucpbeepxysvkshpir';
const FUNCTIONS_DIR = 'supabase/functions';

let errors = 0;
const fail = (msg: string) => {
  errors++;
  console.error(`  ❌ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const info = (msg: string) => console.log(`  ℹ️  ${msg}`);

// ─── 1. Functions in the repo ────────────────────────────────────────────────

const onDisk = readdirSync(FUNCTIONS_DIR)
  .filter((d) => !d.startsWith('_') && !d.startsWith('.'))
  .filter((d) => {
    try {
      return statSync(join(FUNCTIONS_DIR, d)).isDirectory();
    } catch {
      return false;
    }
  })
  .sort();

/**
 * Positive control.
 *
 * A MISSING supabase/functions throws, but an EMPTY one — or a run from the
 * wrong working directory — yields zero functions, zero mismatches, and a
 * clean report. Two sibling scanners were caught printing their success lines
 * over an empty corpus on 2026-08-10.
 */
const MIN_FUNCTIONS = 10;
if (onDisk.length < MIN_FUNCTIONS) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${onDisk.length} edge functions found in ${FUNCTIONS_DIR} ` +
      `(expected >= ${MIN_FUNCTIONS}).\n  Wrong working directory or an empty tree; a clean result ` +
      'would be meaningless.',
  );
  process.exit(1);
}

// ─── 2. Every function name the client actually calls ────────────────────────

const SOURCE_DIRS = ['src', 'app'];
const called = new Set<string>();

const walk = (dir: string): void => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/functions\.invoke\(\s*['"`]([a-z0-9-]+)['"`]/g)) {
      called.add(m[1]);
    }
    for (const m of src.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)) {
      called.add(m[1]);
    }
  }
};
SOURCE_DIRS.forEach(walk);

console.log(`\n━━━ Edge functions ━━━`);
info(`${onDisk.length} in repo, ${called.size} invoked by client code`);

// A client call with no source directory is already broken locally — that is
// checkable without any credentials, so it runs unconditionally.
for (const name of [...called].sort()) {
  if (!onDisk.includes(name)) {
    fail(`client calls "${name}" but ${FUNCTIONS_DIR}/${name}/ does not exist — guaranteed 404`);
  }
}

// ─── 3. Compare against what is actually deployed ────────────────────────────

let deployed: Set<string> | null = null;
try {
  const raw = execFileSync(
    'npx',
    ['supabase', 'functions', 'list', '--project-ref', PROJECT_REF],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' },
  );
  const parsed = JSON.parse(raw) as { functions?: { slug: string; status: string }[] };
  if (!parsed.functions) throw new Error('unexpected payload');
  deployed = new Set(parsed.functions.filter((f) => f.status === 'ACTIVE').map((f) => f.slug));
  const inactive = parsed.functions.filter((f) => f.status !== 'ACTIVE');
  for (const f of inactive) fail(`deployed function "${f.slug}" is ${f.status}, not ACTIVE`);
} catch {
  info('skipped the remote check — no SUPABASE_ACCESS_TOKEN / CLI not authenticated');
}

if (deployed) {
  info(`${deployed.size} deployed and ACTIVE`);

  for (const name of onDisk) {
    if (!deployed.has(name)) {
      const isCalled = called.has(name) ? ' — AND THE CLIENT CALLS IT' : '';
      fail(`"${name}" exists in the repo but is NOT deployed${isCalled}. Run: npx supabase functions deploy ${name} --project-ref ${PROJECT_REF}`);
    }
  }
  for (const name of deployed) {
    if (!onDisk.includes(name)) {
      fail(`"${name}" is deployed but has no source in ${FUNCTIONS_DIR}/ — nobody can maintain or redeploy it`);
    }
  }
  if (errors === 0) ok('repo, deployment and client call-graph all agree');
} else if (errors === 0) {
  ok('every function the client calls exists in the repo (deployment not checked)');
}

console.log('');
if (errors > 0) {
  console.error(`  ${errors} problem${errors === 1 ? '' : 's'} found\n`);
  process.exit(1);
}
process.exit(0);
