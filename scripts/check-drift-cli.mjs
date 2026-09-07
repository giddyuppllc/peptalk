/**
 * Does the repo still match the edge functions that are RUNNING?
 *
 * Every other check compares this repo against itself. This one compares it
 * against production, and it exists because that gap produced a fortnight of
 * silent divergence: two machines committing in parallel from 25 Aug, five edge
 * functions live with no source in the repo at all, three shared modules
 * missing, and `aimee-chat-stream` deployed with ~286 more lines than the repo
 * held — so deploying from the repo would have REVERTED production.
 *
 * The existing check:drift does the same job through the Management API and
 * needs SUPABASE_ACCESS_TOKEN. This one goes through the Supabase CLI instead,
 * which carries its own login, so anyone already able to run `supabase` can run
 * the check without a token to hand. Keep both: they fail for different
 * reasons, and this one runs on a laptop.
 *
 * It downloads into a temporary --workdir. It must never write into
 * supabase/functions: a check that "fixes" the thing it is measuring reports
 * success every time and tells you nothing.
 *
 * Run:  npm run check:drift:cli
 * Test: npm run check:drift:cli -- --self-test
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, mkdirSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const REF = 'zniucpbeepxysvkshpir';
const FN_DIR = join(ROOT, 'supabase', 'functions');

// shell: true because on Windows `npx` is npx.cmd, which execFileSync cannot
// spawn directly — without it this failed with a bare "cannot reach production"
// that looked like the CLI was logged out.
const sh = (args, opts = {}) =>
  execFileSync('npx', ['--yes', 'supabase', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
    ...opts,
  });

/** Files under a function directory, relative, sorted. */
function filesUnder(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, prefix ? prefix + '/' + e.name : e.name);
      else out.push(prefix ? prefix + '/' + e.name : e.name);
    }
  };
  walk(dir, '');
  return out.sort();
}

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

export function compareTrees(repoDir, liveDir, slugs) {
  const findings = [];
  let compared = 0;
  for (const slug of slugs) {
    const a = join(repoDir, slug);
    const b = join(liveDir, slug);
    if (!existsSync(b)) continue; // not deployed
    if (!existsSync(a)) {
      findings.push(`${slug}: deployed but NO SOURCE in the repo`);
      continue;
    }
    const fa = new Set(filesUnder(a));
    const fb = filesUnder(b);
    for (const f of fb) {
      compared++;
      const live = norm(readFileSync(join(b, f), 'utf8'));
      if (!fa.has(f)) {
        findings.push(`${slug}/${f}: deployed but missing from the repo`);
        continue;
      }
      const repo = norm(readFileSync(join(a, f), 'utf8'));
      if (repo !== live) {
        findings.push(
          `${slug}/${f}: repo and production differ ` +
            `(repo ${repo.split('\n').length} lines, deployed ${live.split('\n').length})`);
      }
    }
  }
  return { findings, compared };
}

function selfTest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) { console.error('  self-test FAILED: ' + name); bad++; }
    else console.error('  ok: ' + name);
  };
  const base = mkdtempSync(join(tmpdir(), 'drift-self-'));
  const repo = join(base, 'repo'), live = join(base, 'live');
  for (const d of [repo, live]) mkdirSync(join(d, 'fn-a'), { recursive: true });
  writeFileSync(join(repo, 'fn-a', 'index.ts'), 'export const a = 1;\n');
  writeFileSync(join(live, 'fn-a', 'index.ts'), 'export const a = 1;\n');

  t('identical trees report no drift',
    compareTrees(repo, live, ['fn-a']).findings.length === 0);

  writeFileSync(join(live, 'fn-a', 'index.ts'), 'export const a = 2;\n');
  t('DETECTS content that differs',
    compareTrees(repo, live, ['fn-a']).findings.length === 1);

  writeFileSync(join(live, 'fn-a', 'index.ts'), 'export const a = 1;\r\n');
  t('IGNORES CRLF-only differences',
    compareTrees(repo, live, ['fn-a']).findings.length === 0);

  writeFileSync(join(live, 'fn-a', 'extra.ts'), 'export const b = 1;\n');
  t('DETECTS a deployed file absent from the repo',
    compareTrees(repo, live, ['fn-a']).findings.length === 1);

  mkdirSync(join(live, 'fn-b'), { recursive: true });
  writeFileSync(join(live, 'fn-b', 'index.ts'), 'export const c = 1;\n');
  t('DETECTS a function deployed with no source at all',
    compareTrees(repo, live, ['fn-b']).findings.some((f) => f.includes('NO SOURCE')));

  rmSync(base, { recursive: true, force: true });
  if (bad) { console.error(`\nself-test: ${bad} failure(s)`); process.exitCode = 1; }
  else console.error('\nself-test: all checks behaved correctly');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  let slugs;
  try {
    slugs = JSON.parse(sh(['functions', 'list', '--project-ref', REF]))
      .functions.map((f) => f.slug);
  } catch (e) {
    console.error('drift: could not list deployed functions — is the Supabase CLI logged in?');
    console.error(String(e.message || e).split('\n')[0]);
    process.exitCode = 1;
    throw new Error('cannot reach production');
  }

  const tmp = mkdtempSync(join(tmpdir(), 'peptalk-drift-'));
  try {
    sh(['functions', 'download', '--project-ref', REF, '--use-api', '--workdir', tmp],
       { stdio: ['ignore', 'ignore', 'pipe'] });
    const liveDir = join(tmp, 'supabase', 'functions');
    if (!existsSync(liveDir)) throw new Error('download produced no functions directory');

    const { findings, compared } = compareTrees(FN_DIR, liveDir, slugs);

    // A green check that compared nothing is worse than no check.
    if (slugs.length < 20 || compared < 20) {
      console.error(`drift: compared implausibly little (${slugs.length} functions, ` +
                    `${compared} files). The check is broken, not the code.`);
      process.exitCode = 1;
    }
    for (const f of findings) console.error('drift: ' + f);
    console.error(
      findings.length
        ? `\ndrift: ${slugs.length} deployed functions, ${compared} files, ${findings.length} difference(s).`
        : `\ndrift: ${slugs.length} deployed functions, ${compared} files — repo matches production exactly.`);
    if (findings.length) process.exitCode = 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
