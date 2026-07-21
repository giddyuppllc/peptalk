/**
 * withHealthConnectPermissionDelegate — Expo config plugin
 *
 * Fixes the native crash on Android Health Connect connect:
 *
 *   UninitializedPropertyAccessException:
 *     lateinit property requestPermission has not been initialized
 *       HealthConnectPermissionDelegate.launchPermissionsDialog (…:45)
 *       HealthConnectManager.requestPermission (…:72)
 *
 * react-native-health-connect's `HealthConnectPermissionDelegate` is a Kotlin
 * `object` (singleton) whose permission launcher is a `lateinit var
 * requestPermission: ActivityResultLauncher`. That launcher is ONLY created
 * inside `setPermissionDelegate(activity)`, which registers it against the
 * Activity via `registerForActivityResult(...)`. `registerForActivityResult`
 * must be called before the Activity reaches the STARTED state — i.e. in
 * `onCreate`.
 *
 * The library's own config plugin (app.plugin.js) only adds the
 * ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter; it never wires the delegate
 * into MainActivity. So on a managed Expo app the launcher is never
 * initialized, and the first `requestPermission()` call — i.e. the moment the
 * user taps "Connect Health Connect" — hits the uninitialized lateinit and the
 * app crashes to the home screen.
 *
 * This plugin injects, into the generated MainActivity.onCreate:
 *
 *   import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate
 *   …
 *   super.onCreate(null)
 *   HealthConnectPermissionDelegate.setPermissionDelegate(this)   // <-- added
 *
 * ReactActivity extends AppCompatActivity extends (…) ComponentActivity, so
 * `this` satisfies the `ComponentActivity` parameter and registration is legal
 * in onCreate.
 */

const { withMainActivity } = require('@expo/config-plugins');

const IMPORT_LINE =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const REGISTER_CALL =
  'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function addImport(src) {
  if (src.includes(IMPORT_LINE)) return src;
  // Insert right after the `package …` declaration.
  const m = src.match(/^package .*$/m);
  if (!m) {
    throw new Error(
      '[withHealthConnectPermissionDelegate] no package declaration in MainActivity',
    );
  }
  return src.replace(m[0], `${m[0]}\n\n${IMPORT_LINE}`);
}

function addRegistration(src) {
  if (src.includes(REGISTER_CALL)) return src;
  // Insert immediately after the `super.onCreate(...)` line inside onCreate.
  const superCall = src.match(/^(\s*)super\.onCreate\([^)]*\)\s*$/m);
  if (!superCall) {
    throw new Error(
      '[withHealthConnectPermissionDelegate] could not find super.onCreate(...) to anchor registration',
    );
  }
  const indent = superCall[1];
  return src.replace(
    superCall[0],
    `${superCall[0]}\n${indent}// Register the Health Connect permission launcher before the\n${indent}// Activity is STARTED so requestPermission() never hits an\n${indent}// uninitialized lateinit (see withHealthConnectPermissionDelegate.js).\n${indent}${REGISTER_CALL}`,
  );
}

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error(
        `[withHealthConnectPermissionDelegate] expected a Kotlin MainActivity, got "${config.modResults.language}"`,
      );
    }
    let src = config.modResults.contents;
    src = addImport(src);
    src = addRegistration(src);
    config.modResults.contents = src;
    return config;
  });
};
