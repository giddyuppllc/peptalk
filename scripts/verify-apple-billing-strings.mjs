#!/usr/bin/env node
/**
 * verify:applebilling — Apple-specific billing language must not render off iOS.
 *
 * The converse of verify:iosstrings, which keeps Android product names out of
 * the iOS binary. This keeps Apple's billing vocabulary out of the Android and
 * web builds, where it is simply false: Android billing is Google Play and the
 * PWA's is Square, and neither buyer has an Apple ID. The paywall told all
 * three of them that payment is charged to their Apple ID account at
 * confirmation, that they can cancel in their Apple ID Subscriptions, and
 * linked Apple's standard EULA as the terms governing the purchase.
 *
 * Same heuristic and the same honesty about it as verify:iosstrings: it cannot
 * prove a string is unreachable off iOS, because that needs the control flow.
 * It flags every occurrence and accepts one only when the immediate
 * neighbourhood gates on Platform.OS, or the occurrence is allowlisted below
 * WITH ITS REASON. That makes it a ratchet — a new ungated Apple billing
 * string has to be gated or justified.
 *
 * `--self-test` runs the matcher over fixtures, including the trap that makes
 * this class of check vacuous: a comment explaining the rule must not read as
 * a breach of it, and a gate six lines away must count as a gate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

/** Apple billing vocabulary. Each is false on Android and on web. */
const TERMS = [
  'Apple ID',
  'apple.com/legal/internet-services/itunes',
  'App Store Subscriptions',
];

/**
 * Occurrences that stay, each with the reason.
 *
 * Matched on the OFFENDING LINE, not on file+term the way verify:iosstrings
 * keys its allowlist. A file+term key excuses every occurrence of that term in
 * that file — so allowlisting one sentence in app/subscription.tsx would have
 * silently excused the footer disclosure, the renew disclosure and the
 * social-proof card as well, which are three of the findings this check exists
 * to catch. `contains` must appear in the line itself.
 */
const ALLOWED = [
  {
    file: 'app/(tabs)/profile.tsx',
    contains: 'is set to renew soon through your Apple ID',
    reason:
      'Delete-account billing warning, expiring branch. Gating it to iOS would ' +
      'DROP the warning for an Android or web subscriber, who then deletes the ' +
      'account and keeps being charged by Play or Square — worse than a wrong ' +
      'noun. The replacement sentence names another company\'s billing and is a ' +
      'legal statement, so it is Edward\'s to write. Listed in ' +
      'SHIP_CHECKLIST_2026-09-15.md under Paywall and plan claims.',
  },
  {
    file: 'app/(tabs)/profile.tsx',
    contains: 'will keep renewing through your Apple ID',
    reason: 'The same warning, active-subscription branch. Same reasoning.',
  },
  {
    file: 'app/subscription.tsx',
    contains: 'already active on your Apple ID',
    reason:
      'handleUpgrade\'s AlreadyOwnedError path. Reached only through ' +
      'react-native-iap, and the Android branch of that error needs its own ' +
      'sentence naming Play. Gating it here would leave an Android user with a ' +
      'purchase that silently does nothing. Same Edward decision as above.',
  },
];

const allowedFor = (file, line) =>
  ALLOWED.find((a) => a.file === file && line.includes(a.contains));

/** How far either side of a hit to look for a platform gate. */
const GATE_WINDOW = 6;

/** Blank comments out, keeping line/column numbers, so an explanation of the
 *  rule does not read as a breach of it. */
export function blankComments(text) {
  return text
    .replace(/\{[^\S\n]*\/\*[\s\S]*?\*\/[^\S\n]*\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[^\S\n]*\/\/.*$/gm, (m) => ' '.repeat(m.length));
}

/** Returns [{ line, term, text, gated }] for one file's source. */
export function scanSource(text) {
  const lines = blankComments(text).split('\n');
  const raw = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const term of TERMS) {
      if (!lines[i].includes(term)) continue;
      const near = lines
        .slice(Math.max(0, i - GATE_WINDOW), Math.min(lines.length, i + GATE_WINDOW + 1))
        .join('\n');
      hits.push({
        line: i + 1,
        term,
        text: raw[i].trim().slice(0, 100),
        gated: /Platform\.OS|isIOS|iosOnly/.test(near),
      });
    }
  }
  return hits;
}

