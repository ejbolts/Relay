import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeScreenGuide } from './HomeScreenGuide';

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));
beforeEach(() => {
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', { location: { host: 'preview.example.test:8447' } });
});
afterEach(() => vi.unstubAllGlobals());

describe('home screen guide popup', () => {
  it('walks through the Safari steps in order with illustrations hidden from screen readers', () => {
    const markup = renderToStaticMarkup(<HomeScreenGuide onClose={vi.fn()} />);
    expect(markup).toContain('<dialog');
    expect(markup).toContain('>Add to Home Screen</h2>');
    expect(markup).toContain('aria-label="Close Add to Home Screen"');
    const steps = [...markup.matchAll(/<li><p>(.*?)<\/p>/g)].map(([, text]) =>
      text.replace(/<[^>]+>/g, ''),
    );
    expect(steps).toEqual([
      'In Safari, tap the menu button on the left of the address bar.',
      'Tap Share.',
      'Tap View More.',
      'Tap Add to Home Screen.',
      'Tap Add, then open Relay from your Home Screen.',
    ]);
    expect(markup.match(/class="home-guide-shot" aria-hidden="true"/g)).toHaveLength(5);
    expect(markup).toContain('href="https://relayfitness.app"');
    expect(markup.match(/>relayfitness.app</g)).toHaveLength(2);
    expect(markup).not.toContain('preview.example.test');
    expect(markup).toContain('>Got it</button>');
  });
});
