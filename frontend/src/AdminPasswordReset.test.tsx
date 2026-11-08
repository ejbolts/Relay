// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminScreenView, type TemporaryPasswordReveal } from './AdminScreen';
import type { AdminUser } from './types';

const tester: AdminUser = {
  id: 'tester',
  username: 'tester',
  display_name: 'Tester',
  is_admin: false,
  disabled_at: null,
  must_change_password: false,
  created_at: '2026-10-01T10:00:00Z',
  last_active_at: null,
  signed_in_devices: 1,
  workouts: 0,
  photos: 0,
  photo_bytes: 0,
  video_sessions: 0,
};

let container: HTMLDivElement;
let root: Root;
const reset = vi.fn();

function Harness() {
  const [reveal, setReveal] = useState<TemporaryPasswordReveal | null>(null);
  return (
    <AdminScreenView
      currentUserId="owner"
      users={[tester]}
      settings={null}
      status={null}
      limits={null}
      loading={false}
      error={null}
      notice={null}
      savingSetting={false}
      savingLimits={false}
      busyUserId={null}
      temporaryPassword={reveal}
      onVideoUploadsChange={vi.fn()}
      onSaveLimits={vi.fn()}
      onRegistrationChange={vi.fn()}
      onUserDisabledChange={vi.fn()}
      onResetPassword={async (user) => {
        reset(user.id);
        setReveal({
          userId: user.id,
          displayName: user.display_name,
          password: 'abcde-fghjk-mnpqr',
        });
      }}
      onTemporaryPasswordDismiss={() => setReveal(null)}
      onRefresh={vi.fn()}
    />
  );
}

function button(label: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent === label,
  );
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reset.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('resetting a password from the admin screen', () => {
  it('needs a confirmation, then shows the temporary password until it is dismissed', async () => {
    await act(async () => button('Reset password')!.click());
    expect(reset).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Signs them out everywhere');

    await act(async () => button('Reset and sign out')!.click());

    expect(reset).toHaveBeenCalledWith('tester');
    expect(container.querySelector('.admin-temp-password code')?.textContent).toBe(
      'abcde-fghjk-mnpqr',
    );

    await act(async () => button('Done')!.click());

    expect(container.querySelector('.admin-temp-password')).toBeNull();
    expect(container.textContent).not.toContain('abcde-fghjk-mnpqr');
  });

  it('cancelling the confirmation resets nothing', async () => {
    await act(async () => button('Reset password')!.click());
    await act(async () => button('Cancel')!.click());

    expect(reset).not.toHaveBeenCalled();
    expect(button('Reset password')).toBeDefined();
  });

  it('copies the temporary password and confirms on the button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await act(async () => button('Reset password')!.click());
    await act(async () => button('Reset and sign out')!.click());

    await act(async () => button('Copy')!.click());

    expect(writeText).toHaveBeenCalledWith('abcde-fghjk-mnpqr');
    expect(button('Copied')).toBeDefined();
  });
});
