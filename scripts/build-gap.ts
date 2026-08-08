/**
 * build-gap — "what is the tester NOT seeing?"
 *
 * WHY THIS EXISTS
 * On 2026-08-08 Jamie reported that the workout builder had no place to log
 * the weight used. The player has had a full per-set weight stepper for
 * months. The first read was "she didn't find it" — that was wrong. Her build,
 * iOS 1.9.9 (70), predated `060e2f3`, the fix for "saved workouts said 'No
 * workout to play' after any restart". She could not open a saved workout at
 * all, so she never reached the player. The builder was the only workout
 * screen available to her.
 *
 * Edward's rule, and it is the right one:
 *   "if she's proposing something that exists it means it failed to render or
 *    work, and/or wrong info was presented."
 *
 * A tester asking for a feature that exists is a RENDERING or REACHABILITY
 * bug, never a discoverability shrug. The cheapest first question is always
 * "what is in their build?" — and answering it by hand is exactly the kind of
 * step that gets skipped under pressure. So it lives here.
 *
 * USAGE
 *   npm run build-gap -- <easBuildId>     # resolves the commit via EAS
 *   npm run build-gap -- <commitSha>      # offline, no EAS auth needed
 *   npm run build-gap -- <sha> --against <sha>
 *
 * Exits 0 always — this is a reporting tool, not a gate.
 */
import { execSync } from 'node:child_process';

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.length === 0) {
  console.error('usage: npm run build-gap -- <easBuildId|commitSha> [--against <ref>]');
  process.exit(1);
}

const againstIdx = args.indexOf('--against');
const against = againstIdx >= 0 ? args[againstIdx + 1] : 'HEAD';
const target = args[0];

/** EAS build ids are UUIDs; anything else is treated as a git ref. */
function resolveCommit(input: string): { sha: string; via: string } | null {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  if (isUuid) {
    const raw = sh(`npx eas build:view ${input} --json`);
    if (!raw) return null;
    try {
      const sha = JSON.parse(raw)?.gitCommitHash;
      return sha ? { sha, via: 'EAS build' } : null;
    } catch {
      return null;
    }
  }
  const sha = sh(`git rev-parse ${input}`);
  return sha ? { sha, via: 'git ref' } : null;
}

const resolved = resolveCommit(target);
if (!resolved) {
  console.error(`Could not resolve "${target}" to a commit.`);
  console.error('Give an EAS build id (needs eas login) or a commit sha/branch.');
  process.exit(1);
}

const { sha, via } = resolved;
const shortTarget = sha.slice(0, 7);
const headSha = sh(`git rev-parse ${against}`);

console.log('\n— build gap —\n');
console.log(`  build commit : ${shortTarget}  (resolved via ${via})`);
console.log(`               : ${sh(`git log -1 --format='%ci %s' ${sha}`)}`);
console.log(`  compared to  : ${headSha.slice(0, 7)}  (${against})`);

if (sha === headSha) {
  console.log('\n✓ Identical — the tester is on current code.\n');
  process.exit(0);
}

const isAncestor = sh(`git merge-base --is-ancestor ${sha} ${headSha} && echo yes`) === 'yes';
if (!isAncestor) {
  console.log('\n⚠ That commit is not an ancestor of the comparison ref — the tester may be');
  console.log('  on a different branch entirely. Results below may be misleading.\n');
}

// Only commits that can change what a user SEES. A chore/ci/test commit cannot
// explain a "this feature is missing" report, and listing them buries the ones
// that can.
const raw = sh(`git log --format=%H%x1f%s ${sha}..${headSha} -- app src supabase/functions assets`);
const commits = raw
  ? raw.split('\n').filter(Boolean).map((l) => {
      const [hash, subject] = l.split('\x1f');
      return { hash, subject };
    })
  : [];

const userFacing = commits.filter((c) => /^(fix|feat)/i.test(c.subject));
const other = commits.filter((c) => !/^(fix|feat)/i.test(c.subject));

console.log(`\n  ${commits.length} commit(s) touching user-facing code are missing from this build.`);
console.log(`  ${userFacing.length} of them are fix/feat.\n`);

if (userFacing.length) {
  console.log('MISSING fix/feat — any of these can explain a "it doesn\'t work" report:');
  for (const c of userFacing) console.log(`  ${c.hash.slice(0, 7)}  ${c.subject}`);
}
if (other.length) {
  console.log(`\nAlso missing (${other.length} chore/refactor/test/ci):`);
  for (const c of other.slice(0, 10)) console.log(`  ${c.hash.slice(0, 7)}  ${c.subject}`);
  if (other.length > 10) console.log(`  … and ${other.length - 10} more`);
}

console.log(
  '\nBefore triaging a tester report, check this list first. A feature that ' +
  '\n"already exists" but was reported missing usually was not IN their build.\n',
);
