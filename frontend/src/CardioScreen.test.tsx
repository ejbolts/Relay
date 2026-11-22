// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardioScreen } from './App';
import { api } from './api';
import { createToastRoot, toastButton, toastElement, toastText } from './toastTestUtils';
import type { CardioOverview, CardioSession, Exercise } from './types';

const session = (overrides: Partial<CardioSession> = {}): CardioSession => ({
  id: 'ride',
  session_date: '2026-10-24',
  activity_type: 'Cycling',
  duration_minutes: 30,
  calories_kcal: 300,
  average_heart_rate_bpm: 140,
  distance_km: 10,
  average_speed_kph: 20,
  incline_percent: null,
  average_mets: 6,
  estimated_mets: 7.4,
  estimated_elevation_gain_m: 150,
  intensity: null,
  zone: 'Zone 2',
  qualifies_zone2: true,
  notes: null,
  source_workout_id: null,
  created_at: '',
  updated_at: '',
  ...overrides,
});
const overview: CardioOverview = {
  preferences: {
    preferred_weight_unit: 'kg',
    week_start: 'monday',
    zone2_goal_minutes: 150,
    weekly_muscle_set_goal: 10,
  },
  current_week: {
    week_start: '2026-10-19',
    week_end: '2026-10-25',
    goal_minutes: 150,
    completed_minutes: 60,
    remaining_minutes: 90,
    percentage: 40,
    complete: false,
  },
  previous_weeks: [],
  sessions: [
    session(),
    session({
      id: 'walk',
      activity_type: 'Walking',
      duration_minutes: 20,
      session_date: '2026-10-23',
      workout_context: 'workout_plus_cardio',
      source_workout_id: 'workout',
      average_mets: null,
      elevation_gain_m: 90,
    }),
    session({ id: 'last-week', session_date: '2026-10-17', duration_minutes: 40 }),
  ],
  energy_periods: ['week', 'month', '3m', '6m', 'year', 'all'].map((period) => ({
    period,
    start_date: period === 'week' ? '2026-10-19' : '2026-10-01',
    end_date: '2026-10-24',
    total_sessions: 3,
    logged_sessions: 3,
    calories_kcal: period === 'week' ? 600 : 900,
    average_heart_rate_bpm: 140,
    distance_km: 30,
    average_speed_kph: 20,
    average_incline_percent: null,
    average_mets: 6,
    elevation_gain_m: 240,
    elevation_sessions: 2,
    heart_rate_sessions: 3,
    distance_sessions: 3,
    speed_sessions: 3,
    incline_sessions: 0,
    mets_sessions: 3,
    previous_start_date: null,
    previous_end_date: null,
    previous_calories_kcal: null,
    previous_average_heart_rate_bpm: null,
    previous_distance_km: null,
    previous_average_speed_kph: null,
    previous_average_incline_percent: null,
    previous_average_mets: null,
    previous_elevation_gain_m: null,
  })) as CardioOverview['energy_periods'],
};

let container: HTMLDivElement;
let root: Root;
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
const named = (name: string) =>
  [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === name)!;
