import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const slash = s => s.split('\').join('/');
// --- collect real routes from app/
const routes = new Set();
(function walk(dir, prefix='') {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, prefix + e + '/'); continue; }
    if (!/\.(tsx|jsx)$/.test(e)) continue;
    if (e.startsWith('_')) continue;
    let name = e.replace(/\.(tsx|jsx)$/, '');
    let r = prefix + (name === 'index' ? '' : name);
    r = r.replace(/\/$/, '');
    routes.add('/' + r);
  }
})('app');
// strip group segments (tabs) etc -> both forms
const expanded = new Set();
for (const r of routes) {
  expanded.add(r);
  expanded.add(r.replace(/\/\([^)]*\)/g, ''));
}
const normalize = p => p.replace(/\[[^\]]*\]/g, '*').replace(/\/$/, '') || '/';
const routeSet = new Set([...expanded].map(normalize));

// --- collect navigation targets
const files = globSync('{app,src}/**/*.{ts,tsx}');
const NAV = /(?:router\.(?:push|replace|navigate)|<Link[^>]*href=)\s*\(?\s*[`'"]([^`'"]+)[`'"]/g;
const bad = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    let m;
    NAV.lastIndex = 0;
    while ((m = NAV.exec(line))) {
      let t = m[1];
      if (!t.startsWith('/')) continue;
      t = t.split('?')[0].split('#')[0];
      t = t.replace(/\$\{[^}]*\}/g, '*').replace(/\/$/, '') || '/';
      const n = normalize(t);
      if (routeSet.has(n)) continue;
      bad.push(`${slash(f)}:${i+1}  →  ${m[1]}`);
    }
  });
}
console.log(`routes found: ${routeSet.size}`);
console.log(bad.length ? `\nNAV TARGETS WITH NO MATCHING ROUTE (${bad.length}):\n` + bad.join('\n') : '\n✓ every navigation target resolves');
