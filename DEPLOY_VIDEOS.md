# Video delivery — what to verify before videos actually play

The code side is now complete: 311 of 311 video files are addressable by the
client (264 mapped to 128 exercises with multi-take support, 47 in an
untagged pool). The remaining work is **infrastructure verification** —
none of it requires code changes, all of it can be done from Cloudflare
+ Supabase dashboards.

## Two delivery backends — Stream (new) and R2 (legacy)

The `get-workout-video` edge function branches per video:

- **Cloudflare Stream** when the manifest entry has `streamUid` — preferred. Returns an HLS playback URL signed with our RS256 key, plus the live `meta.name` from Stream (Jamie can rename in the Cloudflare dashboard and the app picks it up on next play) and a Stream-generated poster thumbnail (also signed because we set `requireSignedURLs: true` on every Stream video).
- **Cloudflare R2** when `streamUid` is absent — legacy fallback. Returns an S3-style presigned MP4 URL. Videos that haven't been migrated yet still work this way.

**Automatic Stream → R2 failover.** If Stream signing throws — bad key PEM, Cloudflare API hiccup, expired token cache — the edge function logs the failure and falls through to the R2 path for that request. A misconfigured Stream secret can't take down videos that still have R2 backups. The R2 copy is intentionally never deleted by the migration script.

