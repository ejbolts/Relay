// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineConfirmButton } from './InlineConfirmButton';

let container: HTMLDivElement;
let root: Root;

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

const button = (name: string) =>
  [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === name)!;
const click = (element: HTMLElement) => act(async () => element.click());

describe('InlineConfirmButton', () => {
  it('styles only the trigger with className; the confirm step is danger beside a secondary Cancel', async () => {
    await act(async () =>
      root.render(
        <InlineConfirmButton
          className="pulse-button danger-soft small row-delete"
          label="Delete"
          confirmLabel="Delete session"
          onConfirm={vi.fn()}
        />,
      ),
    );
    expect(button('Delete').className).toBe('pulse-button danger-soft small row-delete');

    await click(button('Delete'));

    expect(button('Delete session').className).toBe('pulse-button danger small');
    expect(button('Cancel').className).toBe('pulse-button small');
    expect(container.querySelector('.row-delete')).toBeNull();

    await click(button('Cancel'));
    expect(button('Delete').className).toContain('row-delete');
  });

  it('uses the default size in forms and runs the confirm once', async () => {
    const onConfirm = vi.fn();
    await act(async () =>
      root.render(
        <InlineConfirmButton
          className="profile-danger"
          size="default"
          label="Disable account"
          confirmLabel="Disable and sign out"
          onConfirm={onConfirm}
        />,
      ),
    );

    await click(button('Disable account'));
    expect(button('Disable and sign out').className).toBe('pulse-button danger');
    expect(button('Cancel').className).toBe('pulse-button');

    await click(button('Disable and sign out'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button('Disable account')).toBeTruthy();
  });
});
