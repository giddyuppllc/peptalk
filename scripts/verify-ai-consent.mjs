#!/usr/bin/env node
/**
 * verify:aiconsent — the health-data consent must reach EVERY AI edge function,
 * not just Aimee chat.
 *
 * The app has two separate consents. `useAiConsentStore.consented` (the launch
 * modal, checked by ensureAiConsent) covers "may we send messages, voice and
 * photos to an AI provider". `profile.aiDataConsent` (the health toggle,
 * checked by canSendToCloud) covers "may we use your HEALTH PROFILE". Before
 * 2026-09-16 only llmService.buildServerContext and app/(tabs)/peptalk.tsx read
 * the second one, so with the modal accepted and the toggle OFF the app still
 * sent lab values, a photo of a lab report, dose logs, side-effect severities,
 * check-in moods, medical and food allergies, the active peptide stack, goals,
 * age and sex to nine other functions.
 *
 * Four checks, all read from the SOURCE, none from a doc:
 *
 *   1. Registry parity — src/lib/aiFeatureConsent.ts and
 *      supabase/functions/_shared/aiFeatureConsent.ts list the same functions
 *      and the same fields. (Also asserted by jest; cheap to repeat here.)
 *   2. No unregistered AI function — any supabase/functions/aimee-*, lab-scan
 *      or food-scan directory must be in the registry or in EXEMPT with a
 *      reason.
 *   3. Client — every call site of a registered function must send a body that
 *      is a direct `withHealthConsent('<fn>', …)` call, OR (for a function with
 *      no health field) a body literal containing no health field at all. Every
 *      call site of a CONSENT_REQUIRED function must additionally be preceded,
 *      in its own file, by `healthConsentGranted()`.
 *   4. Server — every registered function with at least one health field must
 *      call `applyFeatureConsent('<its own name>', …)` in its index.ts, and the
 *      refuse-list ones must answer HEALTH_CONSENT_REFUSAL.
 *
 * Self-test: `node scripts/verify-ai-consent.mjs --self-test` runs the analyser
 * over synthetic fixtures (a gated call, an ungated call, a missing server
 * guard) and fails if any fixture lands on the wrong verdict — so the check
 * cannot pass by reading nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_REGISTRY = 'src/lib/aiFeatureConsent.ts';
const SERVER_REGISTRY = 'supabase/functions/_shared/aiFeatureConsent.ts';

/**
 * AI edge functions deliberately outside the registry. An entry here is a
 * claim about the request body, and check 2 fails if a new one appears without
 * one.
 */
const EXEMPT = {
  'aimee-chat': 'governed by _shared/aimeeConsent.ts (applyAiDataConsent on AimeeServerContext)',
  'aimee-chat-stream': 'governed by _shared/aimeeConsent.ts, incl. the health-reading tools',
  'aimee-usage': 'reads the caller\'s own allowance counters; the request carries no user data',
  'aimee-action-confirm': 'body is {action_id, decision, edits} for an action the user just approved',
  'aimee-pantry-parse': 'body is {text} — a pantry line the user typed; food names, no health record',
  'food-search-proxy': 'body is a food-name search string',
};

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);

// ─── registry parsing ────────────────────────────────────────────────────────

