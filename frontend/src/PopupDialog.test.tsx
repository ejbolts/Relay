import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupDialog } from './PopupDialog';

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));

beforeEach(() => vi.stubGlobal('document', { body: {} }));
afterEach(() => vi.unstubAllGlobals());

describe('shared popup dialog', () => {
  it('renders accessible form content and a close control', () => {
    const markup = renderToStaticMarkup(
      <PopupDialog title="Log measurement" kicker="CHECK-IN" onClose={vi.fn()}>
        <form>
          <input aria-label="Weight" />
        </form>
      </PopupDialog>,
    );

    expect(markup).toContain('<dialog');
    expect(markup).toContain('class="popup-dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('>Log measurement</h2>');
    expect(markup).toContain('aria-label="Close Log measurement"');
    expect(markup).toContain('aria-label="Weight"');
  });
});
