// The build config that turns on universal links and App Links from environment variables.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppLinks } = require('../../appLinks') as {
  withAppLinks: (config: object, env: Record<string, string | undefined>) => Record<string, any>;
};

const base = { name: 'Relay', scheme: 'relay-mobile', ios: { supportsTablet: false } };

it('leaves the config alone without link settings, as Expo Go and local builds run', () => {
  expect(withAppLinks(base, {})).toBe(base);
  expect(withAppLinks(base, { RELAY_APP_LINK_HOSTS: ' , ' })).toBe(base);
});

it('adds universal links and verified App Links for each Relay host', () => {
  const config = withAppLinks(base, {
    RELAY_APP_LINK_HOSTS: 'gym.example.com, Relay.Example.org,gym.example.com',
    RELAY_IOS_BUNDLE_ID: 'com.example.relay',
    RELAY_ANDROID_PACKAGE: 'com.example.relay',
  });
  expect(config.ios).toEqual({
    supportsTablet: false,
    bundleIdentifier: 'com.example.relay',
    associatedDomains: ['applinks:gym.example.com', 'applinks:relay.example.org'],
  });
  expect(config.android).toEqual({
    package: 'com.example.relay',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'gym.example.com', path: '/' },
          { scheme: 'https', host: 'relay.example.org', path: '/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  });
  expect(config.scheme).toBe('relay-mobile');
});

it('keeps identifiers and links the base config already sets', () => {
  const config = withAppLinks(
    {
      ios: {
        bundleIdentifier: 'com.example.base',
        associatedDomains: ['webcredentials:x.example'],
      },
      android: { package: 'com.example.base' },
    },
    {
      RELAY_APP_LINK_HOSTS: 'gym.example.com',
      RELAY_IOS_BUNDLE_ID: 'com.example.other',
      RELAY_ANDROID_PACKAGE: 'com.example.other',
    },
  );
  expect(config.ios.bundleIdentifier).toBe('com.example.base');
  expect(config.ios.associatedDomains).toEqual([
    'webcredentials:x.example',
    'applinks:gym.example.com',
  ]);
  expect(config.android.package).toBe('com.example.base');
});

it.each([
  [{ RELAY_APP_LINK_HOSTS: 'https://gym.example.com' }],
  [{ RELAY_APP_LINK_HOSTS: 'gym.example.com:8443' }],
  [{ RELAY_APP_LINK_HOSTS: 'gym.example.com/path' }],
  [{ RELAY_APP_LINK_HOSTS: 'localhost' }],
  [{ RELAY_IOS_BUNDLE_ID: 'not an id' }],
  [{ RELAY_ANDROID_PACKAGE: 'relay' }],
])('refuses a setting a phone could not use: %o', (env) => {
  expect(() => withAppLinks(base, env)).toThrow();
});
