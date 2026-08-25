# Deep links — the two files that must be hosted on peptalk.bio

The app side is done (`app.json`): Android declares a verified App Link intent
filter for `https://peptalk.bio`, and iOS declares `applinks:peptalk.bio`.

**Both are inert until these two files are served from the apex domain.** That
is the whole mechanism — the OS fetches them to confirm the domain and the app
agree about each other. Until then, links open the browser and Play keeps
reporting "no verified domains".

## Where they go

**`peptalk.bio`** — the apex, **not** `app.peptalk.bio`.

`app.peptalk.bio` is the PWA. Claiming it for the native app would mean a user
tapping a link to the web app gets bounced into the native app instead, which
is the opposite of what a PWA is for.

```
https://peptalk.bio/.well-known/assetlinks.json
https://peptalk.bio/.well-known/apple-app-site-association
```

Requirements the OS enforces, and the usual reasons this fails:

- Served over **HTTPS**, no redirect. A 301 from apex to www, or to
  app.peptalk.bio, breaks verification silently.
- `Content-Type: application/json` for **both**. The Apple file has **no `.json`
  extension** and is still JSON — a server that guesses `text/plain` from the
  missing extension will fail verification.
- No authentication, no robots gate.

## assetlinks.json (Android)

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.peptalkapp.peptalk",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_PLAY_APP_SIGNING_SHA256"
      ]
    }
  }
]
```

**The fingerprint must be the Play *app signing* certificate, not the upload
certificate.** Play re-signs every build with its own key, so the upload key —
which is what the AAB on disk carries — is not what lands on a device. Using it
is the most common reason verification fails while everything looks correct.

Get it from **Play Console → Test and release → App integrity → App signing →
SHA-256 certificate fingerprint**. Copy it with the colons, uppercase.

If Play also lists an **upload** certificate SHA-256, add it as a second entry
in the same array. That covers builds installed directly from an APK during
testing, which are signed with the upload key.

## apple-app-site-association (iOS)

No file extension. Team ID and bundle id are already correct below.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["6624WDHAHG.com.peptalkapp.peptalk"],
        "components": [
          { "/": "/*", "comment": "every path on peptalk.bio opens the app" }
        ]
      }
    ]
  }
}
```

Narrow `components` if only some paths should open the app — as written, every
peptalk.bio URL will. That is a product decision, not a technical one: decide
whether marketing pages should hand off to the app or stay in the browser.

## Verifying it actually worked

Do not trust a green console. Check the outcome:

```
curl -sI https://peptalk.bio/.well-known/assetlinks.json | grep -i "content-type\|HTTP/"
curl -s  https://peptalk.bio/.well-known/assetlinks.json | head -20
curl -sI https://peptalk.bio/.well-known/apple-app-site-association | grep -i "content-type\|HTTP/"
```

Then Google's own validator, which is what the device actually consults:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://peptalk.bio&relation=delegate_permission/common.handle_all_urls
```

Android verification runs at **install time**, so it only takes effect for a
build that ships *after* the file is live — the intent filter added to app.json
lands in the next build, not in vc41.
