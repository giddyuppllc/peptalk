/**
 * Triage: exported functions/consts under src/ that nothing outside their own
 * file references.
 *
 * Finer grain than verify:deadfiles — the file is imported, but this particular
 * export is not. Data modules are excluded: a catalog exporting a getter nobody
 * calls yet is normal, and verify:peptiderefs already covers that direction.
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');
const strip = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

const targets = globSync('src/{lib,utils,services,hooks}/**/*.{ts,tsx}')
  .map(slash)
  .filter((f) => !f.includes('__tests__'));

const all = globSync('{app,src,scripts,supabase}/**/*.{ts,tsx,mjs}')
  .map(slash)
  .filter((f) => !f.includes('__tests__'));

const corpus = new Map(all.map((f) => [f, strip(readFileSync(f, 'utf8'))]));

// Positive control: an export everything uses must register.
const CONTROL = 'playCue';
let controlHits = 0;
for (const [f, src] of corpus) {
  if (f.includes('lib/cue')) continue;
  if (new RegExp('\\b' + CONTROL + '\\b').test(src)) controlHits++;
}
if (controlHits < 1) {
  console.error(`SELF-CHECK FAILED: ${CONTROL} appears used by ${controlHits} files.`);
  process.exit(1);
}
console.log(`self-check ok (${CONTROL} seen in ${controlHits} files)\n`);

const dead = [];
for (const file of targets) {
  const src = corpus.get(file) ?? strip(readFileSync(file, 'utf8'));
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+(\w+)\s*[:=]/gm)) names.add(m[1]);

  for (const name of names) {
    let used = false;
    for (const [other, text] of corpus) {
      if (other === file) continue;
      if (new RegExp('\\b' + name + '\\b').test(text)) {
        used = true;
        break;
      }
    }
    if (!used) dead.push({ file, name });
  }
}

const byFile = new Map();
for (const d of dead) {
  if (!byFile.has(d.file)) byFile.set(d.file, []);
  byFile.get(d.file).push(d.name);
}

console.log(`scanned ${targets.length} modules under src/{lib,utils,services,hooks}`);
console.log(`exports with no consumer outside their own file: ${dead.length}\n`);
for (const [file, names] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file}`);
  console.log(`     ${names.join(', ')}`);
}
