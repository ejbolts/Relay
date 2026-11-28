// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { SocialFeed } from './SocialFeed';
import { ToastProvider } from './Toast';
import { TrainedWithPill } from './TrainedWithPill';
import type { TrainedWith } from './trainTogether';
import type { TrackedWorkout } from './types';
import { UserContext } from './userContext';

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

  it('renders inside a real SocialFeed card with one visible and one hidden partner (finding 23)', async () => {
    const workout: TrackedWorkout = {
      id: 'feed-w1',
      name: 'Upper body',
      workout_date: '2026-11-28',
      category: 'upper',
      notes: null,
      duration_minutes: 45,
      start_time: null,
      end_time: null,
      is_sample: false,
      created_at: '2026-11-28T10:00:00Z',
      updated_at: '2026-11-28T10:00:00Z',
      trained_with: [SAM],
      trained_with_count: 2,
      movements: [],
      photos: [],
    };
    vi.spyOn(api.sharing, 'timeline').mockResolvedValue({
      items: [
        {
          member: {
            id: 'u-alex',
            display_name: 'Alex',
            profile_photo_url: null,
            is_you: false,
          },
          workout,
          reactions: { counts: [], yours: null, comment_count: 0 },
          record_count: 0,
        },
      ],
      has_more: false,
    });

    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider
            value={{
              user: {
                id: 'u-viewer',
                username: 'viewer',
                display_name: 'Viewer',
                is_admin: false,
              } as never,
              updateUser: vi.fn(),
              signOut: vi.fn(),
              accountDeleted: vi.fn(),
            }}
          >
            <SocialFeed
              active
              friends={[
                {
                  id: 'u-alex',
                  display_name: 'Alex',
                  profile_photo_url: null,
                  since: '2026-10-01',
                  latest: null,
                  recent_workout_count: 1,
                  training_dates: [],
                },
              ]}
              today="2026-11-28"
              onOpenProfile={vi.fn()}
              onOpenOwnProfile={vi.fn()}
              onOpenFind={vi.fn()}
              onChooseSharing={vi.fn()}
            />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const card = container.querySelector('.feed-card article');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.tt-with-pill.is-feed')?.textContent).toContain(
      'with Sam & 1 other',
    );
  });
});
