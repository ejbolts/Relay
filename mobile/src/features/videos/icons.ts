import type { IconPair } from '../../ui/Icon';

/** The videos tab's own icons: an SF Symbol on iOS and a Material icon elsewhere. */
export const videoIcons = {
  video: { sf: 'video', md: 'videocam' },
  record: { sf: 'video.badge.plus', md: 'video-call' },
  web: { sf: 'safari', md: 'open-in-browser' },
  up: { sf: 'arrow.up', md: 'arrow-upward' },
  down: { sf: 'arrow.down', md: 'arrow-downward' },
} satisfies Record<string, IconPair>;
