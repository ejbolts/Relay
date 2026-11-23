import type { IconPair } from '../../ui/Icon';

// Body's icons that the shared list doesn't have, as SF Symbol and Material pairs.
export const bodyIcons = {
  up: { sf: 'arrow.up', md: 'arrow-upward' },
  down: { sf: 'arrow.down', md: 'arrow-downward' },
  level: { sf: 'equal', md: 'drag-handle' },
  info: { sf: 'info.circle', md: 'info-outline' },
  lock: { sf: 'lock.fill', md: 'lock' },
  male: { sf: 'figure.stand', md: 'male' },
  female: { sf: 'figure.stand.dress', md: 'female' },
  scale: { sf: 'scalemass', md: 'monitor-weight' },
  ruler: { sf: 'ruler', md: 'straighten' },
  flag: { sf: 'flag', md: 'flag' },
  sparkle: { sf: 'sparkles', md: 'auto-awesome' },
  cloud: { sf: 'icloud.and.arrow.up', md: 'cloud-upload' },
  expand: { sf: 'arrow.up.left.and.arrow.down.right', md: 'open-in-full' },
  rotate: { sf: 'rotate.right', md: 'screen-rotation' },
} satisfies Record<string, IconPair>;
