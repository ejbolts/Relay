import { createServer, type ViteDevServer } from 'vite';
import { afterEach, expect, it } from 'vitest';
import metadata from '../release.json';
import { releaseNotesPlugin } from '../vite.config';

let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

it('serves fresh development notes while letting Vite transform JSON imports', async () => {
  server = await createServer({
    configFile: false,
    plugins: [releaseNotesPlugin()],
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0];
  if (!origin) throw new Error('Development test server did not start');

  const release = await fetch(new URL('/release.json', origin));
  expect(release.status).toBe(200);
  expect(release.headers.get('cache-control')).toBe('no-store');
  expect(await release.json()).toEqual(metadata);

  const module = await fetch(new URL('/release.json?import', origin));
  expect(module.status).toBe(200);
  expect(module.headers.get('content-type')).toContain('javascript');
  expect(await module.text()).toContain('export default');
}, 15_000);
