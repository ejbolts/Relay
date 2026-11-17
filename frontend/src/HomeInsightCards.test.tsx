// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import {
  BodyGoalCard,
  CardioDistanceCard,
  CardioDistanceSettingsForm,
  ExerciseSpotlightCard,
  ExerciseSpotlightSettingsForm,
  FriendsWeekCard,
  MuscleFreshnessCard,
} from './HomeInsightCards';
import { defaultHomeLayout, HOME_SECTIONS, OPTIONAL_HOME_SECTIONS } from './homeLayout';
import type {
  BodyMeasurement,
  BodyWeightGoal,
  CardioOverview,
  CardioSession,
  ExerciseLibrarySummary,
  FriendActivity,
  FriendConnections,
  TrackedWorkout,
} from './types';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}
const text = () => host.textContent ?? '';
function button(label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(found, label).toBeTruthy();
  return found!;
}

it('adds the new sections hidden, so Home looks the same until one is added', () => {
  const layout = defaultHomeLayout();
  expect(OPTIONAL_HOME_SECTIONS).toEqual([
    'body-goal',
    'exercise-spotlight',
    'muscle-freshness',
    'cardio-distance',
    'friends-week',
  ]);
  for (const id of OPTIONAL_HOME_SECTIONS) {
    expect(layout.order).toContain(id);
    expect(layout.hidden).toContain(id);
    expect(HOME_SECTIONS.find((section) => section.id === id)?.title).toBeTruthy();
  }
  expect(layout.settings?.exercise_spotlight).toEqual({ exercise_id: null });
  expect(layout.settings?.cardio_distance).toEqual({ period: 'month' });
});

describe('Body goal', () => {
  const goal: BodyWeightGoal = {
    id: 'g1',
    created_at: '2026-09-01T00:00:00Z',
    start_date: '2026-09-01',
    target_date: '2026-12-10',
    start_weight_kg: 90,
    target_weight_kg: 80,
    active: true,
  };
  const measurements = [
    { measurement_date: '2026-10-21', weight_kg: 84, body_fat_pct: null },
  ] as BodyMeasurement[];

  it('shows the weight, how far ahead of the line it is and the time left', async () => {
    vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue([
      { ...goal, id: 'old', active: false },
      goal,
    ]);
    const onOpenBody = vi.fn();
    await render(
      <BodyGoalCard
        measurements={measurements}
        today="2026-10-21"
        weightUnit="kg"
        onOpenBody={onOpenBody}
      />,
    );
    expect(text()).toContain('84 kg');
    expect(text()).toContain('1 kg ahead');
    expect(text()).toContain('Start 90');
    expect(text()).toContain('Goal 80 kg by');
    expect(text()).toContain('7 weeks left');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('60');
    expect(host.querySelector('.body-goal-ring')?.textContent).toContain('6of 10 kg');
    await act(async () => button('Body').click());
    expect(onOpenBody).toHaveBeenCalled();
  });

  it('asks for a goal when none is active', async () => {
    vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue([{ ...goal, active: false }]);
    await render(
      <BodyGoalCard
        measurements={measurements}
        today="2026-10-21"
        weightUnit="kg"
        onOpenBody={vi.fn()}
      />,
    );
    expect(text()).toContain('Set a body-weight goal on Body');
  });
});

