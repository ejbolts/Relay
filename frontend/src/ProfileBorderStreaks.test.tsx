// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileBorderPicker } from './ProfileBorderPicker';
import { streakLength, streakLines, streakSpan } from './profileBorderStreak';
import type { BorderStreak, ProfileBorder, ProfileBorders, User } from './types';

const user: User = {
  id: 'sample',
  username: 'sample',
  display_name: 'Sample Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-01T12:00:00Z',
  profile_photo_url: null,
  profile_border: null,
};

const today = new Date(2026, 10, 22, 12);

const border = (fields: Partial<ProfileBorder> & Pick<ProfileBorder, 'key' | 'name'>) => ({
  group: 'Consistency',
  rarity: 'common' as const,
  requirement: 'Log 5 workouts',
  unlocked: false,
  progress: { current: 2, target: 5, unit: 'workouts' },
  needs_sex: false,
  ...fields,
});

const streak = (fields: Partial<BorderStreak> = {}): BorderStreak => ({
  unit: 'days',
  current: 12,
  current_start: '2026-11-10',
  current_end: '2026-11-21',
  active: true,
  broken_on: null,
  best: 30,
  best_start: '2026-09-01',
  best_end: '2026-09-30',
  ...fields,
});

describe('streak wording', () => {
  it('counts days, Mondays and weeks in plain words', () => {
    expect(streakLength(1, 'days')).toBe('1 day');
    expect(streakLength(12, 'days')).toBe('12 days');
    expect(streakLength(1, 'Mondays')).toBe('1 Monday');
    expect(streakLength(8, 'Mondays')).toBe('8 Mondays');
    expect(streakLength(12, 'weeks')).toBe('12 weeks');
    expect(streakLength(1000, 'days')).toBe('1,000 days');
    expect(streakLength(3, 'fortnights')).toBe('3 fortnights');
  });

  it('spans a run as briefly as its dates allow', () => {
    expect(streakSpan('2026-11-10', '2026-11-21', today)).toBe('10–21 Nov');
    expect(streakSpan('2026-10-28', '2026-11-03', today)).toBe('28 Oct – 3 Nov');
    expect(streakSpan('2026-11-21', '2026-11-21', today)).toBe('21 Nov');
    expect(streakSpan('2025-09-01', '2025-09-30', today)).toBe('1–30 Sep 2025');
    expect(streakSpan('2025-10-28', '2025-11-03', today)).toBe('28 Oct – 3 Nov 2025');
    expect(streakSpan('2025-12-29', '2026-01-04', today)).toBe('29 Dec 2025 – 4 Jan 2026');
    expect(streakSpan('2026-11-21', null, today)).toBe('21 Nov');
    expect(streakSpan(null, undefined, today)).toBeNull();
  });
});

describe('streakLines', () => {
  const lines = (value: BorderStreak) =>
    streakLines(value, today).map(({ label, length, dates }) => [label, length, dates]);

  it('shows the run going now and the best one', () => {
    expect(lines(streak())).toEqual([
      ['Current', '12 days', '10–21 Nov'],
      ['Best', '30 days', '1–30 Sep'],
    ]);
  });

  it('says when the latest run ended instead of a current line', () => {
    expect(lines(streak({ active: false, broken_on: '2026-11-22' }))).toEqual([
      ['Streak ended', null, '22 Nov'],
      ['Best', '30 days', '1–30 Sep'],
    ]);
    expect(lines(streak({ active: false, broken_on: null }))[0]).toEqual([
      'Streak ended',
      null,
      null,
    ]);
  });

  it('reads Mondays and weeks naturally', () => {
    expect(
      lines(
        streak({
          unit: 'Mondays',
          current: 8,
          current_start: '2026-09-28',
          current_end: '2026-11-16',
          best: 10,
          best_start: '2025-03-03',
          best_end: '2025-05-05',
        }),
      ),
    ).toEqual([
      ['Current', '8 Mondays', '28 Sep – 16 Nov'],
      ['Best', '10 Mondays', '3 Mar – 5 May 2025'],
    ]);
    expect(lines(streak({ unit: 'weeks', current: 1, best: 1 }))).toEqual([
      ['Current', '1 week', '10–21 Nov'],
      ['Best', '1 week', '1–30 Sep'],
    ]);
  });

  it('shows the best run once when it is the one going now', () => {
    const now = streak({ best: 12, best_start: '2026-11-10', best_end: '2026-11-21' });
    expect(lines(now)).toEqual([['Current', '12 days', '10–21 Nov']]);
  });

  it('has nothing to say before the first run', () => {
    const none = streak({
      current: 0,
      current_start: null,
      current_end: null,
      active: false,
      best: 0,
      best_start: null,
      best_end: null,
    });
    expect(lines(none)).toEqual([]);
  });

  it('leaves out dates the server did not send', () => {
    const bare = { unit: 'days', current: 4, active: true, best: 9 } as BorderStreak;
    expect(lines(bare)).toEqual([
      ['Current', '4 days', null],
      ['Best', '9 days', null],
    ]);
  });
});

