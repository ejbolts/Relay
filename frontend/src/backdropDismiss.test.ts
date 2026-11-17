import { describe, expect, it, vi } from 'vitest';
import { backdropDismissHandlers } from './backdropDismiss';

const backdrop = {} as EventTarget;
const dialog = {} as EventTarget;
const on = (target: EventTarget) => ({ target, currentTarget: backdrop });

describe('backdrop dismissal', () => {
  it('waits for the click so a tap outside cannot fall through to the page behind', () => {
    const onDismiss = vi.fn();
    const handlers = backdropDismissHandlers({ current: false }, onDismiss);

    handlers.onPointerDown(on(backdrop));
    expect(onDismiss).not.toHaveBeenCalled();

    handlers.onClick(on(backdrop));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('stays open when a press inside the popup is released over the backdrop', () => {
    const onDismiss = vi.fn();
    const handlers = backdropDismissHandlers({ current: false }, onDismiss);

    handlers.onPointerDown(on(dialog));
    handlers.onClick(on(backdrop));
    handlers.onClick(on(backdrop));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores clicks on the popup itself', () => {
    const onDismiss = vi.fn();
    const handlers = backdropDismissHandlers({ current: false }, onDismiss);

    handlers.onPointerDown(on(backdrop));
    handlers.onClick(on(dialog));

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
