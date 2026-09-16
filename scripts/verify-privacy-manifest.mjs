#!/usr/bin/env node
/**
 * verify:privacymanifest — the iOS privacy manifest must name every data type
 * the code actually collects, with the right linkage, and nothing else.
 *
 * WHY THIS EXISTS
 * `app.json` → expo.ios.privacyManifests is hand-written and drifts silently.
 * It listed Email / Name / UserID / Health / Fitness / OtherUserContent /
 * PhotosOrVideos / PurchaseHistory / ProductInteraction / CrashData while the
 * app had, for months, also been collecting:
 *   - a phone number and a full postal address (app/profile/personal.tsx →
 *     profiles, added when personal details went server-backed),
 *   - voice recordings (aimee-voice uploads the blob to OpenAI Whisper),
 *   - performance traces (Sentry, tracesSampleRate 0.1).
 * Nothing failed. A wrong manifest is not a build error — it is an App Review
 * finding and a privacy misstatement, and both cost a submission.
 *
 * HOW IT CHECKS
 * Not by scanning for "anything that looks like collection" — that produces a
 * scanner that passes without reading anything. It is driven from COLLECTED
 * below: one explicit entry per data type, each carrying
 *   - the declaration the manifest must contain (linked / tracking / purposes),
 *   - a `why` comment, and
 *   - `evidence`: the exact line of real code that makes the claim true.
 *
 * That gives a check with two failure directions, which is the point:
 *   UNDER-DECLARED  a mapped data type is missing from app.json, or its
 *                   linkage / tracking / purposes disagree.
 *   OVER-DECLARED   app.json declares a data type COLLECTED does not, so
 *                   nothing in this file vouches for it.
 *   STALE           a mapped type's evidence is gone from the source — the
 *                   code stopped collecting it, and the declaration (and this
 *                   entry) should go too. Reported, never auto-accepted.
 *
 * `--self-test` mutates an in-memory copy of the manifest and of the sources
 * and asserts the evaluator FAILS each way. A checker that cannot fail is
 * worse than no checker; run the self-test with it (verify:all does).
 *
 * NOT COVERED HERE: the App Store Connect "App Privacy" answers and the Play
 * Data safety form. Those live in a console, not in the repo — the required
 * answers are written up in docs/app-store-review-notes-additions-2026-09-16.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const APP_FUNCTIONALITY = 'NSPrivacyCollectedDataTypePurposeAppFunctionality';
const ANALYTICS = 'NSPrivacyCollectedDataTypePurposeAnalytics';
const CUSTOMER_SUPPORT = 'NSPrivacyCollectedDataTypePurposeCustomerSupport';

/**
 * Every data type this app collects, and the line of code that proves it.
 *
 * `linked` is Apple's "linked to the user's identity". The test is not whether
 * we *want* it linked — it is whether the row we write, or the request we make,
 * carries the account. A `profiles` row is keyed by the user id; an edge
 * function call carries the user's JWT; Sentry is given the user id explicitly
 * by useAuthStore. All of those are linked.
 */
