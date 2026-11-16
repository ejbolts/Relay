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

it('offers Off, Subtle, Medium and Strong frosted glass with Medium selected by default', () => {
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).toContain('<legend>Frosted glass</legend>');
  for (const name of ['Off', 'Subtle', 'Medium', 'Strong'])
    expect(markup).toContain(`<strong>${name}</strong>`);
  expect(markup.match(/<input[^>]*name="glass-level"[^>]*value="medium"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
});

it('shows the frosted glass levels in light mode and selects the saved one', () => {
  localStorage.setItem('gym-logger-colour-mode', 'light');
  localStorage.setItem('gym-logger-glass', 'off');
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup.match(/<input[^>]*name="glass-level"[^>]*value="off"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
});

it('offers Colour, Grey and Blank backgrounds with the saved one selected', () => {
  localStorage.setItem('gym-logger-sun-ray', 'grey');
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).toContain('<legend>Background</legend>');
  for (const name of ['Colour', 'Grey', 'Blank'])
    expect(markup).toContain(`<strong>${name}</strong>`);
  expect(markup.match(/<input[^>]*name="sun-ray-style"[^>]*value="grey"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
});
