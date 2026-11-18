// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { takeAdminAccountFromUrl } from './adminAccountFocus';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('opening an account from a phone alert', () => {
  it('reads the account once and leaves the rest of the address and history state alone', () => {
    window.history.replaceState(
      { gymLogger: true, index: 2, tab: 'admin' },
      '',
      '/?admin-account=riley&x=1#admin',
    );

    expect(takeAdminAccountFromUrl()).toBe('riley');

    expect(`${location.pathname}${location.search}${location.hash}`).toBe('/?x=1#admin');
    expect(window.history.state).toEqual({ gymLogger: true, index: 2, tab: 'admin' });
    expect(takeAdminAccountFromUrl()).toBeNull();
  });

  it('ignores an address without an account', () => {
    window.history.replaceState(null, '', '/#admin');
    expect(takeAdminAccountFromUrl()).toBeNull();
    expect(location.hash).toBe('#admin');
  });
});
