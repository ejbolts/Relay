import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, type AlertButton } from 'react-native';
import type { User, YouTubeConnection } from '../../../../frontend/src/types';
import { ApiError, apiGet, request } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { showToast } from '../../ui/Toast';
import { YouTubeCard } from './YouTubeCard';
import { isYouTubeReturn, readYouTubeReturn } from './youtubeReturn';

configure({ asyncUtilTimeout: 8000 });

jest.mock('expo-web-browser', () => ({
  WebBrowserResultType: { CANCEL: 'cancel' },
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  getRandomBytesAsync: jest.fn(async (size: number) => new Uint8Array(size).fill(171)),
  digestStringAsync: jest.fn(async () => 'c'.repeat(64)),
}));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `exp://127.0.0.1:8081/--/${path}`,
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
  request: jest.fn(),
}));
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(),
  forgetSessionTokenIf: jest.fn(),
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), toastAccount: () => 'account-1' }));
const mockUser = { id: 'u1', username: 'preview' } as User;
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockUser }));

const RETURN = 'exp://127.0.0.1:8081/--/youtube-return';
const GOOGLE = 'https://accounts.google.com/o/oauth2/auth?state=sample-state';
const START = { url: GOOGLE, flow: 'app', state: 'sample-state' };
const VERIFIER = 'ab'.repeat(32);
const CODE = 'sample-completion-code-1234';
const INTERRUPTED =
  "Connecting YouTube didn't finish. Your previous connection has not changed. Try again.";
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
/** What the server answers when the app finishes. */
let finishResult: string;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  youtube = notConnected;
  finishResult = 'connected';
  jest.mocked(apiGet).mockImplementation(async () => youtube);
  jest.mocked(sessionToken).mockResolvedValue('token-a');
  jest.mocked(request).mockImplementation(async (path: string) => {
    if (path === '/api/youtube/connect') return START;
    if (finishResult === 'connected') youtube = connected;
    return { result: finishResult, connection: youtube };
  });
});
afterEach(() => client.clear());

async function open(props: { canConnect?: boolean; notice?: string } = {}) {
  await render(
    <QueryClientProvider client={client}>
      <YouTubeCard canConnect={props.canConnect ?? true} notice={props.notice} />
    </QueryClientProvider>,
  );
}

function returns(query: string) {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({ type: 'success', url: `${RETURN}?${query}` });
}

/** The calls the app sent to a path: their JSON bodies and the token each was sent with. */
function sent(path: string) {
  return jest
    .mocked(request)
    .mock.calls.filter(([called]) => called === path)
    .map(([, init, token]) => ({ body: JSON.parse(String(init?.body)), token }));
}

async function connect() {
  await fireEvent.press(await screen.findByRole('button', { name: /Connect YouTube/ }));
}

it('connects in a sign-in browser and saves only when the server confirms', async () => {
  returns(`youtube=finish&code=${CODE}`);
  await open();
  await connect();
  await waitFor(() => expect(sent('/api/youtube/finish')).toHaveLength(1));
  expect(sent('/api/youtube/connect')).toEqual([
    { body: { return_url: RETURN, app_challenge: 'c'.repeat(64) }, token: 'token-a' },
  ]);
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(GOOGLE, RETURN);
  expect(sent('/api/youtube/finish')).toEqual([
    { body: { state: 'sample-state', code: CODE, verifier: VERIFIER }, token: 'token-a' },
  ]);
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      'YouTube connected. Your next upload will go to the channel shown below.',
      undefined,
      { account: 'account-1' },
    ),
  );
  expect(await screen.findByText('Sample Lifts')).toBeTruthy();
});

it('uses the sign-in the attempt started with for both requests', async () => {
  // Another account's token is saved while the browser is open; it must never be used.
  jest.mocked(sessionToken).mockResolvedValueOnce('token-a').mockResolvedValue('token-b');
  returns(`youtube=finish&code=${CODE}`);
  await open();
  await connect();
  await waitFor(() => expect(sent('/api/youtube/finish')).toHaveLength(1));
  expect(sent('/api/youtube/connect')[0].token).toBe('token-a');
  expect(sent('/api/youtube/finish')[0].token).toBe('token-a');
});

it('forgets the attempt sign-in if the server has ended it', async () => {
  jest.mocked(request).mockRejectedValue(new ApiError(401, 'Sign in to continue.'));
  await open();
  await connect();
  expect(await screen.findByText('Sign in to continue.')).toBeTruthy();
  expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'token-a');
});

