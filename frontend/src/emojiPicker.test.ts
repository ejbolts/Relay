import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS } from './emojiCatalog';
import { isSingleEmoji, searchEmojis } from './emojiPicker';
import { nextReaction, reactionChoice, reactionEmoji, reactionKey } from './friendFeedData';

describe('isSingleEmoji', () => {
  it.each(['🫡', '😮‍💨', '👍🏽', '🧑🏻‍🦰', '👩🏻‍❤️‍💋‍👨🏼', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🇦🇺', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '1️⃣', '#️⃣', '☀️', '❤️‍🔥'])(
    'accepts %s',
    (emoji) => {
      expect(isSingleEmoji(emoji)).toBe(true);
    },
  );

  it.each(['', ' ', 'a', '1', 'hi', '👍👍', '🔥 🔥', '👍a', '🇦', '🇦🇺🇳🇿', '\u200d', '🏽'])(
    'refuses %j',
    (value) => {
      expect(isSingleEmoji(value)).toBe(false);
    },
  );

  it('accepts every emoji the picker offers', () => {
    const refused = EMOJI_GROUPS.flatMap((group) => group.emojis).filter(
      ([emoji]) => !isSingleEmoji(emoji),
    );
    expect(refused).toEqual([]);
  });
});

describe('searchEmojis', () => {
  it('matches the start of words in emoji names', () => {
    expect(searchEmojis('thumbs up').map(([emoji]) => emoji)).toEqual(['👍']);
    expect(searchEmojis('Flag aus').map(([emoji]) => emoji)).toEqual(['🇦🇹', '🇦🇺']);
    expect(searchEmojis('salut').map(([emoji]) => emoji)).toContain('🫡');
    expect(searchEmojis('   ')).toEqual([]);
    expect(searchEmojis('zzqx')).toEqual([]);
  });

  it('offers an emoji typed from the keyboard, including ones the catalogue leaves out', () => {
    expect(searchEmojis('🔥')).toEqual([['🔥', 'fire']]);
    expect(searchEmojis(' 👍🏽 ')).toEqual([['👍🏽', '👍🏽']]);
  });
});

describe('reactions', () => {
  it('saves the original emojis by name so older releases still show them', () => {
    expect(reactionKey('🔥')).toBe('fire');
    expect(reactionKey('❤')).toBe('love');
    expect(reactionKey('❤️')).toBe('love');
    expect(reactionKey('🫡')).toBe('🫡');
    expect(reactionEmoji('fire')).toBe('🔥');
    expect(reactionEmoji('🫡')).toBe('🫡');
    expect(reactionChoice('clap')).toEqual({ kind: 'clap', emoji: '👏', label: 'Applause' });
    expect(reactionChoice('🫡')).toEqual({ kind: '🫡', emoji: '🫡', label: '🫡' });
    expect(reactionChoice(null)).toBeUndefined();
  });

  it('removes your reaction when you choose it again', () => {
    expect(nextReaction('🫡', '🫡')).toBeNull();
    expect(nextReaction('fire', '🫡')).toBe('🫡');
    expect(nextReaction(null, 'fire')).toBe('fire');
  });
});
