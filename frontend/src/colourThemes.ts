const THEME_KEY = 'gym-logger-colour-theme';
const MODE_KEY = 'gym-logger-colour-mode';
export const COLOUR_MODES = [
  { id: 'dark', name: 'Dark', icon: 'moon' },
  { id: 'light', name: 'Light', icon: 'sun' },
] as const;
export type ColourModeId = (typeof COLOUR_MODES)[number]['id'];
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
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', id === 'light' ? '#f3f5f7' : '#000000');
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
