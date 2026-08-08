/**
 * verify-aimee — assert Aimee's capabilities actually reach the user.
 *
 * WHY THIS EXISTS
 * Aimee's abilities span three files that can drift independently:
 *   1. `_tools.ts` DECLARES the tools the model may call.
 *   2. `_tools.ts` executeTool() DISPATCHES them server-side.
 *   3. `app/(tabs)/peptalk.tsx` APPLIES the write actions client-side, and
 *      `src/lib/aimeeNavAllowlist.ts` gates where she may navigate.
 *
 * Every join between them is silent. A tool declared but not dispatched is a
 * capability the model will confidently claim and never perform. A write tool
 * with no client handler hits "Unknown action type" after the user taps
 * Confirm. A navigation target the allowlist rejects, or that has no route
 * file, does nothing at all — the user asks Aimee to open a screen and the
 * app simply sits there.
 *
 * That is the same shape as every other bug on this app: the capability
 * exists, and does not reach the user. This makes those joins fail loudly.
 *
 * Read-only and offline — safe in CI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { isAllowedNavigationPath } from '../src/lib/aimeeNavAllowlist';

const TOOLS = 'supabase/functions/aimee-chat-stream/_tools.ts';
const SCREEN = 'app/(tabs)/peptalk.tsx';

let checks = 0;
let failures = 0;
const warnings: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  checks++;
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${detail}`);
  }
}

console.log('\n— Aimee capability harness —\n');

for (const f of [TOOLS, SCREEN]) {
  if (!existsSync(f)) {
    console.error(`${f} not found`);
    process.exit(1);
  }
}

const tools = readFileSync(TOOLS, 'utf8');
const screen = readFileSync(SCREEN, 'utf8');

// ── 1. Every declared tool is dispatched ───────────────────────────────────
const declared = [...tools.matchAll(/^\s*name:\s*'([a-z_0-9]+)'/gm)].map((m) => m[1]);
const uniqueDeclared = [...new Set(declared)];
const dispatched = new Set(
  [...tools.matchAll(/case\s+'([a-z_0-9]+)':/g)].map((m) => m[1]),
);

check(
  'at least one tool is declared',
  uniqueDeclared.length > 0,
  'no `name:` entries found — did the tool schema format change?',
);

for (const t of uniqueDeclared) {
  check(
    `tool "${t}" is dispatched by executeTool`,
    dispatched.has(t),
    `declared in ${TOOLS} but executeTool has no case for it — the model can call it and nothing runs.`,
  );
}

// ── 2. Every WRITE tool has a client handler ───────────────────────────────
// These are the tools that change user data, so they route through the
// pending-action confirm card and need an explicit client branch.
const WRITE_TOOLS = [
  'log_dose',
  'log_meal',
  'log_water',
  'log_appetite',
  'add_to_pantry',
  'schedule_workout',
];
for (const t of WRITE_TOOLS) {
  if (!uniqueDeclared.includes(t)) {
    warnings.push(`write tool "${t}" is no longer declared server-side`);
    continue;
  }
  check(
    `write tool "${t}" has a client handler`,
    new RegExp(`action\\.tool === '${t}'`).test(screen),
    `no branch in ${SCREEN} — tapping Confirm returns "Unknown action type".`,
  );
}

// ── 3. Every navigation target is reachable AND allowed ────────────────────
const start = tools.indexOf('SCREEN_TO_PATH: Record<string, string> = {');
const block = start >= 0 ? tools.slice(start, tools.indexOf('\n};', start)) : '';
const navTargets = [...block.matchAll(/^\s*'?([\w-]+)'?:\s*'([^']+)'/gm)].map(
  (m) => [m[1], m[2]] as const,
);

check(
  'SCREEN_TO_PATH parsed',
  navTargets.length > 0,
  'could not read the screen map — did its shape change?',
);

/** Expo Router: /a/b resolves to app/a/b.tsx or app/a/b/index.tsx (+ (tabs)). */
function routeFileFor(p: string): string | null {
  const clean = p.replace(/^\//, '').replace(/\?.*$/, '');
  if (clean === '' || clean === '(tabs)') {
    return existsSync('app/(tabs)/index.tsx') ? 'app/(tabs)/index.tsx' : null;
  }
  const candidates = [
    `app/${clean}.tsx`,
    `app/${clean}/index.tsx`,
    `app/(tabs)/${clean}.tsx`,
    `app/(tabs)/${clean}/index.tsx`,
  ];
  return candidates.find(existsSync) ?? null;
}

for (const [name, path] of navTargets) {
  check(
    `nav "${name}" -> ${path} has a route file`,
    routeFileFor(path) !== null,
    'Aimee offers this screen but no route file exists — navigating does nothing.',
  );
  check(
    `nav "${name}" passes the client allowlist`,
    isAllowedNavigationPath(path),
    `isAllowedNavigationPath() rejects "${path}" — the app silently refuses to go there.`,
  );
}

// ── 4. The allowlist still denies what it must ─────────────────────────────
for (const bad of ['/admin/users', 'admin/users', '/dev-tools', '//evil.com', '/doses/../admin']) {
  check(
    `allowlist denies "${bad}"`,
    !isAllowedNavigationPath(bad),
    'a prompt-injection escape could land the user here.',
  );
}

console.log('');
console.log(`Total checks: ${checks}`);
console.log(`Passed:       ${checks - failures}`);
console.log(`Failed:       ${failures}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);

if (failures > 0) {
  console.log('\n✗ Aimee capability checks failed.\n');
  process.exit(1);
}
console.log('\n✓ All Aimee capability checks passed.\n');
