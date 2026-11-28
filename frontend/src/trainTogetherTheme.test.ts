import { describe, expect, it } from 'vitest';
import { COLOUR_THEMES, mixHex } from './appearanceChoices';
import { paletteForTheme, partnerCssVars, partnerPalettes } from './trainTogetherTheme';

const plum = COLOUR_THEMES.find((theme) => theme.id === 'plum')!;

describe('partner palettes', () => {
  it('derives a dark palette from the theme', () => {
    expect(paletteForTheme('plum', false)).toEqual({
      id: 'plum',
      accent: '#8057ba',
      text: plum.text,
      soft: 'rgba(128, 87, 186, 0.2)',
      tint: mixHex('#8057ba', '#15181b', 14),
      line: 'rgba(128, 87, 186, 0.34)',
    });
  });

  it('derives a light palette from the theme', () => {
    expect(paletteForTheme('plum', true)).toEqual({
      id: 'plum',
      accent: '#8057ba',
      text: plum.lightText,
      soft: 'rgba(128, 87, 186, 0.12)',
      tint: mixHex('#8057ba', '#ffffff', 6),
      line: 'rgba(128, 87, 186, 0.36)',
    });
  });

  it('gives partners the fixed order, skipping the viewer’s own theme', () => {
    expect(partnerPalettes('blue', 3, false).map((palette) => palette.id)).toEqual([
      'plum',
      'amber',
      'coral',
    ]);
    expect(partnerPalettes('plum', 3, true).map((palette) => palette.id)).toEqual([
      'amber',
      'coral',
      'emerald',
    ]);
    expect(partnerPalettes('blue', 0, true)).toEqual([]);
  });

  it('exposes a palette as CSS custom properties', () => {
    const palette = paletteForTheme('amber', false);
    expect(partnerCssVars(palette)).toEqual({
      '--tt-accent': palette.accent,
      '--tt-text': palette.text,
      '--tt-soft': palette.soft,
      '--tt-tint': palette.tint,
      '--tt-line': palette.line,
    });
  });
});
