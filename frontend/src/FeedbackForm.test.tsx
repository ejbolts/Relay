// @vitest-environment jsdom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { FeedbackForm } from './FeedbackForm';
import { createToastRoot, toastText } from './toastTestUtils';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createToastRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function type(value: string) {
  const field = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value,
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const send = () =>
  act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );

it('confirms sent feedback in a toast and clears the field for another message', async () => {
  const submit = vi.spyOn(api, 'submitFeedback').mockResolvedValue(undefined as never);
  const sending = vi.fn();
  await act(async () => root.render(<FeedbackForm optional onSendingChange={sending} />));
  await type('The rest timer is great');
  await send();

  expect(submit).toHaveBeenCalledWith('The rest timer is great', expect.any(String));
  expect(toastText()).toBe('Thanks! Your feedback has been sent.');
  expect(container.querySelector('textarea')!.value).toBe('');
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(sending.mock.calls).toEqual([[true], [false]]);

  await type('One more idea');
  await send();
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[1][1]).not.toBe(submit.mock.calls[0][1]);
});

it('keeps the message and shows the error beside the form when sending fails', async () => {
  vi.spyOn(api, 'submitFeedback').mockRejectedValue(new Error('You are offline.'));
  await act(async () => root.render(<FeedbackForm />));
  await type('Keep this text');
  await send();

  expect(container.querySelector('[role="alert"]')!.textContent).toBe('You are offline.');
  expect(container.querySelector('textarea')!.value).toBe('Keep this text');
  expect(toastText()).toBeNull();
});