const field = (label: string) =>
  [...container.querySelectorAll('label')]
    .find((item) => item.textContent?.trim() === label)!
    .querySelector('input')!;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00'));
  vi.spyOn(api, 'cardioOverview').mockResolvedValue(structuredClone(overview));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
  await act(async () =>
    root.render(
      <CardioScreen
        dataRevision={null}
        exercises={[{ id: 'bike', name: 'Cycling', kind: 'cardio' } as Exercise]}
        onDataChange={vi.fn()}
        onOpenWorkout={vi.fn()}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cardio weekly trend screen', () => {
  it('automatically classifies saved cardio without showing a zone popup', async () => {
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      cardio_preferences: {
        heart_rate_zones: [{ zone: 2, min_bpm: 110, max_bpm: 139 }],
        goals: [{ zone: 2, minutes: 150 }],
      },
      goal_weeks: [
        {
          zone: 2,
          goal_minutes: 150,
          completed_minutes: 30,
          remaining_minutes: 120,
          complete: false,
        },
      ],
    });
    await act(async () =>
      root.render(
        <CardioScreen
          dataRevision="zones"
          exercises={[{ id: 'bike', name: 'Cycling', kind: 'cardio' } as Exercise]}
          onDataChange={vi.fn().mockResolvedValue(undefined)}
          onOpenWorkout={vi.fn()}
        />,
      ),
    );
    const create = vi
      .spyOn(api, 'createCardio')
      .mockResolvedValue(session({ zone: 'Zone 2', average_heart_rate_bpm: 120 }));
    await click(named('Log session'));
    expect(
      [...container.querySelectorAll('label')].some(
        (label) => label.textContent?.trim() === 'Zone',
      ),
    ).toBe(false);
    await click(named('Add cardio session'));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ zone: null, qualifies_zone2: false }),
    );
    expect(toastText()).toBe('Workout saved');
    expect(document.querySelector('dialog, [aria-modal="true"]')).toBeNull();
    expect(toastButton('Share card')).toBeDefined();
    await click(container.querySelector('[aria-label="Edit heart-rate zones and goals"]')!);
    expect(document.querySelector('dialog')!.textContent).toContain('Personal ranges (bpm)');
  });
  it('offers the share card from the saved toast, or just confirms when the reminder is off', async () => {
    vi.spyOn(api, 'createCardio').mockResolvedValue(session({ id: 'new-ride' }));
    await click(named('Log session'));
    await click(named('Add cardio session'));
    await click(toastButton('Share card')!);
    expect(toastElement()).toBeNull();
    expect(document.querySelector('dialog h2')?.textContent).toBe('Share workout');
    await click(document.querySelector('dialog [aria-label^="Close"]')!);

    window.localStorage.setItem('relay-workout-share-reminder:device', 'off');
    window.dispatchEvent(new StorageEvent('storage'));
    await click(named('Log session'));
    await click(named('Add cardio session'));
    expect(toastText()).toBe('Cardio saved');
    expect(toastElement()!.querySelector('.toast-action')).toBeNull();
    window.localStorage.removeItem('relay-workout-share-reminder:device');
  });
  it('celebrates the cardio PRs a logged session sets, one per line', async () => {
    vi.spyOn(api, 'createCardio').mockResolvedValue(
      session({ id: 'new-ride', source_workout_id: 'ride-workout' }),
    );
    const records = vi.spyOn(api, 'listPersonalRecords').mockResolvedValue([
      {
        id: 'ride-distance',
        exercise_id: 'bike',
        workout_id: 'ride-workout',
        set_id: 'set',
        achieved_date: '2026-10-24',
        record_type: 'distance',
        value: 42,
        unit: 'km',
        normalized_weight: null,
        formula: null,
        exercise_name: 'Cycling',
      },
      {
        id: 'ride-40',
        exercise_id: 'bike',
        workout_id: 'ride-workout',
        set_id: 'set',
        achieved_date: '2026-10-24',
        record_type: 'pace',
        value: 4800,
        unit: 'seconds',
        normalized_weight: 40,
        formula: null,
        exercise_name: 'Cycling',
      },
    ]);
    await click(named('Log session'));
    await click(named('Add cardio session'));
    expect(records).toHaveBeenCalledWith({ workoutId: 'ride-workout' });
    const toast = toastElement()!;
    expect(toast.dataset.variant).toBe('celebrate');
    expect([...toast.querySelectorAll('.toast-line')].map((line) => line.textContent)).toEqual([
      'All-time distance PRCycling · 42 km',
      'All-time fastest 40 kmCycling · 1:20:00',
    ]);
    expect(toastButton('Share card')).toBeDefined();
  });
  it('confirms an edited session in a toast', async () => {
    const update = vi.spyOn(api, 'updateCardio').mockResolvedValue(session());
    await click(named('Edit'));
    await click(named('Save changes'));
    expect(update).toHaveBeenCalledOnce();
    expect(toastText()).toBe('Cardio saved');
  });
  it.each(['en-AU', 'en-US'])(
    'switches metrics and selected weeks together, with the current week as the default (%s)',
    async (locale) => {
      const toLocaleDateString = Date.prototype.toLocaleDateString;
      vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
        this: Date,
        locales,
        options,
      ) {
        return toLocaleDateString.call(this, locales ?? locale, options);
      });
      const hero = () => container.querySelector('.cardio-week-value')!.textContent;
      expect(hero()).toContain('50 min');
      expect(named('MET-min')).toBeUndefined();
      expect(container.textContent).not.toMatch(/METs|MET-min/);
      await click(named('Elevation'));
      // The ride's climb is estimated; the walk's 90 m was logged.
      expect(hero()).toContain('240 m');
      const previousWeekDate = new Date('2026-10-12T12:00:00').toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      });
      const previousWeek = container.querySelector(
        `[aria-label="Week of ${previousWeekDate}: 150 m"]`,
      );
      expect(previousWeek).not.toBeNull();
      expect(previousWeek!.getAttribute('aria-pressed')).toBe('false');
      await click(previousWeek!);
      expect(previousWeek!.getAttribute('aria-pressed')).toBe('true');
      expect(hero()).toContain('150 m');
      expect(container.querySelector('.cardio-week-comparison')!.textContent).toContain(
        '1 session',
      );
      await click(named('Calories'));
      expect(hero()).toContain('300 kcal burnt');
    },
  );

  it('splits distance by activity group and switches between groups', async () => {
    const hero = () => container.querySelector('.cardio-week-value')!.textContent;
    const comparison = () => container.querySelector('.cardio-week-comparison')!.textContent;
    const distanceTile = container.querySelectorAll('.cardio-week-stats > div')[2];
    expect(distanceTile.querySelector('dt')!.textContent).toBe('Cycling');
    expect(distanceTile.querySelector('dd')!.textContent).toBe('10 km');
    expect(container.querySelector('.cardio-distance-groups')).toBeNull();
    await click(named('Distance'));
    const groups = container.querySelector('[aria-label="Distance activity"]')!;
    expect([...groups.querySelectorAll('button')].map((item) => item.textContent)).toEqual([
      'Cycling',
      'Walk & run',
      'Rowing',
    ]);
    expect(hero()).toContain('10 km');
    expect(comparison()).toContain('1 session');
    expect(comparison()).toContain('No change');
    await click(named('Walk & run'));
    expect(named('Walk & run').getAttribute('aria-pressed')).toBe('true');
    expect(hero()).toContain('10 km');
    expect(comparison()).toBe('1 session');
    await click(named('Rowing'));
    expect(named('Rowing').getAttribute('aria-pressed')).toBe('true');
    expect(hero()).toContain('—');
    expect(comparison()).toBe('0 sessions');
    await click(named('Walk & run'));
    await click(named('Time'));
    expect(distanceTile.querySelector('dt')!.textContent).toBe('Walk & run');
  });

  it('opens all stats, switches periods and explains MET in a dismissible popup', async () => {
    await click(container.querySelector('.cardio-all-stats > summary')!);
    expect(container.querySelector('details.cardio-all-stats')!.hasAttribute('open')).toBe(true);
    await click(named('Month'));
    expect(container.querySelector('.cardio-progress-grid')!.textContent).toContain('900 kcal');
    await click(container.querySelector('[aria-label="About cardio progress"]')!);
    expect(document.querySelector('dialog')!.textContent).toContain('not measured fat loss');
    expect(document.querySelector('dialog')!.textContent).toContain('no MET logged');
    expect(document.body.textContent).not.toMatch(/METs|MET-min/);
    await click(document.querySelector('[aria-label="Close Cardio progress"]')!);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('groups filtered history by week and keeps session editing inside expandable rows', async () => {
    expect(container.querySelectorAll('.cardio-history-week')).toHaveLength(2);
    await click(named('With workout'));
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(1);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('20 min');
    await click(container.querySelector('.cardio-history-row > summary')!);
    // The walk logged its elevation; its MET was left blank, so it is estimated.
    expect(container.querySelector('.cardio-session-performance')!.textContent).toContain(
      '90\u00A0m elevation · ≈\u00A07.4\u00A0MET avg',
    );
    await click(named('Edit metrics'));
    expect(document.querySelector('dialog')!.textContent).toContain('Cardio metrics');
  });

  it('separates history days while keeping sessions on the same day together', async () => {
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      sessions: [
        session(),
        session({ id: 'same-day', activity_type: 'Incline walking' }),
        session({ id: 'previous-day', session_date: '2026-10-23' }),
      ],
    });
    await act(async () =>
      root.render(
        <CardioScreen
          dataRevision="day-dividers"
          exercises={[]}
          onDataChange={vi.fn()}
          onOpenWorkout={vi.fn()}
        />,
      ),
    );
    const rows = container.querySelectorAll('.cardio-history-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].classList.contains('cardio-history-new-day')).toBe(false);
    expect(rows[1].classList.contains('cardio-history-new-day')).toBe(false);
    expect(rows[2].classList.contains('cardio-history-new-day')).toBe(true);
  });

  it('opens the screenshot picker and previews imported values without saving', async () => {
    const scan = vi.spyOn(api, 'scanCardioScreenshot').mockResolvedValue({
      session_date: '2026-10-22',
      activity_type: 'Cycling',
      duration_minutes: 45,
      calories_kcal: 410,
      average_heart_rate_bpm: 135,
      distance_km: 15,
      average_speed_kph: 20,
      elevation_gain_m: 180,
      fields_found: ['duration', 'calories'],
      warning: null,
    });
    const save = vi.spyOn(api, 'createCardio');
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await click(named('Import screenshot'));
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(picker).toHaveBeenCalledOnce();
    const upload = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['sample image'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(upload, 'files', { value: [file] });
    await act(async () => upload.dispatchEvent(new Event('change', { bubbles: true })));
    expect(scan).toHaveBeenCalledWith(file);
    expect(field('Minutes').value).toBe('45');
    expect(field('Calories burned (kcal)').value).toBe('410');
    expect(field('Elevation gain (m)').value).toBe('180');
    expect(field('Average MET').placeholder).toBe('Auto');
    expect(save).not.toHaveBeenCalled();
    expect(named('Cancel').className).toContain('pulse-button secondary');
    await click(named('Cancel'));
    expect(named('Log session')).toBeTruthy();
    await click(named('Log session'));
    expect(field('Calories burned (kcal)').value).toBe('');
  });

  it('pages history by whole weeks and resets pagination on filtering', async () => {
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      sessions: [
        // Seven sessions in one week stay on one page.
        ...Array.from({ length: 7 }, (_, index) => session({ id: `ride-${index}` })),
        session({ id: 'week-2', session_date: '2026-10-14' }),
        session({ id: 'week-3', session_date: '2026-10-07' }),
        session({ id: 'week-4', session_date: '2026-09-30' }),
      ],
    });
    await act(async () =>
      root.render(
        <CardioScreen
          dataRevision="updated"
          exercises={[]}
          onDataChange={vi.fn()}
          onOpenWorkout={vi.fn()}
        />,
      ),
    );
    expect(container.querySelectorAll('.cardio-history-week')).toHaveLength(3);
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(9);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('210 min');
    await click(container.querySelector('[aria-label="Next cardio history page"]')!);
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(1);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('30 min');
    await click(named('Cardio only'));
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(9);
  });

  it('edits and deletes sessions logged with a workout from their rows, and asks for zones', async () => {
    const onEditWorkout = vi.fn();
    const deleteWorkout = vi.spyOn(api, 'deleteWorkout').mockResolvedValue(undefined);
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      cardio_preferences: { heart_rate_zones: [], goals: [{ zone: 2, minutes: 150 }] },
      sessions: [
        session({ id: 'tab', source_workout_id: 'w-tab', workout_context: 'pure_cardio' }),
        session({
          id: 'finisher',
          session_date: '2026-10-23',
          source_workout_id: 'w-legs',
          source_workout_name: 'Lower A',
          workout_context: 'workout_plus_cardio',
        }),
      ],
    });
    await act(async () =>
      root.render(
        <CardioScreen
          dataRevision="linked"
          exercises={[]}
          onDataChange={vi.fn().mockResolvedValue(undefined)}
          onOpenWorkout={vi.fn()}
          onEditWorkout={onEditWorkout}
        />,
      ),
    );
    const [tab, finisher] = [...container.querySelectorAll('.cardio-history-row')];
    // Each panel lists the metrics and actions, without repeating the row's title and date.
    expect(tab.querySelector('.cardio-session-title-row')).toBeNull();
    expect(finisher.querySelector('summary')!.textContent).toContain('With Lower A');
    const buttons = (row: Element) =>
      [...row.querySelectorAll('.cardio-session-actions button')].map((item) =>
        item.textContent?.trim(),
      );
    expect(buttons(tab)).toEqual(['Share card', 'Edit metrics', 'Edit', 'Delete']);
    // Removing the finisher would change the strength workout, so that happens there.
    expect(buttons(finisher)).toEqual(['Share card', 'Edit metrics', 'Edit']);

    await click(
      [...finisher.querySelectorAll('button')].find((item) => item.textContent === 'Edit')!,
    );
    expect(onEditWorkout).toHaveBeenCalledWith('w-legs');
    await click([...tab.querySelectorAll('button')].find((item) => item.textContent === 'Delete')!);
    await click(
      [...tab.querySelectorAll('button')].find((item) => item.textContent === 'Delete session')!,
    );
    expect(deleteWorkout).toHaveBeenCalledWith('w-tab');

    expect(named('Set zones').getAttribute('aria-label')).toBe('Set heart-rate zones');
    expect(container.querySelector('.cardio-goal-list')!.textContent).toContain('– / 150 min');
  });

  it('shows an empty chart and history without inventing unlogged metrics', async () => {
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      sessions: [],
      energy_periods: [],
    });
    await act(async () =>
      root.render(
        <CardioScreen
          dataRevision="empty"
          exercises={[]}
          onDataChange={vi.fn()}
          onOpenWorkout={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector('.cardio-week-value')!.textContent).toBe('0 min');
    expect(container.querySelector('.cardio-history-empty')!.textContent).toContain(
      'No cardio sessions',
    );
    await click(named('Elevation'));
    expect(container.querySelector('.cardio-week-value')!.textContent).toContain('—');
    expect(container.querySelectorAll('.cardio-trend-week')).toHaveLength(8);
  });
});
