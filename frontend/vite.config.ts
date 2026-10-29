import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import releaseHistory from './release-history.json';
import releaseMetadata from './release.json';
import { parseRelease, parseReleaseHistory } from './src/releaseMetadata';

export function releaseNotesPlugin(): Plugin {
  return {
    name: 'validate-release-notes',
    buildStart() {
      if (!parseRelease(releaseMetadata) || !releaseMetadata.date) {
        this.error(
          'release.json needs a version, valid YYYY-MM-DD date, title, summary, changes and an HTTPS GitHub URL.',
        );
      }
      if (
        !parseReleaseHistory(releaseHistory, releaseMetadata.version) ||
        releaseHistory.some((release) => !release.date)
      ) {
        this.error(
          'release-history.json must list dated, valid earlier releases, newest first, below the current version.',
        );
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'release.json',
        source: JSON.stringify(releaseMetadata),
      });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // Vite uses /release.json?import for the bundled fallback; let its JSON
        // transformer handle module requests rather than answering them with raw JSON.
        if (request.originalUrl !== '/release.json') {
          next();
          return;
        }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(releaseMetadata));
      });
    },
  };
}

const developmentServiceWorker = `
importScripts('/push-notifications.js');

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});
`;

function resetProductionWorkerDuringDevelopment(): Plugin {
  return {
    name: 'reset-production-service-worker-during-development',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.originalUrl?.split('?')[0] !== '/sw.js') {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        response.setHeader('Service-Worker-Allowed', '/');
        response.end(developmentServiceWorker);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    releaseNotesPlugin(),
    resetProductionWorkerDuringDevelopment(),
    VitePWA({
      // Registration is managed in appUpdates.ts without interrupting open forms.
      injectRegister: false,
      registerType: 'prompt',
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Never answer API navigations with the app shell, and never cache /api responses:
        // auth state must always come from the server.
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['push-notifications.js'],
        // The bundled Inter font must be precached so the installed PWA renders offline.
        globPatterns: ['**/*.{js,css,html,woff2}'],
      },
      manifest: {
        name: 'Relay',
        short_name: 'Relay',
        description: 'Private workout tracking, progress, and video logging',
        theme_color: '#0b0d0f',
        background_color: '#0b0d0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    allowedHosts: [loadEnv('development', '.', 'GYM_DEV_HOST').GYM_DEV_HOST].filter(Boolean),
    proxy: { '/api': { target: 'http://127.0.0.1:8000', ws: true } },
  },
});
