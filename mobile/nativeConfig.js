/**
 * The app's native identity and links, from build environment variables, so no installation's
 * domain, identifiers or Expo account is committed. Each applies only when set, so a build
 * without them (Expo Go included) is unchanged. See "Native builds" in README.md.
 *
 * - `RELAY_IOS_BUNDLE_ID`, `RELAY_ANDROID_PACKAGE`: the app's identifiers. A value the base
 *   config already sets wins.
 * - `RELAY_EAS_PROJECT_ID`: the EAS project, as `extra.eas.projectId` (push tokens need it).
 * - `RELAY_EXPO_OWNER`: the Expo account or organisation that owns that project.
 * - `RELAY_GOOGLE_SERVICES_FILE`: the path to Firebase's `google-services.json` (a local path,
 *   or an EAS file variable), as `android.googleServicesFile`; Android push tokens need it.
 * - `RELAY_APP_LINK_HOSTS`: comma-separated Relay hostnames, such as `gym.example.com`, for
 *   universal links (iOS) and App Links (Android). The server must serve the matching files:
 *   see `GYM_IOS_TEAM_ID` and its neighbours in the backend settings.
 */

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const APP_ID = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/;
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

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

function setting(name, value, pattern) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!pattern.test(trimmed)) throw new Error(`${name} is not valid: ${trimmed}`);
  return trimmed;
}

/** Adds the identity, EAS project and link settings the environment names to an Expo config. */
function withNativeConfig(config, env = process.env) {
  const hosts = linkHosts(env.RELAY_APP_LINK_HOSTS);
  const bundleIdentifier =
    config.ios?.bundleIdentifier ?? setting('RELAY_IOS_BUNDLE_ID', env.RELAY_IOS_BUNDLE_ID, APP_ID);
  const androidPackage =
    config.android?.package ?? setting('RELAY_ANDROID_PACKAGE', env.RELAY_ANDROID_PACKAGE, APP_ID);
  const projectId =
    config.extra?.eas?.projectId ??
    setting('RELAY_EAS_PROJECT_ID', env.RELAY_EAS_PROJECT_ID, PROJECT_ID);
  const owner = config.owner ?? setting('RELAY_EXPO_OWNER', env.RELAY_EXPO_OWNER, OWNER);
  // A path, so any non-blank value is used as given; the build reports a missing file.
  const googleServicesFile =
    config.android?.googleServicesFile ?? (env.RELAY_GOOGLE_SERVICES_FILE?.trim() || undefined);
  if (
    !hosts.length &&
    !bundleIdentifier &&
    !androidPackage &&
    !projectId &&
    !owner &&
    !googleServicesFile
  )
    return config;

  const ios = { ...config.ios, ...(bundleIdentifier ? { bundleIdentifier } : {}) };
  const android = {
    ...config.android,
    ...(androidPackage ? { package: androidPackage } : {}),
    ...(googleServicesFile ? { googleServicesFile } : {}),
  };
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
  return {
    ...config,
    ...(owner ? { owner } : {}),
    ios,
    android,
    ...(projectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } } : {}),
  };
}

module.exports = { withNativeConfig };
