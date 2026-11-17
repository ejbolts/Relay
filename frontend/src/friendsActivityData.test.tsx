// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import {
  useFriendRequestCount,
  profileButtonLabel,
  useOpenFeedbackCount,
} from './friendsActivityData';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Home friend and feedback counts', () => {
  it('refreshes request counts on return to Today and window focus, and clears private counts', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const choices = vi.spyOn(api.sharing, 'choices').mockResolvedValue({
      visibility: 'followers',
      pending_requests: 2,
      share_notes: false,
      share_body_weight: false,
      share_goals: false,
      share_machine_photos: false,
      share_online_status: true,
      share_live_workouts: true,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Badge({ active }: { active: boolean }) {
      return <span>{useFriendRequestCount(active, true)}</span>;
    }
    try {
      await act(async () => root.render(<Badge active />));
      expect(container.textContent).toBe('2');
      await act(async () => root.render(<Badge active={false} />));
      const settings = await api.sharing.choices();
      choices.mockResolvedValue({ ...settings, pending_requests: 0 });
      await act(async () => root.render(<Badge active />));
      expect(container.textContent).toBe('0');
      choices.mockResolvedValue({ ...settings, pending_requests: 3 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('3');
      choices.mockResolvedValue({ ...settings, visibility: 'private', pending_requests: 3 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('0');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
    const calls = choices.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    expect(choices).toHaveBeenCalledTimes(calls);
  });

  it('counts open feedback for administrators only', async () => {
    const summary = vi.spyOn(api.admin, 'feedbackSummary').mockResolvedValue({ open: 4 });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Badge({ isAdmin }: { isAdmin: boolean }) {
      return <span>{useOpenFeedbackCount(true, isAdmin)}</span>;
    }
    try {
      await act(async () => root.render(<Badge isAdmin={false} />));
      expect(container.textContent).toBe('0');
      expect(summary).not.toHaveBeenCalled();
      await act(async () => root.render(<Badge isAdmin />));
      expect(container.textContent).toBe('4');
      summary.mockResolvedValue({ open: 1 });
      await act(async () => window.dispatchEvent(new Event('focus')));
      expect(container.textContent).toBe('1');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      summary.mockRestore();
    }
  });

  it('describes waiting requests and feedback on the profile button', () => {
    expect(profileButtonLabel('Ethan', 0, 0)).toBe('Profile: Ethan');
    expect(profileButtonLabel('Ethan', 1, 0)).toBe('Profile: Ethan, 1 friend request');
    expect(profileButtonLabel(undefined, 2, 1)).toBe(
      'Profile, 2 friend requests, 1 feedback message to review',
    );
    expect(profileButtonLabel('Ethan', 0, 3)).toBe('Profile: Ethan, 3 feedback messages to review');
  });
});
