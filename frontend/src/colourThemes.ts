const THEME_KEY = 'gym-logger-colour-theme';
const MODE_KEY = 'gym-logger-colour-mode';
const DARK_STYLE_KEY = 'gym-logger-dark-style';
export const COLOUR_MODES = [
  { id: 'dark', name: 'Dark', icon: 'moon' },
  { id: 'light', name: 'Light', icon: 'sun' },
] as const;
export type ColourModeId = (typeof COLOUR_MODES)[number]['id'];
export const DARK_STYLES = [
  { id: 'default', name: 'Default' },
  { id: 'stained', name: 'Stained' },
  { id: 'oled', name: 'OLED' },
] as const;
export type DarkStyleId = (typeof DARK_STYLES)[number]['id'];
export const COLOUR_THEMES = [
  {
    id: 'blue',
    name: 'Blue',
    detail: 'Original',
    accent: '#2c74d0',
    hover: '#357bd6',
    text: '#7fb4f1',
    lightText: '#1f62b4',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    detail: 'Forest green',
    accent: '#237844',
    hover: '#2d8a51',
    text: '#78d49c',
    lightText: '#1b6638',
  },
  {
    id: 'plum',
    name: 'Plum',
    detail: 'Soft purple',
    accent: '#8057ba',
    hover: '#9069c7',
    text: '#c4a2ef',
    lightText: '#663f9e',
  },
  {
    id: 'coral',
    name: 'Coral',
    detail: 'Warm coral',
    accent: '#a44850',
    hover: '#b7565e',
    text: '#f3a0a6',
    lightText: '#943a42',
  },
  {
    id: 'amber',
    name: 'Amber',
    detail: 'Burnt amber',
    accent: '#985014',
    hover: '#ac6020',
    text: '#efb06d',
    lightText: '#8a4410',
  },
] as const;
export type ColourThemeId = (typeof COLOUR_THEMES)[number]['id'];

export function colourThemePreference(): ColourThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return COLOUR_THEMES.find((theme) => theme.id === saved)?.id ?? 'blue';
  } catch {
    return 'blue';
  }
}

export function applyColourTheme(id: ColourThemeId) {
  const theme = COLOUR_THEMES.find((entry) => entry.id === id) ?? COLOUR_THEMES[0];
  const root = document.documentElement;
  root.dataset.colourTheme = theme.id;
  root.style.setProperty('--p-accent', theme.accent);
  root.style.setProperty('--p-accent-hover', theme.hover);
  // Light mode needs a darker accent tint so accent-coloured text stays readable on white.
  const light = root.dataset.colourMode === 'light';
  root.style.setProperty('--p-accent-text', light ? theme.lightText : theme.text);
  // Dark cards are lighter than before, so the soft tint needs a little more colour to stand out.
  root.style.setProperty(
    '--p-accent-soft',
    `color-mix(in srgb, ${theme.accent} ${light ? 15 : 20}%, transparent)`,
  );
  updateBrowserThemeColour();
}

/** Mix two #rrggbb colours, matching CSS `color-mix(in srgb, a pct%, b)`. */
function mixHex(a: string, b: string, pct: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) * (pct / 100) + channel(b, i) * (1 - pct / 100))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Page colour for the phone's browser bar; kept in step with the `--p-page` token in pulse.css. */
export function browserThemeColour(
  mode: ColourModeId,
  style: DarkStyleId,
  themeId: ColourThemeId,
): string {
  if (mode === 'light') return '#f3f5f7';
  if (style === 'oled') return '#000000';
  if (style === 'stained') {
    const theme = COLOUR_THEMES.find((entry) => entry.id === themeId) ?? COLOUR_THEMES[0];
    return mixHex(theme.accent, '#0a0d12', 7);
  }
  return '#111417';
}

function updateBrowserThemeColour() {
  const root = document.documentElement;
  const mode: ColourModeId = root.dataset.colourMode === 'light' ? 'light' : 'dark';
  const style = DARK_STYLES.find((entry) => entry.id === root.dataset.darkStyle)?.id ?? 'default';
  const theme = COLOUR_THEMES.find((entry) => entry.id === root.dataset.colourTheme)?.id ?? 'blue';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', browserThemeColour(mode, style, theme));
}

export function darkStylePreference(): DarkStyleId {
  try {
    const saved = localStorage.getItem(DARK_STYLE_KEY);
    return DARK_STYLES.find((style) => style.id === saved)?.id ?? 'default';
  } catch {
    return 'default';
  }
}

export function applyDarkStyle(id: DarkStyleId) {
  document.documentElement.dataset.darkStyle = id;
  updateBrowserThemeColour();
}

export function saveDarkStyle(id: DarkStyleId): boolean {
  applyDarkStyle(id);
  try {
    localStorage.setItem(DARK_STYLE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function saveColourTheme(id: ColourThemeId): boolean {
  applyColourTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function colourModePreference(): ColourModeId {
  try {
    return localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyColourMode(id: ColourModeId) {
  const root = document.documentElement;
  root.dataset.colourMode = id;
  const theme = root.dataset.colourTheme;
  applyColourTheme(COLOUR_THEMES.find((entry) => entry.id === theme)?.id ?? 'blue');
}

export function saveColourMode(id: ColourModeId): boolean {
  applyColourMode(id);
  try {
    localStorage.setItem(MODE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
