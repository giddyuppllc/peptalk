#!/usr/bin/env node
/**
 * The version a build declares must be traceable to a commit in this repo.
 *
 * app.json said 1.9.9 while App Store Connect held 1.10.0 (75) under review, and
 * NO commit in this repo ever set 1.10.0 — the rejected binary corresponded to
 * no commit, so "we fixed it" and "it is still broken" were both true and
 * neither was checkable. Worse, the next EAS build would have declared 1.9.9,
 * which is lower than a version App Store Connect already knows about.
 *
 * Until 2026-09-16 this checked ONE of the three things that go wrong, and the
 * other two are the ones that produced the incident:
 *
 *   floor        app.json must not be behind the latest release tag.  (checked)
 *   tagged       the commit that sets a version must carry its tag, or the
 *                binary corresponds to no commit.                (NOT checked)
 *   pushed       that commit must exist somewhere other than this laptop, or
 *                nobody else can ever get it back.               (NOT checked)
 *
 * Worse, with no tags at all it printed "no release tags to compare against
 * yet" and exited 0 — the exact state of a fresh clone, and a pass that had
 * read nothing.
 *
 * ESCAPE HATCH. The last two are release properties, not edit-time ones: an
 * untagged, unpushed HEAD is what normal work looks like. `PEPTALK_UNRELEASED=1`
 * downgrades them to a loud notice, the way ALLOW_SANDBOX_PAYMENTS=1 works for
 * verify:build. It prints what it suppressed, every time, and using it means
 * this commit is NOT shippable. Nothing about it is silent.
 *
 * Build numbers are NOT checked here: eas.json sets appVersionSource "remote"
 * with autoIncrement, so EAS owns ios.buildNumber and android.versionCode. Their
 * absence from app.json is correct, and adding them back would fight EAS.
 *
 * `--self-test` drives the pure evaluator over fixtures.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SEMVER = /^\d+\.\d+\.\d+$/;

export const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

/**
 * PURE. Given what git says, return the problems. Kept separate from the git
 * calls so the fixtures below exercise the real decision rather than a copy.
 *
 * @param {{version: string, tags: string[], tagsAtHead: string[],
 *          unpushed: number, remoteKnown: boolean}} state
 * @returns {{fatal: string[], traceability: string[], notes: string[]}}
 */
export function evaluate(state) {
  const fatal = [];
  const traceability = [];
  const notes = [];
  const { version, tags, tagsAtHead, unpushed, remoteKnown } = state;

  if (!version || !SEMVER.test(version)) {
    fatal.push(`app.json expo.version is missing or malformed: ${JSON.stringify(version)}`);
    return { fatal, traceability, notes };
  }

  const releases = tags.filter((t) => SEMVER.test(t));
  if (releases.length > 0) {
    const latest = [...releases].sort(cmp).at(-1);
    if (cmp(version, latest) < 0) {
      fatal.push(
        `app.json version ${version} is BEHIND the latest release tag v${latest}. ` +
          `A build from this commit would declare a version already released.`,
      );
    } else {
      notes.push(`version ${version} ≥ latest release tag v${latest}`);
    }
  } else {
    // NOT a pass. No tags means nothing to compare against AND nothing that
    // pins any past release — the state this check was silent about.
    traceability.push(
      'this repo has no v* release tags at all, so there is no floor under ' +
        'expo.version and no commit is identified as a release.',
    );
  }

  if (!tagsAtHead.includes(`v${version}`)) {
    traceability.push(
      `HEAD is not tagged v${version}` +
        (tagsAtHead.length ? ` (it carries ${tagsAtHead.join(', ')})` : ' (it carries no tag)') +
        '. A submitted build must come from a commit that sets its version — tag it.',
    );
  }

  if (!remoteKnown) {
    traceability.push(
      'no remote is configured, so nothing here exists anywhere but this machine.',
    );
  } else if (unpushed > 0) {
    traceability.push(
      `${unpushed} commit${unpushed === 1 ? '' : 's'} on HEAD ${unpushed === 1 ? 'is' : 'are'} ` +
        'on no remote branch. A build from here corresponds to a commit nobody else can fetch.',
    );
  }

  return { fatal, traceability, notes };
}

