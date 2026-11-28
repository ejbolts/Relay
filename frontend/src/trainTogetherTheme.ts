import { COLOUR_THEMES, mixHex, type ColourThemeId } from './appearanceChoices';
import { partnerThemeIds } from './trainTogether';

export interface PartnerPalette {
  id: ColourThemeId;
  accent: string;
  text: string;
  soft: string;
  tint: string;
  line: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Derives a partner's palette from COLOUR_THEMES using the exact alpha and mixHex steps from
 * DESIGN.md: soft (20% dark / 12% light), tint (mixHex with surface 14% dark / 6% light),
 * line (34% dark / 36% light).
 */
export function paletteForTheme(themeId: ColourThemeId, lightMode: boolean): PartnerPalette {
  const theme = COLOUR_THEMES.find((entry) => entry.id === themeId) ?? COLOUR_THEMES[0];
  const surface = lightMode ? '#ffffff' : '#15181b';
  return {
    id: theme.id,
    accent: theme.accent,
    text: lightMode ? theme.lightText : theme.text,
    soft: hexToRgba(theme.accent, lightMode ? 0.12 : 0.2),
    tint: mixHex(theme.accent, surface, lightMode ? 6 : 14),
    line: hexToRgba(theme.accent, lightMode ? 0.36 : 0.34),
  };
}

/** One palette per partner, in the server's stable member order, skipping the viewer's own theme. */
export function partnerPalettes(
  ownThemeId: ColourThemeId,
  count: number,
  lightMode: boolean,
): PartnerPalette[] {
  return partnerThemeIds(ownThemeId, count).map((id) => paletteForTheme(id, lightMode));
}

/** CSS custom properties for styling a partner row, pace strip, avatar or banner. */
export function partnerCssVars(palette: PartnerPalette): Record<string, string> {
  return {
    '--tt-accent': palette.accent,
    '--tt-text': palette.text,
    '--tt-soft': palette.soft,
    '--tt-tint': palette.tint,
    '--tt-line': palette.line,
  };
}
