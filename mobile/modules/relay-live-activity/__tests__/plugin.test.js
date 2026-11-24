/* global test, expect */
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

test('without a bundle identifier it adds only the Info.plist key', () => {
  const config = withRelayLiveActivity({ ...base });
  expect(config.extra).toBeUndefined();
  expect(Object.keys(config.mods.ios)).toEqual(['infoPlist']);
});
