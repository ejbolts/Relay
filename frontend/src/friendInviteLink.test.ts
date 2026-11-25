import { describe, expect, it } from 'vitest';
import {
  friendInviteIdFromHash,
  friendInviteLink,
  registrationInviteFromHash,
} from './friendInviteLink';

const id = 'd7131000-7937-40be-b8ee-8b02800f5a36';

describe('friend links', () => {
  it('reads back the account and registration code every link carries', () => {
    const link = new URL(friendInviteLink(id, 'https://gym.example.com', 'open sesame&more'));
    expect(friendInviteIdFromHash(link.hash)).toBe(id);
    expect(registrationInviteFromHash(link.hash)).toBe('open sesame&more');
    const plain = new URL(friendInviteLink(id, 'https://gym.example.com'));
    expect(registrationInviteFromHash(plain.hash)).toBeNull();
  });

  it.each(['%', 'a'.repeat(201)])('ignores a malformed registration code (%s)', (code) => {
    expect(registrationInviteFromHash(`#friend=${id}&invite=${code}`)).toBeNull();
    expect(friendInviteIdFromHash(`#friend=${id}&invite=${code}`)).toBe(id);
  });

  it('needs a friend link to read a code', () => {
    expect(registrationInviteFromHash('#invite=sample-code')).toBeNull();
  });
});
