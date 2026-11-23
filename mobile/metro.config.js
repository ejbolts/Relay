const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The app shares rules in frontend/src and the release metadata beside it. Shared modules
// import no packages, and the web's dependencies and build output stay outside Metro's graph.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../frontend')];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\\]frontend[/\\](?:node_modules|dist)(?:[/\\]|$)/,
];

module.exports = config;
