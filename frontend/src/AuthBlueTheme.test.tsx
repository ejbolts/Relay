// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { colourThemePreference, saveColourTheme, saveDarkStyle } from './colourThemes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
  delete document.documentElement.dataset.darkStyle;
  delete document.documentElement.dataset.lightStyle;
});

it('shows the sign-in screen grey with Blue accents whatever is saved, then restores it', async () => {
  saveColourTheme('coral');
  saveDarkStyle('stained');
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <AuthScreen
        config={{ registration_open: true, invite_code_required: false }}
        onAuthenticated={vi.fn()}
      />,
    ),
  );
  const style = document.documentElement.style;
  expect(document.documentElement.dataset.colourTheme).toBe('blue');
  expect(style.getPropertyValue('--p-accent')).toBe('#2c74d0');
  // Plain grey surfaces rather than the accent-tinted Stained style.
  expect(document.documentElement.dataset.darkStyle).toBe('default');
  expect(document.documentElement.dataset.lightStyle).toBe('default');
  // The saved choice itself is untouched.
  expect(colourThemePreference()).toBe('coral');

  await act(async () => root.unmount());
  expect(document.documentElement.dataset.colourTheme).toBe('coral');
  expect(document.documentElement.dataset.darkStyle).toBe('stained');
  expect(style.getPropertyValue('--p-accent')).not.toBe('#2c74d0');
});
