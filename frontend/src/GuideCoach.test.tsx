// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuideCoach, type CoachStep } from './GuideCoach';

const steps: CoachStep[] = [
  { title: 'Switch it on', body: 'Turn on the switch.' },
  { title: 'Match the weights', body: 'Drag the slider.', next: { onClick: () => {} } },
];

let root: Root, host: HTMLDivElement;
const coach = () => host.querySelector<HTMLElement>('.setup-coach')!;
const handle = () => host.querySelector<HTMLButtonElement>('.setup-coach-handle')!;
const body = () => host.querySelector('.setup-coach-body')!;
const render = (index: number) =>
  act(async () =>
    root.render(
      <GuideCoach step={steps[index]} index={index} total={steps.length} onExit={() => {}} />,
    ),
  );
const pointer = (type: string, clientY: number) =>
  act(async () => {
    handle().dispatchEvent(new MouseEvent(type, { bubbles: true, clientY }));
  });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // jsdom lays nothing out, so give the step's text and buttons a height to drag against.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('minimises to its header with a tap or a swipe down, and comes back up', async () => {
  await render(0);
  expect(handle().getAttribute('aria-expanded')).toBe('true');
  expect(handle().getAttribute('aria-label')).toBe('Minimise setup guide');
  expect(coach().style.getPropertyValue('--full')).toBe('120px');

  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('false');
  expect(handle().getAttribute('aria-label')).toBe('Show setup guide');
  expect(body().getAttribute('aria-hidden')).toBe('true');
  // The header and progress stay, so the guide can still be found and exited.
  expect(coach().textContent).toContain('Setup guide · 1 of 2');
  expect(coach().textContent).toContain('Exit guide');
  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('true');

  // Swiping down follows the finger, then settles minimised; the click after it is not a tap.
  await pointer('pointerdown', 100);
  await pointer('pointermove', 175);
  expect(coach().classList.contains('is-dragging')).toBe(true);
  expect(coach().style.getPropertyValue('--open')).toBe('0.375');
  await pointer('pointerup', 175);
  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('false');
  // Swiping up brings it back.
  await pointer('pointerdown', 175);
  await pointer('pointermove', 70);
  await pointer('pointerup', 70);
  expect(handle().getAttribute('aria-expanded')).toBe('true');
});

it('opens again on the next step, so its instructions are not missed', async () => {
  await render(0);
  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('false');
  await render(1);
  expect(handle().getAttribute('aria-expanded')).toBe('true');
  expect(body().getAttribute('aria-hidden')).toBe('false');
  expect(coach().textContent).toContain('Match the weights');
});
