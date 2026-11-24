import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, type AlertButton } from 'react-native';
import type { User, YouTubeConnection } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { showToast } from '../../ui/Toast';
import { YouTubeCard } from './YouTubeCard';
import { isYouTubeReturn, youtubeReturnResult } from './youtubeReturn';

configure({ asyncUtilTimeout: 8000 });

jest.mock('expo-web-browser', () => ({
  WebBrowserResultType: { CANCEL: 'cancel' },
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `exp://127.0.0.1:8081/--/${path}`,
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), toastAccount: () => 'account-1' }));
const mockUser = { id: 'u1', username: 'preview' } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));

const RETURN = 'exp://127.0.0.1:8081/--/youtube-return';
const START = 'https://relay.test/api/youtube/app-start?state=sample';
const notConnected: YouTubeConnection = {
  status: 'not_connected',
  channel_id: null,
  channel_title: null,
  channel_url: null,
  can_disconnect: true,
  message: 'Connect your own channel to upload workout videos.',
  privacy_status: 'unlisted',
};
const connected: YouTubeConnection = {
  ...notConnected,
  status: 'connected',
  channel_id: 'chan',
  channel_title: 'Sample Lifts',
  channel_url: 'https://www.youtube.com/channel/chan',
  message: 'Uploads go to your channel.',
};

let client: QueryClient;
let youtube: YouTubeConnection;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  youtube = notConnected;
  jest.mocked(apiGet).mockImplementation(async () => youtube);
  jest.mocked(apiSend).mockResolvedValue({ url: START });
});
afterEach(() => client.clear());

async function open(canConnect = true) {
  await render(
    <QueryClientProvider client={client}>
      <YouTubeCard canConnect={canConnect} />
    </QueryClientProvider>,
  );
}

function returns(result: string) {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    // The server saved the channel before sending the browser back.
    if (result === 'connected') youtube = connected;
    return { type: 'success', url: `${RETURN}?youtube=${result}` };
  });
}

it('connects in a sign-in browser over the app and shows the new channel', async () => {
  returns('connected');
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  expect(apiSend).toHaveBeenCalledWith('/api/youtube/connect', 'POST', { return_url: RETURN });
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(START, RETURN);
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      'YouTube connected. Your next upload will go to the channel shown below.',
      undefined,
      { account: 'account-1' },
    ),
  );
  expect(await screen.findByText('Sample Lifts')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reconnect YouTube' })).toBeTruthy();
});

it('keeps a failed return beside the card until the next attempt', async () => {
  returns('permission');
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  expect(
    await screen.findByText(
      'Allow the requested YouTube permission to upload and check your videos.',
    ),
  ).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  returns('cancelled');
  await fireEvent.press(screen.getByRole('button', { name: 'Connect YouTube' }));
  await waitFor(() => expect(showToast).toHaveBeenCalled());
  expect(screen.queryByText(/Allow the requested YouTube permission/)).toBeNull();
});

it('treats closing the sign-in browser as cancelling', async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      'Connection cancelled. Your previous connection has not changed.',
      undefined,
      { account: 'account-1' },
    ),
  );
  expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeEnabled();
});

it('shows why the server refused to start', async () => {
  const { ApiError } = jest.requireActual<typeof import('../../data/api')>('../../data/api');
  jest
    .mocked(apiSend)
    .mockRejectedValue(
      new ApiError(503, 'YouTube connections are not ready.', 'youtube_not_configured'),
    );
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  expect(await screen.findByText('YouTube connections are not ready.')).toBeTruthy();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});

it('drops a result that returns after the account changed', async () => {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    nextSessionEpoch();
    return { type: 'success', url: `${RETURN}?youtube=connected` };
  });
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
  await act(async () => {});
  expect(showToast).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('hands off to the web, naming the account, when the server predates the app sign-in', async () => {
  jest.spyOn(Alert, 'alert');
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No browser'));
  jest.mocked(apiSend).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' });
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Connect YouTube' }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  const [title, message, buttons] = jest.mocked(Alert.alert).mock.lastCall!;
  expect(title).toBe('Connect YouTube on the web');
  expect(message).toBe('Sign in to the web as @preview to connect YouTube.');
  await act(async () =>
    (buttons as AlertButton[]).find((button) => button.text === 'Continue')?.onPress?.(),
  );
  expect(Linking.openURL).toHaveBeenCalledWith('https://relay.test/#videos');
  expect(await screen.findByText(/Could not open the browser/)).toBeTruthy();
});

it('asks an account without video access to see the administrator, as the web does', async () => {
  await open(false);
  expect(
    await screen.findByText(
      'Video uploads are disabled for this account. Ask the administrator to enable them.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Connect YouTube' })).toBeNull();
});

it('reads the return link in a build and in Expo Go', () => {
  expect(isYouTubeReturn('relay-mobile://youtube-return?youtube=connected')).toBe(true);
  expect(isYouTubeReturn('relay-mobile:///youtube-return')).toBe(true);
  expect(isYouTubeReturn(`${RETURN}?youtube=expired`)).toBe(true);
  expect(isYouTubeReturn('/youtube-return?youtube=expired')).toBe(true);
  expect(isYouTubeReturn('relay-mobile://youtube-returns')).toBe(false);
  expect(isYouTubeReturn('relay-mobile://videos?youtube=connected')).toBe(false);
  expect(youtubeReturnResult(`${RETURN}?youtube=no_channel`)).toBe('no_channel');
  expect(youtubeReturnResult(RETURN)).toBe('failed');
  expect(youtubeReturnResult(`${RETURN}?youtube=%3Cscript%3E`)).toBe('failed');
});
