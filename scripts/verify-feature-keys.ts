/**
 * verify:featurekeys — every feature key a paywall gate checks must be granted
 * by at least one tier.
 *
 * WHY THIS EXISTS
 * d9859bc (2026-09-07) removed 'exercise_library' and 'meal_plan' from
 * PRO_FEATURES. Both screens still wrapped themselves in
 * <PaywallGate feature="…"> for those keys, so computeFeatureAccess returned
 * false for EVERY user, Pro included, and PaywallModal.getRequiredTier fell
 * through to 'free' — a Pro subscriber was shown "Upgrade to Free". The whole
 * of verify:all was green while that shipped, because nothing compared the
 * keys used at call sites with the keys the tier table grants.
 *
 * WHAT IT CHECKS
 * Literal keys passed to <PaywallGate feature>, <PaywallModal feature>,
 * useFeatureGate(), hasFeature(), useFeatureLimit(), and setPaywallFeature()
 * (the state that feeds a dynamic PaywallModal) across app/ and src/.
 *
 * A non-literal key cannot be checked statically. It fails unless its file is
 * listed in DYNAMIC_OK with the reason it is safe — the hook definitions that
 * forward a parameter, and screens whose dynamic key is only ever set from
 * literals this script also reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TIER_FEATURES } from '../src/types/fitness';

const ROOT = path.resolve(__dirname, '..');

const DYNAMIC_OK: Record<string, string> = {
  'src/hooks/useFeatureGate.ts': 'defines useFeatureGate/PaywallGate; forwards its parameter',
  'src/hooks/useFeatureLimit.ts': 'defines useFeatureLimit; forwards its parameter',
  'src/store/useSubscriptionStore.ts': 'defines hasFeature; forwards its parameter',
  'src/components/PaywallModal.tsx': 'defines PaywallModal; reads its prop',
  'app/nutrition/food-search.tsx': 'feature={paywallFeature} is only set via setPaywallFeature(literal), checked below',
};

/** Floor on call sites found, so a broken scanner cannot pass by reading nothing. */
const MIN_SITES = 12;

const granted = new Set<string>(Object.values(TIER_FEATURES).flat());

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

interface Site { file: string; line: number; kind: string; key: string | null; raw: string }

const LITERAL = /^\s*(?:'([a-z0-9_]+)'|"([a-z0-9_]+)"|\{\s*'([a-z0-9_]+)'\s*\}|\{\s*"([a-z0-9_]+)"\s*\})/;

const sites: Site[] = [];

for (const abs of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
  const file = path.relative(ROOT, abs).split(path.sep).join('/');
  const src = stripComments(fs.readFileSync(abs, 'utf8'));

  // JSX: <PaywallGate … feature=…> / <PaywallModal … feature=…>
  for (const m of src.matchAll(/<(PaywallGate|PaywallModal)\b/g)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const attrs = src.slice(start, i);
    const fm = attrs.match(/\bfeature=([\s\S]*)/);
    if (!fm) continue;
    const lit = fm[1].match(LITERAL);
    sites.push({
      file,
      line: lineOf(src, m.index ?? 0),
      kind: `<${m[1]} feature>`,
      key: lit ? (lit[1] ?? lit[2] ?? lit[3] ?? lit[4]) : null,
      raw: fm[1].split(/\s/)[0],
    });
  }

  // Calls whose first argument is a feature key.
  for (const m of src.matchAll(/\b(useFeatureGate|hasFeature|useFeatureLimit|setPaywallFeature)\(([^),]*)/g)) {
    const arg = m[2];
    if (arg.trim() === '' || arg.trim() === 'null') continue; // hasFeature() prose / clearing state
    if (/:\s*string/.test(arg)) continue; // a signature, not a call
    const lit = arg.match(LITERAL);
    sites.push({
      file,
      line: lineOf(src, m.index ?? 0),
      kind: `${m[1]}()`,
      key: lit ? (lit[1] ?? lit[2]) : null,
      raw: arg.trim(),
    });
  }
}

/**
 * The paywall modal's copy table. Its keys are the OTHER direction the gate
 * can drift: a row here whose key no tier grants is a row that only ever
 * renders over an unsatisfiable gate, which is what produced "Upgrade to
 * Free". The scanner only ever looked at CALL SITES, so seven such rows sat
 * green in this check for months.
 */
function paywallMetaKeys(): { key: string; line: number }[] {
  const rel = 'src/components/PaywallModal.tsx';
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const block = src.match(/const FEATURE_META[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.error(`✗ ${rel} — FEATURE_META not found; this check would read nothing`);
    process.exit(1);
  }
  const start = src.indexOf(block[1]);
  return [...block[1].matchAll(/^ {2}([a-z0-9_]+):\s*\{/gm)].map((m) => ({
    key: m[1],
    line: lineOf(src, start + (m.index ?? 0)),
  }));
}

const metaKeys = paywallMetaKeys();
const metaUngranted = metaKeys.filter((m) => !granted.has(m.key));

const ungranted = sites.filter((s) => s.key !== null && !granted.has(s.key));
const dynamicBad = sites.filter((s) => s.key === null && !DYNAMIC_OK[s.file]);
const literal = sites.filter((s) => s.key !== null);

console.log(`verify:featurekeys — ${sites.length} gate sites (${literal.length} literal), ${metaKeys.length} PaywallModal copy rows, ${granted.size} keys granted across tiers`);

let failed = false;
if (literal.length < MIN_SITES) {
  console.error(`✗ SELF-CHECK FAILED — only ${literal.length} literal gate sites found (floor ${MIN_SITES}); the scanner is probably not reading the code`);
  failed = true;
}
for (const s of ungranted) {
  console.error(`✗ ${s.file}:${s.line} ${s.kind} "${s.key}" — no tier grants this key, so the gate blocks everyone`);
  failed = true;
}
if (metaKeys.length < 20) {
  console.error(`✗ SELF-CHECK FAILED — only ${metaKeys.length} FEATURE_META rows parsed (floor 20); the FEATURE_META scan is not reading the table`);
  failed = true;
}
for (const m of metaUngranted) {
  console.error(`✗ src/components/PaywallModal.tsx:${m.line} FEATURE_META "${m.key}" — no tier grants this key, so this row can only ever render over a gate no purchase opens`);
  failed = true;
}
for (const s of dynamicBad) {
  console.error(`✗ ${s.file}:${s.line} ${s.kind} ${s.raw} — non-literal key; make it literal or add the file to DYNAMIC_OK with a reason`);
  failed = true;
}

if (failed) process.exit(1);
console.log('✓ every gated feature key, and every PaywallModal copy row, is granted by at least one tier');