/** Pull the two exported literals out of a registry file without importing it. */
function parseRegistry(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const mapBlock = src.match(/AI_FEATURE_HEALTH_FIELDS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!mapBlock) throw new Error(`${rel}: AI_FEATURE_HEALTH_FIELDS not found`);
  const body = mapBlock[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fields = {};
  for (const m of body.matchAll(/'([a-z0-9-]+)'\s*:\s*\[([^\]]*)\]/g)) {
    fields[m[1]] = [...m[2].matchAll(/'([A-Za-z0-9_]+)'/g)].map((f) => f[1]);
  }
  const reqBlock = src.match(/CONSENT_REQUIRED_FUNCTIONS[^=]*=\s*\[([\s\S]*?)\];/);
  if (!reqBlock) throw new Error(`${rel}: CONSENT_REQUIRED_FUNCTIONS not found`);
  const required = [...reqBlock[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  return { fields, required };
}

const client = parseRegistry(CLIENT_REGISTRY);
const server = parseRegistry(SERVER_REGISTRY);

// 1. parity
{
  const cKeys = Object.keys(client.fields).sort();
  const sKeys = Object.keys(server.fields).sort();
  if (cKeys.join(',') !== sKeys.join(',')) {
    fail(`registry drift: functions differ\n    client: ${cKeys.join(', ')}\n    server: ${sKeys.join(', ')}`);
  }
  for (const fn of cKeys) {
    const c = [...(client.fields[fn] ?? [])].sort().join(',');
    const s = [...(server.fields[fn] ?? [])].sort().join(',');
    if (c !== s) fail(`registry drift: ${fn} health fields differ — client [${c}] vs server [${s}]`);
  }
  if (client.required.sort().join(',') !== server.required.sort().join(',')) {
    fail('registry drift: CONSENT_REQUIRED_FUNCTIONS differ between client and server');
  }
  if (cKeys.length < 8) fail(`registry holds only ${cKeys.length} functions — expected the full AI surface`);
}

const REGISTRY = server.fields;
const REQUIRED = new Set(server.required);
/**
 * Field names whose health-ness depends on WHICH function receives them, so
 * they cannot be used as a cross-function alarm. `imageBase64` is a health
 * record in lab-scan and a photo of a sandwich in food-scan; `body`,
 * `headline`, `recommendation`, `results` and `profile` are generic shape
 * names. Each is still enforced on its own function by the registry.
 */
const CONTEXT_DEPENDENT = new Set(['imageBase64', 'body', 'headline', 'recommendation', 'results', 'profile']);

/**
 * Names that are health data wherever they appear — used to catch a field
 * added to a function whose own list is empty (a photo scanner that starts
 * sending allergies, say).
 */
const AMBIENT_HEALTH_FIELDS = new Set(
  Object.values(REGISTRY).flat().filter((f) => !CONTEXT_DEPENDENT.has(f)),
);
if (AMBIENT_HEALTH_FIELDS.size < 4) {
  fail(`only ${AMBIENT_HEALTH_FIELDS.size} unambiguous health field names — the cross-function leak check would be toothless`);
}

// 2. no unregistered AI function
{
  const dir = path.join(ROOT, 'supabase/functions');
  const looksAi = (n) => /^aimee-/.test(n) || n === 'lab-scan' || n === 'food-scan';
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('_') || !looksAi(name)) continue;
    if (!fs.statSync(path.join(dir, name)).isDirectory()) continue;
    if (REGISTRY[name] || EXEMPT[name]) continue;
    fail(`supabase/functions/${name} looks like an AI function but is in neither the consent registry nor EXEMPT`);
  }
  for (const name of Object.keys(EXEMPT)) {
    if (!fs.existsSync(path.join(dir, name))) {
      fail(`EXEMPT lists ${name}, which has no supabase/functions/${name} — stale entry`);
    }
    if (REGISTRY[name]) fail(`${name} is both EXEMPT and in the registry — pick one`);
  }
}

// ─── client scan ─────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^([ \t]*)\/\/.*$/gm, '$1');

/**
 * Find every client request to a registered AI function and judge it.
 * Returns { sites, problems } so the self-test can drive it over fixtures.
 */
