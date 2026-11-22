import type { IconPair } from '../../ui/Icon';

/** Icons the logger needs beyond the shared list, as SF Symbol and Material icon pairs. */
export const loggerIcons = {
  note: { sf: 'note.text', md: 'sticky-note-2' },
  superset: { sf: 'link', md: 'link' },
  done: { sf: 'checkmark.circle.fill', md: 'check-circle' },
  syncing: { sf: 'icloud.and.arrow.up', md: 'cloud-upload' },
  synced: { sf: 'checkmark.icloud', md: 'cloud-done' },
} satisfies Record<string, IconPair>;
