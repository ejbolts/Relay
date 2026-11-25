import type { IconPair } from '../../ui/Icon';

/** Training's icons that the shared list doesn't have, as SF Symbol and Material pairs. */
export const trainingIcons = {
  repeat: { sf: 'arrow.counterclockwise', md: 'replay' },
  // The web's filter mark (three narrowing lines) on the exercise list's options.
  options: { sf: 'line.3.horizontal.decrease', md: 'filter-list' },
  expand: { sf: 'arrow.up.left.and.arrow.down.right', md: 'fullscreen' },
  up: { sf: 'arrow.up', md: 'arrow-upward' },
  down: { sf: 'arrow.down', md: 'arrow-downward' },
  heart: { sf: 'waveform.path.ecg', md: 'monitor-heart' },
  video: { sf: 'play.rectangle.fill', md: 'smart-display' },
  help: { sf: 'questionmark.circle', md: 'help-outline' },
} satisfies Record<string, IconPair>;
