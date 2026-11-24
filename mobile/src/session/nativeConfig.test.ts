// The build config's native identity, EAS project and links, from environment variables.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withNativeConfig } = require('../../nativeConfig') as {
  withNativeConfig: (
    config: object,
    env: Record<string, string | undefined>,
  ) => Record<string, any>;
};

const base = {
  name: 'Relay',
  scheme: 'relay-mobile',
  ios: { supportsTablet: false },
  extra: { relayCompatibilityVersion: '1.0.0' },
};
const PROJECT = '00000000-0000-4000-8000-000000000000';

it('leaves the config alone without settings, as Expo Go and local runs use it', () => {
  expect(withNativeConfig(base, {})).toBe(base);
  expect(withNativeConfig(base, { RELAY_APP_LINK_HOSTS: ' , ', RELAY_IOS_BUNDLE_ID: ' ' })).toBe(
    base,
  );
});

it('sets the identifiers and EAS project a build names', () => {
  const config = withNativeConfig(base, {
    RELAY_IOS_BUNDLE_ID: 'com.example.relay',
    RELAY_ANDROID_PACKAGE: 'com.example.relay',
    RELAY_EAS_PROJECT_ID: PROJECT,
    RELAY_EXPO_OWNER: 'example-team',
  });
  expect(config.ios).toEqual({ supportsTablet: false, bundleIdentifier: 'com.example.relay' });
  expect(config.android).toEqual({ package: 'com.example.relay' });
  expect(config.extra).toEqual({ relayCompatibilityVersion: '1.0.0', eas: { projectId: PROJECT } });
  expect(config.owner).toBe('example-team');
  expect(config.ios.associatedDomains).toBeUndefined();
  expect(config.android.intentFilters).toBeUndefined();
});

it('points Android at the Firebase file a build supplies, keeping one the base sets', () => {
  const config = withNativeConfig(base, { RELAY_GOOGLE_SERVICES_FILE: ' ./secrets/google.json ' });
  expect(config.android).toEqual({ googleServicesFile: './secrets/google.json' });
  expect(config.ios).toEqual(base.ios);
  const kept = withNativeConfig(
    { android: { googleServicesFile: './base.json' } },
    { RELAY_GOOGLE_SERVICES_FILE: './other.json' },
  );
  expect(kept.android.googleServicesFile).toBe('./base.json');
  expect(withNativeConfig(base, { RELAY_GOOGLE_SERVICES_FILE: '  ' })).toBe(base);
});

it('adds universal links and verified App Links for each Relay host', () => {
  const config = withNativeConfig(base, {
    RELAY_APP_LINK_HOSTS: 'gym.example.com, Relay.Example.org,gym.example.com',
  });
  expect(config.ios.associatedDomains).toEqual([
    'applinks:gym.example.com',
    'applinks:relay.example.org',
  ]);
  expect(config.android.intentFilters).toEqual([
    {
      action: 'VIEW',
      autoVerify: true,
      data: [
        { scheme: 'https', host: 'gym.example.com', path: '/' },
        { scheme: 'https', host: 'relay.example.org', path: '/' },
      ],
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ]);
  expect(config.scheme).toBe('relay-mobile');
});

it('keeps what the base config already sets', () => {
  const config = withNativeConfig(
    {
      owner: 'base-team',
      ios: {
        bundleIdentifier: 'com.example.base',
        associatedDomains: ['webcredentials:x.example'],
      },
      android: { package: 'com.example.base' },
      extra: { eas: { projectId: PROJECT, other: true } },
    },
    {
      RELAY_APP_LINK_HOSTS: 'gym.example.com',
      RELAY_IOS_BUNDLE_ID: 'com.example.other',
      RELAY_ANDROID_PACKAGE: 'com.example.other',
      RELAY_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
      RELAY_EXPO_OWNER: 'other-team',
    },
  );
  expect(config.ios.bundleIdentifier).toBe('com.example.base');
  expect(config.ios.associatedDomains).toEqual([
    'webcredentials:x.example',
    'applinks:gym.example.com',
  ]);
  expect(config.android.package).toBe('com.example.base');
  expect(config.extra.eas).toEqual({ projectId: PROJECT, other: true });
  expect(config.owner).toBe('base-team');
});

it.each([
  [{ RELAY_APP_LINK_HOSTS: 'https://gym.example.com' }],
  [{ RELAY_APP_LINK_HOSTS: 'gym.example.com:8443' }],
  [{ RELAY_APP_LINK_HOSTS: 'gym.example.com/path' }],
  [{ RELAY_APP_LINK_HOSTS: 'localhost' }],
  [{ RELAY_IOS_BUNDLE_ID: 'not an id' }],
  [{ RELAY_ANDROID_PACKAGE: 'relay' }],
  [{ RELAY_EAS_PROJECT_ID: 'project' }],
  [{ RELAY_EXPO_OWNER: 'two words' }],
])('refuses a setting a build could not use: %o', (env) => {
  expect(() => withNativeConfig(base, env)).toThrow();
});
