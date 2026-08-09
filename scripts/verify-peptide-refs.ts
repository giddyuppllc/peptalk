/**
 * verify:peptiderefs — every peptide id referenced in data must resolve.
 *
 * The house failure mode again, in its quietest form. A peptide id that points
 * at nothing does not throw and does not warn: the lookup is a `.find()` that
 * returns undefined, the entry is filtered out, and a slightly shorter list
 * renders. Nobody can tell the difference between "we have no recommendation
 * here" and "the recommendation is spelled wrong".
 *
 * Found in src/data/goalPeptideMatrix.ts, which drives the goal-based peptide
 * recommendations:
 *
 *   epitalon      → epithalon      3 refs   (longevity, sleep, general_wellness)
 *   melanotan-ii  → melanotan-2    1 ref    (skin_hair)
 *   kisspeptin    → kisspeptin-10  1 ref    (hormonal)
 *
 * Six goals were quietly serving a shorter list than intended; `hormonal` lost
 * half of its four entries. Every one of these compounds is in the library —
 * the reference was just spelled differently from the id.
 *
 * ALLOWED holds ids referenced on purpose that the library does not carry, with
 * the reason. Same ratchet as KNOWN_ORPHANS in verify:routes and
 * TRUNCATION_ALLOWED in verify:deadzones: baseline what exists, fail on
 * anything new.
 */
import { PEPTIDES } from '../src/data/peptides';
import * as goalMatrix from '../src/data/goalPeptideMatrix';
import * as interactions from '../src/data/interactions';

const ids = new Set((PEPTIDES as { id: string }[]).map((p) => p.id));

/** Referenced deliberately, but not in the library. */
const ALLOWED = new Map<string, string>([
  [
    'larazotide',
    'gut_health/secondary — tight-junction modulator. Referenced as a goal ' +
      'recommendation but the compound has no library entry yet.',
  ],
  [
    'gonadorelin',
    'hormonal/secondary — GnRH analog. Referenced as a goal recommendation but ' +
      'the compound has no library entry yet.',
  ],
]);

type Bad = { where: string; id: string };
const bad: Bad[] = [];
const seen = new Set<string>();
const note = (where: string, id: string) => {
  if (ids.has(id) || ALLOWED.has(id)) return;
  const key = `${where}::${id}`;
  if (seen.has(key)) return;
  seen.add(key);
  bad.push({ where, id });
};

// ── peptide-to-peptide references carried on the catalog itself
for (const p of PEPTIDES as any[]) {
  for (const key of ['pairsWith', 'avoidWith', 'stacksWith']) {
    const list = p.uses?.[key] ?? p[key] ?? [];
    for (const ref of list) note(`peptides.${key} (${p.id})`, ref);
  }
}

// ── anything shaped like { id: '...' } anywhere in the goal matrix
const walkIds = (node: unknown, where: string) => {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach((n) => walkIds(n, where));
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (typeof o.id === 'string') note(where, o.id);
  Object.values(o).forEach((v) => walkIds(v, where));
};
Object.values(goalMatrix).forEach((v) => walkIds(v, 'goalPeptideMatrix'));

// ── interaction pairs
const walkPairs = (node: unknown) => {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach(walkPairs);
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  for (const key of ['peptideA', 'peptideB', 'peptideIds', 'ids']) {
    const v = o[key];
    if (typeof v === 'string') note('interactions', v);
    if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && note('interactions', x));
  }
  Object.values(o).forEach(walkPairs);
};
Object.values(interactions).forEach(walkPairs);

/**
 * Nearest library ids, so the failure tells you the answer instead of just the
 * problem. Prefix matching alone was not enough — it missed `epitalon` vs
 * `epithalon`, which is the exact case this check exists for (one inserted
 * letter, five characters in). Edit distance catches that; substring catches
 * `kisspeptin` vs `kisspeptin-10`.
 */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function suggest(id: string): string[] {
  const bare = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return [...ids]
    .map((i) => ({ i, d: editDistance(bare(id), bare(i)) }))
    .filter(({ i, d }) => d <= 3 || i.includes(id) || id.includes(i))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map(({ i }) => i);
}

console.log('\n— Peptide reference integrity —');
console.log(`  ${ids.size} peptides in the library`);

if (ALLOWED.size) {
  console.log(`  ℹ️  ${ALLOWED.size} reference(s) allowed without a library entry:`);
  for (const [id, why] of ALLOWED) console.log(`     ${id} — ${why}`);
}

if (bad.length === 0) {
  console.log('\n✓ Every peptide-id reference resolves to a real peptide.\n');
  process.exit(0);
}

console.log('');
for (const b of bad) {
  console.log(`  ❌ ${b.where}: '${b.id}' matches no peptide`);
  console.log(`     This drops silently — the entry is filtered out and a shorter list renders.`);
  const near = suggest(b.id);
  if (near.length) console.log(`     Did you mean: ${near.join(', ')}`);
  console.log(`     If it is deliberate, add it to ALLOWED with a reason.`);
}
console.log(`\n  ${bad.length} broken peptide reference(s)\n`);
process.exit(1);
