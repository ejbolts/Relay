import type { IconPair } from '../../ui/Icon';

export const guideIcons = {
  bulb: { sf: 'lightbulb', md: 'lightbulb-outline' },
  sparkle: { sf: 'sparkles', md: 'auto-awesome' },
  tour: { sf: 'map', md: 'map' },
  machines: { sf: 'level', md: 'tune' },
  blocks: { sf: 'calendar', md: 'calendar-month' },
  split: { sf: 'arrow.up', md: 'arrow-upward' },
  guides: { sf: 'questionmark.circle', md: 'help-outline' },
  share: { sf: 'square.and.arrow.up', md: 'ios-share' },
  external: { sf: 'arrow.up.right.square', md: 'open-in-new' },
} satisfies Record<string, IconPair>;
