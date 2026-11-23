const { version } = require('../frontend/release.json');

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, relayCompatibilityVersion: version },
});
