// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaginationControls } from './PaginationControls';

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('shows the current page on the page picker and announces it', async () => {
  const onPageChange = vi.fn();
  await act(async () =>
    root.render(
      <PaginationControls
        currentPage={2}
        totalPages={7}
        label="session"
        onPageChange={onPageChange}
      />,
    ),
  );
  const picker = host.querySelector<HTMLButtonElement>('[aria-label="Choose a session page"]')!;
  expect(picker.textContent).toBe('2 / 7');
  expect(host.querySelector('.pagination-status')?.textContent).toBe('Page 2 of 7');
  expect(host.querySelector('.pagination-status')?.classList.contains('sr-only')).toBe(true);

  await act(async () => picker.click());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Go to page 5"]')!.click(),
  );
  expect(onPageChange).toHaveBeenCalledWith(5);
});
