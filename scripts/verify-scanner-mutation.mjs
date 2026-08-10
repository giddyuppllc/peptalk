/**
 * Mutation-test the SCANNERS: if their corpus were empty, would they still
 * report success?
 *
 * A scanner passes by finding nothing, so an empty corpus and a clean codebase
 * are indistinguishable unless the scanner asserts on what it examined.
 *
 * v1 of this harness reported "✓ fails (exit null)" for two scanners. `status:
 * null` means killed or crashed, not "correctly failed" — the harness was
 * producing exactly the false-confident result it exists to detect. It now
 * reports run.error and treats a null status as INCONCLUSIVE.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';

/** Each scanner discovers its corpus differently, so each needs its own break. */
const TARGETS = [
  {
    file: 'scripts/verify-edge-functions.ts',
    // Pointing FUNCTIONS_DIR at a missing path makes readdirSync THROW before
    // the guard runs — which looks like a pass but only proves node crashes.
    // Break the filter instead: the directory is read successfully and yields
    // nothing, which is the case a wrong cwd or an empty tree actually produces.
    break: (s) => s.split("!d.startsWith('_')").join("d.startsWith('__no_such_prefix__')"),
  },
  {
    file: 'scripts/verify-route-reachability.ts',
    // walk('app') is a literal, and a MISSING directory throws rather than
    // passing quietly. The interesting case is an EMPTY corpus, so break the
    // extension filter instead: the walk succeeds and yields nothing, exactly
    // as a run from the wrong working directory would.
    break: (s) => s.split("endsWith('.tsx')").join("endsWith('.__no_such_ext__')"),
  },
  {
    file: 'scripts/verify-deadzones.mjs',
    break: (s) => s.replace(/globSync\((['"`])/g, 'globSync($1__no_such_dir__/'),
  },
  {
    file: 'scripts/verify-nav-params.mjs',
    break: (s) => s.replace(/globSync\((['"`])/g, 'globSync($1__no_such_dir__/'),
  },
];

const rows = [];
for (const t of TARGETS) {
  if (!existsSync(t.file)) {
    rows.push([t.file, 'MISSING', '']);
    continue;
  }
  const original = readFileSync(t.file, 'utf8');
  const mutated = t.break(original);
  if (mutated === original) {
    rows.push([t.file, '?  INCONCLUSIVE', 'mutation did not apply — corpus is discovered some other way']);
    continue;
  }

  const tmp = t.file.replace(/(\.\w+)$/, '.__mut__$1');
  writeFileSync(tmp, mutated);
  const run = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', tmp], {
    encoding: 'utf8',
    timeout: 180000,
    // .cmd shims need a shell on Windows; without it spawnSync returns EINVAL
    // and the harness reported INCONCLUSIVE for every target.
    shell: process.platform === 'win32',
  });
  unlinkSync(tmp);

  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/npm warn/i.test(l));
  const tail = out.slice(-2).join(' | ').slice(0, 100) || '(no output)';

  if (run.error) {
    rows.push([t.file, '?  INCONCLUSIVE', `harness error: ${run.error.message}`]);
  } else if (run.status === null) {
    rows.push([t.file, '?  INCONCLUSIVE', `killed by signal ${run.signal} — NOT a pass or a fail`]);
  } else if (run.status === 0) {
    rows.push([t.file, '❌ PASSES ON EMPTY', tail]);
  } else {
    rows.push([t.file, `✓  fails (exit ${run.status})`, tail]);
  }
}

console.log('\nWould these scanners still report success with an empty corpus?\n');
for (const [f, verdict, note] of rows) {
  console.log(`  ${verdict.padEnd(22)} ${f}`);
  if (note) console.log(`      ${note}`);
}
const bad = rows.filter(([, v]) => v.startsWith('❌')).length;
console.log(`\n  ${bad} scanner(s) pass vacuously.\n`);
