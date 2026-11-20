// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyColourMode,
  applyColourTheme,
  browserThemeColour,
  COLOUR_MODES,
  COLOUR_THEMES,
  darkStylePreference,
  glassPreference,
  saveDarkStyle,
  saveGlass,
  resetAppearanceOnce,
  saveLightStyle,
  lightStylePreference,
  colourModePreference,
  colourThemePreference,
  followSystemColourMode,
  saveColourMode,
  saveColourTheme,
  shownColourMode,
} from './colourThemes';
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
  delete document.documentElement.dataset.colourMode;
  delete document.documentElement.dataset.darkStyle;
  delete document.documentElement.dataset.glass;
  delete document.documentElement.dataset.lightStyle;
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Stands in for the phone's light or dark setting; `set` flips it like the phone would. */
function stubPhoneMode(initial: 'dark' | 'light') {
  let dark = initial === 'dark';
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    set(mode: 'dark' | 'light') {
      dark = mode === 'dark';
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
}
it('persists a selected theme and applies its accent without affecting status colours', () => {
  expect(saveColourTheme('amber')).toBe(true);
  expect(colourThemePreference()).toBe('amber');
  expect(document.documentElement.dataset.colourTheme).toBe('amber');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#985014');
  expect(document.documentElement.style.getPropertyValue('--p-danger')).toBe('');
});
it('uses Blue for invalid storage and keeps the theme usable when storage is unavailable', () => {
  localStorage.setItem('gym-logger-colour-theme', 'missing');
  expect(colourThemePreference()).toBe('blue');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveColourTheme('plum')).toBe(false);
  expect(document.documentElement.dataset.colourTheme).toBe('plum');
  applyColourTheme('blue');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#2c74d0');
});
it('defaults to Automatic and keeps the saved accent when switching to light', () => {
  expect(colourModePreference()).toBe('auto');
  saveColourTheme('emerald');
  expect(saveColourMode('light')).toBe(true);
  expect(colourModePreference()).toBe('light');
  expect(document.documentElement.dataset.colourMode).toBe('light');
  expect(document.documentElement.dataset.colourTheme).toBe('emerald');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#237844');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#1b6638');
  expect(document.documentElement.style.getPropertyValue('--p-accent-soft')).toBe(
    'color-mix(in srgb, #237844 15%, transparent)',
  );
  applyColourMode('dark');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#78d49c');
  expect(document.documentElement.style.getPropertyValue('--p-accent-soft')).toBe(
    'color-mix(in srgb, #237844 20%, transparent)',
  );
});
it('keeps white text on every accent button at WCAG AA contrast', () => {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const theme of COLOUR_THEMES) {
    expect(1.05 / (luminance(theme.accent) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
it('ignores invalid modes and applies light mode when storage is unavailable', () => {
  localStorage.setItem('gym-logger-colour-mode', 'sepia');
  expect(colourModePreference()).toBe('auto');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveColourMode('light')).toBe(false);
  expect(document.documentElement.dataset.colourMode).toBe('light');
});

it('defaults to the Default dark style and ignores unknown saved styles', () => {
  expect(darkStylePreference()).toBe('default');
  localStorage.setItem('gym-logger-dark-style', 'neon');
  expect(darkStylePreference()).toBe('default');
});
it('saves a dark style, marks the page and updates the browser bar colour', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  applyColourMode('dark');
  expect(saveDarkStyle('oled')).toBe(true);
  expect(darkStylePreference()).toBe('oled');
  expect(document.documentElement.dataset.darkStyle).toBe('oled');
  expect(meta.content).toBe('#000000');
  saveColourTheme('emerald');
  saveDarkStyle('stained');
  expect(meta.content).toBe(browserThemeColour('dark', 'stained', 'emerald'));
  applyColourMode('light');
  expect(meta.content).toBe('#f3f5f7');
});
it('keeps the dark style usable when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveDarkStyle('stained')).toBe(false);
  expect(document.documentElement.dataset.darkStyle).toBe('stained');
});
it('tints the Stained browser bar colour with the accent theme', () => {
  expect(browserThemeColour('dark', 'default', 'blue')).toBe('#0b0d0f');
  expect(browserThemeColour('dark', 'stained', 'blue')).toBe('#0c141f');
  expect(browserThemeColour('dark', 'stained', 'coral')).toBe('#151116');
});
it('defaults frosted glass to Medium and ignores unknown saved levels', () => {
  expect(glassPreference()).toBe('medium');
  localStorage.setItem('gym-logger-glass', 'opaque');
  expect(glassPreference()).toBe('medium');
});
it('saves a frosted glass level and marks the page with it', () => {
  expect(saveGlass('strong')).toBe(true);
  expect(glassPreference()).toBe('strong');
  expect(document.documentElement.dataset.glass).toBe('strong');
  saveGlass('off');
  expect(document.documentElement.dataset.glass).toBe('off');
});
it('keeps the frosted glass level for this visit when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(saveGlass('subtle')).toBe(false);
  expect(document.documentElement.dataset.glass).toBe('subtle');
});
it('offers a Neutral accent preset that applies its silver grey accent', () => {
  expect(COLOUR_THEMES.map((theme) => theme.id)).toContain('neutral');
  saveColourTheme('neutral');
  expect(colourThemePreference()).toBe('neutral');
  expect(document.documentElement.style.getPropertyValue('--p-accent')).toBe('#5f6670');
});
it('saves a light style separately and tints the light browser bar when Stained', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  expect(lightStylePreference()).toBe('default');
  saveColourTheme('emerald');
  applyColourMode('light');
  expect(meta.content).toBe('#f3f5f7');
  expect(saveLightStyle('stained')).toBe(true);
  expect(lightStylePreference()).toBe('stained');
  expect(document.documentElement.dataset.lightStyle).toBe('stained');
  expect(meta.content).toBe(browserThemeColour('light', 'default', 'emerald', 'stained'));
  expect(meta.content).not.toBe('#f3f5f7');
  localStorage.setItem('gym-logger-light-style', 'oled');
  expect(lightStylePreference()).toBe('default');
});
it('moves a device onto the default look once, keeping its accent colour', () => {
  localStorage.setItem('gym-logger-colour-theme', 'coral');
  localStorage.setItem('gym-logger-colour-mode', 'light');
  localStorage.setItem('gym-logger-dark-style', 'oled');
  localStorage.setItem('gym-logger-light-style', 'stained');
  localStorage.setItem('gym-logger-sun-ray', 'colour');
  localStorage.setItem('gym-logger-glass', 'off');
  localStorage.setItem('gym-logger-set-tint', 'strong');
  // A device that ran an earlier version of the reset is moved onto the current defaults too.
  localStorage.setItem('gym-logger-appearance-reset', '3');
  resetAppearanceOnce();
  expect(colourThemePreference()).toBe('coral');
  expect(colourModePreference()).toBe('auto');
  expect(darkStylePreference()).toBe('default');
  expect(lightStylePreference()).toBe('default');
  // The retired Background choice is cleared too.
  expect(localStorage.getItem('gym-logger-sun-ray')).toBeNull();
  expect(glassPreference()).toBe('medium');
  // The retired Set colours choice is cleared too.
  expect(localStorage.getItem('gym-logger-set-tint')).toBeNull();
  // Choices made after the reset stay put on later loads.
  saveGlass('strong');
  saveColourMode('light');
  resetAppearanceOnce();
  expect(glassPreference()).toBe('strong');
  expect(colourModePreference()).toBe('light');
});
it('offers Dark, Light and Automatic modes and keeps a saved Dark or Light choice', () => {
  expect(COLOUR_MODES.map((mode) => mode.name)).toEqual(['Dark', 'Light', 'Automatic']);
  localStorage.setItem('gym-logger-colour-mode', 'dark');
  expect(colourModePreference()).toBe('dark');
  localStorage.setItem('gym-logger-colour-mode', 'light');
  expect(colourModePreference()).toBe('light');
  expect(saveColourMode('auto')).toBe(true);
  expect(colourModePreference()).toBe('auto');
});
it('shows the phone setting in Automatic and follows it when the phone switches', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  const phone = stubPhoneMode('light');
  const stop = followSystemColourMode();
  saveColourTheme('plum');
  applyColourMode('auto');
  expect(shownColourMode('auto')).toBe('light');
  expect(document.documentElement.dataset.colourMode).toBe('light');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#663f9e');
  expect(meta.content).toBe('#f3f5f7');
  phone.set('dark');
  expect(document.documentElement.dataset.colourMode).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--p-accent-text')).toBe('#c4a2ef');
  expect(meta.content).toBe('#0b0d0f');
  stop();
  expect(phone.listeners.size).toBe(0);
});
it('leaves a chosen Dark or Light mode alone when the phone switches', () => {
  const phone = stubPhoneMode('dark');
  const stop = followSystemColourMode();
  saveColourMode('dark');
  phone.set('light');
  expect(document.documentElement.dataset.colourMode).toBe('dark');
  saveColourMode('light');
  phone.set('dark');
  expect(document.documentElement.dataset.colourMode).toBe('light');
  stop();
});
it('shows dark in Automatic when the browser cannot report the phone setting', () => {
  vi.stubGlobal('matchMedia', undefined);
  applyColourMode('auto');
  expect(document.documentElement.dataset.colourMode).toBe('dark');
  expect(followSystemColourMode()).toBeTypeOf('function');
});