// ─── self-test ───────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  const base = { version: '1.10.1', tags: ['1.9.9'], tagsAtHead: ['v1.10.1'], unpushed: 0, remoteKnown: true };
  const cases = [
    ['a tagged, pushed, ahead-of-floor HEAD is clean', base, (r) => r.fatal.length === 0 && r.traceability.length === 0],
    ['a version behind the latest tag is fatal', { ...base, version: '1.9.8', tagsAtHead: ['v1.9.8'] }, (r) => r.fatal.length === 1],
    ['a malformed version is fatal and stops there', { ...base, version: '1.10' }, (r) => r.fatal.length === 1 && r.traceability.length === 0],
    ['an UNTAGGED head is a traceability failure', { ...base, tagsAtHead: [] }, (r) => r.traceability.length === 1],
    ['a head tagged with the WRONG version is a traceability failure', { ...base, tagsAtHead: ['v1.9.9'] }, (r) => r.traceability.length === 1],
    ['unpushed commits are a traceability failure', { ...base, unpushed: 4 }, (r) => r.traceability.length === 1],
    ['no remote at all is a traceability failure', { ...base, remoteKnown: false }, (r) => r.traceability.length === 1],
    ['NO TAGS AT ALL is a failure, not the old free pass', { ...base, tags: [], tagsAtHead: [] }, (r) => r.traceability.length === 2],
    ['untagged AND unpushed reports both', { ...base, tagsAtHead: [], unpushed: 2 }, (r) => r.traceability.length === 2],
    ['1.10.0 sorts above 1.9.9 (not a string compare)', { ...base, version: '1.10.0', tags: ['1.9.9'], tagsAtHead: ['v1.10.0'] }, (r) => r.fatal.length === 0],
  ];
  let bad = 0;
  for (const [label, state, ok] of cases) {
    const r = evaluate(state);
    if (ok(r)) console.log(`  ✓ self-test: ${label}`);
    else { bad++; console.error(`  ✗ self-test: ${label} — got ${JSON.stringify(r)}`); }
  }
  if (bad) { console.error(`\n✗ verify:version self-test failed (${bad})`); process.exit(1); }
  console.log('✓ verify:version self-test passed');
}

// ─── the real check ──────────────────────────────────────────────────────────

const version = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
  .expo?.version;

const git = (cmd, fallback = '') => {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return fallback; }
};

const tags = git('git tag --list "v*"')
  .split('\n')
  .map((t) => t.trim().replace(/^v/, ''))
  .filter(Boolean);

const tagsAtHead = git('git tag --points-at HEAD')
  .split('\n')
  .map((t) => t.trim())
  .filter(Boolean);

const remotes = git('git remote').split('\n').map((r) => r.trim()).filter(Boolean);
// Commits reachable from HEAD but from no remote-tracking branch. `--not
// --remotes` is the direction that matters: an upstream may not be set, and
// `@{u}` throws when it is not.
const unpushed = remotes.length
  ? git('git rev-list --count HEAD --not --remotes', '0').trim()
  : '0';

const { fatal, traceability, notes } = evaluate({
  version,
  tags,
  tagsAtHead,
  unpushed: Number(unpushed) || 0,
  remoteKnown: remotes.length > 0,
});

for (const n of notes) console.log(`✓ ${n}`);

if (fatal.length) {
  console.error('');
  for (const f of fatal) console.error(`✗ ${f}`);
  console.error('');
  process.exit(1);
}

if (traceability.length) {
  const suppressed = process.env.PEPTALK_UNRELEASED === '1';
  const head = suppressed
    ? '! NOT SHIPPABLE — traceability failures suppressed by PEPTALK_UNRELEASED=1:'
    : '✗ This commit cannot be released. Traceability:';
  console[suppressed ? 'warn' : 'error'](`\n${head}`);
  for (const t of traceability) console[suppressed ? 'warn' : 'error'](`    - ${t}`);
  if (suppressed) {
    console.warn(
      '\n  Clear these before any store or PWA build: set expo.version on the\n' +
        '  release commit, tag it v<version>, and push the tag and the branch.\n',
    );
  } else {
    console.error(
      '\n  Fix: set expo.version on the release commit, tag it v<version>, push\n' +
        '  the tag and the branch. To carry on working before that, run with\n' +
        '  PEPTALK_UNRELEASED=1 — which prints this list every time and means\n' +
        '  the commit is not shippable.\n',
    );
    process.exit(1);
  }
}
