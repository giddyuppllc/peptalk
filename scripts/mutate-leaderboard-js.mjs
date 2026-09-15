#!/usr/bin/env node
/**
 * Mutation test for the leaderboard's jest guards — proves each test FAILS when
 * the thing it guards is broken, instead of passing over it.
 *
 *   node scripts/mutate-leaderboard-js.mjs
 *
 * Each mutation rewrites one exact snippet, runs the two leaderboard suites,
 * and restores the file from memory (never `git checkout`, which would revert
 * uncommitted work). A mutation whose snippet is missing counts as a failure of
 * this script — a stale pattern would otherwise "pass" by testing nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MUTATIONS = [
  {
    name: 'gate: isOptedIn accepts any truthy value',
    file: 'src/lib/leaderboardMetrics.ts',
    from: 'return optIn === true;',
    to: 'return Boolean(optIn);',
  },
  {
    name: 'gate: rankLeaderboard stops filtering on opt-in',
    file: 'src/lib/leaderboardMetrics.ts',
    from: '.filter((u) => isOptedIn(u.optIn))',
    to: '.filter(() => true)',
  },
  {
    name: 'scrub: leaderboard row passes raw fields through',
    file: 'src/lib/leaderboardPayload.ts',
    from: '  return {\n    rank,\n    userId,',
    to: '  return {\n    ...(raw as object),\n    rank,\n    userId,',
  },
  {
    name: 'scrub: shout-out row passes raw fields through',
    file: 'src/lib/leaderboardPayload.ts',
    from: '  return {\n    userId,\n    username: str(raw.username),\n    displayName: str(raw.display_name),\n    avatarUrl: str(raw.avatar_url),\n    kind,',
    to: '  return {\n    ...(raw as object),\n    userId,\n    username: str(raw.username),\n    displayName: str(raw.display_name),\n    avatarUrl: str(raw.avatar_url),\n    kind,',
  },
  {
    name: 'scrub: unknown milestone kinds accepted',
    file: 'src/lib/leaderboardPayload.ts',
    from: ' || !SHOUTOUT_KINDS.includes(kind)) return null;',
    to: ') return null;',
  },
  {
    name: 'scrub: my-metrics keeps every key',
    file: 'src/lib/leaderboardPayload.ts',
    from: '  const out = {} as MyMetrics;',
    to: '  const out = { ...(row as object) } as MyMetrics;',
  },
  {
    name: 'opt-out: purgeSelf leaves the viewer in cached boards',
    file: 'src/lib/leaderboardPayload.ts',
    from: 'next[k] = { ...boards[k], rows: withoutSelf(boards[k].rows) };',
    to: 'next[k] = { ...boards[k] };',
  },
  {
    name: 'SQL (parsed): opt-in predicate dropped from the board',
    file: 'supabase/migrations/20260915200000_community_leaderboard.sql',
    from: '   WHERE p.leaderboard_opt_in IS TRUE',
    to: '   WHERE TRUE',
  },
  {
    name: 'SQL (parsed): FROM PUBLIC-only revoke',
    file: 'supabase/migrations/20260915200000_community_leaderboard.sql',
    from: 'REVOKE ALL ON FUNCTION public.get_community_leaderboard(text, integer)   FROM PUBLIC, anon, authenticated;',
    to: 'REVOKE ALL ON FUNCTION public.get_community_leaderboard(text, integer)   FROM PUBLIC;',
  },
  {
    name: 'SQL (parsed): planned doses counted as taken',
    file: 'supabase/migrations/20260915200000_community_leaderboard.sql',
    from: "AND coalesce(dl.source, 'user') <> 'planned'",
    to: 'AND TRUE',
  },
  {
    name: 'nav: leaderboard entry removed from navMap',
    file: 'src/lib/navMap.ts',
    from: "        href: '/community/leaderboard',",
    to: "        href: '/community/milestones',",
  },
  {
    name: 'copy: one DRAFT marker removed',
    file: 'src/constants/leaderboardCopy.ts',
    from: "joinButton: 'Join', // DRAFT — Edward approves",
    to: "joinButton: 'Join',",
  },
  {
    name: 'copy: hardcoded JSX text in the screen',
    file: 'app/community/leaderboard.tsx',
    from: '{LEADERBOARD_COPY.joinButton}',
    to: 'Join now',
  },
];

let survivors = 0;
for (const m of MUTATIONS) {
  const abs = path.join(ROOT, m.file);
  const original = readFileSync(abs, 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  if (!normalized.includes(m.from)) {
    console.log(`  ??        ${m.name} — snippet not found, mutation is stale`);
    survivors++;
    continue;
  }
  writeFileSync(abs, normalized.replace(m.from, m.to));
  try {
    const r = spawnSync('npx', ['jest', 'src/lib/__tests__/leaderboard'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const out = `${r.stdout}\n${r.stderr}`;
    const failed = (out.match(/Tests:\s+(\d+) failed/) ?? [])[1];
    if (r.status === 0) {
      console.log(`  SURVIVED  ${m.name}`);
      survivors++;
    } else {
      console.log(`  killed    ${m.name} (${failed ?? '?'} failing tests)`);
    }
  } finally {
    writeFileSync(abs, original);
  }
}

console.log(survivors === 0 ? '\nall mutations killed' : `\n${survivors} mutation(s) survived`);
process.exit(survivors === 0 ? 0 : 1);