let root: Root;
let container: HTMLDivElement;

async function open(loaded: ProfileBorders) {
  vi.spyOn(api, 'profileBorders').mockResolvedValue(loaded);
  await act(async () =>
    root.render(
      <ProfileBorderPicker user={user} onSaved={() => {}} onClose={() => {}} onSetSex={() => {}} />,
    ),
  );
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.border-picker')!;
const tile = (name: string) =>
  [...dialog().querySelectorAll<HTMLButtonElement>('.border-tile')].find(
    (item) => item.querySelector('.border-tile-name')?.textContent === name,
  )!;
const preview = () => dialog().querySelector('.border-preview-copy')!;
const streakText = () =>
  [...preview().querySelectorAll('.border-streak li')].map((item) => item.textContent);
const press = (element: Element) =>
  act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(today);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const sevenStraight = border({
  key: 'seven-straight',
  name: 'Seven Straight',
  requirement: 'Log on 7 days in a row',
  progress: { current: 0, target: 7, unit: 'days' },
});

describe('streak borders in the picker', () => {
  it('lists the current and best runs under a locked streak border’s progress', async () => {
    await open({
      selected: null,
      sex: null,
      borders: [
        border({
          key: 'locked-in',
          name: 'Locked In',
          requirement: 'Log on 50 days in a row',
          progress: { current: 12, target: 50, unit: 'days' },
          streak: streak(),
        }),
      ],
    });
    const bar = preview().querySelector('[role=progressbar]')!;
    expect(bar.getAttribute('aria-valuetext')).toBe('12 / 50 days');
    expect(preview().querySelector('.border-progress .border-streak')).not.toBeNull();
    expect(streakText()).toEqual(['Current 12 days · 10–21 Nov', 'Best 30 days · 1–30 Sep']);
    expect(
      [...preview().querySelectorAll('.border-streak li > span')].map((item) => item.textContent),
    ).toEqual(['10–21 Nov', '1–30 Sep']);
  });

  it('says a broken streak ended, and reads Mondays naturally', async () => {
    await open({
      selected: null,
      sex: null,
      borders: [
        border({
          key: 'monday-club',
          name: 'Never Miss a Monday',
          rarity: 'rare',
          requirement: 'Train on 8 Mondays in a row',
          progress: { current: 0, target: 8, unit: 'Mondays' },
          streak: streak({
            unit: 'Mondays',
            current: 5,
            current_start: '2026-09-21',
            current_end: '2026-10-19',
            active: false,
            broken_on: '2026-10-26',
            best: 5,
            best_start: '2026-09-21',
            best_end: '2026-10-19',
          }),
        }),
      ],
    });
    expect(streakText()).toEqual(['Streak ended 26 Oct', 'Best 5 Mondays · 21 Sep – 19 Oct']);
  });

  it('adds nothing for a streak not yet started, or a border without a streak', async () => {
    await open({
      selected: null,
      sex: null,
      borders: [
        {
          ...sevenStraight,
          streak: streak({
            current: 0,
            current_start: null,
            current_end: null,
            active: false,
            best: 0,
            best_start: null,
            best_end: null,
          }),
        },
        border({ key: 'regular', name: 'Regular', requirement: 'Log 50 workouts' }),
      ],
    });
    expect(preview().querySelector('[role=progressbar]')).not.toBeNull();
    expect(streakText()).toEqual([]);
    await press(tile('Regular'));
    expect(preview().querySelector('[role=progressbar]')).not.toBeNull();
    expect(preview().querySelector('.border-streak')).toBeNull();
  });
});

describe('progress on locked borders', () => {
  const locked: ProfileBorder[] = [
    border({
      key: 'bench-club-1',
      name: 'Bench Club I',
      group: 'Strength',
      requirement: 'Bench press 60 kg',
      progress: { current: 45, target: 60, unit: 'kg' },
      family: 'bench',
      tier: 1,
    }),
    border({
      key: 'road-runner',
      name: 'Road Runner',
      group: 'Cardio',
      requirement: 'Run 100 km',
      progress: { current: 25, target: 100, unit: 'km' },
    }),
    border({
      key: 'record-breaker',
      name: 'Record Breaker',
      group: 'Records',
      requirement: 'Set 10 PRs',
      progress: { current: 3, target: 10, unit: 'PRs' },
    }),
    border({
      key: 'christmas-2026',
      name: 'Christmas 2026',
      group: 'Events',
      requirement: 'Train on 12 days in December 2026',
      progress: { current: 0, target: 12, unit: 'days' },
      kind: 'event',
      status: 'upcoming',
      starts_on: '2026-12-01',
      ends_on: '2026-12-31',
      days_left: 9,
    }),
    border({
      key: 'tonnage',
      name: 'Whale Lifter',
      group: 'Volume',
      requirement: 'Lift 100,000 kg in total',
      progress: { current: 40000, target: 100000, unit: 'kg' },
    }),
    { ...sevenStraight, progress: { current: 3, target: 7, unit: 'days' } },
  ];
  const all: ProfileBorders = {
    selected: null,
    sex: 'male',
    borders: [
      border({ key: 'first-steps', name: 'First Steps', unlocked: true }),
      ...locked,
      border({
        key: 'squat-club',
        name: 'Squat Club',
        group: 'Strength',
        requirement: 'Squat 100 kg (men) or 60 kg (women)',
        progress: null,
        needs_sex: true,
      }),
    ],
  };

  it('shows the progress bar in the preview for every locked border with progress', async () => {
    await open(all);
    for (const item of locked) {
      await press(tile(item.name));
      const bar = preview().querySelector('[role=progressbar]');
      expect(bar, item.name).not.toBeNull();
      expect(bar?.getAttribute('aria-label')).toBe(`${item.name} progress`);
    }
  });

  it('runs a thin progress line along each locked tile', async () => {
    await open(all);
    const width = (name: string) =>
      tile(name).querySelector<HTMLElement>('.border-tile-progress > span')?.style.width;
    expect(width('Bench Club I')).toBe('75%');
    expect(width('Road Runner')).toBe('25%');
    expect(width('Record Breaker')).toBe('30%');
    expect(width('Christmas 2026')).toBe('0%');
    expect(width('Whale Lifter')).toBe('40%');
    expect(width('Seven Straight')).toBe('42.9%');
    expect(tile('Road Runner').querySelector('.border-tile-progress')?.textContent).toBe('');
    expect(
      tile('Road Runner').querySelector('.border-tile-progress')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(tile('First Steps').querySelector('.border-tile-progress')).toBeNull();
    expect(tile('Squat Club').querySelector('.border-tile-progress')).toBeNull();
  });

  it('drops the line once a family has an earned tier on show', async () => {
    await open({
      selected: null,
      sex: 'male',
      borders: [
        { ...locked[0], unlocked: true, progress: { current: 65, target: 60, unit: 'kg' } },
        border({
          ...locked[0],
          key: 'bench-club-2',
          name: 'Bench Club II',
          progress: { current: 65, target: 80, unit: 'kg' },
          tier: 2,
        }),
      ],
    });
    expect(tile('Bench Club I').querySelector('.border-tile-progress')).toBeNull();
  });
});
