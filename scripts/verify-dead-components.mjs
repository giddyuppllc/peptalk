/**
 * verify:deadcomponents — a React component defined and rendered nowhere.
 *
 * WHY
 * app/(tabs)/profile.tsx carried FOUR of these: NotificationSettings (340
 * lines), ResearchProfileCard (150), HealthProfileCard (123) and
 * QuickLinksSection (61). All compiled, type-checked and linted clean. tsc
 * cannot see it, the tests cannot see it, and a Workout-sounds toggle added to
 * one of them shipped as code that no user could reach.
 *
 * They also actively mislead. QuickLinksSection held the app's ONLY navigation
 * to /journal, which made verify:routes consider that screen reachable — a
 * route string in dead code is still a route string. Removing it blind would
 * have silently orphaned a whole feature.
 *
 * WHAT COUNTS AS RENDERED
 * A component is considered used if its name appears anywhere OTHER than its
 * own declaration — in JSX, an export, a prop, a route table, anything. That is
 * deliberately generous: this check should only fire on the unambiguous case,
 * because the fix for a real hit is to read the component and decide whether it
 * is rubbish or a missing wire, and nobody does that for a noisy report.
 *
 * ALLOWED records the ones that are intentionally defined-but-unused.
 */
import { readFileSync } from 'fs';
// node:fs, not the `glob` package. The installed glob is v7, which is CommonJS
// and exports no named `globSync` — that arrived in v9 — so this import threw on
// load. Node's built-in has the same signature and no dependency at all.
import { globSync } from 'node:fs';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

/** Defined on purpose, rendered nowhere, with the reason. */
const ALLOWED = new Map();

const files = globSync('{app,src}/**/*.tsx')
  .map(slash)
  .filter((f) => !f.includes('__tests__'));

const findings = [];
for (const file of files) {
  const src = stripComments(readFileSync(file, 'utf8'));

  // `function Foo(` / `const Foo = (` / `const Foo: React.FC` at column 0,
  // capitalised — the React component convention.
  const declared = new Map();
  for (const m of src.matchAll(/^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/gm)) {
    declared.set(m[1], m.index);
  }
  // PascalCase only — `[A-Z][a-z]` requires a lowercase second letter, which
  // excludes SCREAMING_CASE constants. Without it the check reported
  // ACCENT_LIGHT and DAY_LABELS as unrendered components, and a check that
  // cries wolf twice out of five gets switched off.
  for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Z][a-z]\w*)\s*[:=]/gm)) {
    declared.set(m[1], m.index);
  }

  for (const [name, at] of declared) {
    if (ALLOWED.has(`${file}::${name}`)) continue;
    const uses = (src.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
    if (uses > 1) continue;
    // Exported names are part of a public surface — another file may use them,
    // and that is not this check's business.
    const decl = src.slice(Math.max(0, at - 10), at + 40);
    if (/\bexport\b/.test(decl)) continue;
    findings.push({ file, name, line: src.slice(0, at).split('\n').length });
  }
}

/**
 * Positive control. Several scanners this session failed by matching NOTHING
 * and presenting it as a clean result. If the declaration regex stops matching,
 * this check silently passes forever.
 */
const sampleDecls = files.reduce((n, f) => {
  const src = stripComments(readFileSync(f, 'utf8'));
  return (
    n +
    (src.match(/^(?:export\s+)?(?:default\s+)?function\s+[A-Z]\w*\s*\(/gm) || []).length
  );
}, 0);

console.log('\n— Dead component scan —');
console.log(`  ${files.length} screens · ${sampleDecls} component declarations found`);

if (sampleDecls < 100) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${sampleDecls} declarations matched across ${files.length} files.` +
      '\n  The declaration pattern is broken; a clean result here would be meaningless.',
  );
  process.exit(1);
}

if (ALLOWED.size) {
  console.log(`  ℹ️  ${ALLOWED.size} intentionally unused:`);
  for (const [k, why] of ALLOWED) console.log(`     ${k} — ${why}`);
}

if (findings.length === 0) {
  console.log('\n✓ Every component defined is rendered somewhere.\n');
  process.exit(0);
}

console.log('');
for (const f of findings) {
  console.log(`  ❌ ${f.file}:${f.line}  ${f.name}() is defined and never used`);
  console.log(`     READ IT before deleting. Dead because it was superseded → remove.`);
  console.log(`     Dead because nothing ever wired it → that is a missing feature,`);
  console.log(`     and it may hold the only route to something (see QuickLinksSection`);
  console.log(`     and /journal). If deliberate, add it to ALLOWED with a reason.\n`);
}
console.log(`  ${findings.length} unrendered component(s)\n`);
process.exit(1);
