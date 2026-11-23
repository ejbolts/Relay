import type { IconPair } from '../../ui/Icon';

/** Training's icons that the shared list doesn't have, as SF Symbol and Material pairs. */
export const trainingIcons = {
  repeat: { sf: 'arrow.counterclockwise', md: 'replay' },
  options: { sf: 'slider.horizontal.3', md: 'tune' },
  up: { sf: 'arrow.up', md: 'arrow-upward' },
  down: { sf: 'arrow.down', md: 'arrow-downward' },
  heart: { sf: 'waveform.path.ecg', md: 'monitor-heart' },
  video: { sf: 'play.rectangle.fill', md: 'smart-display' },
} satisfies Record<string, IconPair>;
