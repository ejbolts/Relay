// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { YouTubeConnectionPanel } from './YouTubeConnectionPanel';
import type { YouTubeConnection } from './types';

vi.mock('./api', () => ({
  api: { youtube: { connection: vi.fn(), connect: vi.fn(), disconnect: vi.fn() } },
}));

let root: Root;
let container: HTMLDivElement;
const disconnected: YouTubeConnection = {
  status: 'not_connected',
  channel_id: null,
  channel_title: null,
  channel_url: null,
  can_disconnect: true,
  message: 'Connect your own channel to upload workout videos.',
  privacy_status: 'unlisted',
};
const connected: YouTubeConnection = {
  ...disconnected,
  status: 'connected',
  channel_id: 'sample-channel',
  channel_title: 'Sample training',
  channel_url: 'https://www.youtube.com/channel/sample-channel',
  message: 'Uploads go to your channel.',
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/#videos');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(label: string) {
  const match = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  expect(match, `Button ${label}`).toBeTruthy();
  return match!;
}
async function render(value: YouTubeConnection, props = {}) {
  vi.mocked(api.youtube.connection).mockResolvedValue(value);
  await act(async () => root.render(<YouTubeConnectionPanel {...props} />));
}

describe('personal YouTube connection', () => {
  it.each([
    ['private', 'Your videos upload as Private', 'A link alone does not give access'],
    ['unlisted', 'Your videos upload as Unlisted', 'Anyone with the link can watch and share them'],
    ['public', 'Your videos upload as Public', 'Anyone can find and watch them'],
  ] as const)(
    'explains the configured %s visibility accurately',
    async (privacy_status, title, detail) => {
      await render({ ...connected, privacy_status });
      const copy = container.querySelector('.youtube-privacy-copy');
      expect(copy?.querySelector('strong')?.textContent).toBe(title);
      expect(copy?.textContent).toContain(detail);
      if (privacy_status !== 'private') expect(copy?.textContent).not.toContain('as Private');
    },
  );

  it('shows the first-use connection, privacy and a recoverable authorization failure', async () => {
    const onChange = vi.fn();
    await render(disconnected, { onChange });
    expect(container.textContent).toContain('Your videos upload as Unlisted');
    expect(container.textContent).toContain("They aren't listed on your channel's Videos tab");
    expect(container.textContent).toContain('Anyone with the link can watch and share them');
    expect(container.textContent).toContain('No API keys or files needed');
    expect(onChange).toHaveBeenLastCalledWith(disconnected);
    vi.mocked(api.youtube.connect).mockRejectedValue(
      new Error('Google is unavailable. Try again.'),
    );
    await act(async () => button('Connect YouTube').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Google is unavailable',
    );
    expect(button('Connect YouTube').disabled).toBe(false);
  });

  it('requires explicit confirmation to disconnect, and Cancel preserves the connection', async () => {
    await render(connected);
    await act(async () => button('Disconnect').click());
    expect(api.youtube.disconnect).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    expect(api.youtube.disconnect).not.toHaveBeenCalled();
    vi.mocked(api.youtube.disconnect).mockResolvedValue(disconnected);
    vi.mocked(api.youtube.connection).mockResolvedValue(disconnected);
    await act(async () => button('Disconnect').click());
    await act(async () => button('Disconnect YouTube').click());
    expect(api.youtube.disconnect).toHaveBeenCalledOnce();
    expect(button('Connect YouTube')).toBeTruthy();
    expect(container.textContent).not.toContain('Sample training');
  });

  it('protects an active job while allowing reconnect of its channel', async () => {
    await render({ ...connected, can_disconnect: false, status: 'reconnect_required' });
    expect(button('Disconnect').disabled).toBe(true);
    expect(button('Reconnect YouTube').disabled).toBe(false);
    expect(container.textContent).toContain('Reconnect needed');
  });

  it('lets an account disconnect after uploads are disabled without offering a new connection', async () => {
    await render(connected, { canConnect: false });
    expect(button('Disconnect').disabled).toBe(false);
    expect(container.textContent).not.toContain('Reconnect YouTube');
  });

  it.each(['mock', 'unavailable'] as const)(
    'does not offer a Google connection in %s mode',
    async (status) => {
      await render({ ...disconnected, status });
      expect(
        [...container.querySelectorAll('button')].some((node) =>
          node.textContent?.includes('Connect YouTube'),
        ),
      ).toBe(false);
    },
  );

  it('shows the callback result and removes its query parameter without losing navigation', async () => {
    window.history.replaceState({ gymLogger: true }, '', '/?youtube=connected#videos');
    await render(connected);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('YouTube connected');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#videos');
    expect(window.history.state).toEqual({ gymLogger: true });
  });

  it('recovers from an unavailable status endpoint with Try again', async () => {
    vi.mocked(api.youtube.connection).mockRejectedValue(new Error('Connection unavailable'));
    await act(async () => root.render(<YouTubeConnectionPanel />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Connection unavailable',
    );
    vi.mocked(api.youtube.connection).mockResolvedValue(connected);
    await act(async () => button('Try again').click());
    expect(container.textContent).toContain('Sample training');
  });
});
