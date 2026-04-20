# Video Content TODO

## Task 1: Replace 8 Placeholder Learn Hub Videos

**File:** `src/data/videos.ts`

Search for `PLACEHOLDER` — you'll find 8 entries with fake YouTube URLs. For each, replace the `videoUrl` field with a real link.

Current entries have keys like:
- `PLACEHOLDER_RECON` (reconstitution tutorial)
- `PLACEHOLDER_SUBQ` (subcutaneous injection)
- …and 6 more

**What you need to do:**
1. Record/source 8 videos (YouTube or host on Cloudflare R2)
2. Open `src/data/videos.ts`
3. For each entry, replace `videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_*'` with the real URL

## Task 2: Populate `VIDEO_MANIFEST` for Exercise Demo Videos

**File:** `src/services/videoService.ts` (lines 58-64)

The code infrastructure is already ready — you just need to upload exercise videos to Cloudflare R2 and map them.

**Current state:**
```typescript
const VIDEO_MANIFEST: Record<string, string> = {
  // ── Populated after uploading videos to R2 ──
  // Example entries (uncomment and fill in after upload):
  // 'band-pallof-press-0': 'band-pallof-press.mp4',
};
```

**What you need to do:**
1. Get the 308 exercise video files from Jamie
2. Upload to your Cloudflare R2 bucket at `EXPO_PUBLIC_R2_VIDEO_URL` (set in your `.env`)
3. In `src/services/videoService.ts`, populate `VIDEO_MANIFEST` with entries like:
   ```typescript
   const VIDEO_MANIFEST: Record<string, string> = {
     'band-pallof-press-0': 'band-pallof-press.mp4',
     'barbell-back-squat-0': 'barbell-back-squat.mp4',
     // ... 308 entries total
   };
   ```
4. Keys are `{exerciseId}` — they match entries in `src/data/jamieExercises.json`
5. Values are the filename on R2

## Why these are blocking

Without these videos:
- **Learn hub videos tab** — tapping any video opens an invalid YouTube URL (user gets error)
- **Exercise videos** — workout player shows a placeholder instead of form demonstration

## Bulk-upload tip

If Jamie has the videos in a folder named by exercise, you can generate the manifest automatically:

```bash
# From the folder with videos
ls *.mp4 | while read f; do
  id="${f%.mp4}-0"
  echo "  '$id': '$f',"
done
```

Paste the output into `VIDEO_MANIFEST`.
