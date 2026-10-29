// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  captureFriendInvite,
  clearFriendInvite,
  FRIEND_INVITE_EVENT,
  friendInviteIdFromHash,
  friendInviteIdFromScan,
  friendInviteUrl,
  openFriendInvite,
  pendingFriendInvite,
} from './friendInvite';

const id = 'd7131000-7937-40be-b8ee-8b02800f5a36';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('friend invite links', () => {
  it('links to the account id, which survives a username change', () => {
    expect(friendInviteUrl(id, 'https://gym.example.com')).toBe(
      `https://gym.example.com/#friend=${id}`,
    );
    expect(friendInviteIdFromHash(`#friend=${id}`)).toBe(id);
  });

  it('ignores screen links and malformed invites', () => {
    expect(friendInviteIdFromHash('#social')).toBeNull();
    expect(friendInviteIdFromHash('#friend=')).toBeNull();
    expect(friendInviteIdFromHash('#friend=<script>')).toBeNull();
    expect(friendInviteIdFromHash(`#friend=${'a'.repeat(65)}`)).toBeNull();
  });

  it('keeps the invite through sign-in and clears it from the address bar', () => {
    const storage = memoryStorage();
    const history = { state: { kept: true }, replaceState: vi.fn() };
    const location = { hash: `#friend=${id}`, pathname: '/', search: '?from=qr' };

    expect(captureFriendInvite(location, history, storage)).toBe(id);
    expect(history.replaceState).toHaveBeenCalledWith({ kept: true }, '', '/?from=qr');
    expect(pendingFriendInvite(storage)).toBe(id);

    clearFriendInvite(storage);
    expect(pendingFriendInvite(storage)).toBeNull();
  });

  it('leaves other addresses alone', () => {
    const storage = memoryStorage();
    const history = { state: null, replaceState: vi.fn() };
    expect(
      captureFriendInvite({ hash: '#profile', pathname: '/', search: '' }, history, storage),
    ).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(pendingFriendInvite(storage)).toBeNull();
  });

  it('remembers the invite for this page when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const history = { state: null, replaceState: vi.fn() };
    captureFriendInvite({ hash: `#friend=${id}`, pathname: '/', search: '' }, history, blocked);
    expect(pendingFriendInvite(blocked)).toBe(id);
    clearFriendInvite(blocked);
    expect(pendingFriendInvite(blocked)).toBeNull();
  });

  it('reads friend links from scanned codes and ignores anything else', () => {
    expect(friendInviteIdFromScan(`https://gym.example.com/#friend=${id}`)).toBe(id);
    expect(
      friendInviteIdFromScan(` http://127.0.0.1:8000/#friend=${id}
`),
    ).toBe(id);
    expect(friendInviteIdFromScan('https://gym.example.com/#social')).toBeNull();
    expect(friendInviteIdFromScan(`javascript:alert(1)//#friend=${id}`)).toBeNull();
    expect(friendInviteIdFromScan('WIFI:S:gym;T:WPA;P:secret;;')).toBeNull();
  });

  it('starts the invite flow for a code scanned inside the app', () => {
    const storage = memoryStorage();
    const opened = vi.fn();
    window.addEventListener(FRIEND_INVITE_EVENT, opened);
    try {
      openFriendInvite(id, storage);
    } finally {
      window.removeEventListener(FRIEND_INVITE_EVENT, opened);
    }
    expect(pendingFriendInvite(storage)).toBe(id);
    expect(opened).toHaveBeenCalledOnce();
  });
});
