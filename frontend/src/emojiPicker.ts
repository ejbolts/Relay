import { EMOJI_GROUPS, type EmojiGroup } from './emojiCatalog';

// The reaction picker's rules, shared by the web and the app: which emojis a search finds, and
// whether text typed into the search is itself an emoji to react with. The server applies the
// same single-emoji rule (backend/app/reactions.py).

const MAX_LENGTH = 16;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const ZWJ = 0x200d;
const KEYCAP = 0x20e3;
const CANCEL_TAG = 0xe007f;

const PICTOGRAPHIC: ReadonlyArray<readonly [number, number]> = [
  [0x00a9, 0x00a9],
  [0x00ae, 0x00ae],
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2122, 0x2122],
  [0x2139, 0x2139],
  [0x2194, 0x2199],
  [0x21a9, 0x21aa],
  [0x231a, 0x231b],
  [0x2328, 0x2328],
  [0x23cf, 0x23cf],
  [0x23e9, 0x23f3],
  [0x23f8, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25ab],
  [0x25b6, 0x25b6],
  [0x25c0, 0x25c0],
  [0x25fb, 0x25fe],
  [0x2600, 0x27bf],
  [0x2934, 0x2935],
  [0x2b05, 0x2b07],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3297],
  [0x3299, 0x3299],
  [0x1f000, 0x1f1e5],
  [0x1f200, 0x1f3fa],
  [0x1f400, 0x1faff],
  [0x1fc00, 0x1fffd],
];

const pictographic = (point: number) =>
  PICTOGRAPHIC.some(([start, end]) => point >= start && point <= end);
const regional = (point: number) => point >= 0x1f1e6 && point <= 0x1f1ff;
const skinTone = (point: number) => point >= 0x1f3fb && point <= 0x1f3ff;
const tag = (point: number) => point >= 0xe0020 && point <= 0xe007e;

/** One emoji between joiners: a symbol, optionally styled, toned or tagged (a region flag). */
function element(points: number[]): boolean {
  if (!points.length || !pictographic(points[0])) return false;
  let rest = points.slice(1);
  if (rest[0] === VS15 || rest[0] === VS16) rest = rest.slice(1);
  if (rest.length && skinTone(rest[0])) rest = rest.slice(1);
  if (rest.length && tag(rest[0])) {
    return rest[rest.length - 1] === CANCEL_TAG && rest.slice(0, -1).every(tag);
  }
  return rest.length === 0;
}

/** Whether `value` is one emoji, including joined, skin-toned, keycap and flag emojis. */
export function isSingleEmoji(value: string): boolean {
  const points = Array.from(value, (char) => char.codePointAt(0) ?? 0);
  if (!points.length || points.length > MAX_LENGTH) return false;
  if (points.length === 2 && points.every(regional)) return true;
  if (points[points.length - 1] === KEYCAP) {
    const base = points.slice(0, -1).filter((point) => point !== VS16);
    return base.length === 1 && '0123456789#*'.includes(String.fromCodePoint(base[0]));
  }
  const parts: number[][] = [[]];
  for (const point of points) {
    if (point === ZWJ) parts.push([]);
    else parts[parts.length - 1].push(point);
  }
  return parts.every(element);
}

export type EmojiEntry = readonly [emoji: string, name: string];

/**
 * Emojis whose name has a word starting with each searched word ("thumb up", "fla au"). An
 * emoji typed or pasted from the keyboard, such as one with a skin tone, comes first.
 */
export function searchEmojis(
  query: string,
  groups: ReadonlyArray<EmojiGroup> = EMOJI_GROUPS,
): EmojiEntry[] {
  const typed = query.trim();
  if (!typed) return [];
  if (isSingleEmoji(typed)) {
    const known = groups.flatMap((group) => group.emojis).find(([emoji]) => emoji === typed);
    return [known ?? [typed, typed]];
  }
  const words = typed.toLowerCase().split(/\s+/);
  const found: EmojiEntry[] = [];
  for (const group of groups) {
    for (const entry of group.emojis) {
      const name = entry[1].toLowerCase().split(/[\s:,'’“”()-]+/);
      if (words.every((word) => name.some((part) => part.startsWith(word)))) found.push(entry);
    }
  }
  return found;
}
