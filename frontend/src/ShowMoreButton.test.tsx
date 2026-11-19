// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ShowMoreButton } from './ShowMoreButton';

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

it('says Show more, or its own label, and shows loading without disabling', async () => {
  const onClick = vi.fn();
  await act(async () => root.render(<ShowMoreButton onClick={onClick} />));
  const button = host.querySelector('button')!;
  expect(button.className).toBe('show-more-button');
  expect(button.textContent).toBe('Show more');
  await act(async () => button.click());
  expect(onClick).toHaveBeenCalledOnce();

  await act(async () =>
    root.render(
      <ShowMoreButton onClick={onClick} loading>
        Show older workouts
      </ShowMoreButton>,
    ),
  );
  expect(button.textContent).toBe('Loading…');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.querySelector('.calendar-older-spinner')).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(onClick).toHaveBeenCalledOnce();

  await act(async () =>
    root.render(<ShowMoreButton onClick={onClick}>Show older workouts</ShowMoreButton>),
  );
  expect(button.textContent).toBe('Show older workouts');
  expect(button.hasAttribute('aria-busy')).toBe(false);
});
