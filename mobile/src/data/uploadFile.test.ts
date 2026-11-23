import { uploadFile, UploadStopped } from './uploadFile';

jest.mock('./api', () => ({
  ...jest.requireActual<typeof import('./api')>('./api'),
  apiOrigin: 'https://relay.test',
  clientVersionHeaders: () => ({ 'X-Relay-Version': '1.3.2' }),
}));
jest.mock('./session', () => ({ sessionToken: jest.fn(async () => 'phone-token') }));

/** A stand-in XHR that records what was sent and can be answered or aborted. */
class Xhr {
  static last: Xhr;
  headers: Record<string, string> = {};
  upload: {
    onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
  } = {};
  status = 0;
  responseText = '';
  timeout = 0;
  withCredentials = true;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  sent?: FormData;
  constructor() {
    Xhr.last = this;
  }
  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.sent = body;
  }
  abort = jest.fn(() => this.onabort?.());
}

const original = globalThis.XMLHttpRequest;
beforeEach(() => {
  globalThis.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest;
});
afterEach(() => {
  globalThis.XMLHttpRequest = original;
});

const file = { uri: 'file:///set.mp4', name: 'set.mp4', type: 'video/mp4' };

it('reports progress and uses the longer timeout it is given', async () => {
  const progress = jest.fn();
  const done = uploadFile('/api/sessions/s1/clips', 'POST', file, {
    timeoutMs: 1_800_000,
    onProgress: progress,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const xhr = Xhr.last;
  expect(xhr.timeout).toBe(1_800_000);
  expect(xhr.headers).toMatchObject({ Authorization: 'Bearer phone-token' });
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 4 });
  expect(progress).toHaveBeenCalledWith(75);
  xhr.status = 201;
  xhr.responseText = '{"id":"clip-1"}';
  xhr.onload?.();
  await expect(done).resolves.toEqual({ id: 'clip-1' });
});

it('stops the request when its signal aborts', async () => {
  const controller = new AbortController();
  const done = uploadFile('/api/sessions/s1/clips', 'POST', file, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await expect(done).rejects.toBeInstanceOf(UploadStopped);
  expect(Xhr.last.abort).toHaveBeenCalled();
});
