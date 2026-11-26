// Uploads and signed-in images read the session when they are asked for, through the real
// session store: a session change before that read answers means nothing is sent.
type Api = typeof import('./api');
type Session = typeof import('./session');
type Upload = typeof import('./uploadFile');
type Image = typeof import('./authorisedImage');

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0', extra: {} } }));

const mockKeychain = new Map<string, string>();
// When set, the next read answers only once this gate opens, with what is saved by then.
let mockLateReadGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    const late = mockLateReadGate;
    mockLateReadGate = null;
    if (late) await late;
    return mockKeychain.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => void mockKeychain.set(key, value),
  deleteItemAsync: async (key: string) => void mockKeychain.delete(key),
}));

/** A stand-in XHR that records every request opened. */
class Xhr {
  static opened: Xhr[] = [];
  headers: Record<string, string> = {};
  upload = {};
  constructor() {
    Xhr.opened.push(this);
  }
  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {}
  abort() {}
}

const reply = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

let api: Api;
let session: Session;
let upload: Upload;
let image: Image;
const original = globalThis.XMLHttpRequest;

beforeEach(() => {
  process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = 'https://relay.test';
  mockKeychain.clear();
  mockKeychain.set(
    'relay.session',
    JSON.stringify({ origin: 'https://relay.test', token: 'first-token' }),
  );
  Xhr.opened = [];
  globalThis.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest;
  globalThis.fetch = jest.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/api/auth/login') return reply(200, { id: 'b', session_token: 'next-token' });
    return reply(204);
  }) as unknown as typeof fetch;
  jest.isolateModules(() => {
    api = jest.requireActual<Api>('./api');
    session = jest.requireActual<Session>('./session');
    upload = jest.requireActual<Upload>('./uploadFile');
    image = jest.requireActual<Image>('./authorisedImage');
  });
});
afterEach(() => {
  globalThis.XMLHttpRequest = original;
});

/** Holds the next session read until the first account signs out and the next signs in. */
async function switchAccountsDuringNextRead(start: () => Promise<unknown>) {
  let open!: () => void;
  mockLateReadGate = new Promise<void>((resolve) => (open = resolve));
  const started = start();
  await api.signOut();
  await api.signIn('casey', 'pw');
  open();
  return started;
}

test('an upload asked for under one account is never sent as the next', async () => {
  const file = { uri: 'file:///set.mp4', name: 'set.mp4', type: 'video/mp4' };
  const sent = switchAccountsDuringNextRead(() =>
    upload.uploadFile('/api/sessions/s1/clips', 'POST', file),
  );
  await expect(sent).rejects.toBeInstanceOf(session.SessionChanged);
  expect(Xhr.opened).toEqual([]);
});

test('a signed-in image asked for under one account is never loaded as the next', async () => {
  const loaded = switchAccountsDuringNextRead(() =>
    image.loadAuthorisedImage('/api/profile-photos/p1'),
  );
  await expect(loaded).resolves.toBeNull();
  expect(Xhr.opened).toEqual([]);
});

test('with no change, the upload and the image go out with the session saved when asked', async () => {
  const file = { uri: 'file:///set.mp4', name: 'set.mp4', type: 'video/mp4' };
  void upload.uploadFile('/api/sessions/s1/clips', 'POST', file);
  void image.loadAuthorisedImage('/api/profile-photos/p2');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(Xhr.opened.map((xhr) => xhr.headers.Authorization)).toEqual([
    'Bearer first-token',
    'Bearer first-token',
  ]);
});
