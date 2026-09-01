#!/usr/bin/env node
/**
 * Does the repo still match what is RUNNING?
 *
 * Every other check in this repo compares the repo against itself. This one
 * compares it against production, and it exists because that gap kept producing
 * the same surprise:
 *
 *   - five edge functions live with no source here at all;
 *   - three shared modules they depend on, also absent;
 *   - `aimee-chat-stream` deployed with 848 lines of index.ts and 321 of
 *     _cost.ts while the repo held 738 and 145.
 *
 * That last one is a live hazard rather than untidiness: deploying
 * aimee-chat-stream from this repo would REVERT production by ~286 lines and
 * delete `readCreditBalance` / `overageState`, which the deployed `aimee-usage`
 * imports.
 *
 * HOW IT WORKS
 * Supabase's deployed bundle is an ESZIP that embeds source maps carrying
 * `sourcesContent` — the original TypeScript. So the deployed source can be read
 * back and compared directly. The method was validated against a control:
 * `_shared/effectiveTier.ts`, which the repo already had, came back identical.
 *
 * NOT in verify:all — it downloads a bundle per function (hundreds of KB each)
 * and needs a token. Run it before a release, or when a deploy surprises you:
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/check-deployed-drift.mjs [fn ...]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REF = 'zniucpbeepxysvkshpir';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

if (!TOKEN) {
  console.error('✗ SUPABASE_ACCESS_TOKEN is required — this check compares against production.');
  process.exit(1);
}

/** Pull every original source out of a deployed bundle's embedded source maps. */
function extractSources(buf) {
  const text = Buffer.from(buf).toString('utf8');
  const out = new Map();
  const re = /\{"version":3,"sources":\[/g;
  let m;
  while ((m = re.exec(text))) {
    // Walk to the matching brace, respecting strings and escapes.
    let depth = 0, i = m.index, inStr = false, esc = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    let sm;
    try { sm = JSON.parse(text.slice(m.index, i + 1)); } catch { continue; }
    const { sources = [], sourcesContent } = sm;
    if (!sourcesContent) continue;
    sources.forEach((s, k) => {
      if (s.includes('functions/') && sourcesContent[k] && !out.has(s)) {
        out.set(s, sourcesContent[k]);
      }
    });
  }
  return out;
}

const norm = (s) => s.replace(/\r\n/g, '\n').trim();

const listRes = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/functions`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
if (!listRes.ok) {
  console.error(`✗ could not list functions: ${listRes.status}`);
  process.exit(1);
}
const deployed = (await listRes.json()).filter((f) => f.status === 'ACTIVE');
const only = process.argv.slice(2);
const targets = only.length ? deployed.filter((f) => only.includes(f.slug)) : deployed;

console.log(`\n━━━ deployed vs repo ━━━\n  checking ${targets.length} function(s)\n`);

let drifted = 0, missing = 0, checked = 0;

for (const fn of targets) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/functions/${fn.slug}/body`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!res.ok) { console.log(`  ?  ${fn.slug}: body unavailable (${res.status})`); continue; }
  const sources = extractSources(await res.arrayBuffer());
  if (!sources.size) { console.log(`  ?  ${fn.slug}: no source maps in the bundle`); continue; }

  for (const [key, content] of sources) {
    const rel = join('supabase', key);
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) { missing++; console.log(`  ✗  ${rel} — deployed but NOT in the repo`); continue; }
    checked++;
    if (norm(readFileSync(abs, 'utf8')) !== norm(content)) {
      drifted++;
      const a = norm(readFileSync(abs, 'utf8')).split('\n').length;
      const b = norm(content).split('\n').length;
      console.log(`  ✗  ${rel} — DRIFT (repo ${a}L, deployed ${b}L)`);
    }
  }
}

console.log(`\n  ${checked} file(s) compared · ${drifted} drifted · ${missing} deployed with no source here`);
if (drifted || missing) {
  console.error(
    '\n✗ the repo does not match production.\n' +
      '  Deploying a drifted function would REVERT whatever is only in production.\n' +
      '  Recover it first — see supabase/functions/_recovered/README.md.\n',
  );
  process.exit(1);
}
console.log('\n✓ every deployed file matches the repo\n');
