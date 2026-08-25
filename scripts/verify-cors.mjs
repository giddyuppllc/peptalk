/**
 * verify:cors — every edge function the CLIENT invokes must answer a browser
 * preflight.
 *
 * WHY THIS EXISTS
 * `square-subscribe` had no CORS headers and no OPTIONS handler. Native builds
 * were unaffected — React Native's fetch sends no preflight — so it looked
 * fine everywhere except the one place it mattered. In a browser the preflight
 * went unanswered, the POST was never sent, and the PWA reported:
 *
 *     "Failed to send a request to the Edge Function"
 *
 * which reads like a network blip, not a missing header. Web checkout could
 * never have completed a payment, and the failure was invisible on the two
 * platforms anyone was testing.
 *
 * The check is narrow on purpose: it only inspects functions the client
 * actually calls via `functions.invoke`, because those are the ones a browser
 * will ever preflight. A server-triggered webhook has no need for CORS and
 * flagging it would be noise.
 *
 * Both halves are required and they fail differently:
 *   - no OPTIONS handler  -> the preflight itself fails, POST never sent
 *   - no headers on the RESPONSE -> preflight passes, then the browser blocks
 *     the reply and the caller sees an opaque failure after the work was done
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCS = path.join(ROOT, 'supabase', 'functions');
const SRC_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, 'app')];

// ── which functions does the client invoke? ──────────────────────────────
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
SRC_DIRS.forEach(walk);

const invoked = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/functions\s*\.\s*invoke\(\s*['"]([a-z0-9-]+)['"]/g)) {
    invoked.add(m[1]);
  }
}

console.log('— CORS on client-invoked edge functions —');
console.log(`  functions the client invokes: ${invoked.size}`);

// Self-check: if the matcher finds nothing, every assertion below is vacuous.
if (invoked.size < 3) {
  console.error(
    `\nSELF-CHECK FAILED: found only ${invoked.size} functions.invoke() call sites — ` +
    'the matcher is broken, not the code.',
  );
  process.exit(1);
}

let failed = false;
const missing = [];
for (const name of [...invoked].sort()) {
  const p = path.join(FUNCS, name, 'index.ts');
  if (!fs.existsSync(p)) {
    failed = true;
    console.log(`\n  🔴 ${name} — invoked by the client, but no such edge function`);
    continue;
  }
  const src = fs.readFileSync(p, 'utf8');
  const hasHeader = /Access-Control-Allow-Origin/.test(src);
  const hasOptions = /req\.method\s*===\s*['"]OPTIONS['"]/.test(src);
  if (!hasHeader || !hasOptions) {
    failed = true;
    missing.push({ name, hasHeader, hasOptions });
  }
}

if (missing.length) {
  for (const m of missing) {
    console.log(`\n  🔴 ${m.name}`);
    if (!m.hasOptions) {
      console.log('     no OPTIONS handler — the browser preflight goes unanswered,');
      console.log('     so the POST is never sent and the caller sees');
      console.log('     "Failed to send a request to the Edge Function".');
    }
    if (!m.hasHeader) {
      console.log('     no Access-Control-Allow-Origin — even a successful preflight');
      console.log('     ends with the browser blocking the response.');
    }
  }
  console.log('\n  Native builds send no preflight, so this only breaks the web app.');
  process.exit(1);
}

if (!failed) {
  console.log(`\n  ✓ all ${invoked.size} client-invoked functions answer a preflight.`);
}
