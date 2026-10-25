import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';

const screenshot = {
  url: 'https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/docs/screenshots/sample-release.png',
  alt: 'Sample release notification and refresh button',
};

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));
beforeEach(() => vi.stubGlobal('document', { body: {} }));
afterEach(() => vi.unstubAllGlobals());

describe('release popup', () => {
  it('shows the version, notes, safe GitHub link and accessible dismissal controls', () => {
    const markup = renderToStaticMarkup(
      <ReleaseAnnouncement release={{ ...metadata, version: '1.0.0' }} onClose={vi.fn()} />,
    );
    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('>Version 1.0</h2>');
    expect(markup).toContain(
      '<svg class="release-confetti" viewBox="0 0 24 24" aria-hidden="true"',
    );
    expect(markup).toContain(renderToStaticMarkup(<h3>{metadata.title}</h3>));
    expect(markup).toContain(metadata.summary);
    expect(markup.match(/<li>/g)).toHaveLength(metadata.changes.length);
    expect(markup).toContain(`href="${metadata.url}"`);
    expect(markup).toContain('target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('aria-label="Close Version 1.0"');
    expect(markup).toContain('>Got it</button>');
  });

  it('shows an accessible screenshot linking to the original image without sending a referrer', () => {
    const markup = renderToStaticMarkup(
      <ReleaseAnnouncement
        release={{ ...metadata, highlights: undefined, image: screenshot }}
        onClose={vi.fn()}
      />,
    );
    expect(markup).toContain(`src="${screenshot.url}"`);
    expect(markup).toContain(`alt="${screenshot.alt}"`);
    expect(markup).toContain(`href="${screenshot.url}"`);
    expect(markup).toContain('referrerPolicy="no-referrer"');
  });

  it('keeps text-only releases usable', () => {
    const markup = renderToStaticMarkup(
      <ReleaseAnnouncement
        release={{ ...metadata, highlights: undefined, image: undefined }}
        onClose={vi.fn()}
      />,
    );
    expect(markup).not.toContain('<img');
    expect(markup).toContain(metadata.summary);
    expect(markup).toContain('>Got it</button>');
  });

  it('renders release notes as text rather than executable HTML', () => {
    const markup = renderToStaticMarkup(
      <ReleaseAnnouncement
        release={{ ...metadata, changes: ['<script>alert(1)</script>'] }}
        onClose={vi.fn()}
      />,
    );
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).not.toContain('<script>');
  });
});
