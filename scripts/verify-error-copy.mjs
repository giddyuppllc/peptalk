#!/usr/bin/env node
/**
 * Raw error messages must not be rendered to users.
 *
 * Sentry PEPTALK-3: 53 NetworkError events across 5 users on the onboarding
 * screen — roughly ten attempts each, the shape of someone stuck rather than
 * someone unlucky. They were shown "Failed to fetch", because the screen passed
 * `err.message` straight into the UI. Accurate, meaningless, and silent on
 * whether to retry.
 *
 * Auditing for the same shape turned up fifteen more sites. All now go through
 * `toUserMessage(err, fallback)` from src/lib/errorMessages.ts, which rewrites
 * only what it can genuinely improve on — a dead network, a 5xx, a rate limit —
 * and otherwise keeps the caller's own contextual copy.
 *
 * This stops the sixteenth.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// A user-facing sink taking a raw `.message` off an error.
const SINK = /(Alert\.alert|setError|setAccountError|setMessage|toast)\s*\([^)]*\b(?:err|error|e)\??\.message\b/;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !full.includes('__tests__')) files.push(full);
  }
};
for (const d of ['src', 'app']) walk(join(ROOT, d));

// Positive control. A broken walk must fail loudly rather than report "clean"
// having read nothing — the exact way a guard lies about work it did not do.
const MIN_FILES = 200;
if (files.length < MIN_FILES) {
  console.error(
    `\nSELF-CHECK FAILED: scanned ${files.length} file(s), expected ≥ ${MIN_FILES}. ` +
      `The walk is broken or the layout moved, so this check proves nothing.`,
  );
  process.exit(1);
}

const offenders = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;   // prose is fine
    if (SINK.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
  });
}

if (offenders.length) {
  console.error(
    `\n✗ raw error text rendered to users (${offenders.length} site(s)).\n` +
      `  Use toUserMessage(err, '<contextual fallback>') from src/lib/errorMessages.\n` +
      `  Keep sending the raw error to Sentry — just do not show it.\n\n    ` +
      offenders.join('\n    ') + '\n',
  );
  process.exit(1);
}

console.log(`✓ error copy: no raw error messages shown to users (${files.length} files)`);
