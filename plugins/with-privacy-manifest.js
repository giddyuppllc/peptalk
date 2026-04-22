/**
 * Expo config plugin: drops PrivacyInfo.xcprivacy into the generated iOS
 * project on every prebuild + adds it to the Xcode project so it ships
 * inside the app bundle.
 *
 * Source of truth: plugins/PrivacyInfo.xcprivacy (this directory).
 * Destination: ios/<AppName>/PrivacyInfo.xcprivacy
 *
 * Required because `npx expo prebuild --clean` wipes the ios/ directory,
 * so a manually-placed file gets lost on every clean prebuild.
 *
 * Registered via app.json "plugins": ["./plugins/with-privacy-manifest.js"].
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'PrivacyInfo.xcprivacy');
const FILENAME = 'PrivacyInfo.xcprivacy';

/**
 * Step 1 — copy the manifest into ios/<AppName>/ after prebuild finishes
 * writing the native project.
 */
function withPrivacyManifestCopy(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const appName = cfg.modRequest.projectName;
      const destDir = path.join(iosRoot, appName);
      const destFile = path.join(destDir, FILENAME);

      if (!fs.existsSync(SOURCE)) {
        // Don't fail prebuild — just warn. Source might have been moved;
        // better to ship without the file than block the dev loop.
        console.warn(
          `[with-privacy-manifest] source not found at ${SOURCE}; skipping copy`,
        );
        return cfg;
      }
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(SOURCE, destFile);
      return cfg;
    },
  ]);
}

/**
 * Step 2 — add the file to the Xcode project so it's actually bundled
 * into the app. Without this, the file lives on disk but Xcode doesn't
 * compile it into the .ipa.
 */
function withPrivacyManifestPbx(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const appName = cfg.modRequest.projectName;
    const filePath = `${appName}/${FILENAME}`;

    // No-op if already referenced (idempotent across re-runs)
    const allFiles = project.pbxFileReferenceSection();
    const alreadyPresent = Object.values(allFiles).some(
      (ref) => ref && typeof ref === 'object' && ref.path === `"${FILENAME}"`,
    );
    if (alreadyPresent) return cfg;

    // Find the main app group and add the file to it + the resources build phase.
    const groupKey = project.findPBXGroupKey({ name: appName });
    if (!groupKey) {
      console.warn(`[with-privacy-manifest] could not find pbx group ${appName}`);
      return cfg;
    }

    project.addResourceFile(
      filePath,
      { target: project.getFirstTarget().uuid },
      groupKey,
    );
    return cfg;
  });
}

module.exports = function withPrivacyManifest(config) {
  config = withPrivacyManifestCopy(config);
  config = withPrivacyManifestPbx(config);
  return config;
};
