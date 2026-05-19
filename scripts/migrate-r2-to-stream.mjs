#!/usr/bin/env node
/**
 * migrate-r2-to-stream.mjs — one-way migration of workout videos from
 * Cloudflare R2 (raw MP4 storage) into Cloudflare Stream (managed video
 * CMS with naming + thumbnails + HLS).
 *
 * Flow per video:
 *   1. Sign a short-lived R2 GET URL (so Stream can pull the bytes).
 *   2. POST /accounts/<id>/stream/copy with the URL + initial name.
 *   3. Poll /accounts/<id>/stream/<uid> until status.state === 'ready'.
 *   4. Write streamUid into BOTH manifest.json files:
 *        - supabase/functions/get-workout-video/manifest.json   (edge fn allowlist)
 *        - src/data/workoutVideos.json                          (client manifest)
 *   5. Move to next video.
 *
 * Once a video has streamUid set, the edge function uses Stream for
 * playback. The R2 copy stays as a cold backup — never delete it from
 * here.
 *
 * Resumability: re-running skips entries that already have streamUid.
 *
 * Environment:
 *   CLOUDFLARE_ACCOUNT_ID         required
 *   CLOUDFLARE_API_TOKEN          required, scope = Stream:Edit
 *   SUPABASE_URL                  optional — only used for the help message
 *   R2_ENDPOINT                   required (e.g. https://<accountid>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID              required
 *   R2_SECRET_ACCESS_KEY          required
 *   R2_BUCKET                     defaults to peptalktraining
 *
 * Usage:
 *   node scripts/migrate-r2-to-stream.mjs                      # all unmigrated
 *   node scripts/migrate-r2-to-stream.mjs --limit 5            # first 5 unmigrated
 *   node scripts/migrate-r2-to-stream.mjs --slug img-3681      # one specific slug
 *   node scripts/migrate-r2-to-stream.mjs --dry-run            # show what would run
 *
 * Estimated runtime: 293 videos × ~30 seconds end-to-end ≈ 2½ hours
 * (most of it is Stream's transcoding queue, which we poll for).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const EDGE_MANIFEST = resolve(ROOT, 'supabase/functions/get-workout-video/manifest.json');
const APP_MANIFEST = resolve(ROOT, 'src/data/workoutVideos.json');

const argv = parseArgs(process.argv.slice(2));
const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const r2Bucket = process.env.R2_BUCKET ?? 'peptalktraining';
const r2Endpoint = required('R2_ENDPOINT');
const r2Key = required('R2_ACCESS_KEY_ID');
const r2Secret = required('R2_SECRET_ACCESS_KEY');

const r2 = new S3Client({
  region: 'auto',
  endpoint: r2Endpoint,
  credentials: { accessKeyId: r2Key, secretAccessKey: r2Secret },
});

const POLL_MAX_MS = 5 * 60 * 1000; // give Stream 5 min to transcode a clip
const POLL_INTERVAL_MS = 4 * 1000;
const SIGN_TTL_SEC = 60 * 60; // 1 hour is plenty for Stream to fetch
const FETCH_TIMEOUT_MS = 30 * 1000; // soak slow Cloudflare responses but cap hangs
const STREAM_API = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;

function timeout(signalMs = FETCH_TIMEOUT_MS) {
  return AbortSignal.timeout(signalMs);
}

async function main() {
  const edge = readJson(EDGE_MANIFEST);
  const app = readJson(APP_MANIFEST);
  const appBySlug = new Map(app.map((v) => [v.slug, v]));

  // Surface --slug typos clearly: distinguish "slug doesn't exist" from
  // "slug already migrated" from "nothing untagged left".
  if (argv.slug) {
    const matched = edge.find((e) => e.slug === argv.slug);
    if (!matched) {
      console.error(`No manifest entry has slug=${argv.slug}.`);
      process.exit(2);
    }
    if (matched.streamUid) {
      console.log(`${argv.slug} already migrated (streamUid=${matched.streamUid}). Nothing to do.`);
      return;
    }
  }

  const queue = filterQueue(edge, argv);
  if (queue.length === 0) {
    console.log('Nothing to migrate. Every entry already has streamUid.');
    return;
  }
  console.log(`${queue.length} video${queue.length === 1 ? '' : 's'} to migrate.`);
  if (argv.dryRun) {
    for (const entry of queue) console.log(`  would migrate: ${entry.slug}  (${entry.objectKey})`);
    return;
  }

  let migrated = 0;
  let failed = 0;
  for (const [idx, entry] of queue.entries()) {
    const label = `[${idx + 1}/${queue.length}] ${entry.slug}`;
    try {
      const initialName = appBySlug.get(entry.slug)?.title?.trim() || entry.slug;
      console.log(`${label} → signing R2 URL`);
      const r2Url = await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: r2Bucket, Key: entry.objectKey }),
        { expiresIn: SIGN_TTL_SEC },
      );

      console.log(`${label} → POST /stream/copy as "${initialName}"`);
      const copyRes = await fetch(`${STREAM_API}/copy`, {
        method: 'POST',
        signal: timeout(),
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: r2Url,
          meta: {
            name: initialName,
            originalKey: entry.objectKey,
            slug: entry.slug,
          },
          requireSignedURLs: true,
          thumbnailTimestampPct: 0.04,
        }),
      });
      if (!copyRes.ok) {
        const text = await copyRes.text().catch(() => '');
        throw new Error(`Stream /copy failed ${copyRes.status}: ${text.slice(0, 400)}`);
      }
      const copyBody = await copyRes.json();
      const uid = copyBody?.result?.uid;
      if (!uid) throw new Error(`Stream /copy returned no uid: ${JSON.stringify(copyBody)}`);

      console.log(`${label} → polling for ready (uid=${uid})`);
      await waitForReady(uid, label);

      // Persist immediately so a crash mid-batch doesn't lose progress.
      entry.streamUid = uid;
      const appEntry = appBySlug.get(entry.slug);
      if (appEntry) appEntry.streamUid = uid;
      writeJson(EDGE_MANIFEST, edge);
      writeJson(APP_MANIFEST, app);

      console.log(`${label} ✓ migrated`);
      migrated++;
    } catch (err) {
      console.error(`${label} ✗ ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. ${migrated} migrated, ${failed} failed.`);
  if (failed > 0) {
    process.exitCode = 1;
    console.log('Re-run the script — failures are retried automatically (still no streamUid).');
  }
}

async function waitForReady(uid, label) {
  const start = Date.now();
  let lastState = '';
  while (Date.now() - start < POLL_MAX_MS) {
    const res = await fetch(`${STREAM_API}/${uid}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: timeout(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Stream GET ${uid} ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = await res.json();
    const state = body?.result?.status?.state;
    if (state === 'ready') return;
    if (state === 'error') {
      const msg = body?.result?.status?.errorReasonText ?? 'unknown';
      throw new Error(`Stream transcode error: ${msg}`);
    }
    if (state !== lastState) {
      console.log(`${label}    state=${state}`);
      lastState = state;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Stream transcode timed out after ${POLL_MAX_MS / 1000}s`);
}

function filterQueue(entries, args) {
  let q = entries.filter((e) => !e.streamUid && e.slug && e.objectKey);
  if (args.slug) q = q.filter((e) => e.slug === args.slug);
  if (args.limit && q.length > args.limit) q = q.slice(0, args.limit);
  return q;
}

function parseArgs(args) {
  const out = { limit: 0, slug: '', dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = Number(args[++i] ?? 0);
    else if (a === '--slug') out.slug = String(args[++i] ?? '');
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function required(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`missing required env var: ${key}`);
    process.exit(2);
  }
  return v;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
