// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FfmiHelp } from './FfmiHelp';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing ${text}`);
  return found;
}

it.each(['FFMI', 'Body measurements'])(
  'opens methodology within the existing %s help, with back and reset',
  async (title) => {
    await act(async () =>
      root.render(
        <FfmiHelp title={title}>
          {title === 'Body measurements' ? <p>Measure consistently with a tape.</p> : undefined}
        </FfmiHelp>,
      ),
    );
    const trigger = host.querySelector('button')!;
    await act(async () => trigger.click());
    expect(document.querySelector('dialog h2')?.textContent).toBe(title);
    expect(document.querySelectorAll('dialog p')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Your score.');
    const more = button('Learn more about FFMI methodology');
    expect(more.tagName).toBe('BUTTON');
    await act(async () => more.click());
    expect(document.querySelector('dialog h2')?.textContent).toBe('FFMI methodology');
    expect(document.body.textContent).toContain(
      'not the general-public average or a prediction of your genetic limit.',
    );
    expect(document.querySelector('dialog a')).toBeNull();
    expect(document.querySelectorAll('dialog p')).toHaveLength(6);
    expect(document.body.textContent).toContain('22.1 for men, or 20.6 for women');
    expect(document.body.textContent).toContain('not a representative survey of all gym members');
    await act(async () => button('Back to overview').click());
    expect(document.querySelector('dialog h2')?.textContent).toBe(title);
    expect(document.body.textContent).not.toContain('Your score.');
    await act(async () => button('Learn more about FFMI methodology').click());
    await act(async () =>
      document
        .querySelector('dialog')!
        .dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })),
    );
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(document.querySelector('dialog h2')?.textContent).toBe(title);
  },
);