describe('Exercise spotlight', () => {
  const summaries = [
    {
      exercise_id: 'bench',
      session_count: 6,
      last_date: '2026-11-16',
      latest_estimated_1rm: 112.5,
      change_kg: 3.5,
      change_percent: 3,
      trend: [
        { date: '2026-10-01', estimated_1rm: 109 },
        { date: '2026-11-16', estimated_1rm: 112.5 },
      ],
    },
    {
      exercise_id: 'squat',
      session_count: 9,
      last_date: '2026-11-15',
      latest_estimated_1rm: 140,
      change_kg: -2,
      change_percent: -1,
      trend: [],
      normalised: true,
    },
  ] as ExerciseLibrarySummary[];
  const names = new Map([
    ['bench', 'Barbell Bench Press'],
    ['squat', 'Back Squat'],
  ]);

  it('follows the most-trained lift until one is chosen, then opens its progress', async () => {
    const onOpenProgress = vi.fn();
    await render(
      <ExerciseSpotlightCard
        summaries={summaries}
        names={names}
        settings={{ exercise_id: null }}
        weightUnit="kg"
        onOpenProgress={onOpenProgress}
      />,
    );
    expect(host.querySelector('h2')?.textContent).toBe('Back Squat');
    expect(text()).toContain('≈140 kg');
    expect(text()).toContain('−2 kg');
    await render(
      <ExerciseSpotlightCard
        summaries={summaries}
        names={names}
        settings={{ exercise_id: 'bench' }}
        weightUnit="kg"
        onOpenProgress={onOpenProgress}
      />,
    );
    expect(host.querySelector('h2')?.textContent).toBe('Barbell Bench Press');
    expect(text()).toContain('112.5 kg');
    expect(text()).toContain('+3.5 kg');
    expect(host.querySelector('.insight-change')?.className).toContain('is-up');
    await act(async () => button('Progress').click());
    expect(onOpenProgress).toHaveBeenCalledWith('bench');
  });

  it('chooses the exercise in Customise', async () => {
    const onChange = vi.fn();
    await render(
      <ExerciseSpotlightSettingsForm
        options={[
          { id: 'squat', name: 'Back Squat' },
          { id: 'bench', name: 'Barbell Bench Press' },
        ]}
        value={{ exercise_id: 'missing' }}
        onChange={onChange}
      />,
    );
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((radio) => radio.parentElement?.textContent)).toEqual([
      'Most trained',
      'Back Squat',
      'Barbell Bench Press',
    ]);
    expect(radios[0].checked).toBe(true);
    await act(async () => radios[2].click());
    expect(onChange).toHaveBeenCalledWith({ exercise_id: 'bench' });
  });
});

it('shows muscle freshness with full and short labels', async () => {
  await render(
    <MuscleFreshnessCard
      muscles={[
        { muscle: 'Quadriceps', last_date: '2026-11-13', days: 4 },
        { muscle: 'Lats', last_date: '2026-11-15', days: 2 },
        { muscle: 'Pectorals', last_date: '2026-11-16', days: 1 },
        { muscle: 'Triceps', last_date: '2026-11-17', days: 0 },
      ]}
    />,
  );
  const rows = [...host.querySelectorAll('.freshness-list li')];
  expect(rows.map((row) => row.className)).toEqual([
    'is-fresh',
    'is-recovering',
    'is-recent',
    'is-recent',
  ]);
  expect(rows[0].querySelector('.insight-full-only')?.textContent).toBe('4 days');
  expect(rows[2].querySelector('.insight-full-only')?.textContent).toBe('Yesterday');
  expect(rows[2].querySelector('.insight-compact-only')?.textContent).toBe('1 d');
  expect(text()).toContain('+1 more');
  await render(<MuscleFreshnessCard muscles={[]} />);
  expect(text()).toContain('Log a workout to see which muscles are fresh.');
});

