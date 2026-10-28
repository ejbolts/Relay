// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardioScreen } from './App';
import { api } from './api';
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
    met_minutes: 540,
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
    previous_met_minutes: null,
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
  root = createRoot(container);
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
  it('automatically classifies saved cardio and shows a text-only result', async () => {
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
    const notice = document.querySelector('.app-notification-toast')!;
    expect(notice.textContent).toContain('Zone 2 · 120 bpm average (110–139 bpm)');
    expect(notice.querySelector('svg, canvas')).toBeNull();
    await click(container.querySelector('[aria-label="Edit heart-rate zones and goals"]')!);
    expect(document.querySelector('dialog')!.textContent).toContain('Personal ranges (bpm)');
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
      await click(named('MET-min'));
      expect(hero()).toContain('300 MET-min');
      const previousWeekDate = new Date('2026-10-12T12:00:00').toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      });
      const previousWeek = container.querySelector(
        `[aria-label="Week of ${previousWeekDate}: 240 MET-min"]`,
      );
      expect(previousWeek).not.toBeNull();
      expect(previousWeek!.getAttribute('aria-pressed')).toBe('false');
      await click(previousWeek!);
      expect(previousWeek!.getAttribute('aria-pressed')).toBe('true');
      expect(hero()).toContain('240 MET-min');
      expect(container.querySelector('.cardio-week-comparison')!.textContent).toContain(
        '1 session',
      );
      await click(named('Calories'));
      expect(hero()).toContain('300 kcal burnt');
    },
  );

  it('opens all stats, switches periods and explains METs in a dismissible popup', async () => {
    await click(container.querySelector('.cardio-all-stats > summary')!);
    expect(container.querySelector('details.cardio-all-stats')!.hasAttribute('open')).toBe(true);
    await click(named('Month'));
    expect(container.querySelector('.cardio-progress-grid')!.textContent).toContain('900 kcal');
    await click(container.querySelector('[aria-label="About cardio progress"]')!);
    expect(document.querySelector('dialog')!.textContent).toContain('not measured fat loss');
    await click(document.querySelector('[aria-label="Close Cardio progress"]')!);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('groups filtered history by week and keeps session editing inside expandable rows', async () => {
    expect(container.querySelectorAll('.cardio-history-week')).toHaveLength(2);
    await click(named('After workout'));
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(1);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('20 min');
    await click(container.querySelector('.cardio-history-row > summary')!);
    await click(named('Edit metrics'));
    expect(document.querySelector('dialog')!.textContent).toContain('Cardio metrics');
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
    expect(save).not.toHaveBeenCalled();
    await click(named('Cancel'));
    expect(named('Log session')).toBeTruthy();
    await click(named('Log session'));
    expect(field('Calories burned (kcal)').value).toBe('');
  });

  it('keeps complete weekly totals when a group spans history pages and resets pagination on filtering', async () => {
    vi.mocked(api.cardioOverview).mockResolvedValue({
      ...overview,
      sessions: Array.from({ length: 7 }, (_, index) => session({ id: `ride-${index}` })),
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
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(5);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('210 min');
    await click(container.querySelector('[aria-label="Next cardio history page"]')!);
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(2);
    expect(container.querySelector('.cardio-history-week h3')!.textContent).toContain('210 min');
    await click(named('Cardio only'));
    expect(container.querySelectorAll('.cardio-history-row')).toHaveLength(5);
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
    await click(named('MET-min'));
    expect(container.querySelector('.cardio-week-value')!.textContent).toContain('—');
    expect(container.querySelectorAll('.cardio-trend-week')).toHaveLength(8);
  });
});
