/**
 * withHealthConnectPrivacyPolicyAlias — Expo config plugin
 *
 * Adds the Android 14+ entry point for Health Connect's "privacy policy" link.
 *
 * WHY THIS IS NEEDED
 * Google requires an app that reads Health Connect data to expose its privacy
 * policy from inside the Health Connect permission screen, and the mechanism
 * CHANGED at Android 14:
 *
 *   Android 13 and below → an intent-filter for
 *                          androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE
 *   Android 14 and above → an <activity-alias> exposing
 *                          android.intent.action.VIEW_PERMISSION_USAGE
 *                          with category android.intent.category.HEALTH_PERMISSIONS
 *
 * `react-native-health-connect`'s own plugin adds ONLY the first one. We target
 * SDK 36, so on every modern device — including whatever Google reviews on —
 * the privacy-policy link in the Health Connect permission screen had nothing
 * to open. That link working is part of the Play health-apps declaration, and
 * the declaration is what gates access to the data types at all.
 *
 *   https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
 *
 * The alias targets .MainActivity, which is where the library already puts the
 * Android 13 filter, so both eras land in the same place.
 *
 * `android:permission="android.permission.START_VIEW_PERMISSION_USAGE"` is
 * required by the platform: it restricts who may launch the alias to the system
 * permission UI, so a third-party app cannot deep-link into it.
 */

const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const ALIAS_NAME = 'ViewPermissionUsageActivity';

/**
 * Second half: make the link actually GO somewhere.
 *
 * Declaring the alias satisfies the manifest requirement, but both health
 * intents arrive at MainActivity carrying NO data URI — so
 * `Linking.getInitialURL()` returns null and Expo Router opens wherever the app
 * happened to be. The user taps "privacy policy" inside Health Connect and lands
 * on their dose log.
 *
 * Rather than add a native bridge to read the intent action in JS, translate the
 * intent into the deep link the app already handles. `peptalk://privacy` is a
 * registered scheme with a real route (app/privacy.tsx), and rewriting the
 * intent BEFORE super.onCreate means Expo Router's normal initial-URL path picks
 * it up with no JS changes at all.
 */
const ROUTE_MARKER = 'peptalk://privacy';

function addIntentRewrite(src) {
  if (src.includes(ROUTE_MARKER)) return src;
  const superCall = src.match(/^(\s*)super\.onCreate\([^)]*\)\s*$/m);
  if (!superCall) {
    throw new Error(
      '[withHealthConnectPrivacyPolicyAlias] could not find super.onCreate(...) to anchor the intent rewrite',
    );
  }
  const indent = superCall[1];
  const block = [
    `${indent}// Health Connect's "privacy policy" link arrives as one of these two`,
    `${indent}// actions with NO data URI, so Expo Router would otherwise open the`,
    `${indent}// app wherever it last was. Rewrite it into the deep link we already`,
    `${indent}// handle so the user lands on the policy. Must run BEFORE`,
    `${indent}// super.onCreate, which is where the initial URL is read.`,
    `${indent}// See plugins/withHealthConnectPrivacyPolicyAlias.js`,
    `${indent}intent?.action?.let { a ->`,
    `${indent}  if (a == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||`,
    `${indent}      a == "android.intent.action.VIEW_PERMISSION_USAGE") {`,
    `${indent}    intent.action = android.content.Intent.ACTION_VIEW`,
    `${indent}    intent.data = android.net.Uri.parse("${ROUTE_MARKER}")`,
    `${indent}  }`,
    `${indent}}`,
  ].join('\n');
  return src.replace(superCall[0], `${block}\n${superCall[0]}`);
}

module.exports = function withHealthConnectPrivacyPolicyAlias(config) {
  config = withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        `[withHealthConnectPrivacyPolicyAlias] expected a Kotlin MainActivity, got "${cfg.modResults.language}"`,
      );
    }
    cfg.modResults.contents = addIntentRewrite(cfg.modResults.contents);
    return cfg;
  });

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app['activity-alias'] = app['activity-alias'] ?? [];

    // Idempotent: prebuild runs repeatedly, and a duplicated alias is a manifest
    // merge error rather than a harmless no-op.
    const already = app['activity-alias'].some(
      (a) => a?.$?.['android:name'] === ALIAS_NAME,
    );
    if (already) return cfg;

    app['activity-alias'].push({
      $: {
        'android:name': ALIAS_NAME,
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    });

    return cfg;
  });
};
