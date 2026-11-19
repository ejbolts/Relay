/**
 * The pages to offer in the picker's page buttons: all of them when there are few, otherwise the
 * first, the last and the ones beside the current page, with null for each gap between them.
 */
export function pageButtons(current: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, page) => page);
  const start = Math.max(1, Math.min(current - 1, pages - 4));
  const end = Math.min(pages - 2, Math.max(current + 1, 3));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [
    0,
    ...(start > 1 ? [null] : []),
    ...middle,
    ...(end < pages - 2 ? [null] : []),
    pages - 1,
  ];
}