it.each([
  ['a bare result word', 'youtube=connected'],
  ['a failure word', 'youtube=permission'],
  ['a code-less finish', 'youtube=finish'],
])('shows an unconfirmed return (%s) as interrupted, never as its word', async (_, query) => {
  returns(query);
  await open();
  await connect();
  expect(await screen.findByText(INTERRUPTED)).toBeTruthy();
  expect(sent('/api/youtube/finish')).toHaveLength(0);
  expect(showToast).not.toHaveBeenCalled();
});

it('treats a return to another link as interrupted', async () => {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
    type: 'success',
    url: `exp://127.0.0.1:8081/--/youtube-return-other?youtube=finish&code=${CODE}`,
  });
  await open();
  await connect();
  expect(await screen.findByText(INTERRUPTED)).toBeTruthy();
  expect(sent('/api/youtube/finish')).toHaveLength(0);
});

it('shows the result the server confirms, keeping failures beside the card', async () => {
  returns(`youtube=finish&code=${CODE}`);
  finishResult = 'permission';
  await open();
  await connect();
  expect(
    await screen.findByText(
      'Allow the requested YouTube permission to upload and check your videos.',
    ),
  ).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  // Declining on Google, confirmed by the server, is a toast; the earlier failure clears.
  finishResult = 'cancelled';
  await connect();
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      'Connection cancelled. Your previous connection has not changed.',
      undefined,
      { account: 'account-1' },
    ),
  );
  expect(screen.queryByText(/Allow the requested YouTube permission/)).toBeNull();
});

it('treats closing the sign-in browser as cancelling', async () => {
  jest
    .mocked(WebBrowser.openAuthSessionAsync)
    .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
  await open();
  await connect();
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
  jest
    .mocked(request)
    .mockRejectedValue(
      new ApiError(503, 'YouTube connections are not ready.', 'youtube_not_configured'),
    );
  await open();
  await connect();
  expect(await screen.findByText('YouTube connections are not ready.')).toBeTruthy();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});

it('fails the attempt when secure randomness is unavailable', async () => {
  jest.mocked(Crypto.getRandomBytesAsync).mockRejectedValueOnce(new Error('No secure random'));
  await open();
  await connect();
  expect(await screen.findByText('No secure random')).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});

it('sends no start when the account changes while the secret is prepared', async () => {
  jest.mocked(Crypto.digestStringAsync).mockImplementationOnce(async () => {
    nextSessionEpoch();
    return 'c'.repeat(64);
  });
  await open();
  await connect();
  await waitFor(() => expect(Crypto.digestStringAsync).toHaveBeenCalled());
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Connect YouTube' })).toBeEnabled();
});

it('opens no browser when the account changes while the start is pending', async () => {
  jest.mocked(request).mockImplementation(async () => {
    nextSessionEpoch();
    return START;
  });
  await open();
  await connect();
  await waitFor(() => expect(request).toHaveBeenCalled());
  await act(async () => {});
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('drops a result that returns after the account changed, without finishing', async () => {
  jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(async () => {
    nextSessionEpoch();
    return { type: 'success', url: `${RETURN}?youtube=finish&code=${CODE}` };
  });
  await open();
  await connect();
  await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
  await act(async () => {});
  expect(sent('/api/youtube/finish')).toHaveLength(0);
  expect(showToast).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('hands off to the web, naming the account, when the server predates the app sign-in', async () => {
  jest.spyOn(Alert, 'alert');
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No browser'));
  jest.mocked(request).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' });
  await open();
  await connect();
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

it('says to try again when the attempt was lost while Relay was closed', async () => {
  await open({ notice: INTERRUPTED });
  expect(await screen.findByText(INTERRUPTED)).toBeTruthy();
});

it('asks an account without video access to see the administrator, as the web does', async () => {
  await open({ canConnect: false });
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
  expect(readYouTubeReturn(`${RETURN}?youtube=finish&code=${CODE}`, RETURN)).toEqual({
    result: 'finish',
    code: CODE,
  });
  expect(readYouTubeReturn(`${RETURN}?youtube=no_channel`, RETURN)).toEqual({
    result: 'no_channel',
  });
  expect(readYouTubeReturn(RETURN, RETURN)).toBeNull();
  expect(readYouTubeReturn(`${RETURN}?youtube=finish`, RETURN)).toBeNull();
  expect(readYouTubeReturn(`${RETURN}?youtube=%3Cscript%3E`, RETURN)).toBeNull();
  expect(readYouTubeReturn(`${RETURN}?youtube=cancelled#x`, RETURN)).toBeNull();
  expect(readYouTubeReturn(`${RETURN}x?youtube=cancelled`, RETURN)).toBeNull();
});
