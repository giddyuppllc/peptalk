#!/usr/bin/env node
/**
 * verify:rpcgrants — no database function should be callable with the public
 * anon key unless it is deliberately listed here.
 *
 * WHY THIS EXISTS
 * On 2026-08-26 a probe with nothing but the anon key -- the key that ships
 * inside the web bundle and is readable by anyone -- successfully invoked
 * `grant_ai_credits`. That function is SECURITY DEFINER, so it runs as the
 * owner and bypasses RLS completely. The only thing that stopped the probe
 * granting unlimited AI credit was a foreign-key error on a made-up user id.
 *
 * The migration looked correct. It ended with the idiom used all over this
 * repo:
 *
 *     REVOKE ALL ON FUNCTION public.grant_ai_credits(...) FROM PUBLIC;
 *     GRANT  EXECUTE ON FUNCTION public.grant_ai_credits(...) TO service_role;
 *
 * That is not enough on Supabase. Supabase installs ALTER DEFAULT PRIVILEGES
 * granting EXECUTE on every new function in `public` to the `anon` and
 * `authenticated` roles. Those are EXPLICIT grants to named roles, and
 * `REVOKE ... FROM PUBLIC` does not touch them -- PUBLIC is a different
 * grantee. The revoke runs, reports success, and changes nothing.
 *
 * The same idiom appears in six migrations, and a second function
 * (`purge_expired_aimee_pending_actions`) had been anon-callable since May for
 * exactly this reason. So this is a repeating, silent, source-invisible
 * failure -- which is precisely the kind that needs a check against LIVE state
 * rather than against the SQL text.
 *
 * WHAT IT CHECKS
 * Queries pg_proc on the linked project and fails if any non-trigger function
 * in `public` is executable by `anon` (or is left at the PUBLIC default) and
 * is not in ALLOWED below. Trigger functions are excluded because PostgREST
 * cannot invoke them -- they return `trigger` and are not exposed as RPC.
 *
 * SKIPS LOUDLY. If the database cannot be reached this prints a clear SKIPPED
 * banner and exits 0, because a check that cannot run must not look like a
 * check that passed -- but it must also not fail a build for lack of
 * credentials. Never let it skip silently.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Functions that are SUPPOSED to be callable with the anon key.
 *
 * Empty on purpose. Nothing in PepTalk currently needs an anon-callable
 * database function -- clients go through PostgREST tables (guarded by RLS) or
 * through edge functions (which authenticate first). Adding an entry here is a
 * security decision: write down who may call it and why.
 */
const ALLOWED = new Set([]);

const SQL = `
SELECT p.proname AS fn,
       p.prosecdef AS secdef,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.proacl IS NULL THEN 'public-default'
            ELSE 'anon-granted' END AS how
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND pg_get_function_result(p.oid) <> 'trigger'
   AND (p.proacl IS NULL
        OR array_to_string(p.proacl::text[], ' ') LIKE '%anon=X%')
 ORDER BY p.prosecdef DESC, p.proname;
`;

function runQuery() {
  const file = join(tmpdir(), `peptalk-rpcgrants-${process.pid}.sql`);
  writeFileSync(file, SQL, 'utf8');
  try {
    // shell:true is required on Windows -- npx resolves to npx.cmd, and
    // spawning a .cmd without a shell throws EINVAL. Without this the check
    // silently took the SKIP path on the maintainer's own machine, which is
    // the exact failure mode it is meant to prevent.
    const out = execSync(
      'npx supabase db query --linked -f "' + file + '"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000, shell: true },
    );
    // The CLI wraps rows in a JSON envelope with an untrusted-data warning.
    const m = out.match(/"rows":\s*(\[[\s\S]*?\])\s*,\s*"(warning|message)"/);
    if (!m) return null;
    return JSON.parse(m[1]);
  } catch {
    return null;
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

const rows = runQuery();

if (rows === null) {
  console.log('\n— rpc grants —\n');
  console.log('  SKIPPED — could not reach the linked database.');
  console.log('  This check reads LIVE grants; it cannot be answered from source.');
  console.log('  Run `npx supabase link` and re-run to actually verify.\n');
  process.exit(0);
}

const offenders = rows.filter((r) => !ALLOWED.has(r.fn));

console.log('\n— rpc grants —\n');
console.log(`  non-trigger functions reachable with the anon key : ${rows.length}`);
console.log(`  explicitly allowed                               : ${ALLOWED.size}`);

if (offenders.length === 0) {
  console.log('\n  ✓ no database function is callable with the public anon key.\n');
  process.exit(0);
}

console.log(`\n  ✗ ${offenders.length} function(s) callable with the PUBLIC anon key:\n`);
for (const o of offenders) {
  const risk = o.secdef
    ? 'SECURITY DEFINER — runs as owner, bypasses RLS'
    : 'invoker rights — RLS still applies';
  console.log(`     ${o.fn}(${o.args})`);
  console.log(`        ${risk}  [${o.how}]`);
}
console.log(`
  Fix with an explicit revoke from the NAMED roles. Revoking from PUBLIC
  alone does not work here — Supabase grants anon/authenticated directly:

     REVOKE ALL ON FUNCTION public.<fn>(<args>)
       FROM PUBLIC, anon, authenticated;
     GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO service_role;

  If a function genuinely must be anon-callable, add it to ALLOWED in
  scripts/verify-rpc-grants.mjs with a note saying why.
`);
process.exit(1);