describe('Cardio distance', () => {
  const session = (date: string, activity: string, km: number | null) =>
    ({ session_date: date, activity_type: activity, distance_km: km }) as CardioSession;
  const sessions = [
    session('2026-11-02', 'Cycling', 21),
    session('2026-11-16', 'Running', 5.2),
    session('2026-11-17', 'Incline walk', 3.4),
    session('2026-11-17', 'Cycling', 18.5),
    session('2026-11-17', 'Rowing', null),
    session('2026-10-30', 'Running', 8),
  ];

  it('totals each kind of activity for the month or the week', async () => {
    vi.spyOn(api, 'cardioOverview').mockResolvedValue({ sessions } as CardioOverview);
    const props = { today: '2026-11-17', weekStartDay: 1, onOpenCardio: vi.fn() };
    await render(<CardioDistanceCard {...props} settings={{ period: 'month' }} />);
    const rows = () =>
      [...host.querySelectorAll('.distance-list li')].map((row) => [
        row.querySelector('.distance-name')?.textContent,
        row.querySelector('b')?.textContent,
        row.querySelector('.distance-sessions')?.textContent,
      ]);
    expect(text()).toContain('November');
    expect(rows()).toEqual([
      ['Cycling', '39.5 km', '2 sessions'],
      ['Walk & run', '8.6 km', '2 sessions'],
    ]);
    await render(<CardioDistanceCard {...props} settings={{ period: 'week' }} />);
    expect(text()).toContain('This week');
    expect(rows()).toEqual([
      ['Walk & run', '8.6 km', '2 sessions'],
      ['Cycling', '18.5 km', '1 session'],
    ]);
    await act(async () => button('Cardio').click());
    expect(props.onOpenCardio).toHaveBeenCalled();
  });

  it('chooses the period in Customise', async () => {
    const onChange = vi.fn();
    await render(<CardioDistanceSettingsForm value={{ period: 'month' }} onChange={onChange} />);
    const week = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (input) => input.parentElement?.textContent === 'This week',
    )!;
    await act(async () => week.click());
    expect(onChange).toHaveBeenCalledWith({ period: 'week' });
  });
});

describe('Friends this week', () => {
  const friend = (id: string, name: string, dates: string[], recent: number) =>
    ({
      id,
      display_name: name,
      profile_photo_url: null,
      training_dates: dates,
      recent_workout_count: recent,
      presence: id === 'alex' ? { online: true, last_active_at: null, workout: null } : null,
    }) as unknown as FriendActivity;
  const mine = [
    { id: 'w1', workout_date: '2026-11-16', is_sample: false, movements: [] },
  ] as unknown as TrackedWorkout[];
  const you = { display_name: 'Pat', username: 'pat', profile_photo_url: null };

  it('ranks you among your friends and opens a friend', async () => {
    vi.spyOn(api.sharing, 'friends').mockResolvedValue({
      friends: [
        friend('alex', 'Alex', ['2026-11-16', '2026-11-17'], 8),
        friend('sam', 'Sam', [], 2),
      ],
      requests: [],
      sent: [],
      blocked: [],
    } as FriendConnections);
    const onOpenFriend = vi.fn();
    await render(
      <FriendsWeekCard
        active
        you={you}
        workouts={mine}
        today="2026-11-17"
        weekStartDay={1}
        onOpenFriend={onOpenFriend}
        onOpenSocial={vi.fn()}
      />,
    );
    const rows = [...host.querySelectorAll('.week-board li')];
    expect(
      rows.map((row) =>
        ['.week-board-rank', '.week-board-name', 'b']
          .map((selector) => row.querySelector(selector)?.textContent)
          .join(' '),
      ),
    ).toEqual(['1 Alex 2 days', '2 You 1 day', '3 Sam 0 days']);
    expect(rows[0].querySelector('.presence-dot')).not.toBeNull();
    expect(rows[1].className).toBe('is-you');
    expect(host.querySelector('.week-board-summary')?.textContent).toBe(
      'Your rank2nd of 31 day behind Alex',
    );
    await act(async () => rows[0].querySelector('button')!.click());
    expect(onOpenFriend).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alex', display_name: 'Alex' }),
    );
    expect(rows[1].querySelector('button')).toBeNull();
  });

  it('asks a private account to share first', async () => {
    vi.spyOn(api.sharing, 'friends').mockResolvedValue({
      locked: true,
      friends: [],
      requests: [],
      sent: [],
      blocked: [],
    });
    const onChooseSharing = vi.fn();
    await render(
      <FriendsWeekCard
        active
        you={you}
        workouts={mine}
        today="2026-11-17"
        weekStartDay={1}
        onChooseSharing={onChooseSharing}
      />,
    );
    expect(text()).toContain('Share your profile to compare weeks with friends.');
    await act(async () => button('Share').click());
    expect(onChooseSharing).toHaveBeenCalled();
  });
});
