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
const card = () => host.querySelector<HTMLElement>('.setup-coach .guide-card')!;
const handle = () => host.querySelector<HTMLButtonElement>('.setup-coach .guide-card-handle')!;
const body = () => host.querySelector('.setup-coach .swipe-fold')!;
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

it('minimises to its title with a tap or a swipe down, and comes back up', async () => {
  await render(1);
  expect(handle().getAttribute('aria-expanded')).toBe('true');
  expect(handle().getAttribute('aria-label')).toBe('Minimise guide');
  expect(handle().querySelector('.sheet-grabber')).toBeTruthy();
  expect(card().style.getPropertyValue('--full')).toBe('120px');

  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('false');
  expect(handle().getAttribute('aria-label')).toBe('Show guide');
  expect(body().getAttribute('aria-hidden')).toBe('true');
  expect(body().hasAttribute('inert')).toBe(true);
  // The kicker, title, Next and progress stay, so the guide can carry on or be skipped.
  expect(coach().querySelector('.guide-card-kicker')!.textContent).toBe('Setup guide · 2 of 2');
  expect(coach().querySelector('.guide-card-title')!.textContent).toBe('Match the weights');
  expect(coach().querySelector<HTMLButtonElement>('.guide-card-next')!.textContent).toBe('Next');
  expect(coach().querySelector('.guide-card-progress')).toBeTruthy();
  expect(coach().querySelector('.guide-card-leave')!.textContent).toBe('Skip guide');
  await act(async () => handle().click());
  expect(handle().getAttribute('aria-expanded')).toBe('true');

  // Swiping down follows the finger, then settles minimised; the click after it is not a tap.
  await pointer('pointerdown', 100);
  await pointer('pointermove', 175);
  expect(card().classList.contains('sheet-dragging')).toBe(true);
  expect(card().style.getPropertyValue('--open')).toBe('0.375');
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

it('sits above a dialog footer, so the dialog’s main action is never covered', async () => {
  const dialog = document.createElement('dialog');
  const footer = document.createElement('footer');
  footer.className = 'popup-dialog-actions popup-dialog-footer';
  dialog.append(host, footer);
  document.body.append(dialog);
  await render(0);
  // offsetHeight is mocked to 120 for every element, the footer included.
  expect(coach().style.getPropertyValue('--coach-dock')).toBe('calc(120px + 0.5rem)');

  // A dialog without a sticky footer, or a coach floating over a page, docks at the bottom.
  footer.remove();
  await render(1);
  expect(coach().style.getPropertyValue('--coach-dock')).toBe('');
  dialog.remove();
});
