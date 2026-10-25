import { afterEach, describe, expect, it, vi } from 'vitest';
import history from '../release-history.json';
import metadata from '../release.json';
import {
  canShowReleaseAnnouncement,
  fetchRelease,
  hasSeenRelease,
  rememberRelease,
  watchReleases,
} from './releaseAnnouncements';
import {
  compareVersions,
  formatReleaseDate,
  parseRelease,
  parseReleaseHistory,
  formatReleaseVersion,
} from './releaseMetadata';

const screenshot = {
  url: 'https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/docs/screenshots/sample-release.png',
  alt: 'Sample release notification and refresh button',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('release announcements', () => {
  it('validates calendar dates and formats them without timezone shifts', () => {
    for (const date of ['2026-02-30', '2026-13-01', '17 Oct 2026', '', null, 123])
      expect(parseRelease({ ...metadata, date })).toBeNull();
    expect(parseRelease({ ...metadata, date: undefined })).not.toBeNull();
    expect(parseRelease({ ...metadata, date: '2024-02-29' })).not.toBeNull();
    expect(formatReleaseDate('2026-10-17')).toBe('17 Oct 2026');
    expect(history.every((release) => /^\d{4}-\d{2}-\d{2}$/.test(release.date))).toBe(true);
  });
  it('accepts the shipped notes and rejects incomplete metadata and unsafe URLs', () => {
    expect(parseRelease(metadata)).toEqual(metadata);
    for (const invalid of [
      null,
      {},
      { ...metadata, version: '' },
      { ...metadata, changes: [] },
      { ...metadata, changes: [null] },
      { ...metadata, summary: ' ' },
      { ...metadata, url: 'javascript:alert(1)' },
      { ...metadata, url: 'https://github.com.example.com/' },
      { ...metadata, url: 'http://github.com/' },
      { ...metadata, url: 'https://user@github.com/' },
      { ...metadata, image: null },
      { ...metadata, image: {} },
      { ...metadata, image: { ...screenshot, alt: ' ' } },
      { ...metadata, image: { ...screenshot, url: 'javascript:alert(1)' } },
      { ...metadata, image: { ...screenshot, url: 'http://raw.githubusercontent.com/a.png' } },
      {
        ...metadata,
        image: { ...screenshot, url: 'https://raw.githubusercontent.com.evil/a.png' },
      },
      {
        ...metadata,
        image: { ...screenshot, url: 'https://user@raw.githubusercontent.com/a.png' },
      },
      {
        ...metadata,
        image: { ...screenshot, url: 'https://github.com/owner/repo/blob/main/a.png' },
      },
    ]) {
      expect(parseRelease(invalid)).toBeNull();
    }
  });

  it('accepts a release with an accessible HTTPS screenshot', () => {
    const illustrated = { ...metadata, image: screenshot };
    expect(parseRelease(illustrated)).toEqual(illustrated);
  });

  it('accepts older releases without an image', () => {
    const textOnly = { ...metadata, image: undefined };
    expect(parseRelease(textOnly)).toEqual(textOnly);
  });

  it('validates every highlight and its media URL while accepting legacy notes', () => {
    expect(parseRelease({ ...metadata, highlights: undefined })).not.toBeNull();
    const highlight = {
      title: 'Sample feature',
      description: 'Feature details',
      image: screenshot,
    };
    for (const highlights of [
      null,
      {},
      [],
      [null],
      [{ ...highlight, title: ' ' }],
      [{ ...highlight, description: '' }],
      [{ ...highlight, image: null }],
      [{ ...highlight, image: { ...screenshot, url: 'javascript:alert(1)' } }],
      [
        {
          ...highlight,
          image: { ...screenshot, url: 'https://raw.githubusercontent.com.evil/a.png' },
        },
      ],
      [highlight, { ...highlight, image: { ...screenshot, alt: '' } }],
    ])
      expect(parseRelease({ ...metadata, highlights })).toBeNull();
  });

  it('accepts a trailer bundled with the app and rejects external, unsafe or incomplete videos', () => {
    const video = {
      url: '/releases/sample-trailer.mp4',
      poster: '/releases/sample-trailer.jpg',
      alt: 'Sample release trailer',
    };
    expect(parseRelease({ ...metadata, video })).toEqual({ ...metadata, video });
    expect(parseRelease({ ...metadata, video: undefined })).not.toBeNull();
    for (const invalid of [
      null,
      {},
      { ...video, alt: ' ' },
      { ...video, poster: undefined },
      { ...video, url: 'https://raw.githubusercontent.com/owner/repo/sha/trailer.mp4' },
      { ...video, url: '//example.com/releases/trailer.mp4' },
      { ...video, url: '/releases/../index.html' },
      { ...video, url: '/releases/trailer.webm' },
      { ...video, url: '/assets/trailer.mp4' },
      { ...video, url: 'javascript:alert(1)//.mp4' },
      { ...video, poster: '/releases/poster.svg' },
      { ...video, poster: 'https://example.com/releases/poster.jpg' },
    ])
      expect(parseRelease({ ...metadata, video: invalid })).toBeNull();
  });

  it('ships earlier releases newest first, all older than the current version', () => {
    expect(parseReleaseHistory(history, metadata.version)).toEqual(history);
    expect(history.map((release) => release.version)).not.toContain(metadata.version);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('shortens only .0 patch releases in headings', () => {
    expect(formatReleaseVersion('1.0.0')).toBe('1.0');
    expect(formatReleaseVersion('0.10.0')).toBe('0.10');
    expect(formatReleaseVersion('1.0.2')).toBe('1.0.2');
    expect(formatReleaseVersion('2.0.0-beta.1')).toBe('2.0.0-beta.1');
  });

  it('rejects release history that is invalid, unordered, duplicated or not older', () => {
    const older = { ...metadata, version: '0.1.1' };
    const oldest = { ...metadata, version: '0.1.0' };
    expect(parseReleaseHistory([], '1.0.0')).toEqual([]);
    expect(parseReleaseHistory(older, '1.0.0')).toBeNull();
    expect(
      parseReleaseHistory([older, { ...oldest, url: 'http://github.com/x' }], '1.0.0'),
    ).toBeNull();
    expect(parseReleaseHistory([oldest, older], '1.0.0')).toBeNull();
    expect(parseReleaseHistory([older, older], '1.0.0')).toBeNull();
    expect(parseReleaseHistory([older], '0.1.1')).toBeNull();
    expect(parseReleaseHistory([older], '0.1.0')).toBeNull();
  });

  it('remembers dismissal per account and version, including on another browser session', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.stubGlobal('window', { localStorage: storage });
    expect(hasSeenRelease('alice', '0.2.0')).toBe(false);
    rememberRelease('alice', '0.2.0');
    expect(hasSeenRelease('alice', '0.2.0')).toBe(true);
    expect(hasSeenRelease('bob', '0.2.0')).toBe(false);
    expect(hasSeenRelease('alice', '0.3.0')).toBe(false);
    // This version was dismissed in a previous page load, outside the in-memory set.
    storage.setItem('gym-logger-release-seen:alice:0.1.0', '1');
    expect(hasSeenRelease('alice', '0.1.0')).toBe(true);
  });

  it('still dismisses for the current session when browser storage is denied', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage denied');
      },
    });
    expect(hasSeenRelease('private-user', '0.2.0')).toBe(false);
    expect(() => rememberRelease('private-user', '0.2.0')).not.toThrow();
    expect(hasSeenRelease('private-user', '0.2.0')).toBe(true);
  });

  it('reads deployed metadata without using the browser cache and ignores bad responses', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => metadata });
    vi.stubGlobal('fetch', fetch);
    expect(await fetchRelease()).toEqual(metadata);
    expect(fetch).toHaveBeenCalledWith('/release.json', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    fetch.mockResolvedValue({ ok: false });
    expect(await fetchRelease()).toBeNull();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ version: 'bad' }) });
    expect(await fetchRelease()).toBeNull();
  });

  it('aborts a stalled release request so a later reconnect can retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    vi.stubGlobal('fetch', fetch);
    const result = expect(fetchRelease()).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it('waits while loading, logging a workout, uploading videos or showing another dialog', () => {
    const ready = { loading: false, tab: 'dashboard', hasOtherDialog: false };
    expect(canShowReleaseAnnouncement(ready)).toBe(true);
    expect(canShowReleaseAnnouncement({ ...ready, tab: 'settings' })).toBe(true);
    expect(canShowReleaseAnnouncement({ ...ready, loading: true })).toBe(false);
    expect(canShowReleaseAnnouncement({ ...ready, tab: 'log' })).toBe(false);
    expect(canShowReleaseAnnouncement({ ...ready, tab: 'videos' })).toBe(false);
    expect(canShowReleaseAnnouncement({ ...ready, hasOtherDialog: true })).toBe(false);
    // Waits until the sign-in screen has finished animating away, even with data loaded.
    expect(canShowReleaseAnnouncement({ ...ready, signingIn: true })).toBe(false);
  });
});

