// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileSharingPanel } from './ProfileSharing';
import type { SharingChoices, SharingSettings } from './types';
import { clearActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';

let root: Root;
let container: HTMLDivElement;

const friendsOnly: SharingSettings = {
  visibility: 'followers',
  share_notes: false,
  share_body_weight: false,
  share_goals: false,
  share_machine_photos: false,
  share_online_status: true,
  share_live_workouts: true,
  pending_requests: 0,
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.sharing, 'choices').mockResolvedValue(friendsOnly);
  vi.spyOn(api.sharing, 'updateChoices').mockImplementation(async (choices: SharingChoices) => ({
    ...choices,
    pending_requests: 0,
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<ProfileSharingPanel />));
}

function radio(value: string) {
  return container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
}

function button(text: string) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text);
}

describe('profile sharing visibility', () => {
  it('shows its explanation in a help popup without changing sharing or folding the section', async () => {
    await render();
    const section = container.querySelector('.profile-sharing')!;
    const help = container.querySelector<HTMLButtonElement>(
      '[aria-label="About profile sharing"]',
    )!;
    const explanation =
      'Choose who can see your training. Only members who share their own profile can see or follow others.';
    expect(container.textContent).not.toContain('Choose who can see your training.');
    await act(async () => help.click());
    const dialog = document.querySelector('dialog[open]')!;
    expect(dialog.textContent).toContain(explanation);
    expect(section.classList.contains('is-collapsed')).toBe(false);
    await act(async () =>
      dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
    );
    await act(async () => vi.advanceTimersByTime(20));
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(help);
    await act(async () => section.querySelector<HTMLButtonElement>('.collapsible-toggle')!.click());
    expect(section.classList.contains('is-collapsed')).toBe(true);
    await act(async () => help.click());
    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Close Profile sharing"]')!.click(),
    );
    expect(api.sharing.updateChoices).not.toHaveBeenCalled();
  });

  it('waits for the confirm button before changing who can see a shared profile', async () => {
    await render();
    await act(async () => radio('public').click());

    expect(api.sharing.updateChoices).not.toHaveBeenCalled();
    expect(radio('public').checked).toBe(true);

    await act(async () => button('Make my profile public')!.click());
    expect(api.sharing.updateChoices).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ visibility: 'public' }),
    );
    expect(button('Make my profile public')!.disabled).toBe(true);
  });

  it('keeps one confirm button under the options and reselecting cancels the change', async () => {
    await render();
    expect(button('Make my profile friends only')!.disabled).toBe(true);
    await act(async () => radio('private').click());
    expect(button('Make my profile private')!.disabled).toBe(false);

    await act(async () => radio('followers').click());
    expect(button('Make my profile friends only')!.disabled).toBe(true);
    expect(button('Make my profile private')).toBeUndefined();
    expect(api.sharing.updateChoices).not.toHaveBeenCalled();
  });

  it('shows the saved message as a five-second popup', async () => {
    await render();
    await act(async () => radio('public').click());
    await act(async () => button('Make my profile public')!.click());

    const toast = document.querySelector('.top-toast');
    expect(toast?.textContent).toContain('Your profile is public to every member who shares.');
    await act(async () => vi.advanceTimersByTime(5000));
    expect(document.querySelector('.top-toast')).toBeNull();
  });
});

it('saves online status and live workouts separately and previews what friends see', async () => {
  await render();
  const section = container.querySelector('.sharing-live')!;
  const toggle = (label: string) =>
    section.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!;
  const preview = () => section.querySelector('.sharing-live-preview .friend-status')?.textContent;
  expect(section.querySelector('h3')?.textContent).toBe('Live activity');
  expect(toggle('Online status').getAttribute('aria-checked')).toBe('true');
  expect(toggle('Live workouts').getAttribute('aria-checked')).toBe('true');
  expect(preview()).toBe('Active now');

  await act(async () => toggle('Online status').click());
  expect(api.sharing.updateChoices).toHaveBeenLastCalledWith({
    ...choicesOf(friendsOnly),
    share_online_status: false,
  });
  expect(toggle('Online status').getAttribute('aria-checked')).toBe('false');
  expect(preview()).toBe('No live activity');

  const now = Date.now();
  writeActiveWorkoutDraft({
    version: 1,
    startedAt: now - 60_000,
    updatedAt: now,
    inactiveFinishAt: now + 3_600_000,
    name: 'Leg day',
    workoutDate: '2026-10-25',
    category: 'lower',
    notes: '',
    movements: [],
  });
  await act(async () => toggle('Live workouts').click());
  expect(api.sharing.updateChoices).toHaveBeenLastCalledWith({
    ...choicesOf(friendsOnly),
    share_online_status: false,
    share_live_workouts: false,
  });
  expect(preview()).toBe('No live activity');
  await act(async () => toggle('Live workouts').click());
  expect(preview()).toBe('Working out · Leg day');
  clearActiveWorkoutDraft();
});

function choicesOf(settings: SharingSettings): SharingChoices {
  const choices: Partial<SharingSettings> = { ...settings };
  delete choices.pending_requests;
  return choices as SharingChoices;
}
