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

/**
 * SECOND CHECK — silent truncation of a catalog.
 *
 * `CATALOG.slice(0, N)` in a picker caps what the user can ever see, and
 * nothing on screen says a cap exists. Missing rows are indistinguishable from
 * rows that do not exist. Found in three places at once:
 *
 *   stack-builder    12 of 79 — the Metabolic category alone hid 11
 *   quick-dose       20 of 79 — 59 compounds unreachable without typing a name
 *   my-stacks        30 of 79
 *
 * A cap is legitimate when the list is long and unvirtualised (video-tagger
 * holds 384 exercises). What is not legitimate is hiding it, so a capped list
 * must render a count of what it left out. `TRUNCATION_ALLOWED` records the
 * ones that do, with the reason — same ratchet as KNOWN_ORPHANS in
 * verify:routes: baseline what exists, fail on anything new.
 */
const CATALOGS = ['PEPTIDES', 'EXERCISES', 'VIDEOS', 'PROTOCOLS'];

const TRUNCATION_ALLOWED = new Map([
  [
    'app/admin/video-tagger.tsx',
    'Admin tool. 384 exercises in a plain ScrollView would crawl, so it caps at ' +
      '60 AND renders "Showing X of Y matches — N more".',
  ],
]);

const truncations = [];
for (const file of files) {
  const rel = file.replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const cat of CATALOGS) {
      if (!new RegExp(String.raw`\b${cat}\s*\.slice\(\s*0\s*,`).test(line)) continue;
      if (TRUNCATION_ALLOWED.has(rel)) continue;
      truncations.push({ file: rel, line: idx + 1, cat, src: line.trim() });
    }
  });
}

console.log(`— Dead-zone scan —\nScanned ${files.length} screens.\n`);

for (const f of findings) {
  console.log(`✗ ${f.file}:${f.line}`);
  console.log(`    {${f.a} && ${f.b} && (   … main content`);
  console.log(`    {!${f.a} && (            … fallback (line ${f.fallbackLine})`);
  console.log(`    When ${f.a} is truthy and ${f.b} is falsy, NEITHER renders.`);
  console.log(`    Fix: split the gate, or add {${f.a} && !${f.b} && (…)} explaining the gap.\n`);
}

for (const t of truncations) {
  console.log(`✗ ${t.file}:${t.line}  silent truncation of ${t.cat}`);
  console.log(`    ${t.src}`);
  console.log(`    A capped catalog must say what it left out, or not cap.`);
  console.log(`    Fix: drop the slice, or render "Showing X of Y". If the cap is`);
  console.log(`    genuinely required, add the file to TRUNCATION_ALLOWED with a reason.\n`);
}

const total = findings.length + truncations.length;
if (total === 0) {
  console.log('✓ No unhandled render dead zones.');
  console.log('✓ No silent catalog truncation.');
  process.exit(0);
}
console.log(`${findings.length} dead zone(s), ${truncations.length} silent truncation(s).`);
process.exit(1);
