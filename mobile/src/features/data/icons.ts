import type { IconPair } from '../../ui/Icon';

/** The Data section's icons: an SF Symbol on iOS and a Material icon elsewhere. */
export const dataIcons = {
  upload: { sf: 'square.and.arrow.down', md: 'file-upload' },
  share: { sf: 'square.and.arrow.up', md: 'ios-share' },
  history: { sf: 'clock.arrow.circlepath', md: 'history' },
  backup: { sf: 'externaldrive', md: 'backup' },
  restore: { sf: 'arrow.counterclockwise', md: 'settings-backup-restore' },
  samples: { sf: 'trash', md: 'delete-outline' },
  weight: { sf: 'scalemass', md: 'scale' },
  distance: { sf: 'ruler', md: 'straighten' },
  workouts: { sf: 'dumbbell', md: 'fitness-center' },
  bodyweight: { sf: 'figure.stand', md: 'accessibility' },
  calendar: { sf: 'calendar', md: 'calendar-month' },
  undo: { sf: 'arrow.uturn.backward', md: 'undo' },
} satisfies Record<string, IconPair>;
