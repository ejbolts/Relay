// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ProfileBorderPicker } from './ProfileBorderPicker';
import { borderUnlockedLabel } from './profileBorderLabels';
import { SharedBorderChip } from './SharedBorderChip';
import { SharedProfileScreen } from './SharedProfiles';
import { clearSharedProfileCache } from './sharedProfileCache';
import type { ProfileBorder, ProfileBorders, SharedProfile, User } from './types';

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

const border = (fields: Partial<ProfileBorder> & Pick<ProfileBorder, 'key' | 'name'>) => ({
  group: 'Consistency',
  rarity: 'common' as const,
  requirement: 'Log 5 workouts',
  unlocked: false,
  progress: { current: 2, target: 5, unit: 'workouts' },
  needs_sex: false,
  ...fields,
});

const borders: ProfileBorders = {
  selected: null,
  sex: null,
  borders: [
    border({
      key: 'first-steps',
      name: 'First Steps',
      unlocked: true,
      unlocked_on: '2026-11-12',
      progress: { current: 5, target: 5, unit: 'workouts' },
    }),
    border({ key: 'seven-straight', name: 'Seven Straight', unlocked: true }),
    border({
      key: 'centurion',
      name: 'Centurion',
      rarity: 'epic',
      requirement: 'Log 100 workouts',
      unlocked_on: '2026-11-12',
      progress: { current: 29, target: 100, unit: 'workouts' },
    }),
  ],
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const click = (element: Element) =>
  act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('borderUnlockedLabel', () => {
  it('reads the unlock day as a calendar date', () => {
    expect(borderUnlockedLabel('2026-11-12')).toBe('Unlocked 12 Nov 2026');
    expect(borderUnlockedLabel('2026-01-01T00:00:00Z')).toBe('Unlocked 1 Jan 2026');
  });

  it('gives nothing when the day is missing or unreadable', () => {
    expect(borderUnlockedLabel(null)).toBeNull();
    expect(borderUnlockedLabel(undefined)).toBeNull();
    expect(borderUnlockedLabel('')).toBeNull();
    expect(borderUnlockedLabel('soon')).toBeNull();
    expect(borderUnlockedLabel('2026-13-45')).toBeNull();
  });
});

describe('Borders dialog unlock date', () => {
  const dialog = () => document.querySelector<HTMLDialogElement>('dialog.border-picker')!;
  const preview = () => dialog().querySelector('.border-preview')!;
  const tile = (name: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>('.border-tile')].find(
      (item) => item.querySelector('.border-tile-name')?.textContent === name,
    )!;

  async function open() {
    vi.spyOn(api, 'profileBorders').mockResolvedValue(borders);
    await act(async () =>
      root.render(
        <ProfileBorderPicker
          user={user}
          onSaved={() => {}}
          onClose={() => {}}
          onSetSex={() => {}}
        />,
      ),
    );
  }

  it('shows when an unlocked border was earned, where progress would be', async () => {
    await open();

    expect(preview().querySelector('.border-preview-name strong')?.textContent).toBe('First Steps');
    expect(preview().querySelector('.border-preview-unlocked')?.textContent).toBe(
      'Unlocked 12 Nov 2026',
    );
    expect(preview().querySelector('[role="progressbar"]')).toBeNull();
    expect(preview().querySelector('.border-wear')?.textContent).toBe('Wear border');
  });

  it('keeps progress for a locked border, even with a stray date', async () => {
    await open();
    await click(tile('Centurion'));

    expect(preview().querySelector('.border-preview-unlocked')).toBeNull();
    expect(preview().querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('leaves the line out when the server sends no date', async () => {
    await open();
    await click(tile('Seven Straight'));

    expect(preview().querySelector('.border-preview-name strong')?.textContent).toBe(
      'Seven Straight',
    );
    expect(preview().querySelector('.border-preview-unlocked')).toBeNull();
    expect(preview().querySelector('.border-wear')).not.toBeNull();
  });
});

describe('Border chip on a shared profile', () => {
  const member = {
    display_name: 'Sample Friend',
    username: '',
    profile_photo_url: null,
    profile_border: 'bench-club-5',
  };
  const chip = () => container.querySelector<HTMLButtonElement>('button.profile-border-chip')!;
  const info = () => document.querySelector<HTMLDialogElement>('dialog.border-info-dialog');

  it('opens the border larger with its rarity and unlock day', async () => {
    await act(async () =>
      root.render(<SharedBorderChip member={member} name="Bench Club V" unlockedOn="2026-11-12" />),
    );

    expect(chip().textContent).toBe('Border: Bench Club V');
    expect(chip().getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip().getAttribute('aria-expanded')).toBe('false');

    await click(chip());

    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(info()?.open).toBe(true);
    expect(info()?.querySelector('h2')?.textContent).toBe('Bench Club V');
    const rarity = info()?.querySelector('.border-rarity');
    expect(rarity?.textContent).toBe('Mythic');
    expect(rarity?.classList.contains('mythic')).toBe(true);
    expect(
      info()
        ?.querySelector('.border-info-avatar svg.profile-border-art')
        ?.getAttribute('data-border'),
    ).toBe('bench-club-5');
    expect(info()?.querySelector('.border-info-unlocked')?.textContent).toBe(
      'Unlocked 12 Nov 2026',
    );
  });

  it('omits the date line when the day is unknown, and closes back to the chip', async () => {
    await act(async () =>
      root.render(<SharedBorderChip member={member} name="Bench Club V" unlockedOn={null} />),
    );
    await click(chip());

    expect(info()?.querySelector('.border-info-unlocked')).toBeNull();

    await click(info()!.querySelector('.popup-dialog-close')!);

    expect(info()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it('closes with Escape', async () => {
    await act(async () =>
      root.render(<SharedBorderChip member={member} name="Bench Club V" unlockedOn={null} />),
    );
    await click(chip());
    await act(async () => info()!.dispatchEvent(new Event('cancel', { cancelable: true })));

    expect(info()).toBeNull();
  });

  it('leaves out the rarity of a border this build cannot draw', async () => {
    await act(async () =>
      root.render(
        <SharedBorderChip
          member={{ ...member, profile_border: 'future-border' }}
          name="Future Border"
          unlockedOn="2026-11-12"
        />,
      ),
    );
    await click(chip());

    expect(info()?.querySelector('h2')?.textContent).toBe('Future Border');
    expect(info()?.querySelector('.border-rarity')).toBeNull();
    expect(info()?.querySelector('.border-info-unlocked')?.textContent).toBe(
      'Unlocked 12 Nov 2026',
    );
  });

  it('shows the worn border on the profile page', async () => {
    clearSharedProfileCache();
    const profile: SharedProfile = {
      id: 'friend',
      display_name: 'Sample Friend',
      profile_photo_url: null,
      profile_border: 'bench-club-5',
      profile_border_name: 'Bench Club V',
      profile_border_unlocked_on: '2026-11-12',
      member_since: '2026-10-01T12:00:00Z',
      visibility: 'followers',
      is_you: false,
      friend_status: 'none',
      can_view: false,
      workout_count: 0,
      recent_workout_count: 0,
      last_workout_date: null,
      shares: null,
      body_weight: null,
      goals: null,
      cardio_sessions: null,
    };
    vi.spyOn(api.sharing, 'profile').mockResolvedValue(profile);
    await act(async () =>
      root.render(
        <SharedProfileScreen
          profileId="friend"
          active
          dataRevision={null}
          onChooseSharing={() => {}}
          renderWorkouts={() => null}
        />,
      ),
    );

    expect(chip().textContent).toBe('Border: Bench Club V');
    await click(chip());
    expect(info()?.querySelector('.border-info-unlocked')?.textContent).toBe(
      'Unlocked 12 Nov 2026',
    );
  });
});

describe('unlock date wording', () => {
  it('uses the same short months as the streak ranges', () => {
    expect(borderUnlockedLabel('2026-09-12')).toBe('Unlocked 12 Sep 2026');
  });
});
