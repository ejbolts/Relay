import type { IconPair } from '../../ui/Icon';

/** The admin console's own icons: an SF Symbol on iOS and a Material icon elsewhere. */
export const adminIcons = {
  admin: { sf: 'shield.lefthalf.filled', md: 'admin-panel-settings' },
  video: { sf: 'video', md: 'videocam' },
  signUp: { sf: 'person.badge.plus', md: 'person-add' },
  server: { sf: 'server.rack', md: 'dns' },
  copy: { sf: 'doc.on.doc', md: 'content-copy' },
} satisfies Record<string, IconPair>;
