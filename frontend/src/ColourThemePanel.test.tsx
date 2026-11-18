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

it('swaps the dark styles for Default and Stained light styles in light mode', () => {
  localStorage.setItem('gym-logger-colour-mode', 'light');
  localStorage.setItem('gym-logger-light-style', 'stained');
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).not.toContain('name="dark-style"');
  expect(markup).toContain('light-style-options');
  expect(markup).not.toContain('<strong>OLED</strong>');
  expect(markup.match(/<input[^>]*name="light-style"[^>]*value="stained"[^>]*>/)?.[0]).toContain(
    'checked=""',
  );
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

it('no longer offers a Background choice, since only the sign-in screen has the sun ray', () => {
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).not.toContain('<legend>Background</legend>');
  expect(markup).not.toContain('name="sun-ray-style"');
});

it('lists Neutral with the accent colour presets', () => {
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).toContain('<strong>Neutral</strong>');
  expect(markup).toMatch(/<input[^>]*name="colour-theme"[^>]*value="neutral"/);
});

it('no longer offers a Set colours choice', () => {
  const markup = renderToStaticMarkup(<ColourThemePanel />);
  expect(markup).not.toContain('<legend>Set colours</legend>');
  expect(markup).not.toContain('name="set-tint"');
});
