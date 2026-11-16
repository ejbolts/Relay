// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import { colourThemePreference, saveColourTheme } from './colourThemes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.colourTheme;
});

it('shows the sign-in screen in Blue whatever theme is saved, then restores the saved theme', async () => {
  saveColourTheme('coral');
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
  // The saved choice itself is untouched.
  expect(colourThemePreference()).toBe('coral');

  await act(async () => root.unmount());
  expect(document.documentElement.dataset.colourTheme).toBe('coral');
  expect(style.getPropertyValue('--p-accent')).not.toBe('#2c74d0');
});
