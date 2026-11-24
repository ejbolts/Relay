/**
 * Universal links (iOS) and App Links (Android), so a friend's QR code or invite link opens the
 * installed app. They come from build environment variables, so no installation's domain or app
 * identity is committed, and a build without them (Expo Go included) is unchanged:
 *
 * - `RELAY_APP_LINK_HOSTS`: comma-separated Relay hostnames, such as `gym.example.com`.
 * - `RELAY_IOS_BUNDLE_ID` and `RELAY_ANDROID_PACKAGE`: the app's identifiers, used only when the
 *   base config does not set them already.
 *
 * The server must serve the matching files: see `GYM_IOS_TEAM_ID` and its neighbours in the
 * backend settings.
 */

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const APP_ID = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/;

function linkHosts(value) {
  const hosts = (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const invalid = hosts.filter((host) => !HOSTNAME.test(host));
  if (invalid.length) {
    throw new Error(
      `RELAY_APP_LINK_HOSTS needs bare hostnames, without a scheme, port or path: ${invalid.join(', ')}`,
    );
  }
  return [...new Set(hosts)];
}

function appId(name, value) {
  const id = value?.trim();
  if (!id) return undefined;
  if (!APP_ID.test(id)) throw new Error(`${name} is not a valid app identifier: ${id}`);
  return id;
}

/** Adds the link settings the environment names to an Expo config. */
function withAppLinks(config, env = process.env) {
  const hosts = linkHosts(env.RELAY_APP_LINK_HOSTS);
  const bundleIdentifier =
    config.ios?.bundleIdentifier ?? appId('RELAY_IOS_BUNDLE_ID', env.RELAY_IOS_BUNDLE_ID);
  const androidPackage =
    config.android?.package ?? appId('RELAY_ANDROID_PACKAGE', env.RELAY_ANDROID_PACKAGE);
  const ios = { ...config.ios, ...(bundleIdentifier ? { bundleIdentifier } : {}) };
  const android = { ...config.android, ...(androidPackage ? { package: androidPackage } : {}) };
  if (hosts.length) {
    ios.associatedDomains = [
      ...new Set([
        ...(config.ios?.associatedDomains ?? []),
        ...hosts.map((host) => `applinks:${host}`),
      ]),
    ];
    android.intentFilters = [
      ...(config.android?.intentFilters ?? []),
      {
        action: 'VIEW',
        autoVerify: true,
        // Android can't match the fragment a friend link keeps its account in (`/#friend=<id>`),
        // so the app opens the server's root address and routes the fragment itself.
        data: hosts.map((host) => ({ scheme: 'https', host, path: '/' })),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ];
  }
  const changed = hosts.length || bundleIdentifier || androidPackage;
  return changed ? { ...config, ios, android } : config;
}

module.exports = { withAppLinks };