function browser() {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const navigator = { onLine: true };
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('navigator', navigator);
  return { window, document, navigator };
}

describe('release reconnection checks', () => {
  it('finds a new release while the visible app remains open and stops polling on cleanup', async () => {
    vi.useFakeTimers();
    const { document, navigator } = browser();
    const load = vi.fn().mockResolvedValue(metadata);
    const received = vi.fn();
    const stop = watchReleases(received, load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    load.mockResolvedValue({ ...metadata, version: '99.0.0' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(received).toHaveBeenLastCalledWith({ ...metadata, version: '99.0.0' });
    expect(load).toHaveBeenCalledTimes(2);

    document.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(60_000);
    document.visibilityState = 'visible';
    navigator.onLine = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    navigator.onLine = true;
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks at startup and on focus, resume and reconnect; skips offline and hidden checks', async () => {
    const { window, document, navigator } = browser();
    const load = vi.fn().mockResolvedValue(metadata);
    const received = vi.fn();
    const stop = watchReleases(received, load);
    await Promise.resolve();
    expect(received).toHaveBeenLastCalledWith(metadata);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    navigator.onLine = false;
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    navigator.onLine = true;
    document.visibilityState = 'hidden';
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
    document.visibilityState = 'visible';
    load.mockResolvedValue({ ...metadata, version: '0.3.0' });
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(received).toHaveBeenLastCalledWith({ ...metadata, version: '0.3.0' });
    stop();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('retries after an unavailable server and ignores a response after unmount or sign-out', async () => {
    const { window } = browser();
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    const received = vi.fn();
    const stop = watchReleases(received, load);
    await Promise.resolve();
    expect(received).not.toHaveBeenCalled();
    let resolve: (value: typeof metadata) => void = () => undefined;
    load.mockImplementation(() => new Promise((done) => (resolve = done)));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    expect(load).toHaveBeenCalledTimes(2);
    stop();
    resolve(metadata);
    await Promise.resolve();
    expect(received).not.toHaveBeenCalled();
  });
});
