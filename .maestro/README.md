# PepTalk — Maestro smoke tests

Catch "can't get past login" / "unresponsive button" **before** Apple does.
These are the exact paths that got v1.9.8 build 47 rejected.

## Cost
Maestro CLI is **free + open-source**. Running locally against the iOS
Simulator (or a real device) costs nothing. Maestro's hosted device cloud is
optional/paid — not needed here.

## One-time setup
```bash
# Install Maestro (macOS)
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

## Run
You need a build installed on a simulator or device first:
```bash
eas build -p ios --profile preview        # or a local dev client
# install the resulting .app / .ipa on the simulator/device, then:

maestro test .maestro/ \
  -e EMAIL=reviewer@peptalk.bio \
  -e PASSWORD=<reviewer-password>
```
Run a single flow: `maestro test .maestro/login.yaml -e EMAIL=… -e PASSWORD=…`

Refine any selector interactively: `maestro studio`

## Flows
| Flow | Guards against | Guideline |
|------|----------------|-----------|
| `login.yaml` | "cannot continue after login" (the build-47 reject) | 2.1a |
| `healthkit-visible.yaml` | "HealthKit not identified in UI" | 2.5.1 |
| `subscribe.yaml` | "unresponsive Subscribe button" | 2.1a |

## Before every App Store submission
1. Build, install on simulator/device.
2. `maestro test .maestro/` — **all green or do not submit.**
3. `login.yaml` is a hard release-blocker (tag: `release-blocker`).

## Reviewer account
`reviewer@peptalk.bio` — confirmed, **Free tier** (so the Subscribe button is
live). Keep it on Free; do not pre-grant Plus/Pro.
