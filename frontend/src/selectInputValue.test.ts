// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectInputValue } from './selectInputValue';

describe('selectInputValue', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    input = document.createElement('input');
    input.type = 'text';
    input.value = '105';
    document.body.append(input);
    input.focus();
  });

  afterEach(() => {
    input.remove();
    vi.useRealTimers();
  });

  it('selects the value again after iOS moves the caret to the tap', () => {
    selectInputValue(input);
    // iOS places the caret where the tap landed after the focus and click handlers.
    input.setSelectionRange(1, 1);
    vi.runAllTimers();

    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });

  it('leaves a part of the value the user selected themselves', () => {
    selectInputValue(input);
    input.setSelectionRange(1, 3);
    vi.runAllTimers();

    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  });

  it('does nothing once the input has lost focus', () => {
    selectInputValue(input);
    input.setSelectionRange(2, 2);
    input.blur();
    vi.runAllTimers();

    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
  });
});
