/* global describe, test, expect, beforeEach, afterEach, __dirname */
const withRelayLiveActivity = require('../app.plugin');

const base = { name: 'Relay', slug: 'relay-mobile', version: '0.1.0' };

test('names the extension after the app and tells EAS to sign it', () => {
  const config = withRelayLiveActivity({
    ...base,
    ios: { bundleIdentifier: 'com.example.relay', buildNumber: '7' },
    extra: { relayCompatibilityVersion: '1.4.0', eas: { projectId: 'abc' } },
  });
  expect(config.extra).toEqual({
    relayCompatibilityVersion: '1.4.0',
    eas: {
      projectId: 'abc',
      build: {
        experimental: {
          ios: {
            appExtensions: [
              {
                targetName: 'RelayRestWidget',
                bundleIdentifier: 'com.example.relay.RestWidget',
                entitlements: {},
              },
            ],
          },
        },
      },
    },
  });
  expect(Object.keys(config.mods.ios)).toEqual(
    expect.arrayContaining(['infoPlist', 'dangerous', 'xcodeproj']),
  );
  expect(config.mods.android).toBeUndefined();
});

test('applied twice, it lists the extension once', () => {
  const once = withRelayLiveActivity({ ...base, ios: { bundleIdentifier: 'com.example.relay' } });
  const twice = withRelayLiveActivity(once);
  expect(twice.extra.eas.build.experimental.ios.appExtensions).toHaveLength(1);
});

test('turns Live Activities on in the app Info.plist', async () => {
  const config = withRelayLiveActivity({ ...base, ios: { bundleIdentifier: 'com.example.relay' } });
  const result = await config.mods.ios.infoPlist({
    ...config,
    modResults: { CFBundleName: 'Relay' },
    modRequest: { platform: 'ios', modName: 'infoPlist', projectRoot: '.', introspect: false },
  });
  expect(result.modResults).toEqual({ CFBundleName: 'Relay', NSSupportsLiveActivities: true });
});

test('the extension Info.plist is a WidgetKit extension with the app version', () => {
  const plist = withRelayLiveActivity.widgetInfoPlist({
    ...base,
    ios: { buildNumber: '7' },
  });
  expect(plist).toContain('<string>com.apple.widgetkit-extension</string>');
  expect(plist).toMatch(/CFBundleShortVersionString<\/key>\s*<string>0\.1\.0</);
  expect(plist).toMatch(/CFBundleVersion<\/key>\s*<string>7</);
});

test('without a bundle identifier it adds only the Info.plist key, and says so at prebuild', () => {
  const config = withRelayLiveActivity({ ...base });
  expect(config.extra).toBeUndefined();
  expect(Object.keys(config.mods.ios).sort()).toEqual(['dangerous', 'infoPlist']);
  expect(config.mods.ios.xcodeproj).toBeUndefined();
});

describe('over the SDK 58 template, from a clean checkout', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { compileModsAsync, IOSConfig } = require('expo/config-plugins');
  const MODULE = path.join(__dirname, '..');
  const FIXTURE = path.join(__dirname, 'fixtures', 'template-ios');
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-live-activity-'));
    fs.cpSync(FIXTURE, path.join(root, 'ios'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const prebuild = (bundleIdentifier) =>
    compileModsAsync(withRelayLiveActivity({ ...base, ios: { bundleIdentifier } }), {
      projectRoot: root,
      platforms: ['ios'],
      introspect: false,
      assertMissingModProviders: false,
    });
  const pbxprojPath = () => path.join(root, 'ios', 'Relay.xcodeproj', 'project.pbxproj');
  const project = () => IOSConfig.XcodeUtils.getPbxproj(root);
  const widgetTargets = (pbx) =>
    Object.values(pbx.pbxNativeTargetSection()).filter(
      (target) => typeof target === 'object' && target.name.replace(/"/g, '') === 'RelayRestWidget',
    );
  const bundleIds = (pbx) =>
    IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      pbx,
      widgetTargets(pbx)[0].buildConfigurationList,
    ).map(([, item]) => [item.name, item.buildSettings.PRODUCT_BUNDLE_IDENTIFIER]);

  test('copies the committed sources and adds one embedded widget target', async () => {
    await prebuild('com.example.relay');
    const folder = path.join(root, 'ios', 'RelayRestWidget');
    for (const [file, source] of [
      ['RestActivityAttributes.swift', path.join(MODULE, 'ios', 'RestActivityAttributes.swift')],
      ['RelayRestWidgetBundle.swift', path.join(MODULE, 'widget', 'RelayRestWidgetBundle.swift')],
      ['RestActivityWidget.swift', path.join(MODULE, 'widget', 'RestActivityWidget.swift')],
    ])
      expect(fs.readFileSync(path.join(folder, file), 'utf8')).toBe(
        fs.readFileSync(source, 'utf8'),
      );
    expect(fs.readFileSync(path.join(folder, 'Info.plist'), 'utf8')).toContain(
      'com.apple.widgetkit-extension',
    );
    expect(fs.readFileSync(path.join(root, 'ios', 'Relay', 'Info.plist'), 'utf8')).toMatch(
      /NSSupportsLiveActivities<\/key>\s*<true\/>/,
    );

    const pbx = project();
    expect(widgetTargets(pbx)).toHaveLength(1);
    expect(bundleIds(pbx)).toEqual([
      ['Debug', '"com.example.relay.RestWidget"'],
      ['Release', '"com.example.relay.RestWidget"'],
    ]);
    const app = pbx.getFirstTarget().firstTarget;
    const phases = app.buildPhases.map((phase) => phase.comment);
    expect(phases.indexOf('Embed Foundation Extensions')).toBe(phases.indexOf('Resources') + 1);
    expect(app.dependencies).toHaveLength(1);
    expect(fs.readFileSync(pbxprojPath(), 'utf8')).not.toMatch(/= undefined;/);
  });

  test('a repeat with the same bundle identifier changes nothing', async () => {
    await prebuild('com.example.relay');
    const first = fs.readFileSync(pbxprojPath(), 'utf8');
    await prebuild('com.example.relay');
    expect(fs.readFileSync(pbxprojPath(), 'utf8')).toBe(first);
  });

  test('a repeat with a new bundle identifier keeps one target and renames it', async () => {
    await prebuild('com.example.relay');
    await prebuild('com.example.relay.dev');
    const pbx = project();
    expect(widgetTargets(pbx)).toHaveLength(1);
    expect(bundleIds(pbx)).toEqual([
      ['Debug', '"com.example.relay.dev.RestWidget"'],
      ['Release', '"com.example.relay.dev.RestWidget"'],
    ]);
  });
});
