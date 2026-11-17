// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollapsibleSection } from './CollapsibleSection';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('collapsible section', () => {
  it('starts folded to its heading and opens from the heading button', async () => {
    await act(async () =>
      root.render(
        <CollapsibleSection className="settings-panel" kicker="SECURITY" title="Change password">
          <form />
        </CollapsibleSection>,
      ),
    );
    const section = container.querySelector('section')!;
    const toggle = container.querySelector<HTMLButtonElement>('.collapsible-toggle')!;

    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(section.getAttribute('aria-labelledby')).toBe(container.querySelector('h2')!.id);

    await act(async () => toggle.click());
    expect(section.classList.contains('is-collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await act(async () => toggle.click());
    expect(section.classList.contains('is-collapsed')).toBe(true);
  });
});