const COLLECTED = [
  {
    type: 'NSPrivacyCollectedDataTypeEmailAddress',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY, CUSTOMER_SUPPORT],
    // The login identity. Held in auth.users and mirrored onto profiles.email,
    // which the personal-details screen reads back.
    why: 'sign-in identity; shown on Profile → Personal details',
    evidence: [{ file: 'src/services/profileService.ts', needle: "email: r.email ?? ''" }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeName',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // First/last name are the only non-optional fields on the personal screen.
    why: 'profiles.first_name / last_name, written by Profile → Personal details',
    evidence: [{ file: 'src/services/profileService.ts', needle: 'first_name: orNull(d.firstName)' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypePhoneNumber',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // Optional, but stored on the account when given. app/profile/personal.tsx
    // offers the field; profileService writes it to profiles.phone.
    why: 'profiles.phone, written by Profile → Personal details',
    evidence: [{ file: 'src/services/profileService.ts', needle: 'phone: orNull(d.phone)' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypePhysicalAddress',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // Street, city, region, postal code and country — a full postal address.
    why: 'profiles.address_line1..country, written by Profile → Personal details',
    evidence: [{ file: 'src/services/profileService.ts', needle: 'address_line1: orNull(d.addressLine1)' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeOtherDataTypes',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // Date of birth. Apple has no dedicated key for it; "Other data types" is
    // the catch-all, and it must be declared because it is stored on the
    // account. Flagged for Edward — if he would rather answer it as Sensitive
    // Info in App Store Connect, this entry changes with it.
    why: 'profiles.date_of_birth, written by Profile → Personal details',
    evidence: [{ file: 'src/services/profileService.ts', needle: 'date_of_birth: orNull(d.dateOfBirth)' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeUserID',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY, ANALYTICS],
    // The Supabase auth uid keys every server row and is handed to Sentry.
    why: 'auth.users id; also set as the Sentry user id',
    evidence: [{ file: 'src/store/useAuthStore.ts', needle: 'telemetrySetUser({ id: appUser.id })' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeHealth',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // HealthKit reads: body metrics, heart data, sleep. Declared in Info.plist
    // as NSHealthShareUsageDescription, which is the thing that cannot be
    // present without a matching collected-data-type entry.
    why: 'Apple Health read/write + in-app check-ins',
    evidence: [{ file: 'app.json', needle: 'NSHealthShareUsageDescription' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeFitness',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    why: 'Apple Health workouts / activity, and logged workouts',
    evidence: [{ file: 'app.json', needle: 'NSHealthUpdateUsageDescription' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeAudioData',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // aimee-voice takes the recording off the device and posts it to OpenAI
    // Whisper under the caller's JWT. We keep no copy — the function returns a
    // transcript and stores nothing — but it still leaves the device tied to
    // the account, which is what "collect" means here.
    why: 'voice messages to Aimee are uploaded to Whisper for transcription',
    evidence: [
      { file: 'supabase/functions/aimee-voice/index.ts', needle: 'https://api.openai.com/v1/audio/transcriptions' },
      { file: 'app.json', needle: 'NSMicrophoneUsageDescription' },
    ],
  },
  {
    type: 'NSPrivacyCollectedDataTypePhotosorVideos',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    why: 'avatar, progress photos, meal / label / lab scans',
    evidence: [{ file: 'app.json', needle: 'NSPhotoLibraryUsageDescription' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeOtherUserContent',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    why: 'community posts / comments / live messages, journal entries, chat',
    evidence: [{ file: 'supabase/functions/community-create-post/index.ts', needle: 'community_posts' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypePurchaseHistory',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    why: 'StoreKit / Play / Square subscription state, validated server-side',
    evidence: [{ file: 'supabase/functions/validate-purchase/index.ts', needle: 'Deno.serve' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeProductInteraction',
    linked: true,
    tracking: false,
    purposes: [ANALYTICS, APP_FUNCTIONALITY],
    why: 'in-app analytics events',
    evidence: [{ file: 'src/services/telemetry.ts', needle: 'export function captureMessage' }],
  },
  {
    type: 'NSPrivacyCollectedDataTypeCrashData',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // LINKED, not unlinked: useAuthStore hands Sentry the account id on every
    // login, and beforeSend keeps `user.id` (it only strips email/username).
    // This was declared unlinked until 2026-09-16.
    why: 'Sentry captureException, with the account id attached',
    evidence: [
      { file: 'src/services/telemetry.ts', needle: 'event.user = { id: event.user.id };' },
      { file: 'src/store/useAuthStore.ts', needle: 'telemetrySetUser({ id: appUser.id })' },
    ],
  },
  {
    type: 'NSPrivacyCollectedDataTypePerformanceData',
    linked: true,
    tracking: false,
    purposes: [APP_FUNCTIONALITY],
    // Sentry performance tracing is on at a 10% sample rate; it auto-instruments
    // fetch, navigation and AppState. Same linkage as CrashData, same user id.
    why: 'Sentry tracing (tracesSampleRate), with the account id attached',
    evidence: [{ file: 'src/services/telemetry.ts', needle: 'tracesSampleRate: 0.1' }],
  },
];

// ─── the evaluator (pure; the self-test drives this, not the filesystem) ─────

function sameSet(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
}

/**
 * @param manifest  the NSPrivacyCollectedDataTypes array from app.json
 * @param sources   { [file]: contents }
 * @param collected the COLLECTED map (injectable so the self-test can mutate it)
 * @returns problems[] — empty means pass
 */
export function evaluate(manifest, sources, collected = COLLECTED) {
  const problems = [];
  if (!Array.isArray(manifest)) {
    return ['app.json: expo.ios.privacyManifests.NSPrivacyCollectedDataTypes is missing or not an array'];
  }

  const byType = new Map();
  for (const entry of manifest) {
    const t = entry?.NSPrivacyCollectedDataType;
    if (!t) {
      problems.push('app.json: a NSPrivacyCollectedDataTypes entry has no NSPrivacyCollectedDataType');
      continue;
    }
    if (byType.has(t)) problems.push(`app.json: ${t} is declared twice`);
    byType.set(t, entry);
  }

  for (const want of collected) {
    // STALE: the evidence must still be in the source.
    for (const ev of want.evidence) {
      const src = sources[ev.file];
      if (src == null) {
        problems.push(`${want.type}: evidence file ${ev.file} could not be read`);
      } else if (!src.includes(ev.needle)) {
        problems.push(
          `${want.type}: evidence gone — ${ev.file} no longer contains ${JSON.stringify(ev.needle)}. ` +
            'Either the collection moved (fix the evidence) or it stopped (drop the declaration).',
        );
      }
    }

    const got = byType.get(want.type);
    if (!got) {
      problems.push(`${want.type}: collected (${want.why}) but NOT declared in app.json`);
      continue;
    }
    if (got.NSPrivacyCollectedDataTypeLinked !== want.linked) {
      problems.push(
        `${want.type}: declared Linked=${got.NSPrivacyCollectedDataTypeLinked}, should be ${want.linked} (${want.why})`,
      );
    }
    if (got.NSPrivacyCollectedDataTypeTracking !== want.tracking) {
      problems.push(
        `${want.type}: declared Tracking=${got.NSPrivacyCollectedDataTypeTracking}, should be ${want.tracking}`,
      );
    }
    if (!sameSet(got.NSPrivacyCollectedDataTypePurposes ?? [], want.purposes)) {
      problems.push(
        `${want.type}: purposes ${JSON.stringify(got.NSPrivacyCollectedDataTypePurposes ?? [])} ` +
          `should be ${JSON.stringify(want.purposes)}`,
      );
    }
  }

  const mapped = new Set(collected.map((c) => c.type));
  for (const t of byType.keys()) {
    if (!mapped.has(t)) {
      problems.push(`${t}: declared in app.json but not in COLLECTED — nothing vouches for it (over-declared?)`);
    }
  }

  return problems;
}

// ─── filesystem plumbing ────────────────────────────────────────────────────

function readManifestAndSources(collected = COLLECTED) {
  const appJsonRaw = readFileSync(join(ROOT, 'app.json'), 'utf8');
  const appJson = JSON.parse(appJsonRaw);
  const manifest = appJson?.expo?.ios?.privacyManifests?.NSPrivacyCollectedDataTypes;

  const sources = {};
  for (const c of collected) {
    for (const ev of c.evidence) {
      if (ev.file in sources) continue;
      // app.json is its own evidence for the Info.plist usage strings.
      if (ev.file === 'app.json') {
        sources[ev.file] = appJsonRaw;
        continue;
      }
      try {
        sources[ev.file] = readFileSync(join(ROOT, ev.file), 'utf8');
      } catch {
        sources[ev.file] = null;
      }
    }
  }
  return { manifest, sources };
}

// ─── self-test ──────────────────────────────────────────────────────────────

function selfTest() {
  const { manifest, sources } = readManifestAndSources();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const failures = [];
  let mutations = 0;

  const expectPass = (label, m, s) => {
    const p = evaluate(m, s);
    if (p.length) failures.push(`${label}: expected PASS, got ${p.length} problem(s):\n    ${p.join('\n    ')}`);
  };
  const expectFail = (label, m, s) => {
    mutations++;
    const p = evaluate(m, s);
    if (p.length === 0) failures.push(`${label}: expected FAIL, but the evaluator passed`);
  };

  // Control: the real manifest against the real sources.
  expectPass('control', manifest, sources);

  // 1. Drop one declared entry — under-declaration must be caught.
  for (const t of [
    'NSPrivacyCollectedDataTypeAudioData',
    'NSPrivacyCollectedDataTypePhoneNumber',
    'NSPrivacyCollectedDataTypePhysicalAddress',
    'NSPrivacyCollectedDataTypePerformanceData',
  ]) {
    expectFail(`remove ${t}`, clone(manifest).filter((e) => e.NSPrivacyCollectedDataType !== t), sources);
  }

  // 2. Flip a linkage — a truthful type with a false claim must be caught.
  const flipped = clone(manifest);
  const crash = flipped.find((e) => e.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeCrashData');
  crash.NSPrivacyCollectedDataTypeLinked = false;
  expectFail('CrashData Linked=false', flipped, sources);

  // 3. Flip the tracking flag.
  const tracked = clone(manifest);
  tracked.find((e) => e.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeUserID')
    .NSPrivacyCollectedDataTypeTracking = true;
  expectFail('UserID Tracking=true', tracked, sources);

  // 4. Drop a purpose.
  const depurposed = clone(manifest);
  depurposed.find((e) => e.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeEmailAddress')
    .NSPrivacyCollectedDataTypePurposes = [APP_FUNCTIONALITY];
  expectFail('EmailAddress missing a purpose', depurposed, sources);

  // 5. Declare something nothing vouches for — over-declaration must be caught.
  expectFail(
    'over-declared PreciseLocation',
    [
      ...clone(manifest),
      {
        NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePreciseLocation',
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: [APP_FUNCTIONALITY],
      },
    ],
    sources,
  );

  // 6. Remove the evidence from a source — a stale declaration must be caught.
  const gutted = { ...sources };
  gutted['supabase/functions/aimee-voice/index.ts'] = (gutted['supabase/functions/aimee-voice/index.ts'] ?? '')
    .split('https://api.openai.com/v1/audio/transcriptions')
    .join('https://example.invalid/moved');
  expectFail('AudioData evidence removed', manifest, gutted);

  // 7. An empty manifest must not pass.
  expectFail('empty manifest', [], sources);

  if (failures.length) {
    console.log('✗ verify:privacymanifest self-test FAILED');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ verify:privacymanifest self-test: evaluator passes the real manifest and fails all ${mutations} ` +
      `mutations (missing entry x4, linkage, tracking flag, purpose, over-declared, stale evidence, empty)`,
  );
}

// ─── main ───────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) {
  selfTest();
  process.exit(0);
}

const { manifest, sources } = readManifestAndSources();
const problems = evaluate(manifest, sources);
if (problems.length) {
  console.log('✗ verify:privacymanifest — app.json does not match what the code collects\n');
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`\n${problems.length} problem(s). Fix app.json, or fix COLLECTED in ${'scripts/verify-privacy-manifest.mjs'}.`);
  process.exit(1);
}
console.log(
  `✓ verify:privacymanifest: ${COLLECTED.length} collected data types declared, ` +
    `linkage and purposes match, evidence present, nothing over-declared`,
);
