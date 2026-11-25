import type { Palette } from '../../ui/theme';
import { mixColor } from '../home/color';

/** An `rgba(r,g,b,a)` colour laid over an opaque `#rrggbb` one, as the screen shows it. */
export function over(rgba: string, base: string) {
  const parts = rgba
    .match(/rgba?\(([^)]+)\)/)?.[1]
    .split(',')
    .map((part) => Number(part.trim()));
  if (!parts || parts.length < 3) return rgba;
  const [r, g, b, a = 1] = parts;
  const hex = `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  return mixColor(hex, base, a);
}

/**
 * The Tips pill's fill and ink: amber while tips are unread, a muted tint once read, as the web's
 * `.home-tip-button`. In light mode the web's gold and muted ink are too faint for 12 pt text on
 * those fills, so the count is gold deepened towards the ink and the read label uses the
 * secondary ink, both at least 4.5:1.
 */
export function tipPillColors(colors: Palette, scheme: 'light' | 'dark', unread: boolean) {
  if (unread)
    return {
      fill: over(colors.goldSoft, colors.page),
      ink: scheme === 'light' ? mixColor(colors.gold, colors.text, 0.75) : colors.gold,
    };
  return { fill: mixColor(colors.muted, colors.page, 0.14), ink: colors.secondary };
}
