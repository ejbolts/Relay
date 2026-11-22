import type { IconPair } from '../../ui/Icon';

// Home's icons that the shared list doesn't have, as SF Symbol and Material pairs.
export const homeIcons = {
  calendar: { sf: 'calendar', md: 'calendar-today' },
  heart: { sf: 'heart', md: 'favorite-border' },
  trophy: { sf: 'trophy', md: 'emoji-events' },
  addCircle: { sf: 'plus', md: 'add' },
} satisfies Record<string, IconPair>;
