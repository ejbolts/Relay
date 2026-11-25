const { version } = require('../frontend/release.json');
const { withNativeConfig } = require('./nativeConfig');

// `app.json` is the base; this adds what each build supplies (see "Native builds" in README.md).
module.exports = ({ config }) =>
  withNativeConfig({
    ...config,
    extra: { ...config.extra, relayCompatibilityVersion: version },
  });
