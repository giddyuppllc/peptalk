# Video delivery — what to verify before videos actually play

The code side is now complete: 311 of 311 video files are addressable by the
client (264 mapped to 128 exercises with multi-take support, 47 in an
untagged pool). The remaining work is **infrastructure verification** —
none of it requires code changes, all of it can be done from Cloudflare
+ Supabase dashboards.

## The flow at runtime

```
ExerciseVideo.tsx
  └─ getExerciseVideoSlug(exerciseId)   →  "img-3681"  (client lookup)
      └─ POST /functions/v1/get-workout-video  body { slug: "img-3681" }
          ├─ Supabase edge fn checks Pro tier
          ├─ Looks up slug in manifest.json → objectKey  "jamie-esposito-icloud-photos/IMG_3681.MP4"
          ├─ Signs an R2 GET URL with R2 access key (6h TTL)
          └─ Returns { url, captionUrl? }
              └─ <Video source={{ uri: url }} /> plays
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
| `ALLOW_TAGGER_FREE` (optional) | `"true"` to let admin emails preview videos without Pro tier | leave unset for now |

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
