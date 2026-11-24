const { version } = require('../frontend/release.json');
const { withAppLinks } = require('./appLinks');

module.exports = ({ config }) =>
  withAppLinks({
    ...config,
    extra: { ...config.extra, relayCompatibilityVersion: version },
  });
