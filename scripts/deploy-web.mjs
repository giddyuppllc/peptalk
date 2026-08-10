/**
 * deploy-web — link dist/ to the Vercel project and ship it.
 *
 * WHY THIS IS A SCRIPT AND NOT AN npm CHAIN
 * `deploy:web` used to end with:
 *
 *   … && mkdir -p dist/.vercel && cp .vercel-link/project.json … && cd dist &&
 *   vercel deploy --prod --yes --scope giddyupp
 *
 * npm runs scripts through cmd.exe on Windows, where `mkdir -p` is not a flag —
 * cmd prints "The syntax of the command is incorrect" and the && chain stops.
 * The export and the freshness check had already printed their ticks, so the
 * run LOOKED successful: "Build is current and deployable" was the second-to-
 * last line. Production stayed four days old while the console said everything
 * passed.
 *
 * That is the same failure verify-build.ts was written for — a step that
 * reports success for work it did not do — so the fix is not another flag. The
 * filesystem work happens in node (portable), the deploy result is checked
 * rather than assumed, and a non-zero exit is propagated.
 */
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const LINK = '.vercel-link/project.json';
const DEST_DIR = 'dist/.vercel';
const DEST = `${DEST_DIR}/project.json`;

if (!existsSync('dist/index.html')) {
  console.error('✗ dist/index.html missing — run "npm run export:web" first.');
  process.exit(1);
}
if (!existsSync(LINK)) {
  console.error(`✗ ${LINK} missing — cannot tell Vercel which project this is.`);
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(LINK, DEST);

const { projectName } = JSON.parse(readFileSync(DEST, 'utf8'));
const commit =
  readFileSync('dist/index.html', 'utf8').match(/build-commit"\s+content="([a-f0-9]+)"/)?.[1] ??
  'unknown';
console.log(`\n→ deploying dist/ (commit ${commit.slice(0, 7)}) to ${projectName}\n`);

const res = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vercel', 'deploy', '--prod', '--yes', '--scope', 'giddyupp'],
  { cwd: 'dist', stdio: 'inherit' },
);

if (res.error) {
  console.error(`\n✗ could not run vercel: ${res.error.message}`);
  process.exit(1);
}
if (res.status !== 0) {
  console.error(`\n✗ vercel deploy exited ${res.status} — NOT deployed.`);
  process.exit(res.status ?? 1);
}

console.log(`\n✓ deployed commit ${commit.slice(0, 7)}.`);
console.log('  Confirm it is actually served — a green deploy is not a served build:');
console.log('    curl -s https://app.peptalk.bio | grep build-commit\n');
