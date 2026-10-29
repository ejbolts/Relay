// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { AUTH_EXPIRED_EVENT } from './authEvents';
import { useSessionConnection } from './useSessionConnection';

class Socket {
  static instances: Socket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  end(code: number) {
    this.onclose?.({ code });
  }
}

let root: Root;
let container: HTMLDivElement;
let expired: ReturnType<typeof vi.fn>;
let visible = 'visible';

function Harness({ userId = 'user-1' }: { userId?: string | null }) {
  useSessionConnection(userId);
  return null;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  visible = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visible as DocumentVisibilityState,
  );
  vi.spyOn(api.auth, 'me').mockResolvedValue({ id: 'user-1' } as Awaited<
    ReturnType<typeof api.auth.me>
  >);
  expired = vi.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, expired);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('live session connection', () => {
  it('uses the same-origin cookie-authenticated socket and signs out on revocation without retries', async () => {
    const socket = Socket.instances[0];
    expect(socket.url).toBe(`ws://${window.location.host}/api/auth/ws`);
    socket.end(4401);
    expect(expired).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    expect(api.auth.me).not.toHaveBeenCalled();
  });

  it('retries ordinary disconnects without signing out', async () => {
    Socket.instances[0].end(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(Socket.instances).toHaveLength(2);
    expect(expired).not.toHaveBeenCalled();
  });

  it.each(['visibilitychange', 'online', 'pageshow'])(
    'checks a resumed app on %s',
    async (event) => {
      vi.mocked(api.auth.me).mockRejectedValue(new ApiError('Sign in', 'not_authenticated', 401));
      (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
      await act(async () => undefined);
      expect(api.auth.me).toHaveBeenCalledOnce();
      expect(expired).toHaveBeenCalledOnce();
    },
  );

  it.each([new TypeError('offline'), new ApiError('Server unavailable', 'http_error', 503)])(
    'preserves the session on a connection/server failure: %s',
    async (error) => {
      vi.mocked(api.auth.me).mockRejectedValue(error);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(expired).not.toHaveBeenCalled();
    },
  );

  it('falls back to HTTP when WebSocket is unavailable', async () => {
    await act(async () => root.render(<Harness userId={null} />));
    vi.stubGlobal('WebSocket', undefined);
    await act(async () => root.render(<Harness />));
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError('Sign in', 'not_authenticated', 401));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('does not poll hidden windows but verifies them on return', async () => {
    visible = 'hidden';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.auth.me).not.toHaveBeenCalled();
    visible = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => undefined);
    expect(api.auth.me).toHaveBeenCalledOnce();
  });

  it('rejects a different account on reconnect and ignores stale socket callbacks', async () => {
    const old = Socket.instances[0];
    old.end(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    old.end(4401);
    expect(expired).not.toHaveBeenCalled();
    Socket.instances[1].onmessage?.({
      data: JSON.stringify({ type: 'session', user_id: 'other' }),
    });
    expect(expired).toHaveBeenCalledOnce();
  });

  it('detects an account switched in another tab through the resume check', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({ id: 'other' } as Awaited<
      ReturnType<typeof api.auth.me>
    >);
    window.dispatchEvent(new Event('online'));
    await act(async () => undefined);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('ignores in-flight checks and closes the connection after unmount', async () => {
    let reject: (error: Error) => void = () => undefined;
    vi.mocked(api.auth.me).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    window.dispatchEvent(new Event('online'));
    await act(async () => root.render(<Harness userId={null} />));
    reject(new ApiError('Sign in', 'not_authenticated', 401));
    await act(async () => undefined);
    expect(expired).not.toHaveBeenCalled();
    expect(Socket.instances[0].close).toHaveBeenCalledOnce();
  });
});
