#!/usr/bin/env node
/**
 * ai-tag-videos.mjs — first-pass AI tagging for the workout video library.
 *
 * Walks src/data/workoutVideos.json, and for any entry that's still
 * `exerciseId: null` AND doesn't already have an `aiSuggested` block,
 * pulls a representative frame from the R2-hosted video, sends it to
 * Grok Vision with the exercise library as context, and writes back a
 * non-destructive `aiSuggested` field:
 *
 *   aiSuggested: {
 *     exerciseId: string | null,    // best guess from the library
 *     category:   string | null,    // best guess category
 *     title:      string,           // short human-facing title
 *     confidence: number,           // 0..1
 *     reasoning:  string,           // one-sentence explanation
 *     model:      string,           // model id that produced this
 *     taggedAt:   string,           // ISO timestamp
 *   }
 *
 * The script never overwrites `exerciseId` / `category` / `title` directly —
 * Jamie still confirms each one via the in-app Video Tagger UI, which
 * surfaces the AI suggestion as a pre-selected default.
 *
 * Resume: re-running skips any video that already has an `aiSuggested`
 * field, so interruptions are safe. Pass --redo to force re-tagging.
 *
 * Requires: ffmpeg on PATH. Reads creds from supabase/.env.production.
 *
 * Usage:
 *   node scripts/ai-tag-videos.mjs                # tag every untagged video
 *   node scripts/ai-tag-videos.mjs --limit 10     # try the first 10 only
 *   node scripts/ai-tag-videos.mjs --redo         # re-tag everything from scratch
 *   node scripts/ai-tag-videos.mjs --slug img-3681  # tag one specific slug
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── env loader ────────────────────────────────────────────────────────────
// Minimal .env reader so we don't pull in dotenv for one script. Reads
// supabase/.env.production by default; falls back to process.env.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

const ENV = {
  ...loadEnvFile(path.join(REPO_ROOT, 'supabase', '.env.production')),
  ...process.env,
};

const R2_ENDPOINT          = ENV.R2_ENDPOINT;
const R2_ACCESS_KEY_ID     = ENV.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = ENV.R2_SECRET_ACCESS_KEY;
const R2_BUCKET            = ENV.R2_BUCKET ?? 'peptalktraining';
const OPENAI_API_KEY       = ENV.OPENAI_API_KEY;
const OPENAI_BASE_URL      = ENV.OPENAI_BASE_URL ?? 'https://api.x.ai/v1';
const VISION_MODEL         = ENV.OPENAI_VISION_MODEL ?? 'grok-4-1-fast-reasoning';

const MISSING = [];
if (!R2_ENDPOINT)          MISSING.push('R2_ENDPOINT');
if (!R2_ACCESS_KEY_ID)     MISSING.push('R2_ACCESS_KEY_ID');
if (!R2_SECRET_ACCESS_KEY) MISSING.push('R2_SECRET_ACCESS_KEY');
if (!OPENAI_API_KEY)       MISSING.push('OPENAI_API_KEY');
if (MISSING.length) {
  console.error(
    `\n  Missing required env vars: ${MISSING.join(', ')}\n` +
    `  Set them in supabase/.env.production or your shell, then re-run.\n`,
  );
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argFlag = (name) => args.includes(name);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const REDO  = argFlag('--redo');
const LIMIT = Number(argValue('--limit') ?? Infinity);
const SLUG  = argValue('--slug');

// ── R2 client ─────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function signedVideoUrl(objectKey, expiresInSec = 3600) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}

// ── ffmpeg frame extraction ───────────────────────────────────────────────
// ffmpeg can read from an HTTPS URL directly; with -ss it seeks ahead
// without downloading the whole file. We grab a single keyframe at 2s
// which is usually mid-rep on Jamie's clips.
async function extractFrame(videoUrl) {
  const tmpFile = path.join(
    os.tmpdir(),
    `peptalk-frame-${crypto.randomBytes(6).toString('hex')}.jpg`,
  );
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',                     // overwrite
        '-loglevel', 'error',
        '-ss', '00:00:02',         // seek
        '-i', videoUrl,
        '-frames:v', '1',
        '-q:v', '4',               // jpeg quality 1 (best) .. 31 (worst)
        '-vf', 'scale=720:-1',     // downscale for cheaper vision calls
        tmpFile,
      ],
      { timeout: 90_000 },
    );
    const buf = fs.readFileSync(tmpFile);
    return buf;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ── Vision API call ───────────────────────────────────────────────────────
const VALID_CATEGORIES = [
  'weight_loss', 'muscle_gain', 'muscle_growth', 'toning',
  'strength', 'endurance', 'longevity', 'yoga', 'pilates',
  'recovery', 'form_tutorial',
];

function buildPrompt(exercises) {
  const lines = exercises.map((e) => `${e.id} → ${e.name}`);
  return `You are tagging a single frame from a fitness instructional video for the PepTalk wellness app. Identify the exercise being performed.

EXERCISE LIBRARY (use only ids from this list):
${lines.join('\n')}

CATEGORIES (pick exactly one):
${VALID_CATEGORIES.join(', ')}

Return ONLY a JSON object — no markdown, no commentary — in this exact shape:
{
  "exerciseId": "<id from the library above, or null if you can't tell>",
  "category": "<one of the categories above, or null if unclear>",
  "title": "<short 3-6 word user-facing title>",
  "confidence": <number from 0.0 to 1.0, your honest confidence>,
  "reasoning": "<one short sentence explaining the call>"
}

Guidance:
- The frame may be mid-rep. Look at body position, equipment visible, and joint angles.
- If the person is between reps or it's a transition frame, use the equipment as a strong hint.
- For yoga / pilates / stretching content, prefer "yoga", "pilates", or "recovery" categories.
- Confidence below 0.4 means "I really can't tell" — set exerciseId to null in that case.
- Title should be human-readable (e.g. "Dumbbell Romanian Deadlift") not the slug.
- Output strict JSON. No backticks, no prose around it.`;
}

async function callVision(imageBuffer, exercises) {
  const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  const prompt = buildPrompt(exercises);

  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.1,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? '';
  // Strip any ``` fencing the model may produce
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) { throw new Error(`Bad JSON from model: ${cleaned.slice(0, 200)}`); }

  return parsed;
}

// ── Main loop ─────────────────────────────────────────────────────────────
async function main() {
  const videosPath = path.join(REPO_ROOT, 'src', 'data', 'workoutVideos.json');
  const exercisesPath = path.join(REPO_ROOT, 'src', 'data', 'jamieExercises.json');

  const videos = JSON.parse(fs.readFileSync(videosPath, 'utf8'));
  const exercises = JSON.parse(fs.readFileSync(exercisesPath, 'utf8'));
  const validIds = new Set(exercises.map((e) => e.id));

  let candidates = videos.filter((v) => v.exerciseId == null);
  if (!REDO) candidates = candidates.filter((v) => !v.aiSuggested);
  if (SLUG) candidates = candidates.filter((v) => v.slug === SLUG);
  candidates = candidates.slice(0, LIMIT);

  console.log(`Found ${candidates.length} videos to tag${REDO ? ' (force-redo)' : ''}.`);
  console.log(`Using model: ${VISION_MODEL} via ${OPENAI_BASE_URL}\n`);

  let done = 0, failed = 0, lowConfidence = 0;

  for (const v of candidates) {
    const tag = `[${done + failed + 1}/${candidates.length}] ${v.slug}`;
    try {
      const url = await signedVideoUrl(v.objectKey, 3600);
      const frame = await extractFrame(url);
      const suggestion = await callVision(frame, exercises);

      // Validate the model's exercise id against the real library — if
      // it hallucinated an id, drop it to null so Jamie has to pick.
      if (suggestion.exerciseId && !validIds.has(suggestion.exerciseId)) {
        console.warn(`${tag} model hallucinated exerciseId "${suggestion.exerciseId}" — discarding`);
        suggestion.exerciseId = null;
      }
      if (suggestion.category && !VALID_CATEGORIES.includes(suggestion.category)) {
        suggestion.category = null;
      }

      v.aiSuggested = {
        exerciseId: suggestion.exerciseId ?? null,
        category: suggestion.category ?? null,
        title: String(suggestion.title ?? '').slice(0, 80),
        confidence: Number(suggestion.confidence ?? 0),
        reasoning: String(suggestion.reasoning ?? '').slice(0, 200),
        model: VISION_MODEL,
        taggedAt: new Date().toISOString(),
      };

      // Save after every video — resumable if interrupted.
      fs.writeFileSync(videosPath, JSON.stringify(videos, null, 2) + '\n');

      const conf = (v.aiSuggested.confidence * 100).toFixed(0);
      const exId = v.aiSuggested.exerciseId ?? '(unknown)';
      console.log(`${tag} → ${exId} · ${conf}% confidence`);
      if (v.aiSuggested.confidence < 0.5) lowConfidence++;
      done++;
    } catch (err) {
      console.warn(`${tag} FAILED: ${err.message ?? err}`);
      failed++;
    }
  }

  console.log(`\nDone. Tagged: ${done}, low-confidence (<50%): ${lowConfidence}, failed: ${failed}.`);
  console.log(`Edits saved to src/data/workoutVideos.json.`);
  console.log(`Next: open the app's Video Tagger — every video now shows the AI suggestion pre-selected.`);
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
