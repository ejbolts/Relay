// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodyCompositionScreen } from './App';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { BodyMeasurement, BodyWeightGoal } from './types';
import type { WeightUnit } from './weightUnits';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

function goal(
  start: number,
  target: number,
  active = true,
  startDate = '2026-01-01',
): BodyWeightGoal {
  return {
    id: `goal-${startDate}`,
    start_date: startDate,
    target_date: '2026-12-31',
    start_weight_kg: start,
    target_weight_kg: target,
    active,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function measurement(date: string, weight: number): BodyMeasurement {
  return {
    id: date,
    measurement_date: date,
    weight_kg: weight,
    body_fat_pct: null,
    notes: null,
    is_sample: true,
    created_at: `${date}T00:00:00Z`,
  };
}

async function render(
  measurements: BodyMeasurement[],
  goals: BodyWeightGoal[],
  unit: WeightUnit = 'kg',
) {
  vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue(goals);
  await act(async () =>
    root.render(
      <TrainingPreferencesContext.Provider
        value={{
          preferences: {
            preferred_weight_unit: unit,
            week_start: 'monday',
            zone2_goal_minutes: 150,
            weekly_muscle_set_goal: 10,
          },
          error: null,
          applySaved: vi.fn(),
        }}
      >
        <BodyCompositionScreen
          measurements={measurements}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onDataChange={vi.fn()}
        />
      </TrainingPreferencesContext.Provider>,
    ),
  );
}

function rows() {
  return [...container.querySelectorAll('.body-history-panel > article')];
}

function arrow(row: Element) {
  return row.querySelector('.body-history-weight-change');
}

async function selectTab(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => button.click());
}

describe('Body history goal-aware arrows', () => {
  it.each([
    { target: 75, statuses: ['favorable', 'unfavorable'], goalWord: 'loss' },
    { target: 90, statuses: ['unfavorable', 'favorable'], goalWord: 'gain' },
  ])(
    'renders daily and grouped directions for a weight-$goalWord goal',
    async ({ target, statuses, goalWord }) => {
      await render(
        [
          measurement('2026-08-03', 80),
          measurement('2026-10-05', 80),
          measurement('2026-09-07', 81),
        ],
        [goal(82, target)],
      );

      for (const tab of ['Daily', 'Avg Week', 'Avg Monthly']) {
        await selectTab(tab);
        expect(rows()).toHaveLength(3);
        expect(arrow(rows()[0])?.classList.contains(statuses[0])).toBe(true);
        expect(arrow(rows()[0])?.getAttribute('aria-label')).toContain('Weight decreased');
        expect(arrow(rows()[0])?.getAttribute('aria-label')).toContain(`weight-${goalWord} goal`);
        expect(arrow(rows()[1])?.classList.contains(statuses[1])).toBe(true);
        expect(arrow(rows()[1])?.getAttribute('aria-label')).toContain('Weight increased');
        expect(arrow(rows()[2])).toBeNull();
      }
    },
  );

  it('compares across page boundaries in each history view and keeps pounds independent of status', async () => {
    await render(
      Array.from({ length: 10 }, (_, index) =>
        measurement(`2026-${String(10 - index).padStart(2, '0')}-15`, 80 + index / 10),
      ),
      [goal(90, 75)],
      'lb',
    );
    expect(rows()[0].querySelector('.body-history-weight')?.textContent).toContain('176.37 lb');
    for (const [tab, period] of [
      ['Daily', 'daily'],
      ['Avg Week', 'week'],
      ['Avg Monthly', 'month'],
    ]) {
      await selectTab(tab);
      expect(rows()).toHaveLength(8);
      expect(arrow(rows()[7])?.classList.contains('favorable')).toBe(true);
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(
            `[aria-label="Next ${period} bodyweight history page"]`,
          )!
          .click(),
      );
      expect(rows()).toHaveLength(2);
      expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
      expect(arrow(rows()[1])).toBeNull();
    }
  });

  it.each([{ goals: [] }, { goals: [goal(90, 75, true, '2026-11-01')] }])(
    'keeps changes neutral before any goal has started: $goals',
    async ({ goals }) => {
      await render([measurement('2026-10-02', 80), measurement('2026-10-01', 81)], goals);
      expect(arrow(rows()[0])?.classList.contains('neutral')).toBe(true);
      expect(arrow(rows()[0])?.getAttribute('aria-label')).toBe(
        'Weight decreased by 1 kg since previous check-in',
      );
      expect(container.querySelector('.body-history-goal-divider')).toBeNull();
    },
  );

  it.each(['en-AU', 'en-US'])(
    'colours rows by their goal and marks its start using the %s date format',
    async (locale) => {
      const DateTimeFormat = Intl.DateTimeFormat;
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
        return new DateTimeFormat(locales ?? locale, options);
      });
      await render(
        [
          measurement('2026-10-20', 83.9),
          measurement('2026-10-17', 84.5),
          measurement('2026-09-29', 83.6),
          measurement('2026-09-28', 83.3),
          measurement('2026-08-20', 85),
        ],
        // An earlier cut, then a bulk set on 17 October that is still active.
        [goal(84.5, 86, true, '2026-10-17'), goal(84, 82, false, '2026-09-01')],
      );
      expect(rows().map((row) => arrow(row)?.className.split(' ').at(-1) ?? null)).toEqual([
        'unfavorable',
        'favorable',
        'unfavorable',
        'favorable',
        null,
      ]);
      const dividers = () => [
        ...container.querySelectorAll<HTMLElement>('.body-history-goal-divider'),
      ];
      // Each divider sits in a swipe row so the goal can be swiped away.
      const rule = (divider: HTMLElement) => divider.closest<HTMLElement>('.body-goal-swipe')!;
      expect(dividers()).toHaveLength(2);
      const goalStart = new Date(2026, 9, 17);
      const goalDate = new DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(goalStart.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
      }).format(goalStart);
      // Each rule sits directly below the oldest row under its goal.
      expect(rule(dividers()[0]).previousElementSibling).toBe(rows()[1]);
      expect(dividers()[0].getAttribute('aria-label')).toBe(
        `New goal from ${goalDate}: Gain to 86 kg`,
      );
      expect(dividers()[0].textContent).toContain(`from ${goalDate}`);
      expect(rule(dividers()[1]).previousElementSibling).toBe(rows()[3]);
      expect(dividers()[1].textContent).toContain('Lose to 82 kg');

      await selectTab('Avg Monthly');
      expect(rows()).toHaveLength(3);
      expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
      expect(dividers().map((divider) => rule(divider).previousElementSibling)).toEqual([
        rows()[0],
        rows()[1],
      ]);
    },
  );

  it('describes maintain goals and favours moving back towards the target weight', async () => {
    await render(
      [
        measurement('2026-10-03', 83.2),
        measurement('2026-10-02', 83.6),
        measurement('2026-10-01', 83),
      ],
      [goal(83, 83, true, '2026-09-01')],
    );
    expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
    expect(arrow(rows()[0])?.getAttribute('aria-label')).toBe(
      'Weight decreased by 0.4 kg since previous check-in; closer to maintenance weight',
    );
    expect(arrow(rows()[1])?.classList.contains('unfavorable')).toBe(true);
    expect(arrow(rows()[1])?.getAttribute('aria-label')).toContain(
      'further from maintenance weight',
    );
  });

  it('does not show arrows for equal weights or the first chronological check-in', async () => {
    await render([measurement('2026-10-02', 80), measurement('2026-10-01', 80)], [goal(90, 75)]);
    expect(container.querySelectorAll('.body-history-weight-change')).toHaveLength(0);
  });

  it('updates period comparisons when the selected statistic changes', async () => {
    await render(
      [
        measurement('2026-10-07', 100),
        measurement('2026-10-06', 80),
        measurement('2026-10-05', 80),
        measurement('2026-09-07', 82),
      ],
      [goal(90, 75)],
    );
    await selectTab('Avg Week');
    expect(arrow(rows()[0])?.classList.contains('unfavorable')).toBe(true);
    const select = container.querySelector<HTMLSelectElement>(
      '[aria-label="Bodyweight trend statistic"]',
    )!;
    await act(async () => {
      select.value = 'median';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
    await selectTab('Median Monthly');
    expect(arrow(rows()[0])?.classList.contains('favorable')).toBe(true);
  });

  it('shows the gain or loss beside each arrow in the row units and rounding', async () => {
    await render(
      [
        measurement('2026-10-06', 84.15),
        measurement('2026-10-05', 83.4),
        measurement('2026-09-10', 83.36),
        measurement('2026-09-03', 85.9),
        measurement('2026-08-12', 88.5),
        measurement('2026-07-08', 89.5),
      ],
      [],
    );
    const amounts = () =>
      rows().map(
        (row) => row.querySelector('.body-history-weight-change-amount')?.textContent ?? null,
      );

    expect(amounts()).toEqual(['0.75', '0.04', '2.54', '2.6', '1', null]);
    expect(arrow(rows()[0])?.getAttribute('aria-label')).toBe(
      'Weight increased by 0.75 kg since previous check-in',
    );

    await selectTab('Avg Monthly');
    // Shown as 83.8, 84.6, 88.5 and 89.5 kg, keeping the rows' single decimal.
    expect(amounts()).toEqual(['0.8', '3.9', '1.0', null]);
    expect(arrow(rows()[1])?.getAttribute('aria-label')).toBe(
      'Weight decreased by 3.9 kg since previous month with check-ins',
    );
  });

  it('converts the amount to pounds and never shows a zero change beside an arrow', async () => {
    await render(
      [
        measurement('2026-10-02', 80.02),
        measurement('2026-10-01', 80.019),
        measurement('2026-09-30', 79),
      ],
      [],
      'lb',
    );
    const amount = (row: Element) =>
      row.querySelector('.body-history-weight-change-amount')?.textContent;

    // 80.02 kg and 80.019 kg both show as 176.41 lb; 79 kg shows as 174.17 lb.
    expect(amount(rows()[0])).toBe('<0.01');
    expect(amount(rows()[1])).toBe('2.24');
  });

  describe('goal form', () => {
    function setInput(input: HTMLInputElement, value: string) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function buttonNamed(label: string) {
      return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === label,
      )!;
    }

    beforeEach(() => {
      HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    });

    async function openGoalForm() {
      await act(async () => buttonNamed('Set a goal').click());
      return document.querySelector<HTMLFormElement>('.body-goal-form')!;
    }

    it('saves a maintain goal that holds the chosen weight', async () => {
      const create = vi.spyOn(api, 'createBodyWeightGoal').mockResolvedValue(goal(84, 84));
      await render([measurement('2026-10-02', 84), measurement('2026-10-01', 85)], []);
      const form = await openGoalForm();
      const maintain = form.querySelector<HTMLButtonElement>('[role="radio"]:nth-child(3)')!;
      await act(async () => maintain.click());
      expect(maintain.getAttribute('aria-checked')).toBe('true');
      const [target, date] = form.querySelectorAll<HTMLInputElement>('input');
      // Maintaining starts from the latest weight.
      expect(target.value).toBe('84');
      await act(async () => setInput(date, '2026-12-31'));
      await act(async () => form.requestSubmit());

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          start_weight_kg: 84,
          target_weight_kg: 84,
          target_date: '2026-12-31',
        }),
      );
    });

    it('asks for a target on the right side of the current weight', async () => {
      const create = vi.spyOn(api, 'createBodyWeightGoal');
      await render([measurement('2026-10-02', 84)], []);
      const form = await openGoalForm();
      const [target, date] = form.querySelectorAll<HTMLInputElement>('input');
      await act(async () => setInput(target, '88'));
      await act(async () => setInput(date, '2026-12-31'));
      await act(async () => form.requestSubmit());

      expect(create).not.toHaveBeenCalled();
      expect(form.textContent).toContain(
        'For a weight-loss goal, choose a target below your current 84 kg.',
      );
    });
  });
});
