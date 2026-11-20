// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PopupDialog } from './PopupDialog';

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));

const host = document.createElement('div');
function render(element: ReactNode) {
  host.innerHTML = renderToStaticMarkup(element);
  return host.querySelector('dialog')!;
}

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
    expect(markup).toContain('class="popup-dialog popup-dialog--dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('>Log measurement</h2>');
    expect(markup).toContain('aria-label="Close Log measurement"');
    expect(markup).toContain('aria-label="Weight"');
  });
});

describe('popup dialog variants', () => {
  it('closes with the × icon, never a text glyph', () => {
    const dialog = render(
      <PopupDialog title="Rename" onClose={vi.fn()}>
        <p>Body</p>
      </PopupDialog>,
    );
    const close = dialog.querySelector('.popup-dialog-close')!;
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg.pulse-icon')).not.toBeNull();
    expect(dialog.querySelector('.popup-dialog-back')).toBeNull();
    expect(dialog.querySelector('.sheet-grabber')).toBeNull();
    expect(dialog.querySelector('footer')).toBeNull();
  });

  it('gives a sheet a decorative grabber in its header', () => {
    const dialog = render(
      <PopupDialog variant="sheet" size="tall" title="Swap exercise" onClose={vi.fn()}>
        <p>List</p>
      </PopupDialog>,
    );
    expect(dialog.className).toBe('popup-dialog popup-dialog--sheet popup-dialog--tall');
    const grabber = dialog.querySelector('header > .sheet-grabber')!;
    expect(grabber.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.querySelector('.popup-dialog-close')).not.toBeNull();
  });

  it('gives a screen a back button and no close button', () => {
    const dialog = render(
      <PopupDialog
        variant="screen"
        title="Edit split"
        headerActions={<button type="button">Save</button>}
        onClose={vi.fn()}
      >
        <p>Editor</p>
      </PopupDialog>,
    );
    const header = dialog.querySelector('header')!;
    expect([...header.children].map((child) => child.className || child.tagName)).toEqual([
      'popup-dialog-back',
      'popup-dialog-heading',
      'BUTTON',
    ]);
    expect(header.querySelector('.popup-dialog-back')!.getAttribute('aria-label')).toBe('Back');
    expect(dialog.querySelector('.popup-dialog-close')).toBeNull();
  });

  it('shows a back chevron before the title in a nested view', () => {
    const dialog = render(
      <PopupDialog title="Undo import?" onBack={vi.fn()} onClose={vi.fn()}>
        <p>Nested</p>
      </PopupDialog>,
    );
    const header = dialog.querySelector('header')!;
    expect(header.firstElementChild!.className).toBe('popup-dialog-back');
    expect(header.lastElementChild!.className).toBe('popup-dialog-close');
  });

  it('puts actions in a footer after the content, with any hook classes', () => {
    const dialog = render(
      <PopupDialog
        title="Delete split?"
        size="compact"
        role="alertdialog"
        actionsClassName="workout-finish-actions"
        actions={
          <>
            <button type="button">Cancel</button>
            <button type="button" className="popup-primary-action is-danger">
              Delete split
            </button>
          </>
        }
        onClose={vi.fn()}
      >
        <p>It goes for good.</p>
      </PopupDialog>,
    );
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.className).toBe('popup-dialog popup-dialog--dialog popup-dialog--compact');
    const footer = dialog.lastElementChild!;
    expect(footer.tagName).toBe('FOOTER');
    expect(footer.className).toBe(
      'popup-dialog-actions popup-dialog-footer workout-finish-actions',
    );
    expect([...footer.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Cancel',
      'Delete split',
    ]);
  });

  it('disables close and back while busy', () => {
    const dialog = render(
      <PopupDialog title="Saving" busy onBack={vi.fn()} onClose={vi.fn()}>
        <p>Saving</p>
      </PopupDialog>,
    );
    expect(dialog.querySelector('.popup-dialog-close')!.hasAttribute('disabled')).toBe(true);
    expect(dialog.querySelector('.popup-dialog-back')!.hasAttribute('disabled')).toBe(true);
  });

  it('always closes with the × icon, and only a sheet has the grabber', () => {
    const dialog = render(
      <PopupDialog title="Muscle" onClose={vi.fn()}>
        <p>Sets</p>
      </PopupDialog>,
    );
    const close = dialog.querySelector('.popup-dialog-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close Muscle');
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(dialog.querySelector('.sheet-grabber')).toBeNull();
  });
});
