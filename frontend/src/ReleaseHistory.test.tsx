// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import history from '../release-history.json';
import metadata from '../release.json';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { formatReleaseDate } from './releaseMetadata';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  // jsdom has no media playback; the release trailer starts muted on open.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
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

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!match) throw new Error(`No button named ${name}`);
  return match;
}

function versionToggle(version: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('.release-history-toggle')].find(
    (candidate) => candidate.querySelector('.release-history-version')?.textContent === version,
  );
  if (!(match instanceof HTMLButtonElement)) throw new Error(`No toggle for ${version}`);
  return match;
}

it('compacts the current notes and expands earlier versions independently', async () => {
  await act(async () =>
    root.render(<ReleaseAnnouncement release={metadata} history={history} onClose={vi.fn()} />),
  );
  const current = document.querySelector('.release-current-details')!;
  expect(current.querySelectorAll('li')).toHaveLength(metadata.changes.length);
  expect(document.body.textContent).toContain(metadata.summary);

  const toggle = button('Hide changes');
  const showChanges = `Show ${metadata.changes.length} ${metadata.changes.length === 1 ? 'change' : 'changes'}`;
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.textContent).toBe(showChanges);
  expect(current.hasAttribute('hidden')).toBe(true);
  expect(current.querySelectorAll('li')).toHaveLength(0);
  expect(document.body.textContent).toContain(metadata.summary);

  const items = document.querySelectorAll('.release-history-item');
  expect(items).toHaveLength(history.length);
  expect([...items].map((item) => item.querySelector('h4')?.textContent)).toEqual(
    history.map(
      (release) => `${release.version}${release.title}${formatReleaseDate(release.date)}`,
    ),
  );
  expect(
    document.querySelector('.release-announcement-body > time')?.getAttribute('datetime'),
  ).toBe(metadata.date);
  expect([...items].map((item) => item.querySelector('time')?.getAttribute('datetime'))).toEqual(
    history.map((release) => release.date),
  );
  expect(document.querySelectorAll('.release-history-details:not([hidden])')).toHaveLength(0);

  const [latest, older] = history;
  const latestToggle = versionToggle(latest.version);
  await act(async () => latestToggle.click());
  expect(latestToggle.getAttribute('aria-expanded')).toBe('true');
  const details = document.getElementById(latestToggle.getAttribute('aria-controls')!)!;
  expect(details.hidden).toBe(false);
  expect(latestToggle.querySelector('time')?.textContent).toBe(formatReleaseDate(latest.date));
  expect(details.textContent).toContain(latest.summary);
  expect(details.querySelectorAll('li')).toHaveLength(latest.changes.length);
  expect(
    [...details.querySelectorAll('a')].some((link) => link.getAttribute('href') === latest.url),
  ).toBe(true);
  expect(details.textContent).toContain(`Read ${latest.version} notes on GitHub`);

  const olderToggle = versionToggle(older.version);
  expect(olderToggle.getAttribute('aria-expanded')).toBe('false');

  await act(async () => button(showChanges).click());
  expect(current.querySelectorAll('li')).toHaveLength(metadata.changes.length);
  await act(async () => latestToggle.click());
  expect(details.hidden).toBe(true);
});

it('omits the earlier versions section when there is no history', async () => {
  await act(async () => root.render(<ReleaseAnnouncement release={metadata} onClose={vi.fn()} />));
  expect(document.querySelector('.release-history')).toBeNull();
});

it('shows feature media before change bullets for current and expanded earlier releases', async () => {
  const image = { url: 'https://example.com/feature.png', alt: 'Feature preview' };
  await act(async () =>
    root.render(
      <ReleaseAnnouncement
        release={{ ...metadata, highlights: undefined, image }}
        history={[{ ...history[0], highlights: undefined, image }]}
        onClose={vi.fn()}
      />,
    ),
  );
  const current = document.querySelector('.release-current-details')!;
  expect(current.querySelector('ul')?.previousElementSibling).toBe(current.querySelector('figure'));
  await act(async () => versionToggle(history[0].version).click());
  const earlier = document.querySelector('.release-history-details')!;
  expect(earlier.querySelector('ul')?.previousElementSibling).toBe(earlier.querySelector('figure'));
});

it('shows the ordered showcase once before changes and keeps captions when a preview fails', async () => {
  const image = { url: 'https://example.com/feature.png', alt: 'Feature preview' };
  const illustrated = {
    ...metadata,
    image,
    highlights: [
      { title: 'First feature', description: 'First feature details', image },
      {
        title: 'Second feature',
        description: 'Second feature details',
        image: { url: 'https://example.com/second.png', alt: 'Second preview' },
      },
    ],
  };
  await act(async () =>
    root.render(<ReleaseAnnouncement release={illustrated} onClose={vi.fn()} />),
  );
  const current = document.querySelector('.release-current-details')!;
  const showcase = current.querySelector('.release-showcase')!;
  const cards = [...showcase.querySelectorAll('figure')];
  expect(cards.map((card) => card.querySelector('h4')?.textContent)).toEqual(
    illustrated.highlights.map((highlight) => highlight.title),
  );
  expect(current.querySelectorAll('img')).toHaveLength(illustrated.highlights.length);
  expect(showcase.nextElementSibling).toBe(current.querySelector('ul'));
  expect(cards[0].querySelector('a')?.getAttribute('href')).toBe(illustrated.image.url);
  expect(cards[0].querySelector('a')?.getAttribute('aria-label')).toContain('full size');

  await act(async () => cards[0].querySelector('img')!.dispatchEvent(new Event('error')));
  expect(cards[0].querySelector('img')).toBeNull();
  expect(cards[0].querySelector('h4')?.textContent).toBe(illustrated.highlights[0].title);
  expect(cards[0].textContent).toContain(illustrated.highlights[0].description);
  expect(current.querySelectorAll('li')).toHaveLength(metadata.changes.length);
});
