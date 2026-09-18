#!/usr/bin/env node
/**
 * Every persisted store defends itself against the blob in storage.
 *
 * zustand 5.0.14's `merge` defaults to `{ ...current, ...persisted }` with no
 * validation (middleware.js:337), so whatever is in storage becomes state —
 * including a string where an array belongs, which throws on the first
 * `.map()`. The app has one error boundary, at the root, so that is not a
 * broken screen: it is the whole app replaced by the fallback, on every launch,
 * until the user reinstalls. On web the storage is localStorage, which the user
 * can edit, and a killed app leaves partial writes.
 *
 * The second failure is quieter. Bumping `version` without supplying `migrate`
 * does not discard the old state — zustand logs "couldn't be migrated", falls
 * out of the branch returning undefined, and the next line destructures it.
 * The throw is swallowed by a trailing `.catch`, `hasHydrated` is never set,
 * and the store hydrates never. `useAuthStore`'s `hasHydrated` gates routing,
 * so that is a permanent stuck screen. 35 of 38 stores declared no version at
 * all, so whoever added the first one would have found this the hard way.
 *
 * Self-test: `--self-test` removes each requirement in memory and asserts this
 * script notices. A check that passes without reading anything is worse than
 * no check.
 */
import { readFileSync, readdirSync } from 'node:fs';

const SELF_TEST = process.argv.includes('--self-test');

function storeFiles() {
  return readdirSync('src/store')
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => `src/store/${f}`)
    .filter((f) => readFileSync(f, 'utf8').includes('persist('));
}

/**
 * The persist options object only — from the `name:` line to the line that
 * closes it. Scanning the whole file would find a `merge` helper or a `version`
 * field on unrelated state and pass a store that has neither.
 */
function optionsBlock(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => /^      name: '[^']+',$/.test(l));
  if (i < 0) return null;
  let close = lines.length;
  for (let j = i + 1; j < lines.length; j++) {
    if (/^    \}\)?,?$/.test(lines[j]) || /^    \}$/.test(lines[j])) {
      close = j;
      break;
    }
  }
  return {
    name: lines[i].match(/^      name: '([^']+)',$/)[1],
    block: lines.slice(i, close).join('\n'),
  };
}

function problemsFor(file, text) {
  const out = [];
  const parsed = optionsBlock(text);
  if (!parsed) return [`${file}: no persist options block found — this check has stopped checking it`];
  const { name, block } = parsed;

  if (!/^      version:/m.test(block)) out.push(`${file}: no explicit \`version\``);
  if (!/^      migrate:/m.test(block)) out.push(`${file}: no \`migrate\` — a future version bump would strand it unhydrated`);

  const merge = block.match(/^      merge: makeSafeMerge\('([^']+)'/m);
  if (!merge) {
    out.push(`${file}: \`merge\` is not makeSafeMerge — storage is untrusted input`);
  } else if (merge[1] !== name) {
    // A copy-paste from a sibling store mislabels every telemetry event it
    // ever sends, which is worse than not sending one.
    out.push(`${file}: merge reports as "${merge[1]}" but the store is "${name}"`);
  }
  return out;
}

const files = storeFiles();

if (SELF_TEST) {
  const sample = files.find((f) => f.endsWith('useDoseLogStore.ts')) ?? files[0];
  const text = readFileSync(sample, 'utf8').replace(/\r\n/g, '\n');
  let bad = 0;
  const expectCaught = (label, mutated, needle) => {
    const found = problemsFor(sample, mutated).some((p) => p.includes(needle));
    console.log(`  ${found ? '✓ caught ' : '✗ MISSED '} ${label}`);
    if (!found) bad++;
  };

  if (problemsFor(sample, text).length) {
    console.error(`  ✗ baseline: ${sample} already fails — fix that first`);
    process.exit(1);
  }
  console.log(`  ✓ baseline clean (${sample})`);

  expectCaught('version removed', text.replace(/^      version: 0,\n/m, ''), 'no explicit');
  expectCaught('migrate removed', text.replace(/^      migrate: passthroughMigrate,\n/m, ''), 'no `migrate`');
  expectCaught(
    'merge downgraded to the default spread',
    text.replace(/^      merge: makeSafeMerge\('[^']+', reportPersistProblem\),\n/m, ''),
    'not makeSafeMerge',
  );
  expectCaught(
    'merge reports under another store’s name',
    text.replace(/makeSafeMerge\('[^']+'/, "makeSafeMerge('peptalk-someone-else'"),
    'but the store is',
  );
  expectCaught(
    'version/merge moved outside the options block',
    text.replace(/^      name: '[^']+',\n/m, ''),
    'stopped checking',
  );

  console.log(bad ? `\n✗ ${bad} self-test failure(s)` : '\n✓ self-test: every case detected');
  process.exit(bad ? 1 : 0);
}

// Positive control: an empty src/store would report nothing and read as success.
const MIN_STORES = 30;
if (files.length < MIN_STORES) {
  console.error(`\n✗ SELF-CHECK FAILED — only ${files.length} persisted stores found (expected >= ${MIN_STORES}).`);
  process.exit(1);
}

const problems = files.flatMap((f) => problemsFor(f, readFileSync(f, 'utf8')));

console.log('— Persisted stores defend against their own storage —');
console.log(`  ${files.length} persisted stores checked`);

if (!problems.length) {
  console.log('  ✓ every one declares version, migrate and a shape-checked merge');
  process.exit(0);
}

console.error(`\n  ✗ ${problems.length} problem(s):`);
for (const p of problems) console.error(`   - ${p}`);
console.error('\n  See src/lib/persistSafety.ts. Storage is untrusted input.\n');
process.exit(1);
