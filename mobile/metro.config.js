const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Metro only bundles files in watched folders. The app shares the web's plain TypeScript rules
// from frontend/src (see frontend/src/upNextSession.ts). Those files import no packages, so
// nothing resolves against the web's node_modules; the detector's tests enforce it.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../frontend/src')];

module.exports = config;
