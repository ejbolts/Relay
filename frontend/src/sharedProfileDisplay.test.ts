import { describe, expect, it } from 'vitest';
import { friendStatusLabel, sharedParts, sinceMonthLabel } from './sharedProfileDisplay';
import type { SharedProfileSummary } from './types';

const nothingExtra = {
  notes: false,
  body_weight: false,
  goals: false,
  machine_photos: false,
};

const profile: SharedProfileSummary = {
  id: 'member',
  display_name: 'Sam',
  profile_photo_url: null,
  member_since: '2026-09-01T10:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'none',
  can_view: true,
  workout_count: 42,
  recent_workout_count: 6,
  last_workout_date: '2026-10-06',
  shares: nothingExtra,
};

const friendsOnly: SharedProfileSummary = {
  ...profile,
  visibility: 'followers',
  can_view: false,
  workout_count: null,
  recent_workout_count: null,
  last_workout_date: null,
  shares: null,
};

describe('shared profile display', () => {
  it('shortens a relationship start date to its month and year', () => {
    expect(sinceMonthLabel('2026-10-06T12:00:00Z')).toBe('Since Oct 2026');
    expect(sinceMonthLabel(null)).toBeNull();
    expect(sinceMonthLabel('invalid')).toBeNull();
  });
  it('always lists workouts, then only the parts the owner chose to share', () => {
    expect(sharedParts(profile)).toEqual(['Workouts + cardio']);
    expect(
      sharedParts({
        ...profile,
        shares: { notes: true, body_weight: true, goals: true, machine_photos: true },
      }),
    ).toEqual(['Workouts + cardio', 'Machine photos', 'Body weight', 'Goals', 'Notes']);
    expect(sharedParts(friendsOnly)).toEqual([]);
  });

  it('labels the relationship, or who can see the profile when you are not connected', () => {
    expect(friendStatusLabel(profile)).toBe('Public');
    expect(friendStatusLabel(friendsOnly)).toBe('Friends only');
    expect(friendStatusLabel({ ...friendsOnly, friend_status: 'outgoing' })).toBe(
      'Friend request sent',
    );
    expect(friendStatusLabel({ ...friendsOnly, friend_status: 'incoming' })).toBe(
      'Sent you a friend request',
    );
    expect(friendStatusLabel({ ...profile, friend_status: 'friends' })).toBe('Friend');
  });
});
