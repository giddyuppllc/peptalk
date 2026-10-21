#!/usr/bin/env node
/**
 * Mutation-test the report path: break one guard at a time, and the tests that
 * claim to pin it must FAIL. Then restore, and they must pass.
 *
 *   node scripts/verify-report-mutants.mjs
 *
 * A green suite proves nothing about a guard it never exercises. Each entry
 * below removes or inverts one decision behind
 *   - reporting a member from the leaderboard (App Review 1.2), and
 *   - reporting an AI response (Play's generative-AI policy),
 * and names the tests that must notice.
 *
 * Rules this repo learned the hard way, followed here:
 *   - verify by EXIT CODE. A crashed run prints no "FAIL"; `status: null`
 *     (killed / timed out) is INCONCLUSIVE, not a catch;
 *   - restore from the content read into memory, never `git checkout --`,
 *     which reverts to HEAD rather than to the work in progress;
 *   - a mutation whose search text is missing, or not unique, is
 *     INCONCLUSIVE — it would otherwise "pass" by testing unmutated code.
 *
 * Not in verify:all: it runs jest ~14 times. Run it after touching any of the
 * files below.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TARGETS = 'src/lib/reportTargets.ts';
const AI = 'src/lib/aiReport.ts';
const STORE = 'src/store/useLeaderboardStore.ts';

const T_TARGETS = 'src/lib/__tests__/reportTargets.test.ts';
const T_AI = 'src/lib/__tests__/aiReport.test.ts';
const T_STORE = 'src/store/__tests__/leaderboardModeration.test.ts';

const MUTANTS = [
  // ── which target a report names ──
  {
    file: TARGETS, tests: [T_TARGETS, T_STORE],
    why: 'file a member report under postId — the old shape, silently wrong target',
    find: "return { ok: true, body: { reportedUserId: id, ...tail } };",
    replace: "return { ok: true, body: { postId: id, ...tail } };",
  },
  {
    file: TARGETS, tests: [T_TARGETS, T_STORE],
    why: 'send a member report with no target at all',
    find: "      if (!id) return { ok: false, error: 'Missing member to report.' };\n",
    replace: '',
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'accept any string as a reason',
    find: "  if (!isReason(reason)) return { ok: false, error: 'Unknown report reason.' };\n",
    replace: '',
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'let an inherited Object.prototype key pass as a reason',
    find: "return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REPORT_REASON_LABELS, value);",
    replace: "return typeof value === 'string' && (REPORT_REASON_LABELS as Record<string, unknown>)[value] !== undefined;",
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'report an empty AI message — a target the server cannot act on',
    find: "      if (!text) return { ok: false, error: 'Nothing to report — that message is empty.' };\n",
    replace: '',
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'send AI text past the column length, so the insert is refused',
    find: 'aiMessageText: text.slice(0, AI_MESSAGE_MAX)',
    replace: 'aiMessageText: text',
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'send an unparseable timestamp through',
    find: '      if (!Number.isNaN(at)) body.aiMessageAt = new Date(at).toISOString();',
    replace: '      body.aiMessageAt = String(target.at);',
  },

  // ── the gate on whose row gets a control ──
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'offer report / hide on the viewer\'s OWN row',
    find: '  return row.isSelf !== true;',
    replace: '  return true;',
  },
  {
    file: TARGETS, tests: [T_TARGETS],
    why: 'offer report / hide when there is no row',
    find: '  if (!row) return false;\n',
    replace: '',
  },

  // ── what an AI report is allowed to carry ──
  {
    file: AI, tests: [T_AI],
    why: 'spread the whole ChatMessage — journal entries, tool results, doses',
    find: "      text: String(message!.content),",
    replace: "      text: String(message!.content) + ' ' + JSON.stringify(message),",
  },
  {
    file: AI, tests: [T_AI],
    why: "report the user's own message back to moderation",
    find: "  if (message.role !== 'bot') return false;\n",
    replace: '',
  },
  {
    file: AI, tests: [T_AI],
    why: 'report an empty / whitespace-only reply',
    find: "  return typeof message.content === 'string' && message.content.trim().length > 0;",
    replace: "  return typeof message.content === 'string';",
  },

  // ── the leaderboard store ──
  {
    file: STORE, tests: [T_STORE],
    why: 'leave a blocked member on the board until a refetch',
    find: '          set(purgeUser(boards, shoutouts, userId));\n',
    replace: '',
  },
  {
    file: STORE, tests: [T_STORE],
    why: 'purge the row even when the block failed — hides someone who is not blocked',
    find: '        if (res.ok) {\n          const { boards, shoutouts } = get();\n          set(purgeUser(boards, shoutouts, userId));\n        }',
    replace: '        const { boards, shoutouts } = get();\n        set(purgeUser(boards, shoutouts, userId));',
  },
  {
    file: STORE, tests: [T_STORE],
    why: 'block a member as a side effect of reporting them',
    find: '        return useCommunityStore.getState().reportContent(built.body);',
    replace: '        await useCommunityStore.getState().blockUser(userId);\n        return useCommunityStore.getState().reportContent(built.body);',
  },
  {
    file: STORE, tests: [T_STORE],
    why: 'send a report even when the body could not be built',
    find: '        if (!built.ok) return { ok: false, error: built.error };\n',
    replace: '',
  },
];

const isWin = process.platform === 'win32';

function jest(tests) {
  return spawnSync(isWin ? 'npx.cmd' : 'npx', ['jest', '--ci', '--silent', ...tests], {
    encoding: 'utf8',
    timeout: 600_000,
    shell: isWin,
  });
}

const originals = new Map();
const restoreAll = () => {
  for (const [file, content] of originals) writeFileSync(file, content);
};
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

let bad = 0;
const rows = [];

try {
  for (const m of MUTANTS) {
    if (!originals.has(m.file)) originals.set(m.file, readFileSync(m.file, 'utf8'));
    const original = originals.get(m.file);
    const find = m.find.split('\r\n').join('\n');
    const normalised = original.split('\r\n').join('\n');
    const hits = normalised.split(find).length - 1;
    if (hits !== 1) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — search text found ${hits}x`]);
      bad++;
      continue;
    }
    writeFileSync(m.file, normalised.replace(find, () => m.replace));
    let run;
    try {
      run = jest(m.tests);
    } finally {
      writeFileSync(m.file, original);
    }
    if (run.error || run.status === null) {
      rows.push(['?  INCONCLUSIVE', m.file, `${m.why} — ${run.error?.message ?? `signal ${run.signal}`}`]);
      bad++;
    } else if (run.status === 0) {
      rows.push(['✗  SURVIVED', m.file, m.why]);
      bad++;
    } else {
      rows.push([`✓  killed (exit ${run.status})`, m.file, m.why]);
    }
  }
} finally {
  restoreAll();
}

// The control: with every file restored, the same tests must pass. Without
// this, a suite that was red to begin with would "kill" every mutant.
const allTests = [...new Set(MUTANTS.flatMap((m) => m.tests))];
const control = jest(allTests);
rows.push([
  control.status === 0 ? '✓  control passes (exit 0)' : `✗  CONTROL FAILED (exit ${control.status})`,
  '(restored sources)',
  `${allTests.length} test files`,
]);
if (control.status !== 0) bad++;

for (const [verdict, file, why] of rows) console.log(`${verdict.padEnd(28)} ${file.padEnd(34)} ${why}`);
console.log(bad ? `\n${bad} problem(s)` : `\nall ${MUTANTS.length} mutants killed; control green`);
process.exit(bad ? 1 : 0);
