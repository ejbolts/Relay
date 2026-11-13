// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardQuickBodyweight } from './TodayScreen';
import { useDailyCheckIns } from './useDailyCheckIns';

let root: Root;
let container: HTMLDivElement;
const undo = vi.fn<() => Promise<void>>();
const save = vi.fn<(weight: number) => Promise<() => Promise<void>>>();

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  undo.mockReset().mockResolvedValue(undefined);
  save.mockReset().mockResolvedValue(undo);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(today: number | null = null) {
  await act(async () =>
    root.render(
      <DashboardQuickBodyweight
        latestBodyweight={84.2}
        priorBodyweight={83.9}
        todayBodyweight={today}
        onSave={save}
      />,
    ),
  );
}

async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

function toast() {
  return document.querySelector('.bodyweight-undo-toast');
}

async function clickUndo() {
  await act(async () =>
    (toast()!.querySelector('.undo-toast-action') as HTMLButtonElement).click(),
  );
}

describe('daily bodyweight check-in', () => {
  it('renders the configured weight, fat and combined options without an inline mode selector', async () => {
    const saveFat = vi.fn().mockResolvedValue(undo);
    const view = (mode: 'weight' | 'fat' | 'combined') => (
      <DashboardQuickBodyweight
        mode={mode}
        latestBodyweight={84.2}
        todayBodyweight={84.2}
        latestBodyFat={18}
        onSave={save}
        onSaveBodyFat={saveFat}
      />
    );
    await act(async () => root.render(view('weight')));
    expect(container.querySelector('.quick-check-in-modes')).toBeNull();
    expect(container.querySelector('.body-fat-check-in')).toBeNull();
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith(84.2);
    expect(saveFat).not.toHaveBeenCalled();
    await act(async () => root.render(view('fat')));
    expect(container.querySelector('[aria-label="Body weight check-in"]')).toBeNull();
    await submit();
    expect(saveFat).toHaveBeenCalledExactlyOnceWith(18);
    await act(async () => root.render(view('combined')));
    expect(container.querySelectorAll('form')).toHaveLength(2);
    expect(container.querySelector('.quick-check-in-modes')).toBeNull();
  });

  it('logs and undoes fat independently with both rows blocked while saving', async () => {
    let finish!: (value: () => Promise<void>) => void;
    const fatUndo = vi.fn().mockResolvedValue(undefined);
    const saveFat = vi.fn(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () =>
      root.render(
        <DashboardQuickBodyweight
          latestBodyweight={84.2}
          todayBodyweight={84.2}
          latestBodyFat={18}
          onSave={save}
          onSaveBodyFat={saveFat}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Increase body fat by 0.1%"]')!
        .click(),
    );
    await act(async () =>
      container
        .querySelectorAll('form')[1]
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(saveFat).toHaveBeenCalledExactlyOnceWith(18.1);
    expect(save).not.toHaveBeenCalled();
    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    await act(async () => finish(fatUndo));
    expect(toast()?.textContent).toContain('Body fat saved');
    await clickUndo();
    expect(fatUndo).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it('requires today’s weight before body fat can be logged', async () => {
    const saveFat = vi.fn();
    await act(async () =>
      root.render(
        <DashboardQuickBodyweight
          latestBodyweight={84.2}
          todayBodyweight={null}
          latestBodyFat={18}
          onSave={save}
          onSaveBodyFat={saveFat}
        />,
      ),
    );
    const row = container.querySelector('.body-fat-check-in')!;
    expect(row.textContent).toContain('Log today’s body weight first.');
    expect(row.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    await act(async () =>
      row
        .querySelector<HTMLButtonElement>('button[type=submit]')!
        .form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(saveFat).not.toHaveBeenCalled();
  });
  it('keeps the saved value beside a tick while editing and shows a five-second undo popup', async () => {
    await render();
    expect(toast()).toBeNull();
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Last 83.9 kg');
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith(84.2);
    await render(84.2);
    const status = container.querySelector('.quick-check-in-status')!;
    expect(status.getAttribute('aria-label')).toBe('Prior: 83.9 kg; Saved today: 84.2 kg');
    const change = status.querySelector('.quick-check-in-change')!;
    expect(change.textContent).toBe('0.3');
    expect(change.querySelector('svg')).not.toBeNull();
    expect(status.querySelector('.quick-check-in-today svg')).not.toBeNull();
    expect(status.textContent).toBe('0.384.2 kg');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Increase by 0.1 kg"]')!.click(),
    );
    expect(container.querySelector('input')!.value).toBe('84.3');
    expect(status.textContent).toBe('0.384.2 kg');
    expect(container.querySelector('.quick-bodyweight-message')).toBeNull();
    expect(toast()!.getAttribute('style')).toContain('5000ms');
    await act(async () => vi.advanceTimersByTime(4999));
    expect(toast()).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(toast()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('undoes the save and removes the popup and timer', async () => {
    await render();
    await submit();
    await clickUndo();
    expect(undo).toHaveBeenCalledOnce();
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the countdown on repeated saves and undoes only the latest save', async () => {
    const latestUndo = vi.fn().mockResolvedValue(undefined);
    await render();
    await submit();
    await act(async () => vi.advanceTimersByTime(4000));
    save.mockResolvedValueOnce(latestUndo);
    await submit();
    await act(async () => vi.advanceTimersByTime(4000));
    expect(toast()).not.toBeNull();
    await clickUndo();
    expect(latestUndo).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it('keeps a failed undo available for retry and prevents overlapping edits', async () => {
    let rejectUndo!: (reason: Error) => void;
    undo.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectUndo = reject;
        }),
    );
    await render();
    await submit();
    await clickUndo();
    expect(container.querySelector('input')!.disabled).toBe(true);
    expect((toast()!.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(6000));
    expect(toast()).not.toBeNull();
    await act(async () => rejectUndo(new Error('Could not undo. Try again.')));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Could not undo');
    await act(async () => vi.advanceTimersByTime(4999));
    expect(toast()).not.toBeNull();
    await clickUndo();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(toast()).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a failed save without an undo popup', async () => {
    save.mockRejectedValueOnce(new Error('Could not save.'));
    await render();
    await submit();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Could not save.');
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses without undoing and cleans up on unmount', async () => {
    await render();
    await submit();
    await act(async () =>
      (toast()!.querySelector('.undo-toast-close') as HTMLButtonElement).click(),
    );
    expect(toast()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
    await submit();
    await act(async () => root.render(null));
    expect(toast()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('independent Home check-in cards', () => {
  function Cards({ saveFat }: { saveFat: (fat: number) => Promise<() => Promise<void>> }) {
    const actions = useDailyCheckIns(save, saveFat);
    return (
      <>
        {(['weight', 'fat', 'combined'] as const).map((mode) => (
          <DashboardQuickBodyweight
            key={mode}
            mode={mode}
            latestBodyweight={84.2}
            todayBodyweight={84.2}
            latestBodyFat={18}
            {...actions}
          />
        ))}
      </>
    );
  }
  it('renders unique card headings and only exposes the latest save Undo across variants', async () => {
    const fatUndo = vi.fn().mockResolvedValue(undefined),
      saveFat = vi.fn().mockResolvedValue(fatUndo);
    await act(async () => root.render(<Cards saveFat={saveFat} />));
    expect(container.querySelectorAll('.quick-bodyweight')).toHaveLength(3);
    expect(new Set([...container.querySelectorAll('h2')].map((title) => title.id)).size).toBe(3);
    expect(container.querySelector('.quick-check-in-modes')).toBeNull();
    await submit();
    expect(toast()?.textContent).toContain('Body weight saved');
    await act(async () =>
      container
        .querySelectorAll('form')[1]
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(document.querySelectorAll('.bodyweight-undo-toast')).toHaveLength(1);
    expect(toast()?.textContent).toContain('Body fat saved');
    await clickUndo();
    expect(fatUndo).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });
  it('blocks all variants during saving and preserves a failed shared Undo for retry', async () => {
    let finish!: (value: () => Promise<void>) => void;
    const fatUndo = vi
      .fn()
      .mockRejectedValueOnce(new Error('Try undo again'))
      .mockResolvedValue(undefined);
    const saveFat = vi.fn(
      () =>
        new Promise<() => Promise<void>>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => root.render(<Cards saveFat={saveFat} />));
    await act(async () =>
      container
        .querySelectorAll('form')[1]
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect([...container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    await submit();
    expect(save).not.toHaveBeenCalled();
    await act(async () => finish(fatUndo));
    await clickUndo();
    expect(toast()).not.toBeNull();
    expect(container.textContent).toContain('Try undo again');
    await clickUndo();
    expect(fatUndo).toHaveBeenCalledTimes(2);
    expect(toast()).toBeNull();
  });
});

describe('combined single-button check-in', () => {
  async function combined(today: number | null = null, fat = 18) {
    await act(async () =>
      root.render(
        <DashboardQuickBodyweight
          mode="combined-single"
          latestBodyweight={84.2}
          todayBodyweight={today}
          latestBodyFat={fat}
          onSave={save}
          onSaveBodyFat={vi.fn()}
        />,
      ),
    );
  }
  it('saves both values together without a previous weigh-in and undoes them once', async () => {
    await combined();
    expect(container.querySelectorAll('button[type=submit]')).toHaveLength(1);
    expect(container.textContent).not.toContain('Log today');
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Increase body fat by 0.1%"]')!
        .click(),
    );
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith(84.2, 18.1);
    expect(toast()?.textContent).toContain('Check-in saved');
    await clickUndo();
    expect(undo).toHaveBeenCalledOnce();
  });
  it('validates both fields before saving either value', async () => {
    await combined(null, 75);
    await submit();
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('1% to 70%');
  });
  it('keeps both entries available after a failed save', async () => {
    save.mockRejectedValueOnce(new Error('Check-in failed'));
    await combined(84);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Check-in failed');
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Body fat percentage"]')?.value,
    ).toBe('18');
    expect(toast()).toBeNull();
    await submit();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
