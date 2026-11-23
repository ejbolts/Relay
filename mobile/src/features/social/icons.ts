import type { IconPair } from '../../ui/Icon';

/** Social's icons, as SF Symbol and Material pairs. */
export const socialIcons = {
  qr: { sf: 'qrcode', md: 'qr-code-2' },
  scan: { sf: 'qrcode.viewfinder', md: 'qr-code-scanner' },
  share: { sf: 'square.and.arrow.up', md: 'share' },
  react: { sf: 'face.smiling', md: 'add-reaction' },
  comment: { sf: 'bubble.right', md: 'chat-bubble-outline' },
  send: { sf: 'arrow.up.circle.fill', md: 'send' },
  personAdd: { sf: 'person.badge.plus', md: 'person-add-alt' },
  people: { sf: 'person.2', md: 'people-outline' },
  lock: { sf: 'lock.fill', md: 'lock' },
  eye: { sf: 'eye.slash', md: 'visibility-off' },
  camera: { sf: 'camera', md: 'photo-camera' },
  link: { sf: 'link', md: 'link' },
  reply: { sf: 'arrowshape.turn.up.left', md: 'reply' },
} satisfies Record<string, IconPair>;
