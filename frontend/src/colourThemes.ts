const THEME_KEY = 'gym-logger-colour-theme';
const MODE_KEY = 'gym-logger-colour-mode';
const DARK_STYLE_KEY = 'gym-logger-dark-style';
const GLASS_KEY = 'gym-logger-glass';
const SUN_RAY_KEY = 'gym-logger-sun-ray';
const LIGHT_STYLE_KEY = 'gym-logger-light-style';
const SET_TINT_KEY = 'gym-logger-set-tint';
const APPEARANCE_RESET_KEY = 'gym-logger-appearance-reset';
/** Bump to move every device onto the default look again once, keeping its accent colour. */
export const APPEARANCE_RESET_VERSION = '3';
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
export const LIGHT_STYLES = [
  { id: 'default', name: 'Default' },
  { id: 'stained', name: 'Stained' },
] as const;
export type LightStyleId = (typeof LIGHT_STYLES)[number]['id'];
/** How see-through the frosted-glass cards and tab bar are; `off` keeps them solid. */
export const GLASS_LEVELS = [
  { id: 'off', name: 'Off' },
  { id: 'subtle', name: 'Subtle' },
  { id: 'medium', name: 'Medium' },
  { id: 'strong', name: 'Strong' },
] as const;
export type GlassLevelId = (typeof GLASS_LEVELS)[number]['id'];
/** How strongly logged sets are tinted by type (green working, orange warm-up and so on). */
export const SET_TINT_LEVELS = [
  { id: 'subtle', name: 'Subtle' },
  { id: 'medium', name: 'Medium' },
  { id: 'strong', name: 'Strong' },
] as const;
export type SetTintId = (typeof SET_TINT_LEVELS)[number]['id'];
export const DEFAULT_SET_TINT: SetTintId = 'medium';
export const DEFAULT_GLASS_LEVEL: GlassLevelId = 'subtle';
/** The drifting light behind the app, in the accent colour, or none at all. */
export const SUN_RAY_STYLES = [
  { id: 'dim', name: 'Dim' },
  // Keeps its original id, so a saved "Sun ray" choice carries over as Medium.
  { id: 'colour', name: 'Medium' },
  { id: 'strong', name: 'Strong' },
  { id: 'blank', name: 'Blank' },
] as const;
export type SunRayStyleId = (typeof SUN_RAY_STYLES)[number]['id'];
export const DEFAULT_SUN_RAY_STYLE: SunRayStyleId = 'dim';
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
  {
    id: 'neutral',
    name: 'Neutral',
    detail: 'Silver grey',
    accent: '#5f6670',
    hover: '#6c747e',
    text: '#c5cbd2',
    lightText: '#4a525b',
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
  lightStyle: LightStyleId = 'default',
): string {
  const theme = COLOUR_THEMES.find((entry) => entry.id === themeId) ?? COLOUR_THEMES[0];
  if (mode === 'light')
    return lightStyle === 'stained' ? mixHex(theme.accent, '#f3f5f7', 7) : '#f3f5f7';
  if (style === 'oled') return '#000000';
  if (style === 'stained') return mixHex(theme.accent, '#0a0d12', 7);
  return '#0b0d0f';
}

function updateBrowserThemeColour() {
  const root = document.documentElement;
  const mode: ColourModeId = root.dataset.colourMode === 'light' ? 'light' : 'dark';
  const style = DARK_STYLES.find((entry) => entry.id === root.dataset.darkStyle)?.id ?? 'default';
  const theme = COLOUR_THEMES.find((entry) => entry.id === root.dataset.colourTheme)?.id ?? 'blue';
  const lightStyle =
    LIGHT_STYLES.find((entry) => entry.id === root.dataset.lightStyle)?.id ?? 'default';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', browserThemeColour(mode, style, theme, lightStyle));
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

export function glassPreference(): GlassLevelId {
  try {
    const saved = localStorage.getItem(GLASS_KEY);
    return GLASS_LEVELS.find((level) => level.id === saved)?.id ?? DEFAULT_GLASS_LEVEL;
  } catch {
    return DEFAULT_GLASS_LEVEL;
  }
}

export function applyGlass(id: GlassLevelId) {
  document.documentElement.dataset.glass = id;
}

export function saveGlass(id: GlassLevelId): boolean {
  applyGlass(id);
  try {
    localStorage.setItem(GLASS_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function sunRayPreference(): SunRayStyleId {
  try {
    const saved = localStorage.getItem(SUN_RAY_KEY);
    return SUN_RAY_STYLES.find((style) => style.id === saved)?.id ?? DEFAULT_SUN_RAY_STYLE;
  } catch {
    return DEFAULT_SUN_RAY_STYLE;
  }
}

export function applySunRay(id: SunRayStyleId) {
  document.documentElement.dataset.sunRay = id;
}

export function saveSunRay(id: SunRayStyleId): boolean {
  applySunRay(id);
  try {
    localStorage.setItem(SUN_RAY_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function lightStylePreference(): LightStyleId {
  try {
    const saved = localStorage.getItem(LIGHT_STYLE_KEY);
    return LIGHT_STYLES.find((style) => style.id === saved)?.id ?? 'default';
  } catch {
    return 'default';
  }
}

export function applyLightStyle(id: LightStyleId) {
  document.documentElement.dataset.lightStyle = id;
  updateBrowserThemeColour();
}

export function saveLightStyle(id: LightStyleId): boolean {
  applyLightStyle(id);
  try {
    localStorage.setItem(LIGHT_STYLE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Once per device, moves existing appearance choices onto the default look (Dark, Default style,
 * Medium sun ray, Subtle glass, Medium set colours) while keeping the accent colour. Later choices are left alone.
 */
export function resetAppearanceOnce(): void {
  try {
    if (localStorage.getItem(APPEARANCE_RESET_KEY) === APPEARANCE_RESET_VERSION) return;
    localStorage.removeItem(MODE_KEY);
    localStorage.removeItem(DARK_STYLE_KEY);
    localStorage.removeItem(LIGHT_STYLE_KEY);
    localStorage.removeItem(SUN_RAY_KEY);
    localStorage.removeItem(GLASS_KEY);
    localStorage.removeItem(SET_TINT_KEY);
    localStorage.setItem(APPEARANCE_RESET_KEY, APPEARANCE_RESET_VERSION);
  } catch {
    // Without storage every choice already falls back to the defaults.
  }
}

export function setTintPreference(): SetTintId {
  try {
    const saved = localStorage.getItem(SET_TINT_KEY);
    return SET_TINT_LEVELS.find((level) => level.id === saved)?.id ?? DEFAULT_SET_TINT;
  } catch {
    return DEFAULT_SET_TINT;
  }
}

export function applySetTint(id: SetTintId) {
  document.documentElement.dataset.setTint = id;
}

export function saveSetTint(id: SetTintId): boolean {
  applySetTint(id);
  try {
    localStorage.setItem(SET_TINT_KEY, id);
    return true;
  } catch {
    return false;
  }
}
