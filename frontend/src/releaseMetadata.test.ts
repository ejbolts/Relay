import { describe, expect, it } from 'vitest';
import { releaseChangeParts } from './releaseMetadata';

describe('release change bullets', () => {
  it('splits off a leading bold title only', () => {
    expect(releaseChangeParts('**Live workouts:** Continue on any device.')).toEqual({
      title: 'Live workouts:',
      text: 'Continue on any device.',
    });
    expect(releaseChangeParts('Faster sign-in with **bold** in the middle.')).toEqual({
      title: null,
      text: 'Faster sign-in with **bold** in the middle.',
    });
  });
});
