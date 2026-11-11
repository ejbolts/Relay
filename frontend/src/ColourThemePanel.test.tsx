// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import { ColourThemePanel } from './ColourThemePanel';

afterEach(() => localStorage.clear());

it('offers Default, Stained and OLED dark styles in dark mode with the saved one selected', () => {
  localStorage.setItem('gym-logger-dark-style', 'stained');
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).toContain('class="dark-style-options"');
  for (const name of ['Default', 'Stained', 'OLED'])
    expect(markup).toContain(`<strong>${name}</strong>`);
  const stained = markup.match(/<input[^>]*value="stained"[^>]*>/)?.[0];
  expect(stained).toContain('checked=""');
});

it('hides the dark styles in light mode', () => {
  localStorage.setItem('gym-logger-colour-mode', 'light');
  expect(renderToStaticMarkup(<ColourThemePanel />)).not.toContain('dark-style-options');
});
