import { COLOUR_THEMES } from '../../../../frontend/src/appearanceChoices';
import { themedPalette } from '../../ui/theme';
import { over, tipPillColors } from './tipPill';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));

// WCAG contrast between two #rrggbb colours.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

it('keeps the Tips pill text at 4.5:1, unread and read, in every theme and style', () => {
  for (const { id } of COLOUR_THEMES) {
    for (const [scheme, dark, light] of [
      ['light', 'default', 'default'],
      ['light', 'default', 'stained'],
      ['dark', 'default', 'default'],
      ['dark', 'oled', 'default'],
      ['dark', 'stained', 'default'],
    ] as const) {
      const colors = themedPalette(scheme, id, dark, light);
      for (const unread of [true, false]) {
        const { fill, ink } = tipPillColors(colors, scheme, unread);
        // The pill sits on the page; its fill is drawn as an opaque colour.
        expect(fill).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

it('lays a translucent colour over the page', () => {
  expect(over('rgba(201,133,0,0.14)', '#f3f5f7')).toBe('#ede5d4');
  expect(over('#123456', '#ffffff')).toBe('#123456');
});
