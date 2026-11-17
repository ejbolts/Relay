// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlipAnimation } from './motionHooks';

let container: HTMLDivElement;
let root: Root;
let animate: ReturnType<typeof vi.fn>;
let scrollIntoView: ReturnType<typeof vi.fn>;
let addItems: (keys: string[], announce: boolean) => void;

function List() {
  const [items, setItems] = useState<string[]>([]);
  const listRef = useRef<HTMLUListElement>(null);
  const announceEntrance = useFlipAnimation(listRef, items.join('|'));
  addItems = (keys, announce) => {
    if (announce) announceEntrance();
    setItems((current) => [...current, ...keys]);
  };
  return (
    <ul ref={listRef}>
      {items.map((item) => (
        <li key={item} data-flip-key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  // jsdom has no layout or Web Animations; give the list a width and record animation calls.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
  animate = vi.fn();
  scrollIntoView = vi.fn();
  Object.assign(HTMLElement.prototype, { animate, scrollIntoView });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<List />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useFlipAnimation entrance', () => {
  it('rises picked items into an empty list one after another and shows the first', async () => {
    await act(async () => addItems(['bench', 'row'], true));

    const items = [...container.querySelectorAll('li')];
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.contexts).toEqual(items);
    expect(animate.mock.calls.map(([, options]) => options.delay)).toEqual([0, 80]);
    expect(animate.mock.calls[0][0][0]).toMatchObject({ opacity: 0 });
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(items[0]);
  });

  it('animates only the newly picked items when the list already has some', async () => {
    await act(async () => addItems(['bench'], false));
    animate.mockClear();

    await act(async () => addItems(['row', 'press'], true));

    const [, row, press] = [...container.querySelectorAll('li')];
    expect(animate.mock.contexts).toEqual([row, press]);
    expect(scrollIntoView.mock.contexts).toEqual([row]);
  });

  it('leaves items that were not picked, such as a restored draft, to appear without the entrance', async () => {
    await act(async () => addItems(['bench', 'row'], false));

    expect(animate).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('only brings the first item into view when motion is reduced', async () => {
    document.documentElement.setAttribute('data-reduce-motion', '');

    await act(async () => addItems(['bench'], true));

    expect(animate).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });
});