Migration from R2 → Stream is per-video and incremental — see [Migration to Stream](#migration-to-stream) below.

## The flow at runtime

```
ExerciseVideo.tsx
  └─ getExerciseVideoSlug(exerciseId)   →  "img-3681"  (client lookup)
      └─ POST /functions/v1/get-workout-video  body { slug: "img-3681" }
          ├─ Supabase edge fn checks Pro tier
          ├─ Looks up slug in manifest.json
          ├─ If entry.streamUid → sign Stream JWT, fetch Stream meta.name
          │    Return { url: <HLS .m3u8>, title, posterUrl, expiresInSec }
          └─ Else → sign R2 GET URL (legacy)
               Return { url: <signed MP4>, captionUrl?, expiresInSec }
                  └─ <Video source={{ uri: url }} /> plays either format
```

Three pieces of infra must be in place for any of this to work:

---

## ✅ Check 1 — Edge function is deployed

In your repo, run:

```bash
supabase functions list
```

You should see `get-workout-video` listed with a recent deploy timestamp.

If **not deployed**, run:

```bash
supabase functions deploy get-workout-video
```

(Requires the Supabase CLI logged in to your project. The function source
lives at `supabase/functions/get-workout-video/index.ts` — already on this
branch.)

---

## ✅ Check 2 — Secrets are set on Supabase

The function needs 4 secrets (5 if you want admin preview):

| Secret | What it is | Where it comes from |
|---|---|---|
| `R2_ACCESS_KEY_ID` | R2 access key ID | Cloudflare → R2 → Manage R2 API Tokens → Create token (read-only on `peptalktraining` bucket) |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key | Same flow — shown once when token created |
| `R2_ENDPOINT` | R2 endpoint URL | `https://<YOUR_CF_ACCOUNT_ID>.r2.cloudflarestorage.com` (Cloudflare → R2 → bucket → "S3 API" tab) |
| `R2_BUCKET` | Bucket name | `peptalktraining` |
| `ALLOW_TAGGER_FREE` (optional but **likely the actual fix**) | `"true"` to let admin emails preview videos without Pro tier | **set to `true` AND add Jamie's email to `ADMIN_EMAILS`** — audit identified this as the most likely reason no videos play for the tester |
| `ADMIN_EMAILS` (optional, comma-separated) | `jamiespositoFit@gmail.com,edward@giddyupp.com` | required when `ALLOW_TAGGER_FREE=true` |

Set them with:

```bash
supabase secrets set R2_ACCESS_KEY_ID=xxx R2_SECRET_ACCESS_KEY=yyy \
  R2_ENDPOINT=https://abc123.r2.cloudflarestorage.com R2_BUCKET=peptalktraining
```

Verify with:

```bash
supabase secrets list
```

---

## ✅ Check 3 — Video files actually exist in R2

In **Cloudflare dashboard → R2 → `peptalktraining` bucket**, confirm:

- Bucket exists and is **NOT public** (it should be private — signed URLs handle access)
- There are folders/objects matching the paths in
  `supabase/functions/get-workout-video/manifest.json` (e.g.
  `jamie-esposito-icloud-photos/IMG_3681.MP4`)

If files are missing, that's the upload step Jamie or you need to do —
the manifest references object keys that should match exactly.

---

## 🧪 End-to-end smoke test

Once 1, 2, 3 are green, hit the function directly from your laptop:

```bash
curl -X POST "https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/functions/v1/get-workout-video" \
  -H "Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"img-3681"}'
```

**Expected response (success):**

```json
{
  "url": "https://abc123.r2.cloudflarestorage.com/peptalktraining/jamie-esposito-icloud-photos/IMG_3681.MP4?X-Amz-Algorithm=...",
  "expiresInSec": 21600
}
```

**Then test the URL itself** — paste it into a browser. If a video plays,
the full chain works and TestFlight will play videos too. If the URL
returns 403/AccessDenied, the R2 token doesn't have read permission on
the object. If it returns NoSuchKey, the file isn't uploaded.

**Error responses to expect during debugging:**

| Status | Body | What's wrong |
|---|---|---|
| 404 (`function not found`) | — | edge function not deployed → Check 1 |
| 401 | `{ "error": "unauthorized" }` | bearer token missing or invalid |
| 403 | `{ "error": "Pro required" }` | function works but user isn't Pro |
| 404 | `{ "error": "unknown slug" }` | slug not in manifest.json (typo or missing entry) |
| 500 | `{ "error": "..." }` | R2 secrets missing or wrong → Check 2 |

---

## Coverage today

- **128 exercises** have at least one video (the canonical take)
- **136 alternate takes** are also wired in (swipeable carousel — UI work pending)
- **47 untagged videos** queued for the admin tagger
- **Every video file (311/311)** is addressable from the client

The 47 untagged videos will need a quick admin pass to assign them to
exercises. The tagger UI is referenced in `app/admin/video-tagger.tsx`
per the existing service comments — that's the next code stop after
infra is verified.

---

## Migration to Stream

Goal: move video playback from R2 (raw MP4, no dashboard) to Stream
(managed CMS with naming, thumbnails, HLS). After migration Jamie
**bookmarks** `https://dash.cloudflare.com/<ACCOUNT_ID>/stream` —
that's the entire video-tagging workflow.

R2 stays put as a cold backup. Only `streamUid` is added to the
manifest; nothing is deleted from R2.

### Step 1 — Enable Stream in Cloudflare

In the Cloudflare dashboard → **Stream** in the left nav. Stream is a
metered paid service (~$5 / 1k minutes stored, ~$1 / 1k minutes
delivered). 293 videos × ~30s = ~150 minutes — under $1/mo storage.

Activate it and note your **account ID** (top-right of the page, also
in the URL: `dash.cloudflare.com/<ACCOUNT_ID>/stream`).

### Step 2 — Create an API token (scope = `Stream:Edit`)

Cloudflare dashboard → **My Profile → API Tokens → Create Token →
Custom token**:

- **Permissions:** `Account` → `Stream` → `Edit`
- **Account Resources:** the specific account (not "All accounts")
- **TTL:** none (we'll use it on Supabase secrets)

Copy the token value (`CLOUDFLARE_API_TOKEN`). Stash it in 1Password
**now** — Cloudflare doesn't show it again.

### Step 3 — Create a Stream signing key (one-time)

Stream uses RS256-signed JWTs in the `?token=` query param to gate
playback. We need to generate a keypair Stream knows about. Once,
from your laptop:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/keys" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

The response looks like:

```json
{
  "result": {
    "id":  "<KEY_ID>",
    "pem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "jwk": "{...}"
  }
}
```

Keep `id` + `pem` — those go into Supabase secrets next.

### Step 4 — Set Supabase secrets

```bash
supabase secrets set \
  CLOUDFLARE_ACCOUNT_ID="<your-account-id>" \
  CLOUDFLARE_API_TOKEN="<token-from-step-2>" \
  CLOUDFLARE_STREAM_SIGNING_KEY_ID="<id-from-step-3>" \
  CLOUDFLARE_STREAM_SIGNING_KEY_PEM="$(cat /path/to/key.pem)"
```

(Quoting matters — the PEM contains newlines. Reading from a file with
`$(cat …)` preserves them. If you paste the literal string, replace
real newlines with `\n` escapes and the edge function will normalize.)

Verify:

```bash
supabase secrets list | grep -i CLOUDFLARE
```

### Step 5 — Deploy the updated edge function

```bash
supabase functions deploy get-workout-video
```

Until you run the migration script, every entry still has
`streamUid: undefined`, so the function keeps using the R2 path. Safe
to deploy now.

### Step 6 — Run the migration script

```bash
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
export CLOUDFLARE_API_TOKEN="<token>"
export R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
export R2_ACCESS_KEY_ID="<r2 key>"
export R2_SECRET_ACCESS_KEY="<r2 secret>"

# Test on one video first
node scripts/migrate-r2-to-stream.mjs --slug img-3681

# When that succeeds, do the rest
node scripts/migrate-r2-to-stream.mjs
```

What it does per video:

1. Signs a 1-hour R2 GET URL.
2. POSTs `/stream/copy` so Cloudflare pulls the bytes server-to-server
   (no laptop bandwidth involved).
3. Polls until `status.state === 'ready'` (usually 30s for a 30s clip).
4. Writes `streamUid` into **both** manifest files (`src/data/workoutVideos.json` and `supabase/functions/get-workout-video/manifest.json`) immediately, so a crash mid-batch never loses progress.

Re-running skips entries that already have `streamUid` — fully
resumable. Use `--limit 5` to try a handful first.

Estimated runtime: 293 videos × ~30 seconds = ~2½ hours. Most of that
is Stream's transcoding queue — you can leave it running. Re-deploy
the edge function once the manifest is fully migrated so the new
`streamUid` values land in production.

### Step 7 — Commit the manifests + re-deploy

```bash
git add src/data/workoutVideos.json supabase/functions/get-workout-video/manifest.json
git commit -m "feat(videos): migrate {N} videos to Cloudflare Stream"
supabase functions deploy get-workout-video
```

### Step 8 — Jamie's bookmark

Send her: **`https://dash.cloudflare.com/<ACCOUNT_ID>/stream`**

She'll see every migrated video as a card with auto-generated
thumbnails. To rename: click → **"Edit name"** → save. The next time
that video plays in the app it shows her new name (the edge function
fetches `meta.name` from Stream on each playback request).

Permissions: invite Jamie's Cloudflare account to your team
(**Cloudflare dashboard → Manage Account → Members → Invite**) and
pick the narrowest role that includes Stream read/write. Cloudflare's
role naming changes over time — at the time of writing the relevant
option is the "Stream"-prefixed one with edit permissions; if that's
gone, scope by picking only `Stream` under the role's permission tree.
Avoid giving her `Administrator` — that opens the entire account.

### Smoke test the Stream path

```bash
curl -X POST "https://<PROJECT>.supabase.co/functions/v1/get-workout-video" \
  -H "Authorization: Bearer <SESSION_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"img-3681"}'
```

Expected (after migration):

```json
{
  "url": "https://customer-<id>.cloudflarestream.com/<uid>/manifest/video.m3u8?token=eyJ...",
  "title": "Bodyweight Plank Hold",
  "posterUrl": "https://customer-<id>.cloudflarestream.com/<uid>/thumbnails/thumbnail.jpg?time=2s",
  "expiresInSec": 21600
}
```

Paste the `url` into VLC or Safari — HLS plays back. If you see
`token expired` Stream's clock is ahead of ours (rare); the JWT's
`nbf` claim is set 60s in the past to soak skew, but if it persists
re-check `CLOUDFLARE_STREAM_SIGNING_KEY_PEM`.
