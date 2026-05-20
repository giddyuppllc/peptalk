#!/usr/bin/env node
/**
 * get-admin-token.mjs — sign in to Supabase from Node and print the
 * admin user's access_token. Use it to populate $env:SUPABASE_TOKEN
 * for the R2→Stream migration script (or any other admin script).
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL      = "https://zniucpbeepxysvkshpir.supabase.co"
 *   $env:SUPABASE_ANON_KEY = "<anon JWT>"
 *   $env:ADMIN_EMAIL       = "edward@giddyupp.com"
 *   $env:ADMIN_PASSWORD    = "<your account password>"
 *   node scripts/get-admin-token.mjs
 *
 * Or one-liner to capture into the env directly:
 *   $env:SUPABASE_TOKEN = (node scripts/get-admin-token.mjs)
 *
 * The script prints ONLY the access_token to stdout (so the
 * one-liner works); diagnostic info goes to stderr.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function fail(msg) {
  console.error(`get-admin-token: ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail('SUPABASE_URL env var not set');
if (!SUPABASE_ANON_KEY) fail('SUPABASE_ANON_KEY env var not set');
if (!ADMIN_EMAIL) fail('ADMIN_EMAIL env var not set');
if (!ADMIN_PASSWORD) fail('ADMIN_PASSWORD env var not set');

const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});

if (!res.ok) {
  const text = await res.text().catch(() => '');
  fail(`auth failed (${res.status}): ${text.slice(0, 300)}`);
}

const data = await res.json();
if (!data?.access_token) fail(`no access_token in response: ${JSON.stringify(data).slice(0, 200)}`);

console.error(`Signed in as ${ADMIN_EMAIL} (expires in ${data.expires_in}s)`);
// stdout = just the token, so the PowerShell one-liner works.
process.stdout.write(data.access_token);
