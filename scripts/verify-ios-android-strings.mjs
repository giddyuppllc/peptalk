#!/usr/bin/env node
/**
 * App Review 2.3.10 — no Android product names in the iOS binary.
 *
 * Apple rejected build 1.9.8 (64) for referencing Android inside the app. The
 * offenders were not obscure: a paywall bullet reading "Apple Watch + Google
 * Fit sync", the same string in onboarding, and "Google Fit" / "Samsung Health"
 * chips on the health profile. All three rendered unconditionally on iOS.
 *
 * ── What this can and cannot tell you ─────────────────────────────────────
 * This is a heuristic, and it says so rather than pretending otherwise. It
 * cannot prove a string is unreachable on iOS — that needs the control flow.
 * What it does is flag every occurrence of an Android product name in app/ and
 * src/, and treat one as acceptable only when the same line or its immediate
 * neighbourhood mentions Platform.OS, or it appears in the allowlist below with
 * a stated reason.
 *
 * So it is a ratchet: existing, reviewed occurrences are listed; anything new
 * has to be gated or justified. That is the property that matters, because the
 * failure mode here is a well-meaning edit adding a string nobody notices until
 * a reviewer does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

/** Product names that must not appear on an iOS surface. */
const TERMS = [
  'Google Fit',
  'Samsung Health',
  'Google Play',
  'Play Store',
  'Health Connect',
];

/**
 * Occurrences that are fine, each with the reason. Keyed `path:term`.
 * Anything not here must be Platform-gated or the check fails.
 */
const ALLOWED = new Map([
  ['app/privacy.tsx:Health Connect',
    'Legal document. A privacy policy describes the whole service; trimming it ' +
    'per-platform to satisfy a marketing guideline makes it less accurate, which ' +
    'is the worse trade.'],
  ['src/types/cycle.ts:Google Fit',
    'BIOMARKER_SOURCE_LABELS — a data map, not a render path. Consumers gate.'],
  ['src/types/cycle.ts:Health Connect',
    'Same map.'],
  ['src/components/DesktopGate.tsx:Google Play',
    'Web-only render path (webGate === "desktop" is set only on Platform.OS === "web").'],
]);

/** How far either side of a hit to look for a platform gate. */
const GATE_WINDOW = 6;

/**
 * Files that are Android-only by construction. A Health Connect adapter naming
 * Health Connect is not a finding; it is the subject of the file. These never
 * render on iOS because the adapter is not selected there.
 */
const ANDROID_ONLY_PATHS = [
  'src/services/healthConnectService.ts',
  'src/services/integrations/healthConnectAdapter.ts',
];

function sourceFiles() {
  const out = execSync(
    "git ls-files 'app/*' 'src/*' | grep -E '\\.(ts|tsx)$'",
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out.split('\n').filter(Boolean);
}

const failures = [];
const gated = [];

for (const file of sourceFiles()) {
  let text;
  try {
    text = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    continue;
  }
  if (!TERMS.some((t) => text.includes(t))) continue;
  if (ANDROID_ONLY_PATHS.includes(file)) continue;
  if (/__tests__|\.test\.tsx?$/.test(file)) continue;

  // Blank out comments before scanning rather than guessing line by line.
  // This codebase explains these rules at length — including inside multi-line
  // JSX comments — and an explanation of a rule must not read as a breach of
  // it. Replacing with spaces keeps line and column numbers intact.
  const blanked = text
    .replace(/\{[^\S\n]*\/\*[\s\S]*?\*\/[^\S\n]*\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[^\S\n]*\/\/.*$/gm, (m) => ' '.repeat(m.length));

  const lines = blanked.split('\n');
  const rawLines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const term of TERMS) {
      if (!lines[i].includes(term)) continue;

      const key = `${file}:${term}`;
      if (ALLOWED.has(key)) continue;

      const from = Math.max(0, i - GATE_WINDOW);
      const to = Math.min(lines.length, i + GATE_WINDOW + 1);
      const near = lines.slice(from, to).join('\n');
      const isGated = /Platform\.OS|androidOnly|isAndroid|isIOS/.test(near);

      if (isGated) gated.push(`${file}:${i + 1}  ${term}`);
      else failures.push(`${file}:${i + 1}  ${term}\n      ${rawLines[i].trim().slice(0, 100)}`);
    }
  }
}

console.log(`verify:iosstrings — ${gated.length} gated, ${ALLOWED.size} allowlisted, ${failures.length} ungated`);

if (failures.length) {
  console.error('\nAndroid product names on ungated render paths (App Review 2.3.10):\n');
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nGate it with Platform.OS, or add it to ALLOWED in this script with the reason.\n',
  );
  process.exit(1);
}
