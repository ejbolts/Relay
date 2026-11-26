import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react-native';
import { OFFLINE_MESSAGE } from '../data/offline';

/**
 * Mounts a screen offline with nothing saved and checks that it says it is offline (rather than
 * spinning) without asking the server, then loads by itself once the phone is back online.
 */
export async function expectOfflineUntilOnline(
  get: jest.Mock,
  mount: () => Promise<unknown>,
  loaded?: () => void,
) {
  onlineManager.setOnline(false);
  try {
    get.mockClear();
    await mount();
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeVisible();
    expect(get).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(screen.queryByText(OFFLINE_MESSAGE)).toBeNull());
    expect(get).toHaveBeenCalled();
    if (loaded) await waitFor(loaded);
  } finally {
    onlineManager.setOnline(true);
  }
}
