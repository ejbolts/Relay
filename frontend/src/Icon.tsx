const PATHS = {
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20a2 2 0 0 0 4 0M12 2v2',
  home: 'M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z',
  calendar:
    'M6.5 4.5h11a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3zM3.5 9.5h17M8 2.8v3.4M16 2.8v3.4',
  plus: 'M12 5v14M5 12h14',
  edit: 'm15 4 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8M12 7.5V12l3 2',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  camera:
    'M4.5 7.5h3l1.5-2.5h6l1.5 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  hide: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.3A11 11 0 0 1 12 5c5.5 0 9 7 9 7a16 16 0 0 1-3 4M6 6C3.8 8 3 12 3 12s3.5 7 9 7a11 11 0 0 0 4-1',
  trend: 'M3.5 17.5l5.5-5.5 4 4 7.5-7.5M15 8.5h5.5V14',
  body: 'M8 3.5h8a4.5 4.5 0 0 1 4.5 4.5v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5zM7.5 10a6 6 0 0 1 9 0M12 10.5l1.6-2.4',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  video:
    'M5 6h8a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 13 18H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 6zM15.5 10.5 21 7.5v9l-5.5-3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  // Three dots, for a menu of further actions.
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  reset: 'M4 10a8 8 0 1 1 1.7 7M4 4v6h6',
  'chevron-left': 'M15 5.5 8.5 12l6.5 6.5',
  'chevron-right': 'M9 5.5l6.5 6.5L9 18.5',
  'chevron-down': 'M6 9l6 6 6-6',
  trophy:
    'M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H5.5a3 3 0 0 0 3 4M16 6h2.5a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z',
  search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.2-4.2',
  timer: 'M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM12 9.5v4l2.5 2M9.5 2.5h5',
  up: 'M12 19V5.5M6.5 11 12 5.5 17.5 11',
  down: 'M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5',
  expand: 'M8 3.5H3.5V8M16 3.5h4.5V8M8 20.5H3.5V16M16 20.5h4.5V16',
  close: 'M6 6l12 12M18 6 6 18',
  filter: 'M4 6.5h16M7 12h10M10 17.5h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 15a5.5 5.5 0 0 1 3.5 5',
  pulse: 'M3 12.5h4l2.5-6.5 5 13 2.5-6.5h4',
  next: 'M6 5.5v13l9.5-6.5zM18.5 5.5v13',
  blank:
    'M7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4zM12 9v6M9 12h6',
  // Two level lines, for a maintain-weight goal.
  level: 'M5.5 9.5h13M5.5 14.5h13',
  // A question mark in a circle, for help.
  help: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.6h.01',
  heart: 'M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7z',
  // A speech bubble, for comments.
  comment:
    'M6 5h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 17h-7l-4.5 3.5V17H6a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 6 5z',
  // A smiling face with a plus, for adding a reaction.
  react:
    'M16.5 4A8.5 8.5 0 1 0 20.4 9.5M9 10h.01M14.5 10h.01M8.2 14a4.4 4.4 0 0 0 7.6 0M19.5 2v6M16.5 5h6',
  external:
    'M14 3.5h6.5V10M20.5 3.5l-10 10M10 4H5.5A2 2 0 0 0 3.5 6v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5',
} as const;

const FILLED = {
  play: 'M8 5.5v13l10.5-6.5z',
} as const;

export type IconName = keyof typeof PATHS | keyof typeof FILLED;

export function Icon({ name, filled = false }: { name: IconName; filled?: boolean }) {
  const filledPath = (FILLED as Record<string, string>)[name];
  return (
    <svg
      className={`pulse-icon ${filled || filledPath ? 'filled' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={filledPath ?? (PATHS as Record<string, string>)[name]} />
    </svg>
  );
}
