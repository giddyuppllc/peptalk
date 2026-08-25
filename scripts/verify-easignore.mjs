/**
 * verify:easignore — the EAS upload must not carry stale native projects.
 *
 * WHY THIS EXISTS
 * `.easignore`, when present, REPLACES `.gitignore` for deciding what gets
 * uploaded to EAS Build. That is easy to miss, and the consequence is severe:
 * `android/` and `ios/` are gitignored here because they are prebuild OUTPUT,
 * but they were not listed in `.easignore`, so they were uploaded — and EAS
 * skips `expo prebuild` whenever native directories are present.
 *
 * Builds were therefore made from whatever prebuild output happened to be
 * sitting on the developer's machine.
 *
 * It shipped a real defect. `health.WRITE_WEIGHT` was added to app.json on
 * 2026-08-24; build 40 (25 Aug) did not contain it, verified by reading the
 * AAB's own manifest. The uploaded AndroidManifest.xml had been generated on
 * 2026-08-08 and was never regenerated. `targetSdk 36` and the Health Connect
 * crash fix survived only by luck — gradle.properties and MainActivity.kt had
 * been patched on that machine as well.
 *
 * The failure mode is the one this codebase keeps hitting: the config is
 * edited, the build succeeds, and the change is silently absent. Nothing fails,
 * nothing logs, and it is only found by taking the artifact apart.
 *
 * This check is deliberately narrow. It asserts that any native project
 * directory which is gitignored is also excluded from the EAS upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EASIGNORE = path.join(ROOT, '.easignore');
const GITIGNORE = path.join(ROOT, '.gitignore');

/** Directories whose presence makes EAS skip `expo prebuild`. */
const NATIVE_DIRS = ['android', 'ios'];

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  ✗ ${msg}`);
  if (detail) console.log(`      ${detail}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log('— EAS upload contents —');

if (!fs.existsSync(EASIGNORE)) {
  // No .easignore means .gitignore governs, which already excludes them.
  console.log('  ✓ no .easignore — .gitignore governs the upload');
  process.exit(0);
}

const easLines = fs
  .readFileSync(EASIGNORE, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const gitLines = fs.existsSync(GITIGNORE)
  ? fs.readFileSync(GITIGNORE, 'utf8').split('\n').map((l) => l.trim())
  : [];

// Self-check: if the parse yields nothing the assertions below are vacuous.
if (easLines.length < 3) {
  console.error(`SELF-CHECK FAILED: parsed only ${easLines.length} .easignore rules — the parser is broken, not the config.`);
  process.exit(1);
}

const excludes = (dir) =>
  easLines.some((l) => {
    const norm = l.replace(/^\/+/, '').replace(/\/+$/, '');
    return norm === dir;
  });

for (const dir of NATIVE_DIRS) {
  const gitIgnored = gitLines.some((l) => {
    const norm = l.replace(/^\/+/, '').replace(/\/+$/, '');
    return norm === dir;
  });
  const present = fs.existsSync(path.join(ROOT, dir));

  if (!gitIgnored && present) {
    // A committed native project is a deliberate bare-workflow choice.
    pass(`${dir}/ is committed — bare workflow, prebuild intentionally skipped`);
    continue;
  }
  if (!present && !gitIgnored) {
    pass(`${dir}/ absent`);
    continue;
  }
  if (excludes(dir)) {
    pass(`${dir}/ excluded from the EAS upload — prebuild will regenerate it`);
  } else {
    fail(
      `${dir}/ is gitignored but NOT excluded by .easignore`,
      `EAS will upload the local ${dir}/ and skip "expo prebuild", so app.json ` +
        `changes (permissions, plugins, SDK levels) will NOT reach the build. ` +
        `Add "/${dir}" to .easignore.`,
    );
  }
}

console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} problem(s) — builds would use stale native config.\n`);
  process.exit(1);
}
console.log('✓ EAS will build from app.json, not from stale native output.\n');
