import { useLayoutEffect, useState } from 'react';

/**
 * An element's laid-out height in pixels, kept up to date as it resizes. Pass the returned ref
 * callback as the element's `ref`; it follows the element if it is replaced.
 */
export function useElementHeight<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const update = () => setHeight(element.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, height] as const;
}
