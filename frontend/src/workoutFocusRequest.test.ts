import { expect, it, vi } from 'vitest';
import {
  clearWorkoutFocus,
  currentWorkoutFocus,
  FOCUS_SEARCH_PAGES,
  notificationWorkoutFocus,
  onWorkoutFocusRequested,
  requestWorkoutFocus,
  workoutFocusStep,
} from './workoutFocusRequest';

it('keeps a request until it is handled, and a newer one replaces it', () => {
  const opened = vi.fn();
  const stop = onWorkoutFocusRequested(opened);
  requestWorkoutFocus({ workoutId: 'w1', workoutName: 'Push', panel: 'people' });
  const first = currentWorkoutFocus()!;
  requestWorkoutFocus({ workoutId: 'w2', workoutName: 'Legs', panel: 'comments' });
  const second = currentWorkoutFocus()!;
  expect(opened).toHaveBeenCalledTimes(2);
  clearWorkoutFocus(first.key);
  expect(currentWorkoutFocus()).toBe(second);
  clearWorkoutFocus(second.key);
  expect(currentWorkoutFocus()).toBeNull();
  // Clearing only notifies listeners; it doesn't count as a new request.
  expect(opened).toHaveBeenCalledTimes(2);
  stop();
});

it('reveals a loaded workout, searches older pages, then opens it on its own', () => {
  const focus = { workoutId: 'w9' };
  expect(workoutFocusStep(focus, { workoutIds: ['w9'], hasMore: true, pagesSearched: 0 })).toBe(
    'reveal',
  );
  expect(workoutFocusStep(focus, { workoutIds: ['w1'], hasMore: true, pagesSearched: 0 })).toBe(
    'load-more',
  );
  expect(
    workoutFocusStep(focus, {
      workoutIds: ['w1'],
      hasMore: true,
      pagesSearched: FOCUS_SEARCH_PAGES,
    }),
  ).toBe('detached');
  expect(workoutFocusStep(focus, { workoutIds: [], hasMore: false, pagesSearched: 0 })).toBe(
    'detached',
  );
});

it('opens reactions or comments for workout notices, and nothing for friend notices', () => {
  const since = '2026-11-20T10:00:00Z';
  const base = { id: 'p1', display_name: 'Sample', profile_photo_url: null, since };
  expect(
    notificationWorkoutFocus({
      kind: 'reaction',
      item: { ...base, workout_id: 'w1', workout_name: 'Push', reaction: 'fire' },
    }),
  ).toEqual({ workoutId: 'w1', workoutName: 'Push', panel: 'people', personId: 'p1' });
  expect(
    notificationWorkoutFocus({
      kind: 'comment',
      item: {
        ...base,
        notice_id: 'n1',
        kind: 'reply',
        comment_id: 'c1',
        workout_id: 'w2',
        workout_name: 'Legs',
        body: 'Nice',
        reaction: null,
      },
    }),
  ).toEqual({ workoutId: 'w2', workoutName: 'Legs', panel: 'comments', commentId: 'c1' });
  expect(notificationWorkoutFocus({ kind: 'request', item: base })).toBeNull();
});
