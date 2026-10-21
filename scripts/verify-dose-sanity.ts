/**
 * verify:dosesanity — structural plausibility of every derived dose.
 *
 * The rules live in src/lib/doseSanity.ts and run against the same functions
 * the peptide screen calls. This prints every finding, known or new, and exits
 * non-zero on anything not already recorded as awaiting Jamie in
 * src/lib/__tests__/doseSanity.test.ts — or on an empty corpus.
 *
 * Why it exists: SS-31 shipped as 5–40 mg per dose, four 10 mg vials at the
 * top, and nothing in the repo objected.
 */
import { readFileSync } from 'node:fs';
import { PROTOCOL_TEMPLATES } from '../src/data/protocols';
import { auditAllDosing, findingKey } from '../src/lib/doseSanity';

if (PROTOCOL_TEMPLATES.length < 40) {
  console.error(`\n✗ SELF-CHECK FAILED — only ${PROTOCOL_TEMPLATES.length} protocols loaded; a clean result would be meaningless.`);
  process.exit(1);
}

// The known list is read from the test so there is exactly one copy of it.
const testSrc = readFileSync('src/lib/__tests__/doseSanity.test.ts', 'utf8');
const block = testSrc.slice(testSrc.indexOf('OPEN_FINDINGS_AWAITING_JAMIE = new Map'), testSrc.indexOf(']);', testSrc.indexOf('OPEN_FINDINGS_AWAITING_JAMIE = new Map')));
const known = new Set([...block.matchAll(/'([a-z0-9-]+\|[^'|]+\|[^']+)'/g)].map((m) => m[1]));
if (known.size === 0) {
  console.error('\n✗ SELF-CHECK FAILED — could not read OPEN_FINDINGS_AWAITING_JAMIE from the test file.');
  process.exit(1);
}

const findings = auditAllDosing();
const fresh = findings.filter((f) => !known.has(findingKey(f)));
const liveKeys = new Set(findings.map(findingKey));
const resolved = [...known].filter((k) => !liveKeys.has(k));

console.log('\n— Dose sanity —');
console.log(`  ${PROTOCOL_TEMPLATES.length} protocols · ${findings.length} finding(s) · ${known.size} recorded as awaiting Jamie`);
for (const f of findings) {
  const tag = known.has(findingKey(f)) ? '⏳ awaiting Jamie' : '❌ NEW';
  console.log(`  ${tag}  ${f.rule}  ${f.peptideId}  ${f.subject} — ${f.detail}`);
}
for (const k of resolved) console.log(`  ✅ no longer found — remove from the test's list: ${k}`);

if (fresh.length || resolved.length) process.exit(1);
console.log('\n✓ No new dose-sanity findings.\n');
process.exit(0);
