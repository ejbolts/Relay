// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyColourMode,
  applyColourTheme,
  browserThemeColour,
  COLOUR_THEMES,
  darkStylePreference,
  saveDarkStyle,
  colourModePreference,
  colourThemePreference,
  saveColourMode,
  saveColourTheme,
} from './colourThemes';
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
  delete document.documentElement.dataset.colourMode;
  delete document.documentElement.dataset.darkStyle;
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  vi.restoreAllMocks();
});
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
it('defaults to dark mode and keeps the saved accent when switching to light', () => {
  expect(colourModePreference()).toBe('dark');
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
  expect(colourModePreference()).toBe('dark');
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
