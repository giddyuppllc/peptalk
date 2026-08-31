/**
 * verify:scannercontrols — every scanner must prove it looked at something.
 *
 * WHY
 * A scanner reports success by finding nothing, so "clean codebase" and "read
 * zero files" produce IDENTICAL output. That is not hypothetical here — it is
 * the single most repeated failure in this repo's tooling:
 *
 *   - a nested-loop store scan reported every action dead, including one with
 *     10 callers
 *   - `\b` collapsed to a backspace character through a heredoc, so a pattern
 *     matched nothing and everything looked dead
 *   - a JS RegExp using Python's `\Z` parsed 0 of 70 guides
 *   - `\1` became U+0001, so every guide parsed as zero sections
 *   - `\bmg\b` never matches in "0.25mg", filing 17 of 37 compounds as
 *     "unparsed" instead of "disagrees"
 *
 * And on 2026-08-10, mutation-testing the checks themselves showed
 * verify:deadzones and verify:navparams BOTH printing their success lines over
 * an empty corpus — verify:navparams being a check that had already taken three
 * attempts to get right.
 *
 * So: any verifier that discovers its own corpus (globSync / readdirSync) must
 * assert the corpus is non-trivial and exit non-zero if it is not. This check
 * is static and fast. To actually prove a scanner fails on an empty corpus, run
 * `node scripts/_vacuous.mjs`, which mutates each one and checks the exit code.
 */
import { readFileSync } from 'fs';
// node:fs, not the `glob` package. The installed glob is v7, which is CommonJS
// and exports no named `globSync` — that arrived in v9 — so this import threw on
// load. Node's built-in has the same signature and no dependency at all.
import { globSync } from 'node:fs';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');

/** Verifiers that discover a corpus but legitimately need no control. */
const ALLOWED = new Map([
  [
    'scripts/verify-scanner-controls.mjs',
    'This file — its own corpus guard is the MIN_VERIFIERS check below.',
  ],
  [
    'scripts/verify-scanner-mutation.mjs',
    'Matches only because it CONTAINS the string "globSync(" inside the ' +
      'mutation regexes it applies to other scanners. It discovers no corpus ' +
      'of its own — it reads a fixed list of four targets and reports ' +
      'INCONCLUSIVE rather than success when a mutation fails to apply.',
  ],
]);

const verifiers = globSync('scripts/verify-*.{ts,mjs}').map(slash);

/**
 * Positive control for the control-checker. Turtles, but the alternative is a
 * check that silently stops finding the checks.
 */
const MIN_VERIFIERS = 15;
if (verifiers.length < MIN_VERIFIERS) {
  console.error(
    `\n✗ SELF-CHECK FAILED — found only ${verifiers.length} verifier scripts (expected >= ${MIN_VERIFIERS}).`,
  );
  process.exit(1);
}

const DISCOVERS = /globSync\(|readdirSync\(|\bglob\(/;
const HAS_CONTROL = /SELF-CHECK FAILED/;

const scanners = [];
const missing = [];
for (const file of verifiers) {
  const src = readFileSync(file, 'utf8');
  if (!DISCOVERS.test(src)) continue; // assertion-list style: it proves itself
  scanners.push(file);
  if (ALLOWED.has(file)) continue;
  if (!HAS_CONTROL.test(src)) missing.push(file);
}

console.log('\n— Scanner positive controls —');
console.log(`  ${verifiers.length} verifiers · ${scanners.length} discover their own corpus`);
for (const [f, why] of ALLOWED) console.log(`  ℹ️  ${f} — ${why}`);

if (missing.length === 0) {
  console.log('  ✓ every corpus-discovering verifier asserts it found something\n');
  process.exit(0);
}

console.log('');
for (const f of missing) {
  console.log(`  ❌ ${f} — discovers a corpus but never checks it is non-empty`);
  console.log('     Add a guard that exits non-zero, printing "SELF-CHECK FAILED",');
  console.log('     when the corpus is implausibly small. Otherwise this check');
  console.log('     reports success for work it did not do.\n');
}
console.log(`  ${missing.length} scanner(s) can pass vacuously\n`);
process.exit(1);
