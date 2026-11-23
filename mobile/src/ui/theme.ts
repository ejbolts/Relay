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
  onGold: '#1c1404',
  danger: '#e66767',
  dangerFill: '#c53b3b',
  grid: '#22272b',
  axis: '#3a4046',
  deemph: '#353b41',
  /** A card's outline (--p-card-border): the line colour, brighter in OLED. */
  cardBorder: 'rgba(255,255,255,0.07)',
  /** Stained dark lifts cards with a shadow (--p-card-shadow); the other styles are flat. */
  cardShadow: false as boolean,
  /** The toast and floating surfaces' drop shadow. */
  shadow: 'rgba(0,0,0,0.45)',
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
  onGold: '#ffffff',
  danger: '#c53b3b',
  dangerFill: '#c53b3b',
  grid: '#e4e8eb',
  axis: '#c3cad0',
  deemph: '#cdd3d8',
  cardBorder: 'rgba(16,24,32,0.09)',
  cardShadow: false,
  shadow: 'rgba(16,24,32,0.18)',
};

export type Palette = typeof dark;
export const palettes = { dark, light };

// Spacing and radii from pulse.css: a 14 pt page gutter and 12 pt between cards, 12 pt buttons
// and inputs, 20 pt cards, 16 pt toasts.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, gutter: 14, stack: 12 };
export const radius = { sm: 10, md: 12, lg: 14, toast: 16, card: 20, sheet: 28, pill: 999 };
export const type = {
  /** The web's page title (.page-header h1): 30 px bold, tight. */
  largeTitle: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.75, lineHeight: 33 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16 },
  callout: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1.1 },
  /** A card's heading (.pulse-card-header h2). */
  cardTitle: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.15 },
  /** A button's label (.pulse-button). */
  button: { fontSize: 15, fontWeight: '600' as const },
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
      line: mixOver(theme.accent, [16, 24, 32, 0.09], 16),
      lineStrong: mixOver(theme.accent, [16, 24, 32, 0.16], 26),
      cardBorder: mixOver(theme.accent, [16, 24, 32, 0.09], 16),
      secondary: mixHex(theme.accent, '#48515a', 14),
      muted: mixHex(theme.accent, '#69727a', 14),
      grid: mixHex(theme.accent, '#e4e8eb', 12),
      deemph: mixHex(theme.accent, '#cdd3d8', 18),
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
      cardBorder: `${accentText}24`,
      cardShadow: true,
      secondary: mixHex(accentText, '#ccd3d9', 18),
      muted: mixHex(accentText, '#a1abb3', 18),
      grid: mixHex(theme.accent, '#262d35', 18),
      axis: mixHex(theme.accent, '#3e4750', 20),
      deemph: mixHex(theme.accent, '#37404a', 20),
      danger: '#f47a7a',
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
      cardBorder: '#ffffff38',
      grid: '#1f2327',
      axis: '#3d434a',
      deemph: '#33393f',
      danger: '#f47a7a',
    };
  }
  return colors;
}

/**
 * CSS `color-mix(in srgb, hex pct%, rgba(...))` for an opaque colour and a translucent one, as the
 * web's light Stained lines mix the accent into a translucent ink.
 */
export function mixOver(hex: string, [r, g, b, a]: [number, number, number, number], pct: number) {
  const p = pct / 100;
  const channel = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const alpha = p + (1 - p) * a;
  const mix = (c1: number, c2: number) => Math.round((p * c1 + (1 - p) * a * c2) / alpha);
  return `rgba(${mix(channel(0), r)},${mix(channel(1), g)},${mix(channel(2), b)},${+alpha.toFixed(3)})`;
}
