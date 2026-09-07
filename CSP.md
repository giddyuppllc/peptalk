# Content-Security-Policy — how it was derived, and how to enforce it

Added 2026-08-06. **Currently `Content-Security-Policy-Report-Only`, deliberately.**
Read this before flipping it to enforcing.

## Where this lives

`public/vercel.json` — tracked in git. Expo copies everything in `public/` into
`dist/` on export, and `npm run deploy:web` does `cd dist && vercel deploy`, so
**`dist/` is the Vercel project root** and `dist/vercel.json` is the file Vercel
actually reads. Editing a `vercel.json` at the repo root would do nothing.

⚠️ **Correction to an earlier assumption of mine:** I initially concluded the
config was untracked and hand-placed, because `dist/` is gitignored and no
script copies `vercel.json` into it. That was wrong — `public/vercel.json` is
tracked, and Expo's `public/` handling is what copies it. A clean clone plus
`expo export` *does* produce the headers.

The real reason `app.peptalk.bio` serves none of them: the security headers were
added on **2026-08-03 in `de6b935`**, which exists only on
`origin/feat/pwa-web-support` — **a branch that has never been deployed.** That
is the same single reason Square is absent from the live bundle. One cause, not
two.

## How the origin list was derived — observed, not guessed

Static grepping was **not** sufficient and would have produced a broken policy:

- `videodelivery.net` appears **882 times in source but 0 times in the client
  bundle** — video URLs are minted by the `get-workout-video` edge function and
  **signed** (`supabase/functions/_shared/streamSign.ts`), so they only exist at
  runtime. A grep-derived CSP would have blocked every video.
- Several apparent hits were **FontAwesome icon names**, not integrations:
  `cc-stripe`, `stripe-s`, `square-js`, `customer-service`. There is **no Stripe
  in this app.** Check context before treating any of those as real.

What each directive is actually for:

| Origin | Why |
|---|---|
| `zniucpbeepxysvkshpir.supabase.co` (+ `wss:`) | auth, edge functions, realtime |
| `videodelivery.net` | Cloudflare Stream HLS. Needs **connect-src too** — an HLS player fetches the `.m3u8` and segments over XHR, not just `<video>` |
| `sandbox.web.squarecdn.com` / `web.squarecdn.com` | Web Payments SDK + its card iframes. **Both** listed so the sandbox→production flip does not need a CSP edit |
| `pci-connect.square*` | where the SDK posts the card tokenization |
| `exp.host` | Expo push registration |
| `world.openfoodfacts.net` | food lookup |
| `images.unsplash.com`, `images.pexels.com` | content imagery |

`'unsafe-inline'` in `style-src` is unavoidable: React Native Web injects inline
styles at runtime. `'unsafe-inline'` in `script-src` is there because
`index.html` carries two inline scripts (service-worker registration); replacing
it with hashes is the obvious hardening step once the policy is otherwise clean.

## What was actually verified, and what was NOT

Tested by serving the real `dist/` with this exact policy **enforcing** and
driving Chrome against it:

- ✅ Square SDK loaded from `sandbox.web.squarecdn.com`
- ✅ `supabase.co` and `videodelivery.net` allowed
- ✅ `https://example.com` **blocked** with a `connect-src` violation — proof the
  policy is enforcing and restrictive, not merely present
- ✅ App shell rendered; no violations from CSS, fonts or the JS bundle

**NOT verified — this is why it ships report-only:**

The app has a **desktop gate** (`src/components/DesktopGate.tsx`, mounted at
`app/_layout.tsx:1126`). When
`(min-width: 1024px) and (hover: hover) and (pointer: fine)` matches it renders
"PepTalk is a mobile app" instead of the app. So on a desktop browser **only the
gate page was exercised** — not the signed-in app. That leaves untested:

- the Square **card iframe** actually mounting and tokenizing
- **video playback** through the signed Stream URL
- **Aimee** streaming from the edge function
- push registration against `exp.host`

Those run only on a phone (or an installed PWA, which the gate lets through via
`display-mode: standalone`).

## Flipping to enforcing

1. Deploy with `Content-Security-Policy-Report-Only` as-is.
2. Exercise the app **on a real phone**: sign in, play a video, talk to Aimee,
   and open the subscription/card screen.
3. Collect violations — DevTools console on the device, or add a `report-uri`.
4. Add any genuinely required origin.
5. Only then rename the header to `Content-Security-Policy`.

Report-only cannot break anything, which is the entire point of shipping it this
way first.

---

## 2026-08-31 — folding in what the reports actually said

Step 3 of the plan above ("collect violations") happened: a `report-uri` to
Sentry was added, and real phones reported. Origins added to the report-only
policy as a result:

| Directive | Origin | Why |
|---|---|---|
| `style-src`, `img-src` | `web.squarecdn.com` | the Web Payments SDK's own CSS and images — the untested card-iframe path this doc predicted |
| `font-src` | `cash-f.squarecdn.com`, `square-fonts-production-f.squarecdn.com` | Square ships its fonts from separate hosts to the SDK |
| `font-src` | `d1g145x70srn7h.cloudfront.net` | Square's font CDN |
| `frame-src` | `api.squareup.com` | the SDK's payment frame |
| `frame-src`, `form-action` | `methodurl.vcas.visa.com` | **3-D Secure step-up.** Visa posts the challenge into a frame; without `form-action` the card authentication itself fails, not just a cosmetic asset |
| `img-src` | `images.openfoodfacts.net` | food photos. `connect-src` already allowed `world.openfoodfacts.net`; the images come from a different host, which a grep of the source would never have revealed |

### `connect.facebook.net` was reported and is deliberately NOT allowed

88 violations across 43 users, and it is the one origin here that must stay
blocked. **PepTalk has no Meta pixel.** Grepping both this repo and
`Peptalk.biowebcontainer` finds no `fbq`, no `fbevents`, no
`connect.facebook.net`, and the live marketing HTML does not load it.

That pattern — many users, one script, no source — is an in-app browser
injecting it. Anyone arriving from a Facebook or Instagram link browses in
Meta's webview, which inserts Meta's own script into the page.

Allowlisting it would mean permitting a third-party tracker we do not control on
a surface that handles HealthKit data, dose logs and lab scans. Meta's own
Business Tools terms prohibit receiving health information, and health providers
have been litigated over precisely this. The report is the policy working.

### Still to do before enforcing

- Drop `sandbox.web.squarecdn.com` and `pci-connect.squareupsandbox.com` once
  the production Square flip is confirmed. Sandbox hosts in a production policy
  are a standing invitation to test against the wrong environment.
- The phone pass in the section above, then rename the header.

