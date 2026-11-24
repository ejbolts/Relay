import type { IconPair } from '../../ui/Icon';

// Home's icons that the shared list doesn't have, as SF Symbol and Material pairs.
export const homeIcons = {
  calendar: { sf: 'calendar', md: 'calendar-today' },
  heart: { sf: 'heart', md: 'favorite-border' },
  trophy: { sf: 'trophy', md: 'emoji-events' },
  addCircle: { sf: 'plus', md: 'add' },
  target: { sf: 'target', md: 'track-changes' },
  customise: { sf: 'slider.horizontal.3', md: 'tune' },
  width: { sf: 'arrow.left.and.right', md: 'swap-horiz' },
  remove: { sf: 'minus.circle.fill', md: 'remove-circle' },
  add: { sf: 'plus.circle.fill', md: 'add-circle' },
  reset: { sf: 'arrow.counterclockwise', md: 'restart-alt' },
  grip: { sf: 'line.3.horizontal', md: 'drag-indicator' },
} satisfies Record<string, IconPair>;