function sourceFiles() {
  // In JS, not a shell pipeline — a single-quoted glob plus grep dies on
  // Windows cmd and takes verify:all down before the later checks report.
  return execSync('git ls-files app src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !/__tests__|\.test\.tsx?$/.test(f));
}

// ─── self-test ───────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  const cases = [
    {
      label: 'an ungated Apple ID string is found',
      src: "<Text>Cancel anytime in your Apple ID Subscriptions.</Text>",
      expect: (h) => h.length === 1 && !h[0].gated,
    },
    {
      label: 'a Platform.OS gate on the same line counts',
      src: "{Platform.OS === 'ios' && ' Cancel in your Apple ID Subscriptions.'}",
      expect: (h) => h.length === 1 && h[0].gated,
    },
    {
      label: 'a gate six lines above still counts',
      src: ["{Platform.OS === 'ios' && (", '<A>', '<B>', '<C>', '<D>', '<E>', 'Apple ID', ')}'].join('\n'),
      expect: (h) => h.length === 1 && h[0].gated,
    },
    {
      label: 'a gate far above does NOT count',
      src: ["{Platform.OS === 'ios' && (", ...Array(12).fill('<A>'), 'Apple ID', ')}'].join('\n'),
      expect: (h) => h.length === 1 && !h[0].gated,
    },
    {
      label: 'a line comment explaining the rule is not a breach',
      src: "// never say Apple ID off iOS\nconst x = 1;",
      expect: (h) => h.length === 0,
    },
    {
      label: 'a block comment explaining the rule is not a breach',
      src: "/**\n * Apple ID is iOS-only.\n */\nconst x = 1;",
      expect: (h) => h.length === 0,
    },
    {
      label: 'a JSX comment explaining the rule is not a breach',
      src: "{/* Apple ID only exists on iOS */}\n<Text>hi</Text>",
      expect: (h) => h.length === 0,
    },
    {
      label: "Apple's EULA url is caught",
      src: "Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')",
      expect: (h) => h.length === 1 && !h[0].gated,
    },
    {
      label: 'ordinary copy is not flagged',
      src: "<Text>Subscriptions auto-renew monthly until cancelled.</Text>",
      expect: (h) => h.length === 0,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const hits = scanSource(c.src);
    if (c.expect(hits)) console.log(`  ✓ self-test: ${c.label}`);
    else { bad++; console.error(`  ✗ self-test: ${c.label} — got ${JSON.stringify(hits)}`); }
  }
  if (bad) { console.error(`\n✗ verify:applebilling self-test failed (${bad})`); process.exit(1); }
  console.log('✓ verify:applebilling self-test passed');
}

// ─── the real scan ───────────────────────────────────────────────────────────

const failures = [];
let gated = 0;
let scanned = 0;
const seenAllowed = new Set();

for (const file of sourceFiles()) {
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
  scanned++;
  if (!TERMS.some((t) => text.includes(t))) continue;
  for (const hit of scanSource(text)) {
    // Gate first, THEN the allowlist, and only ever excuse an UNGATED hit —
    // otherwise an allowlisted file stops contributing to the gated floor
    // below and the scan quietly hollows out.
    if (hit.gated) { gated++; continue; }
    const allow = allowedFor(file, hit.text);
    if (allow) { seenAllowed.add(allow.contains); continue; }
    failures.push(`${file}:${hit.line}  ${hit.term}\n      ${hit.text}`);
  }
}

// A scanner that reads nothing must not look like a pass.
if (scanned < 100) {
  console.error(`✗ SELF-CHECK FAILED — only ${scanned} source files read (floor 100)`);
  process.exit(1);
}
if (gated < 3) {
  console.error(`✗ SELF-CHECK FAILED — only ${gated} gated occurrence(s) found (floor 3); the paywall's Apple disclosures should all be here, so the scan is not seeing them`);
  process.exit(1);
}
for (const a of ALLOWED) {
  if (!seenAllowed.has(a.contains)) {
    console.error(`✗ ALLOWED lists "${a.contains}" in ${a.file}, which no longer occurs ungated — remove the stale entry`);
    process.exit(1);
  }
}

console.log(`verify:applebilling — ${scanned} files, ${gated} gated, ${ALLOWED.length} allowlisted, ${failures.length} ungated`);

if (failures.length) {
  console.error('\nApple billing language on paths that also render on Android or web:\n');
  for (const f of failures) console.error('  ' + f);
  console.error(
    "\nGate it with Platform.OS === 'ios', or add it to ALLOWED in this script with the reason.\n",
  );
  process.exit(1);
}
