// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainedWithPill } from './TrainedWithPill';
import type { TrainedWith } from './trainTogether';

const SAM: TrainedWith = {
  user_id: 'u-sam',
  display_name: 'Sam',
  username: 'sam',
  photo_url: '/api/photos/sam.jpg',
};
const PRIYA: TrainedWith = {
  user_id: 'u-priya',
  display_name: 'Priya',
  username: 'priya',
  photo_url: null,
};
const VIEWER: TrainedWith = {
  user_id: 'u-viewer',
  display_name: 'Alex',
  username: 'alex',
  photo_url: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('TrainedWithPill', () => {
  it('renders nothing when trainedWith is empty and count is 0', async () => {
    await act(async () =>
      root.render(<TrainedWithPill trainedWith={[]} trainedWithCount={0} viewerId="u-viewer" />),
    );
    expect(container.textContent).toBe('');
  });

  it('renders partner photo, overlapping avatars, and exact shared wording', async () => {
    await act(async () =>
      root.render(
        <TrainedWithPill trainedWith={[SAM, PRIYA]} trainedWithCount={2} viewerId="u-viewer" />,
      ),
    );
    expect(container.textContent).toContain('with Sam & Priya');
    expect(container.querySelectorAll('.tt-avatar')).toHaveLength(2);
    expect(container.querySelector<HTMLImageElement>('.tt-avatar img')?.getAttribute('src')).toBe(
      '/api/photos/sam.jpg',
    );
  });

  it('renders You & partner when viewer is included, and counts hidden partners', async () => {
    await act(async () =>
      root.render(
        <TrainedWithPill trainedWith={[VIEWER, PRIYA]} trainedWithCount={2} viewerId="u-viewer" />,
      ),
    );
    expect(container.textContent).toContain('with You & Priya');

    await act(async () =>
      root.render(<TrainedWithPill trainedWith={[SAM]} trainedWithCount={2} viewerId="u-viewer" />),
    );
    expect(container.textContent).toContain('with Sam & 1 other');

    await act(async () =>
      root.render(<TrainedWithPill trainedWith={[]} trainedWithCount={2} viewerId="u-viewer" />),
    );
    expect(container.textContent).toContain('with 2 others');
  });
});
