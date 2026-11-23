import {
  browserThemeColour,
  COLOUR_THEMES,
  DARK_STYLES,
  DEFAULT_GLASS_LEVEL,
  GLASS_LEVELS,
  LIGHT_STYLES,
  type ColourModeId,
  type ColourThemeId,
  type DarkStyleId,
  type GlassLevelId,
  type LightStyleId,
  type ShownColourMode,
} from './appearanceChoices';

export * from './appearanceChoices';

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_KEY = 'gym-logger-colour-theme';
const MODE_KEY = 'gym-logger-colour-mode';
const DARK_STYLE_KEY = 'gym-logger-dark-style';
const GLASS_KEY = 'gym-logger-glass';
// Retired Background choice; the reset clears any value a device still holds.
const SUN_RAY_KEY = 'gym-logger-sun-ray';
const LIGHT_STYLE_KEY = 'gym-logger-light-style';
// Retired Set colours choice; the reset clears any value a device still holds.
const SET_TINT_KEY = 'gym-logger-set-tint';
const APPEARANCE_RESET_KEY = 'gym-logger-appearance-reset';
/** Bump to move every device onto the default look again once, keeping its accent colour. */
export const APPEARANCE_RESET_VERSION = '4';
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

function updateBrowserThemeColour() {
  const root = document.documentElement;
  const mode: ShownColourMode = root.dataset.colourMode === 'light' ? 'light' : 'dark';
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

/** Automatic unless this device saved Dark or Light. */
export function colourModePreference(): ColourModeId {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function systemDarkQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_DARK_QUERY) : null;
  } catch {
    return null;
  }
}

/** The phone's own light or dark setting; dark when the browser cannot tell. */
export function systemColourMode(): ShownColourMode {
  const query = systemDarkQuery();
  return !query || query.matches ? 'dark' : 'light';
}

/** Calls `onChange` whenever the phone switches between light and dark; returns the unsubscribe. */
export function subscribeSystemColourMode(onChange: () => void): () => void {
  const query = systemDarkQuery();
  if (!query) return () => undefined;
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  // Safari before 14 only has the older listener methods.
  if (typeof query.addListener !== 'function') return () => undefined;
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

export function shownColourMode(id: ColourModeId): ShownColourMode {
  return id === 'auto' ? systemColourMode() : id;
}

// The mode chosen for this visit, so a phone switch only moves the app while Automatic is on.
let appliedColourMode: ColourModeId = 'auto';

export function applyColourMode(id: ColourModeId) {
  appliedColourMode = id;
  const root = document.documentElement;
  root.dataset.colourMode = shownColourMode(id);
  const theme = root.dataset.colourTheme;
  applyColourTheme(COLOUR_THEMES.find((entry) => entry.id === theme)?.id ?? 'blue');
}

/** Keeps Automatic in step with the phone while the app is open. Call once at startup. */
export function followSystemColourMode(): () => void {
  return subscribeSystemColourMode(() => {
    if (appliedColourMode === 'auto') applyColourMode('auto');
  });
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
 * Once per device, moves existing appearance choices onto the default look (Automatic mode, Default
 * style, Medium glass) while keeping the accent colour. Later choices are left alone.
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
