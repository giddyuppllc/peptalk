/**
 * Dead-zone verifier.
 *
 * Looks for one specific, mechanical rendering bug:
 *
 *     {A && B && ( …main content… )}
 *     {!A && ( …fallback explaining why there is no content… )}
 *
 * Those two branches look exhaustive and are not. When A is truthy and B is
 * falsy, NEITHER renders — the screen shows a header, maybe a summary, and
 * then nothing, with no message saying anything is missing. It reads as a
 * feature that has nothing to say rather than one that is broken.
 *
 * This is the defect that keeps recurring in this app: the data exists, the
 * screen exists, and the two never meet. Found in app/calculators/quick-dose,
 * where "Your Dose" was gated on `protocol && reconInfo` even though every
 * field in it came from `protocol`. 14 compounds have a protocol and no
 * reconstitution reference, so their dose, route, frequency, timing, storage
 * and contraindications were all hidden — and because `!protocol` was false,
 * the "no protocol available" fallback did not render either.
 *
 * A dead zone is considered COVERED if a third branch handles it:
 *
 *     {A && !B && ( …explain the B case… )}
 *
 * That is why app/(tabs)/community/live/[eventId].tsx does not trip this: a
 * viewer on the wrong tier gets a subscription upsell rather than a blank.
 *
 * Heuristic and deliberately narrow — it matches single-identifier operands on
 * one line. It will not catch every variant, and that is fine: it costs
 * nothing and it catches the exact shape that has already shipped twice.
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const IDENT = String.raw`[A-Za-z_$][\w$.?]*`;
const files = globSync('{app,src}/**/*.tsx').sort();

const findings = [];

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  /** `{A && B && (` → A ⇒ {line, B} */
  const positive = new Map();
  /** `{A && !B && (` → the set of B values already explained for this A */
  const covered = new Map();
  /** `{!A && (` → line number */
  const negative = new Map();

  lines.forEach((line, idx) => {
    const n = idx + 1;

    const cover = line.match(new RegExp(String.raw`\{\s*(${IDENT})\s*&&\s*!\s*(${IDENT})\s*&&\s*\(`));
    if (cover) {
      if (!covered.has(cover[1])) covered.set(cover[1], new Set());
      covered.get(cover[1]).add(cover[2]);
      return; // `{A && !B &&` must not also register as a positive gate
    }

    const pos = line.match(new RegExp(String.raw`\{\s*(${IDENT})\s*&&\s*(${IDENT})\s*&&\s*\(`));
    if (pos && !positive.has(pos[1])) positive.set(pos[1], { line: n, b: pos[2] });

    const neg = line.match(new RegExp(String.raw`\{\s*!\s*(${IDENT})\s*&&\s*\(`));
    if (neg && !negative.has(neg[1])) negative.set(neg[1], n);
  });

  for (const [a, { line, b }] of positive) {
    if (!negative.has(a)) continue; // no fallback pair — not this shape
    if (covered.get(a)?.has(b)) continue; // the A && !B case is explained
    findings.push({ file, line, a, b, fallbackLine: negative.get(a) });
  }
}

if (findings.length === 0) {
  console.log(`— Dead-zone scan —\nScanned ${files.length} screens.\n`);
  console.log('✓ No unhandled render dead zones found.');
  process.exit(0);
}

console.log(`— Dead-zone scan —\nScanned ${files.length} screens.\n`);
for (const f of findings) {
  console.log(`✗ ${f.file}:${f.line}`);
  console.log(`    {${f.a} && ${f.b} && (   … main content`);
  console.log(`    {!${f.a} && (            … fallback (line ${f.fallbackLine})`);
  console.log(`    When ${f.a} is truthy and ${f.b} is falsy, NEITHER renders.`);
  console.log(`    Fix: split the gate, or add {${f.a} && !${f.b} && (…)} explaining the gap.\n`);
}
console.log(`${findings.length} dead zone(s) found.`);
process.exit(1);
