import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { COLOUR_THEMES, mixHex } from '../../../frontend/src/appearanceChoices';
import {
  colourMode,
  colourTheme,
  darkStyle,
  lightStyle,
} from '../features/settings/devicePreferences';

// Relay's Pulse palette, from frontend/src/pulse.css and lightMode.css.
const dark = {
  page: '#0b0d0f',
  surface: '#15181b',
  surface2: '#1d2125',
  surface3: '#272c31',
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.12)',
  text: '#f3f5f6',
  secondary: '#b4bcc2',
  muted: '#828b92',
  accent: '#2c74d0',
  accentText: '#7fb4f1',
  accentSoft: 'rgba(44,116,208,0.20)',
  onAccent: '#ffffff',
  good: '#2fb84a',
  gold: '#e9b44a',
  goldSoft: 'rgba(201,133,0,0.15)',
  danger: '#e66767',
  dangerFill: '#c53b3b',
  grid: '#22272b',
  deemph: '#353b41',
};

const light: typeof dark = {
  page: '#f3f5f7',
  surface: '#ffffff',
  surface2: '#eef1f3',
  surface3: '#e2e6ea',
  line: 'rgba(16,24,32,0.09)',
  lineStrong: 'rgba(16,24,32,0.16)',
  text: '#14181c',
  secondary: '#48515a',
  muted: '#69727a',
  accent: '#2c74d0',
  accentText: '#1f5fb0',
  accentSoft: 'rgba(44,116,208,0.12)',
  onAccent: '#ffffff',
  good: '#1d8534',
  gold: '#a36800',
  goldSoft: 'rgba(201,133,0,0.14)',
  danger: '#c53b3b',
  dangerFill: '#c53b3b',
  grid: '#e4e8eb',
  deemph: '#cdd3d8',
};

export type Palette = typeof dark;
export const palettes = { dark, light };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 12, lg: 14, card: 20, pill: 999 };
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16 },
  callout: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1.1 },
  number: { fontVariant: ['tabular-nums' as const] },
};

export function useTheme() {
  const system = useColorScheme() === 'light' ? 'light' : 'dark';
  const mode = colourMode.use();
  const theme = colourTheme.use();
  const dark = darkStyle.use();
  const light = lightStyle.use();
  const scheme = mode === 'auto' ? system : mode;
  const colors = useMemo(
    () => themedPalette(scheme, theme, dark, light),
    [scheme, theme, dark, light],
  );
  return { scheme, colors, space, radius, type } as const;
}

export function themedPalette(
  scheme: 'light' | 'dark',
  themeId: ReturnType<typeof colourTheme.use>,
  dark: ReturnType<typeof darkStyle.use>,
  light: ReturnType<typeof lightStyle.use>,
): Palette {
  const theme = COLOUR_THEMES.find(({ id }) => id === themeId) ?? COLOUR_THEMES[0];
  const accentText = scheme === 'light' ? theme.lightText : theme.text;
  const colors = {
    ...palettes[scheme],
    accent: theme.accent,
    accentText,
    accentSoft: `${theme.accent}${scheme === 'light' ? '26' : '33'}`,
  };
  if (scheme === 'light' && light === 'stained') {
    return {
      ...colors,
      page: mixHex(theme.accent, '#f3f5f7', 7),
      surface: mixHex(theme.accent, '#ffffff', 4),
      surface2: mixHex(theme.accent, '#eef1f3', 9),
      surface3: mixHex(theme.accent, '#e2e6ea', 14),
    };
  }
  if (scheme === 'dark' && dark === 'stained') {
    return {
      ...colors,
      page: mixHex(theme.accent, '#0a0d12', 7),
      surface: mixHex(theme.accent, '#151a21', 13),
      surface2: mixHex(theme.accent, '#1d242d', 17),
      surface3: mixHex(theme.accent, '#262e38', 23),
      line: `${accentText}24`,
      lineStrong: `${accentText}42`,
    };
  }
  if (scheme === 'dark' && dark === 'oled') {
    return {
      ...colors,
      page: '#000000',
      surface: '#000000',
      surface2: '#121417',
      surface3: '#1f2226',
      line: '#ffffff24',
      lineStrong: '#ffffff3d',
      text: '#ffffff',
      secondary: '#d4d9dd',
      muted: '#a8b0b6',
    };
  }
  return colors;
}
