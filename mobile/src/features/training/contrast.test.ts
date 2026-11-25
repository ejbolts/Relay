import {
  COLOUR_THEMES,
  DARK_STYLES,
  LIGHT_STYLES,
} from '../../../../frontend/src/appearanceChoices';
import { themedPalette } from '../../ui/theme';
import { cellInk, chartNeutral, composite, contrast, toneBadge } from './contrast';

// Every colour theme in every light and dark style, as the app can show it.
const palettes = COLOUR_THEMES.flatMap(({ id }) => [
  ...LIGHT_STYLES.map((style) => themedPalette('light', id, 'default', style.id)),
  ...DARK_STYLES.map((style) => themedPalette('dark', id, style.id, 'default')),
]);

test('agrees with WCAG on known pairs', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  expect(composite('rgba(0,0,0,0.5)', '#ffffff')).toBe('#808080');
});

test('keeps the cardio chart’s grey bars at 3:1 on the card', () => {
  for (const colors of palettes) {
    expect(contrast(chartNeutral(colors), colors.surface)).toBeGreaterThanOrEqual(3);
  }
});

test('keeps Current and Deload badge text at 4.5:1 on its tinted fill', () => {
  for (const colors of palettes) {
    for (const tone of ['good', 'gold'] as const) {
      const { fill, ink } = toneBadge(colors, tone);
      expect(contrast(ink, composite(fill, colors.surface))).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('reads a block’s week labels on any block colour, done or this week', () => {
  const blockColours = [
    '#000000',
    '#ffffff',
    '#808080',
    '#f97316',
    '#8aa4bd',
    '#c9a35a',
    '#2c74d0',
  ];
  for (const colors of palettes) {
    for (const colour of [...blockColours, colors.accentText]) {
      for (const alpha of ['b3', '4d']) {
        const fill = `${colour}${alpha}`;
        expect(
          contrast(cellInk(colors, fill), composite(fill, colors.surface2)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});
