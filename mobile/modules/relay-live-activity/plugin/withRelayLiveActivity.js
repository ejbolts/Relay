// Adds the rest timer's Live Activity to the iOS app at prebuild (EAS builds and `expo prebuild`):
// - NSSupportsLiveActivities in the app's Info.plist;
// - a WidgetKit extension target, RelayRestWidget, holding the Lock Screen and Dynamic Island
//   layouts from ../widget and its own copy of ../ios/RestActivityAttributes.swift;
// - the extension's bundle identifier in extra.eas, so EAS signs it with the app.
//
// Nothing here runs under `expo start` or in Expo Go: config plugins only register "mods", which
// run at prebuild. Android is untouched.

/* global __dirname */
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  WarningAggregator,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const TARGET = 'RelayRestWidget';
const BUNDLE_SUFFIX = 'RestWidget';
/** Expo SDK 58's iOS minimum; the extension matches the app. */
const DEPLOYMENT_TARGET = '16.4';
const MODULE_ROOT = path.join(__dirname, '..');
const SOURCES = [
  path.join(MODULE_ROOT, 'ios', 'RestActivityAttributes.swift'),
  path.join(MODULE_ROOT, 'widget', 'RelayRestWidgetBundle.swift'),
  path.join(MODULE_ROOT, 'widget', 'RestActivityWidget.swift'),
];
const SWIFT_FILES = SOURCES.map((file) => path.basename(file));

function widgetBundleId(config) {
  const app = config.ios && config.ios.bundleIdentifier;
  return app ? `${app}.${BUNDLE_SUFFIX}` : null;
}

/** The extension's Info.plist. Its versions follow the app's, which App Store uploads require. */
function widgetInfoPlist(config) {
  const version = config.version || '1.0.0';
  const build = (config.ios && config.ios.buildNumber) || '1';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Relay rest timer</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${build}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>
`;
}

/** Lets the app start Live Activities. */
function withLiveActivitiesKey(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });
}

/** Tells EAS Build about the extension, so it makes and applies a provisioning profile for it. */
function withEasExtension(config, bundleIdentifier) {
  const extra = config.extra || {};
  const eas = extra.eas || {};
  const build = eas.build || {};
  const experimental = build.experimental || {};
  const ios = experimental.ios || {};
  const others = (ios.appExtensions || []).filter((item) => item.targetName !== TARGET);
  return {
    ...config,
    extra: {
      ...extra,
      eas: {
        ...eas,
        build: {
          ...build,
          experimental: {
            ...experimental,
            ios: {
              ...ios,
              appExtensions: [
                ...others,
                { targetName: TARGET, bundleIdentifier, entitlements: {} },
              ],
            },
          },
        },
      },
    },
  };
}

/** Copies the widget's sources and Info.plist into ios/RelayRestWidget. */
function withWidgetFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const folder = path.join(config.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(folder, { recursive: true });
      for (const source of SOURCES)
        fs.copyFileSync(source, path.join(folder, path.basename(source)));
      fs.writeFileSync(path.join(folder, 'Info.plist'), widgetInfoPlist(config));
      return config;
    },
  ]);
}

const quote = (value) => `"${value}"`;
const unquote = (value) => String(value).replace(/^"(.*)"$/, '$1');

/** Adds the extension target, builds its Swift, and embeds it in the app. */
function withWidgetTarget(config, bundleIdentifier) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    // Prebuild without --clean runs again over the same project.
    // The xcode library stores the name it is given quoted.
    if (project.pbxTargetByName(TARGET) || project.pbxTargetByName(quote(TARGET))) return config;

    // The Expo template has neither section, which addTarget's dependency step needs.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    // The extension's folder in Xcode's navigator, beside the app's.
    const group = project.addPbxGroup([...SWIFT_FILES, 'Info.plist'], TARGET, TARGET);
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);

    // addTarget also embeds the .appex in the app (a "Copy Files" phase to PlugIns) and makes the
    // app depend on it, so it builds first.
    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleIdentifier);
    project.addBuildPhase(SWIFT_FILES, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    // SwiftUI, WidgetKit and ActivityKit link automatically from their Swift imports.
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    // The xcode library leaves unset file types as `undefined`, which it would write out as the
    // literal word and Xcode would read as a file type.
    const ours = new Set([...SWIFT_FILES, 'Info.plist', `${TARGET}.appex`].map(quote));
    const references = project.pbxFileReferenceSection();
    for (const key of Object.keys(references)) {
      const reference = references[key];
      if (typeof reference !== 'object' || !ours.has(quote(unquote(reference.path)))) continue;
      for (const field of Object.keys(reference))
        if (reference[field] === undefined || reference[field] === 'undefined')
          delete reference[field];
    }

    const settings = {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CLANG_ENABLE_MODULES: 'YES',
      CODE_SIGN_STYLE: 'Automatic',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: quote(`${TARGET}/Info.plist`),
      IPHONEOS_DEPLOYMENT_TARGET: DEPLOYMENT_TARGET,
      PRODUCT_BUNDLE_IDENTIFIER: quote(bundleIdentifier),
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: quote('1,2'),
    };
    // The app's team, when it is set in the project (EAS sets it on every target it signs).
    const team = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      project.getFirstTarget().firstTarget.buildConfigurationList,
    )
      .map(([, item]) => item.buildSettings.DEVELOPMENT_TEAM)
      .find(Boolean);
    if (team) settings.DEVELOPMENT_TEAM = team;

    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.pbxNativeTarget.buildConfigurationList,
    );
    for (const [, item] of configurations) {
      Object.assign(item.buildSettings, settings);
      if (item.name === 'Debug') {
        item.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = 'DEBUG';
        item.buildSettings.SWIFT_OPTIMIZATION_LEVEL = quote('-Onone');
      }
    }
    return config;
  });
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
function withRelayLiveActivity(config) {
  config = withLiveActivitiesKey(config);
  const bundleIdentifier = widgetBundleId(config);
  if (!bundleIdentifier) {
    // Without the app's bundle identifier there's nothing to name the extension after. The app
    // still builds; it just has no Live Activity layouts to show. Said at prebuild only, so
    // `expo start` stays quiet.
    return withDangerousMod(config, [
      'ios',
      async (config) => {
        WarningAggregator.addWarningIOS(
          'relay-live-activity',
          'ios.bundleIdentifier is not set, so the rest timer widget extension was not added.',
        );
        return config;
      },
    ]);
  }
  config = withEasExtension(config, bundleIdentifier);
  config = withWidgetFiles(config);
  config = withWidgetTarget(config, bundleIdentifier);
  return config;
}

module.exports = withRelayLiveActivity;
module.exports.TARGET = TARGET;
module.exports.widgetBundleId = widgetBundleId;
module.exports.widgetInfoPlist = widgetInfoPlist;
