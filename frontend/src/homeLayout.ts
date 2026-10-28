import type { IconName } from './Icon';

export const HOME_SECTIONS = [
  {
    id: 'profile',
    title: 'Profile',
    description: 'Your photo and all-time totals',
    icon: 'user',
    size: 'full',
  },
  {
    id: 'next-workout',
    title: 'Next workout',
    description: 'Your suggested session',
    icon: 'plus',
    size: 'full',
  },
  {
    id: 'workouts',
    title: 'Workouts',
    description: 'Weekly count and trend',
    icon: 'calendar',
    size: 'stat',
  },
  {
    id: 'cardio-sessions',
    title: 'Cardio sessions',
    description: 'Weekly count and trend',
    icon: 'heart',
    size: 'stat',
  },
  {
    id: 'weekly-bodyweight',
    title: 'Body weight',
    description: 'Weekly average and trend',
    icon: 'body',
    size: 'stat',
  },
  {
    id: 'consistency',
    title: 'Consistency',
    description: 'Streak and training calendar',
    icon: 'calendar',
    size: 'full',
  },
  {
    id: 'muscle-sets',
    title: 'Sets per muscle',
    description: 'Working sets this week',
    icon: 'pulse',
    size: 'full',
  },
  {
    id: 'zone2',
    title: 'Cardio zone goals',
    description: 'Minutes and weekly goal',
    icon: 'heart',
    size: 'half',
  },
  {
    id: 'bodyweight-trend',
    title: 'Bodyweight trend',
    description: 'Recent check-ins and change',
    icon: 'trend',
    size: 'half',
  },
  {
    id: 'combined-check-in',
    title: 'Combined check-in',
    description: 'Log body weight and body fat',
    icon: 'body',
    size: 'full',
  },
  {
    id: 'bodyweight-check-in',
    title: 'Body weight check-in',
    description: 'Log body weight',
    icon: 'body',
    size: 'full',
  },
  {
    id: 'body-fat-check-in',
    title: 'Body fat check-in',
    description: 'Log body fat',
    icon: 'body',
    size: 'full',
  },
  {
    id: 'records',
    title: 'Recent records',
    description: 'Your latest strength milestones',
    icon: 'trophy',
    size: 'full',
  },
  {
    id: 'friends',
    title: 'Recent Friends Activity',
    description: 'Latest sessions from friends, with reactions',
    icon: 'user',
    size: 'full',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  icon: IconName;
  size: string;
}>;

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];
export type HomeSectionWidth = 'compact' | 'full' | 'third';
export type HomeSectionWidths = Partial<Record<HomeSectionId, HomeSectionWidth>>;
export interface HomeLayout {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
  /** Missing entries retain the original adaptive row packing. */
  widths?: HomeSectionWidths;
}

export function defaultHomeLayout(): HomeLayout {
  return {
    order: HOME_SECTIONS.map((section) => section.id),
    hidden: ['bodyweight-check-in', 'body-fat-check-in'],
    widths: {},
  };
}

/** Fill each row when hiding or moving a small card leaves fewer neighbours. */
export function homeSectionSpans(ids: HomeSectionId[], widths: HomeSectionWidths = {}): number[] {
  const spans: number[] = [];
  const sizeFor = (id: HomeSectionId) => {
    const size = HOME_SECTIONS.find((section) => section.id === id)!.size;
    return widths[id] === 'third'
      ? 'stat'
      : widths[id] === 'full'
        ? 'full'
        : widths[id] === 'compact' && size === 'full'
          ? 'half'
          : size;
  };
  for (let start = 0; start < ids.length;) {
    const size = sizeFor(ids[start]);
    let end = start + 1;
    while (end < ids.length && sizeFor(ids[end]) === size) end++;
    const perRow = size === 'stat' ? 3 : size === 'half' ? 2 : 1;
    for (let row = start; row < end; row += perRow) {
      const count = Math.min(perRow, end - row);
      const compactCount = ids
        .slice(row, row + count)
        .filter((id) => widths[id] === 'compact' || widths[id] === 'third').length;
      const compactSpan = 6 / perRow;
      const adaptiveSpan = (6 - compactCount * compactSpan) / (count - compactCount || 1);
      for (let item = 0; item < count; item++)
        spans.push(
          ['compact', 'third'].includes(widths[ids[row + item]] ?? '') ? compactSpan : adaptiveSpan,
        );
    }
    start = end;
  }
  // A one-column strip cannot accept any card. Give it to the smallest card in that row,
  // while retaining larger spaces that can be filled by dragging another section.
  let rowStart = 0;
  let used = 0;
  spans.forEach((span, index) => {
    used += span;
    if (index === spans.length - 1 || used + spans[index + 1] > 6) {
      if (used === 5) {
        let smallest = rowStart;
        for (let item = rowStart + 1; item <= index; item++)
          if (spans[item] < spans[smallest]) smallest = item;
        spans[smallest]++;
      }
      rowStart = index + 1;
      used = 0;
    }
  });
  return spans;
}

/** Usable space at the end of a grid row, keyed by the card before the space. */
export function homeSectionGaps(ids: HomeSectionId[], spans: number[]): Map<HomeSectionId, number> {
  const gaps = new Map<HomeSectionId, number>();
  let used = 0;
  ids.forEach((id, index) => {
    used += spans[index];
    if (index === ids.length - 1 || used + spans[index + 1] > 6) {
      // The smallest compact card spans two columns; a single column cannot accept a card.
      if (used <= 4) gaps.set(id, 6 - used);
      used = 0;
    }
  });
  return gaps;
}

/** Fill a row's empty space without resizing its existing cards or expanding the moved card. */
export function fillHomeSectionGap(
  layout: HomeLayout,
  source: HomeSectionId,
  after: HomeSectionId,
  span = 3,
): HomeLayout {
  if (source === after || !layout.order.includes(source) || !layout.order.includes(after))
    return layout;
  const order = layout.order.filter((id) => id !== source);
  order.splice(order.indexOf(after) + 1, 0, source);
  const compactSpan = homeSectionSpans([source], { [source]: 'compact' })[0];
  return {
    ...layout,
    order,
    hidden: layout.hidden.filter((id) => id !== source),
    widths: { ...layout.widths, [source]: span === 2 && compactSpan > 2 ? 'third' : 'compact' },
  };
}

/** Explicit compact widths stay compact even when a card has no neighbour. */
export function toggleHomeSectionWidth(
  layout: HomeLayout,
  id: HomeSectionId,
  span: number,
): HomeLayout {
  return { ...layout, widths: { ...layout.widths, [id]: span === 6 ? 'compact' : 'full' } };
}

/** Move to the target's position, preserving hidden sections and every other section. */
export function moveHomeSection(
  layout: HomeLayout,
  source: HomeSectionId,
  target: HomeSectionId,
): HomeLayout {
  const sourceIndex = layout.order.indexOf(source);
  const targetIndex = layout.order.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return layout;
  const order = [...layout.order];
  order.splice(sourceIndex, 1);
  order.splice(targetIndex, 0, source);
  return { ...layout, order };
}

export function toggleHomeSection(layout: HomeLayout, id: HomeSectionId): HomeLayout {
  return {
    ...layout,
    hidden: layout.hidden.includes(id)
      ? layout.hidden.filter((item) => item !== id)
      : [...layout.hidden, id],
  };
}
