#!/usr/bin/env node
/**
 * The app's version must never be behind what has already been released.
 *
 * app.json said 1.9.9 while App Store Connect held 1.10.0 (75) under review, and
 * NO commit in this repo ever set 1.10.0 — the rejected binary corresponded to
 * no commit, so "we fixed it" and "it is still broken" were both true and
 * neither was checkable. Worse, the next EAS build would have declared 1.9.9,
 * which is lower than a version App Store Connect already knows about.
 *
 * Build numbers are NOT checked here: eas.json sets appVersionSource "remote"
 * with autoIncrement, so EAS owns ios.buildNumber and android.versionCode. Their
 * absence from app.json is correct, and adding them back would fight EAS.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const version = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
  .expo?.version;

if (!version || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(`\n✗ app.json expo.version is missing or malformed: ${JSON.stringify(version)}`);
  process.exit(1);
}

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

let tags = [];
try {
  tags = execSync('git tag --list "v*"', { encoding: 'utf8' })
    .split('\n')
    .map((t) => t.trim().replace(/^v/, ''))
    .filter((t) => /^\d+\.\d+\.\d+$/.test(t));
} catch {
  // No git, or no tags — nothing to compare against.
}

if (tags.length === 0) {
  console.log(`✓ version ${version} (no release tags to compare against yet)`);
  process.exit(0);
}

const latest = tags.sort(cmp).at(-1);

if (cmp(version, latest) < 0) {
  console.error(
    `\n✗ app.json version ${version} is BEHIND the latest release tag v${latest}.\n` +
      `  A build from this commit would declare a version already released.\n` +
      `  Bump expo.version, and tag the release commit so the next check has a floor.\n`,
  );
  process.exit(1);
}

console.log(`✓ version ${version} ≥ latest release tag v${latest}`);
