// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';

let root: Root;
let container: HTMLDivElement;
let play: ReturnType<typeof vi.fn>;
const video = metadata.video!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  play = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function reducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }));
}

async function open() {
  await act(async () => root.render(<ReleaseAnnouncement release={metadata} onClose={vi.fn()} />));
  return document.querySelector<HTMLVideoElement>('.release-trailer video');
}

it.each([false, true])('waits for Play at half volume with reduced motion %s', async (reduce) => {
  reducedMotion(reduce);
  const element = await open();
  expect(element).not.toBeNull();
  expect(element!.getAttribute('src')).toBe(video.url);
  expect(element!.getAttribute('poster')).toBe(video.poster);
  expect(element!.getAttribute('aria-label')).toBe(video.alt);
  expect(element!.muted).toBe(false);
  expect(element!.hasAttribute('muted')).toBe(false);
  expect(element!.volume).toBe(0.5);
  expect(element!.hasAttribute('playsinline')).toBe(true);
  expect(element!.loop).toBe(true);
  expect(element!.controls).toBe(true);
  expect(element!.autoplay).toBe(false);
  expect(element!.getAttribute('preload')).toBe('metadata');
  expect(play).not.toHaveBeenCalled();

  const body = document.querySelector('.release-announcement-body')!;
  const order = [...body.children].map((child) => child.className || child.tagName);
  expect(order.indexOf('release-trailer')).toBe(order.indexOf('release-date') + 1);
  expect(body.querySelector('.release-trailer + p')?.textContent).toBe(metadata.summary);
});

it('preserves the viewer volume and mute choices when the announcement rerenders', async () => {
  const element = await open();
  element!.volume = 0.2;
  element!.muted = true;
  expect(await open()).toBe(element);
  expect(element!.volume).toBe(0.2);
  expect(element!.muted).toBe(true);
  expect(play).not.toHaveBeenCalled();
});

it('shows the poster with the same description when the video cannot play', async () => {
  reducedMotion(false);
  const element = await open();
  await act(async () => element!.dispatchEvent(new Event('error')));
  expect(document.querySelector('.release-trailer video')).toBeNull();
  const poster = document.querySelector<HTMLImageElement>('.release-trailer img');
  expect(poster?.getAttribute('src')).toBe(video.poster);
  expect(poster?.alt).toBe(video.alt);
  expect(document.body.textContent).toContain(metadata.summary);
});
