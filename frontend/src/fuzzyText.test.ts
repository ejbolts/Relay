import { describe, expect, it } from 'vitest';
import { editDistance, searchWords, typoMatch } from './fuzzyText';

describe('fuzzy text matching', () => {
  it('splits text into lower-case words without accents', () => {
    expect(searchWords('Café & Feature-Requests')).toEqual(['cafe', 'feature', 'requests']);
  });

  it('counts swapped neighbours as one edit and stops above the limit', () => {
    expect(editDistance('pasword', 'password', 1)).toBe(1);
    expect(editDistance('bnech', 'bench', 1)).toBe(1);
    expect(editDistance('plate', 'palette', 1)).toBeNull();
  });

  it('forgives mistakes in whole words and in words still being typed, but not short ones', () => {
    expect(typoMatch('notifcations', 'notifications')).toEqual({ distance: 1, length: 13 });
    expect(typoMatch('notifc', 'notifications')).toEqual({ distance: 1, length: 6 });
    expect(typoMatch('tal', 'lat')).toBeNull();
    expect(typoMatch('plate', 'templates')).toBeNull();
  });
});