export function analyseClientSource(rel, rawSrc) {
  const src = stripComments(rawSrc);
  const problems = [];
  const sites = [];

  // Resolve `const FN_NAME = 'aimee-lab-interpret';` so a call through a const
  // is judged exactly like a call through a literal.
  const aliases = new Map();
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([a-z0-9-]+)'\s*;/g)) {
    if (REGISTRY[m[2]]) aliases.set(m[1], m[2]);
  }
  const nameAt = (token) => {
    const lit = token.match(/^['"]([a-z0-9-]+)['"]$/);
    if (lit) return REGISTRY[lit[1]] ? lit[1] : null;
    return aliases.get(token.trim()) ?? null;
  };

  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  // functions.invoke(<name>, { ... body: X ... })  and  fetch(`…/functions/v1/<name>`…)
  const invokeRe = /\.functions\s*\.invoke\s*\(\s*([^,]+?)\s*,/g;
  for (const m of invokeRe.exec.length ? [...src.matchAll(invokeRe)] : []) {
    const fn = nameAt(m[1]);
    if (!fn) continue;
    sites.push({ fn, idx: m.index, line: lineOf(m.index), kind: 'invoke' });
  }
  for (const m of src.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) {
    if (!REGISTRY[m[1]]) continue;
    sites.push({ fn: m[1], idx: m.index, line: lineOf(m.index), kind: 'fetch' });
  }

  for (const site of sites) {
    const { fn } = site;
    // The request body: everything between this call and the next 2500 chars,
    // which comfortably covers the option object of every call site here.
    const window = src.slice(site.idx, site.idx + 2500);
    const bodyAt = window.search(/\bbody\s*:/);
    const bodyText = bodyAt >= 0 ? window.slice(bodyAt, bodyAt + 2000) : '';
    // The name argument may be a literal or one of this file's own
    // `const FN = '<fn>'` aliases; both must be accepted or a call through a
    // const would read as ungated.
    const nameAlt = [`'${fn}'`, `"${fn}"`, ...[...aliases].filter(([, v]) => v === fn).map(([k]) => k)]
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const wrapped = new RegExp(
      `body\\s*:\\s*(JSON\\.stringify\\(\\s*)?withHealthConsent\\(\\s*(${nameAlt})\\s*,`,
    ).test(window);

    if (!wrapped) {
      // Not routed through the filter — then it must carry no health field.
      const leaked = [...AMBIENT_HEALTH_FIELDS].filter((f) =>
        new RegExp(`(^|[{,\\s])${f}\\s*[:,}]`).test(bodyText),
      );
      if (REGISTRY[fn].length > 0) {
        problems.push(
          `${rel}:${site.line} — ${fn} is sent without withHealthConsent('${fn}', …); it carries ${REGISTRY[fn].join(', ')}`,
        );
      } else if (leaked.length > 0) {
        problems.push(
          `${rel}:${site.line} — ${fn} now sends health field(s) ${leaked.join(', ')}; add them to the registry and wrap the body in withHealthConsent`,
        );
      }
    }

    if (REQUIRED.has(fn)) {
      const before = src.slice(0, site.idx);
      if (!/healthConsentGranted\s*\(\s*\)/.test(before)) {
        problems.push(
          `${rel}:${site.line} — ${fn} must not run at all without health consent, but no healthConsentGranted() guard precedes the call`,
        );
      }
    }
  }
  return { sites, problems };
}

{
  let siteCount = 0;
  for (const abs of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (rel === CLIENT_REGISTRY) continue;
    const { sites, problems } = analyseClientSource(rel, fs.readFileSync(abs, 'utf8'));
    siteCount += sites.length;
    problems.forEach(fail);
  }
  // Self-check floor: the scanner reading nothing must not look like a pass.
  if (siteCount < 9) {
    fail(`only ${siteCount} client call sites found for registered AI functions (floor 9) — the scanner is not reading the code`);
  } else {
    notes.push(`${siteCount} client call sites inspected`);
  }
}

// ─── server scan ─────────────────────────────────────────────────────────────

export function analyseServerSource(fn, rawSrc, isRequired) {
  // Drop the import lines FIRST. Matching a guard name against the file's own
  // import is how a checker passes 446 routes while reading nothing
  // (CLAUDE.md, the tenancy sweep) — the name must appear in a statement.
  const src = stripComments(rawSrc).replace(/^\s*import\s[\s\S]*?;\s*$/gm, '');
  const problems = [];
  if (!new RegExp(`applyFeatureConsent\\(\\s*['"]${fn}['"]`).test(src)) {
    problems.push(`supabase/functions/${fn}/index.ts — no applyFeatureConsent('${fn}', …) statement; a stale client can bypass the health toggle`);
  }
  if (isRequired && !/\.refuse\b[\s\S]{0,120}?HEALTH_CONSENT_REFUSAL/.test(src)) {
    problems.push(`supabase/functions/${fn}/index.ts — on the refuse list but never returns HEALTH_CONSENT_REFUSAL on .refuse`);
  }
  return problems;
}

{
  let checked = 0;
  for (const [fn, fields] of Object.entries(REGISTRY)) {
    if (fields.length === 0) continue; // nothing to strip; documented in the registry
    const abs = path.join(ROOT, 'supabase/functions', fn, 'index.ts');
    if (!fs.existsSync(abs)) {
      fail(`registry names ${fn} but supabase/functions/${fn}/index.ts does not exist`);
      continue;
    }
    checked++;
    analyseServerSource(fn, fs.readFileSync(abs, 'utf8'), REQUIRED.has(fn)).forEach(fail);
  }
  if (checked < 7) fail(`only ${checked} edge functions checked (floor 7) — the registry shrank or the scan broke`);
  else notes.push(`${checked} edge functions inspected`);
}

// ─── self-test ───────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  const cases = [
    {
      label: 'gated invoke passes',
      run: () => analyseClientSource('f.ts', `
        const { data } = await supabase.functions.invoke('aimee-pantry-meal', {
          body: withHealthConsent('aimee-pantry-meal', { allergens, count: 3 }),
        });`).problems,
      expect: 0,
    },
    {
      label: 'ungated invoke fails',
      run: () => analyseClientSource('f.ts', `
        const { data } = await supabase.functions.invoke('aimee-pantry-meal', {
          body: { allergens, count: 3 },
        });`).problems,
      expect: 1,
    },
    {
      label: 'refuse-list call with no healthConsentGranted fails',
      run: () => analyseClientSource('f.ts', `
        await supabase.functions.invoke('lab-scan', {
          body: withHealthConsent('lab-scan', { imageBase64 }),
        });`).problems,
      expect: 1,
    },
    {
      label: 'refuse-list call with the guard passes',
      run: () => analyseClientSource('f.ts', `
        if (!healthConsentGranted()) return;
        await supabase.functions.invoke('lab-scan', {
          body: withHealthConsent('lab-scan', { imageBase64 }),
        });`).problems,
      expect: 0,
    },
    {
      label: 'health field smuggled into a no-field function fails',
      run: () => analyseClientSource('f.ts', `
        await supabase.functions.invoke('food-scan', {
          body: { imageBase64, allergens },
        });`).problems,
      expect: 1,
    },
    {
      label: 'const-aliased function name is still judged',
      run: () => analyseClientSource('f.ts', `
        const FN = 'aimee-lab-interpret';
        if (!healthConsentGranted()) return;
        await supabase.functions.invoke(FN, { body: { results } });`).problems,
      expect: 1,
    },
    {
      label: 'raw fetch to functions/v1 is judged',
      run: () => analyseClientSource('f.ts', `
        await fetch(\`\${U}/functions/v1/aimee-workout\`, { body: JSON.stringify({ gender }) });`).problems,
      expect: 1,
    },
    { label: 'server without the guard fails', run: () => analyseServerSource('aimee-plan', 'const body = await req.json();', false), expect: 1 },
    { label: 'server with the guard passes', run: () => analyseServerSource('aimee-plan', "const body = applyFeatureConsent('aimee-plan', await req.json()).body;", false), expect: 0 },
    { label: 'refuse-list server without the refusal fails', run: () => analyseServerSource('lab-scan', "applyFeatureConsent('lab-scan', b)", true), expect: 1 },
    {
      label: 'an IMPORT of the guard names is not a guard (vacuous-pass trap)',
      run: () => analyseServerSource('lab-scan', [
        "import { applyFeatureConsent, HEALTH_CONSENT_REFUSAL } from '../_shared/aiFeatureConsent.ts';",
        'const b = await req.json();',
      ].join('\n'), true),
      expect: 1,
    },
    {
      label: 'refuse-list server with the real refusal passes',
      run: () => analyseServerSource('lab-scan', [
        "const c = applyFeatureConsent('lab-scan', await req.json());",
        'if (c.refuse) return jsonResp(HEALTH_CONSENT_REFUSAL, 403);',
      ].join('\n'), true),
      expect: 0,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = c.run().length;
    const ok = c.expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  ✗ self-test: ${c.label} — expected ${c.expect ? '≥1' : '0'} problem(s), got ${got}`); }
    else console.log(`  ✓ self-test: ${c.label}`);
  }
  if (bad) { console.error(`\n✗ verify:aiconsent self-test failed (${bad})`); process.exit(1); }
  console.log('✓ verify:aiconsent self-test passed');
}

// ─── report ──────────────────────────────────────────────────────────────────

if (errors.length) {
  console.error('✗ AI health-data consent:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`✓ every AI edge function is behind the health-data consent (${notes.join('; ')})`);
