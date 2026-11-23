import type { IconPair } from '../../ui/Icon';

/** Exercise management's icons that the shared list doesn't have, as SF Symbol and Material pairs. */
export const exerciseIcons = {
  merge: { sf: 'link', md: 'link' },
  hide: { sf: 'eye.slash', md: 'visibility-off' },
  show: { sf: 'eye', md: 'visibility' },
  star: { sf: 'star.fill', md: 'star' },
  arrow: { sf: 'arrow.right', md: 'arrow-forward' },
} satisfies Record<string, IconPair>;
