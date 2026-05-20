#!/usr/bin/env node
/**
 * gen-exercise-instructions.mjs
 *
 * One-time content generator: hits Grok with a short prompt per
 * exercise and writes structured coaching content
 * (description / steps / cues / safetyNotes) into
 * src/data/exerciseInstructions.json.
 *
 * The Exercise type carries optional `description / steps / cues /
 * safetyNotes` fields; this script populates them.
 *
 * Resumable: re-runs skip any exerciseId that already has an entry
 * in the JSON file. Pass --redo to force regeneration.
 *
 * Usage:
 *   node scripts/gen-exercise-instructions.mjs                # generate missing
 *   node scripts/gen-exercise-instructions.mjs --limit 10     # only first 10
 *   node scripts/gen-exercise-instructions.mjs --redo         # regen all
 *   node scripts/gen-exercise-instructions.mjs --id band-pallof-press
 *
 * Cost: ~$0.10 total for 451 exercises (grok-4-1-fast-reasoning,
 *   ~500 input tokens + ~250 output tokens per call).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const EX_PATH = path.join(repoRoot, 'src/data/jamieExercises.json');
const OUT_PATH = path.join(repoRoot, 'src/data/exerciseInstructions.json');

// ── Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const limit = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const onlyId = (() => {
  const i = args.indexOf('--id');
  return i >= 0 ? args[i + 1] : null;
})();
const redo = args.includes('--redo');
const concurrency = 8;

// ── Env ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const API_KEY =
  process.env.GROK_API_KEY ??
  process.env.XAI_API_KEY ??
  process.env.EXPO_PUBLIC_XAI_API_KEY ??
  process.env.OPENAI_API_KEY ??
  '';
const BASE_URL =
  process.env.GROK_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.x.ai/v1';
const MODEL = process.env.GROK_MODEL ?? 'grok-4-1-fast-reasoning';

if (!API_KEY) {
  console.error('Missing GROK/XAI/OPENAI API key in env. Set GROK_API_KEY or XAI_API_KEY.');
  process.exit(1);
}

// ── Inputs ────────────────────────────────────────────────────────────────
const exercises = JSON.parse(fs.readFileSync(EX_PATH, 'utf8'));
const existing = fs.existsSync(OUT_PATH)
  ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
  : {};

// ── Prompt ────────────────────────────────────────────────────────────────
function buildPrompt(ex) {
  const muscles = (ex.muscles ?? []).join(', ') || 'general';
  const level = ex.level ?? 'beginner';
  const location = ex.location ?? 'any';
  return [
    `You are writing coaching content for a fitness app's exercise library. The user is a ${level}-level lifter, training at: ${location}.`,
    '',
    `EXERCISE: ${ex.name}`,
    `Primary muscles: ${muscles}`,
    `Metrics tracked: ${(ex.metrics ?? []).join(', ') || 'reps'}`,
    '',
    'Produce JSON with EXACTLY these keys (no markdown, no prose outside JSON):',
    '{',
    '  "description": "one-sentence summary of what this is and what it targets (<=140 chars)",',
    '  "steps": ["step 1", "step 2", "step 3", "step 4"],  // 3-5 numbered ordered actions, plain English, each <=140 chars. Start from set-up; finish at return to start.',
    '  "cues": ["cue 1", "cue 2"],   // 2-3 short coaching cues (form points). Each <=80 chars. Example: "Drive through your heels", "Keep ribs stacked over hips".',
    '  "safetyNotes": ["note 1"]      // 1-2 safety notes about common mistakes or injury risks. Each <=160 chars. Omit if not applicable.',
    '}',
    '',
    'RULES:',
    '- Be accurate. If unsure, prefer the conservative coaching variant.',
    '- Do NOT include medical advice.',
    '- Do NOT recommend weights — this is form content only.',
    '- Plain language. No "PR" or "1RM" jargon without explanation.',
    '- Output VALID JSON only. No code fences. No commentary.',
  ].join('\n');
}

// ── Grok call ─────────────────────────────────────────────────────────────
async function callGrok(ex) {
  const body = {
    model: MODEL,
    max_tokens: 500,
    temperature: 0.4,
    messages: [
      { role: 'system', content: 'You output VALID JSON only. No commentary.' },
      { role: 'user', content: buildPrompt(ex) },
    ],
  };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Grok HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? '';
  // Some models occasionally wrap in ```json``` — strip if present.
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Bad JSON for ${ex.id}: ${cleaned.slice(0, 200)}`);
  }
  // Light validation: drop garbage shapes.
  return {
    description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(String).slice(0, 6) : [],
    cues: Array.isArray(parsed.cues) ? parsed.cues.map(String).slice(0, 4) : [],
    safetyNotes: Array.isArray(parsed.safetyNotes) ? parsed.safetyNotes.map(String).slice(0, 3) : [],
  };
}

// ── Run ───────────────────────────────────────────────────────────────────
async function main() {
  let targets = exercises;
  if (onlyId) targets = targets.filter((e) => e.id === onlyId);
  if (!redo) targets = targets.filter((e) => !existing[e.id]);
  targets = targets.slice(0, limit);

  console.log(`Generating instructions for ${targets.length} exercises (concurrency=${concurrency})…`);
  let done = 0;
  let failed = 0;
  const out = { ...existing };
  let saveCounter = 0;

  const save = () => {
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  };

  async function worker(queue) {
    while (queue.length > 0) {
      const ex = queue.shift();
      try {
        const result = await callGrok(ex);
        out[ex.id] = result;
        done += 1;
        // Periodic snapshot every 25 successes so interruptions
        // don't lose all the work.
        saveCounter += 1;
        if (saveCounter % 25 === 0) save();
      } catch (e) {
        failed += 1;
        console.warn(`  ✗ ${ex.id}: ${e.message}`);
      }
      if ((done + failed) % 20 === 0) {
        console.log(`  progress: ${done} ok / ${failed} fail / ${targets.length} total`);
      }
    }
  }

  const queue = [...targets];
  const workers = Array.from({ length: concurrency }, () => worker(queue));
  await Promise.all(workers);

  save();
  console.log(`\nDone. ok=${done} fail=${failed} total=${targets.length}`);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
