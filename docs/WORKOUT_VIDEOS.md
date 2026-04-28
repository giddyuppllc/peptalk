# Workout Video Library — Deploy + Tagging Guide

The PepTalk workout library streams from a Cloudflare R2 bucket
(`peptalktraining`, account `d18e4522521d2b87f6e511c830d5ad03`) via
short-lived signed URLs minted by the `get-workout-video` Supabase
Edge Function.

## Architecture

```
[App, Pro user]
      │
      ├─► resolveVideoUrl(slug) — src/services/r2VideoResolver.ts
      │       ├─► reads object key from src/data/workoutVideos.json
      │       └─► supabase.functions.invoke('get-workout-video', { slug, objectKey })
      │
      ▼
[Supabase Edge Function get-workout-video]
      ├─► verifies user JWT
      ├─► checks profiles.subscription_tier === 'pro'
      │   (or ALLOW_TAGGER_FREE + ADMIN_EMAILS for the tagger UI)
      ├─► AWS SDK presigner → R2 GetObject (TTL 6h)
      └─► returns { url, expiresInSec }
      
[App] caches URL in-memory per slug, plays in expo-av <Video>
```

## One-time deploy

### 1. Set Edge Function secrets

```bash
supabase secrets set \
  R2_ACCESS_KEY_ID=45fdb0208421c82ecd4729e4bb42f890 \
  R2_SECRET_ACCESS_KEY=<paste from Cloudflare dashboard> \
  R2_ENDPOINT=https://d18e4522521d2b87f6e511c830d5ad03.r2.cloudflarestorage.com \
  R2_BUCKET=peptalktraining \
  ALLOW_TAGGER_FREE=true \
  ADMIN_EMAILS=edward@giddyupp.com,jamie@peptalkapp.com
```

(Rotate the access key after this — it was pasted in chat.)

### 2. Deploy the function

```bash
supabase functions deploy get-workout-video
```

### 3. Build + ship the app

The manifest (`src/data/workoutVideos.json`) is bundled at build time —
it ships with all 311 entries, all currently flagged `needsReview: true`.
Library will show "Library coming soon" until tags exist.

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

## Tagging workflow (Jamie)

1. Sign in to PepTalk on TestFlight using an `ADMIN_EMAILS` address.
2. Navigate to `/admin/video-tagger` (no UI link yet — type the URL or
   add a hidden long-press on the workouts hub).
3. For each video the screen presents:
   - Watch the preview (auto-loads).
   - Tap the matching exercise from the search list (289 exercises).
   - Pick a category chip.
   - Edit the title.
   - "Save & Next" — advances to the next untagged video.
4. Edits accumulate in AsyncStorage on Jamie's phone.

## Pulling tags back into the app (Edward)

When Jamie's done a session:

1. She opens the tagger; if everything's tagged she'll see the "All done"
   screen, otherwise the export icon (top right).
2. Tap **"Export updated manifest"** — copies the merged JSON to her
   clipboard.
3. She AirDrops / texts you the JSON.
4. You paste it into `src/data/workoutVideos.json`, commit, push.
5. Next build ships the tags to all users.
6. Have her tap **"Reset local edits"** to clear her local store so the
   next session starts from the canonical manifest.

## Future work

- **Server-side overrides table** — replace AsyncStorage with a
  `workout_video_overrides` table in Supabase so tags go live without an
  app build. Schema: `(slug TEXT PRIMARY KEY, edits JSONB, updated_at,
  edited_by)`. Resolver merges at runtime.
- **Vision-API auto-tag** — first frame → GPT-4o vision → suggested
  exercise + confidence. Pre-fills the tagger so Jamie just confirms.
- **Bucket sync script** — `scripts/sync-r2-bucket.mjs` re-runs the
  listing (using credentials from `.env`) and adds new entries to the
  manifest. Existing tags persist.

## Files

- `supabase/functions/get-workout-video/index.ts` — server-side signing
- `src/services/r2VideoResolver.ts` — client-side URL resolver + cache
- `src/data/workoutVideos.json` — manifest (311 entries, seeded)
- `src/data/workoutVideos.ts` — types + lookups
- `src/store/useVideoTaggerStore.ts` — local edits store
- `app/admin/video-tagger.tsx` — tagger UI
- `app/workouts/library.tsx` — public library
- `app/workouts/library/[slug].tsx` — player
