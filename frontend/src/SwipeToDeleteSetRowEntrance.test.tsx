// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';
import { markSetAdded } from './setRowEntrance';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(keys: string[]) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(
      <>
        {keys.map((key) => (
          <SwipeToDeleteSetRow key={key} flipKey={key} label={key} onDelete={vi.fn()}>
            <div>{key}</div>
          </SwipeToDeleteSetRow>
        ))}
      </>,
    ),
  );
  return animate;
}

it('drops in only the row of a set that was just added', async () => {
  markSetAdded('set-3');
  const animate = await mount(['set-1', 'set-2', 'set-3']);
  // The shell grows open and its content slides down: two animations, both for set 3.
  expect(animate).toHaveBeenCalledTimes(2);
});

it('leaves rows still when they mount with the workout', async () => {
  const animate = await mount(['set-1', 'set-2']);
  expect(animate).not.toHaveBeenCalled();
});
