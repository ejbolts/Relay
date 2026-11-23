import { describe, expect, it } from 'vitest';
import { pendingFriendRequests, profileBadgeText, profileButtonLabel } from './profileButton';

describe('the profile button', () => {
  it('describes waiting requests and feedback', () => {
    expect(profileButtonLabel('Ethan', 0, 0)).toBe('Profile: Ethan');
    expect(profileButtonLabel('Ethan', 1, 0)).toBe('Profile: Ethan, 1 friend request');
    expect(profileButtonLabel(undefined, 2, 1)).toBe(
      'Profile, 2 friend requests, 1 feedback message to review',
    );
    expect(profileButtonLabel('Ethan', 0, 3)).toBe('Profile: Ethan, 3 feedback messages to review');
  });

  it('counts requests only for profiles that can receive them', () => {
    expect(pendingFriendRequests({ visibility: 'followers', pending_requests: 2 })).toBe(2);
    expect(pendingFriendRequests({ visibility: 'public', pending_requests: 0 })).toBe(0);
    expect(pendingFriendRequests({ visibility: 'private', pending_requests: 3 })).toBe(0);
  });

  it('caps the badge at 9+', () => {
    expect(profileBadgeText(0)).toBeNull();
    expect(profileBadgeText(4)).toBe('4');
    expect(profileBadgeText(12)).toBe('9+');
  });
});
