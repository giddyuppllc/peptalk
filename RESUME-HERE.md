# Resume here — PWA deploy, paused mid-build 2026-08-31

Everything is committed and pushed (`fd4996c`). **Nothing was deployed** — not the
PWA, not Play, not TestFlight. `dist/` holds a sandbox build that
`verify:build` correctly refuses, so it cannot be shipped by accident.

## Where I stopped

Recovering the production web-build values, which exist nowhere in the repo or
on Vercel. I pulled them out of the **live bundle** at app.peptalk.bio, which is
the only place they survive:

```
EXPO_PUBLIC_SQUARE_ENV=production
EXPO_PUBLIC_SQUARE_APPLICATION_ID=sq0idp-8mx-oTHeZ3PJjtbZRV9iRw
EXPO_PUBLIC_SQUARE_LOCATION_ID=LD9YGE0PA47SE
EXPO_PUBLIC_SENTRY_DSN=https://d79f1f41c008afe4c2cddbbfc73bfb09@o4510308028710912.ingest.us.sentry.io/4511539348307968
```

All four are PUBLIC by design — they already ship in the client bundle. They are
now in `.env` (gitignored). The previous `.env` is backed up alongside it.

**The open problem:** after setting them, the rebuild STILL emitted the sandbox
Application ID (`sandbox-sq0idb-VpIJkyUJzr1uA6YQ_SHQGQ`), so `.env` is not
reaching the export. `.env` has no trailing newline on its last line, and the
Metro cache was not cleared — try both:

```bash
printf '\n' >> .env
npx expo export --platform web --clear && node scripts/inject-pwa.mjs
grep -rho "sq0idp-[A-Za-z0-9_-]*" dist/_expo/static/js/web/*.js | sort -u   # must show sq0idp-
npm run verify:build                                                        # must exit 0
```

Do not use `ALLOW_SANDBOX_PAYMENTS=1`. It would ship a PWA that cannot take a
real payment.

Then deploy with the token already in hand:
`node scripts/deploy-web.mjs` (Vercel project `peptalk-app`, scope `giddyupp`).

## A real bug found while doing this — not yet fixed

`src/config/square.ts:20` defaults the location to `LBHKG5HYE2VAY`, but
production is `LD9YGE0PA47SE`. A build that sets the env and app id but misses
the location var would send payments to the **wrong location**, silently. The
default should be absent or fail loudly rather than be a plausible wrong value.

## Blocking the other two pushes

- **App Store Connect subscription levels are still inverted** (Plus outranks
  Pro). A Plus→Pro upgrade is recorded as a downgrade: the customer pays and
  waits. Two minutes in the ASC UI — `docs/ASC_SUBSCRIPTION_LEVELS.md`.
- **HealthKit 5.1.1(iv) and a real IAP purchase have never been verified.** The
  Simulator has no HealthKit data layer; the emulator has no Play Billing. Those
  are the two guidelines that got the app rejected. TestFlight without them is
  defensible; **Google production without a real purchase test is not**, given a
  customer already paid and received nothing (see `reconcile-purchases`).
- `keys/` is absent — the ASC `.p8` and the Play service-account JSON are not on
  this machine, so neither submission can run from here regardless.

## The pattern worth remembering

The live PWA's build stamp is `5a993f4a…`, a commit that **exists in no branch of
this repo**. That is the third production artifact with no corresponding source:
the phantom `1.10.0` binary Apple reviewed, five edge functions deployed with no
source, and now the PWA. The build-stamp mechanism is what caught it.
