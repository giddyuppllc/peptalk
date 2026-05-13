# Workout Video Library — Deploy + Tagging Guide

## Status as of v1.9.8 (May 2026)

- **Videos in R2:** 311 uploaded
- **Tagged with `exerciseId`:** **0 / 311**
- **Programs that depend on tagged videos:** Pro-tier coaching programs
  (CORE_CHALLENGE, BOOTY_CHALLENGE, LEAN_AND_MEAN, etc.) currently render
  exercises with **"Video coming soon" placeholders** because no
  exercise has a linked video yet.
- **Net impact:** Pro paywall used to claim "Jamie's 15 workout programs
  + videos." Until tagging is done, the Pro tier shows program schedules
  (sets, reps, rest) but no form-demo videos. The paywall copy was
  softened in v1.9.8 to drop the explicit "videos" claim until tagging
  catches up.

**To unblock the Pro tier video promise — fastest path:**

1. **Edward runs the AI auto-tagger** (`scripts/ai-tag-videos.mjs`) once
   from his laptop. ~30 minutes, ~$3 in API calls. Writes an
   `aiSuggested` block into every untagged video record. **Non-destructive**
   — `exerciseId` stays null; the suggestion is just a default for Jamie.
2. **Edward commits + ships a new build** so Jamie sees the AI suggestions
   in TestFlight (the manifest is shipped, not server-side).
3. **Jamie opens Profile → Admin → Video Tagger** in TestFlight.
   Each video now shows the AI's guess with a colored confidence pill
   (green ≥ 80%, amber 50–80%, red < 50%). The form is pre-filled.
   - Confident, correct → tap **Save & Next**. One tap per video.
   - Wrong → fix the exercise / category / title, then Save & Next.
   - Low confidence — likely a transition frame or unusual angle —
     just enter it manually.
4. **Jamie exports** (top-right icon → "Export updated manifest")
   when done. JSON goes to clipboard, she sends it to Edward.
5. **Edward overwrites `src/data/workoutVideos.json`**, commits, builds
   one more time. Now `exerciseId` is set on every video, `needsReview`
   is false, the library renders real form videos in Pro programs.

Estimated time: ~30 min script + 3-4 hours of Jamie tapping through 311
videos (vs ~20 hours from scratch).

## Running the AI auto-tagger

```bash
# One-time: install ffmpeg if you don't have it
brew install ffmpeg            # macOS
winget install --id Gyan.FFmpeg # Windows

# Make sure supabase/.env.production has these set:
#   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#   OPENAI_API_KEY (works for xAI/Grok or OpenAI)
#   OPENAI_BASE_URL (defaults to https://api.x.ai/v1)

# Try 5 first to confirm the pipeline works
node scripts/ai-tag-videos.mjs --limit 5

# Then run for real
node scripts/ai-tag-videos.mjs

# If you tweak the prompt and want to redo everything:
node scripts/ai-tag-videos.mjs --redo

# Test a single video by slug
node scripts/ai-tag-videos.mjs --slug img-3681
```

The script is resumable — re-running skips any video that already has an
`aiSuggested` field, so it's safe to Ctrl+C and restart.

---

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
