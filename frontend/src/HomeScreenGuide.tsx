import type { ReactNode } from 'react';
import { PopupDialog } from './PopupDialog';

/** Outline glyphs drawn after Safari's own controls, used only inside the illustrations. */
const SAFARI_PATHS = {
  back: 'M15 5 8 12l7 7',
  pageMenu: 'M4 7h9M4 12h16M4 17h11',
  reload: 'M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4',
  tabs: 'M8 8V6.5A2.5 2.5 0 0 1 10.5 4h7A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H16M6.5 8h7A2.5 2.5 0 0 1 16 10.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 17.5v-7A2.5 2.5 0 0 1 6.5 8z',
  share:
    'M12 3.5v11M8 7.5l4-4 4 4M8.5 10H7a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2h-1.5',
  bookmark: 'M7 3.5h10a1 1 0 0 1 1 1v16l-6-4.5-6 4.5v-16a1 1 0 0 1 1-1z',
  find: 'M14 20.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h8l4 4v5M8.5 8h6M8.5 11.5h4M17 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM19 18l2 2',
  copy: 'M9 8V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8z',
  readingList:
    'M6.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM10 12h4M1.5 11h1.5M21 11h1.5',
  more: 'M6 9.5l6 6 6-6',
  star: 'M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8L8 13.6 3.8 9.7l5.7-.7z',
  addSquare:
    'M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4zM12 8v8M8 12h8',
} as const;

function SafariIcon({ name }: { name: keyof typeof SAFARI_PATHS }) {
  return (
    <svg className="home-guide-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SAFARI_PATHS[name]} />
    </svg>
  );
}

const APPLICATION_URL = 'https://gym-logger.duckdns.org';
const APPLICATION_HOST = 'gym-logger.duckdns.org';

function ToolbarShot() {
  return (
    <div className="home-guide-toolbar">
      <span className="home-guide-round">
        <SafariIcon name="back" />
      </span>
      <span className="home-guide-address">
        <span className="home-guide-target home-guide-page-menu">
          <SafariIcon name="pageMenu" />
        </span>
        <span className="home-guide-host">{APPLICATION_HOST}</span>
        <SafariIcon name="reload" />
      </span>
      <span className="home-guide-round">
        <SafariIcon name="tabs" />
      </span>
    </div>
  );
}

function MenuShot() {
  return (
    <div className="home-guide-menu">
      <span className="home-guide-target home-guide-menu-row">
        <SafariIcon name="share" />
        Share
      </span>
      <span className="home-guide-menu-row">
        <SafariIcon name="bookmark" />
        Add to Bookmarks
      </span>
      <span className="home-guide-menu-row">
        <SafariIcon name="find" />
        Find on Page
      </span>
    </div>
  );
}

function ShareSheetShot() {
  const actions: { icon: keyof typeof SAFARI_PATHS; label: string; target?: boolean }[] = [
    { icon: 'copy', label: 'Copy' },
    { icon: 'bookmark', label: 'Add to Bookmarks' },
    { icon: 'readingList', label: 'Add to Reading List' },
    { icon: 'more', label: 'View More', target: true },
  ];
  return (
    <div className="home-guide-sheet">
      <div className="home-guide-sheet-title">
        <img src="/apple-touch-icon.png" alt="" width={34} height={34} />
        <span>
          <strong>Relay</strong>
          <small>{APPLICATION_HOST}</small>
        </span>
      </div>
      <div className="home-guide-actions">
        {actions.map((action) => (
          <span key={action.label} className="home-guide-action">
            <span
              className={`home-guide-action-button ${action.target ? 'home-guide-target' : ''}`}
            >
              <SafariIcon name={action.icon} />
            </span>
            {action.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShareListShot() {
  return (
    <div className="home-guide-list">
      <span className="home-guide-list-row">
        <SafariIcon name="star" />
        Add to Favourites
      </span>
      <span className="home-guide-list-row">
        <SafariIcon name="find" />
        Find on Page
      </span>
      <span className="home-guide-target home-guide-list-row">
        <SafariIcon name="addSquare" />
        Add to Home Screen
      </span>
    </div>
  );
}

function AddShot() {
  return (
    <div className="home-guide-add">
      <div className="home-guide-add-bar">
        <span>Cancel</span>
        <strong>Add to Home Screen</strong>
        <span className="home-guide-target home-guide-add-button">Add</span>
      </div>
      <div className="home-guide-add-app">
        <img src="/apple-touch-icon.png" alt="" width={40} height={40} />
        <span>Relay</span>
      </div>
    </div>
  );
}

const STEPS: { text: ReactNode; shot: ReactNode }[] = [
  {
    text: (
      <>
        In Safari, tap the <strong>menu button</strong> on the left of the address bar.
      </>
    ),
    shot: <ToolbarShot />,
  },
  {
    text: (
      <>
        Tap <strong>Share</strong>.
      </>
    ),
    shot: <MenuShot />,
  },
  {
    text: (
      <>
        Tap <strong>View More</strong>.
      </>
    ),
    shot: <ShareSheetShot />,
  },
  {
    text: (
      <>
        Tap <strong>Add to Home Screen</strong>.
      </>
    ),
    shot: <ShareListShot />,
  },
  {
    text: (
      <>
        Tap <strong>Add</strong>, then open Relay from your Home Screen.
      </>
    ),
    shot: <AddShot />,
  },
];

export function HomeScreenGuideContent() {
  return (
    <div className="home-guide-body">
      <p className="home-guide-intro" tabIndex={-1}>
        Open Relay like an app: full screen and one tap away. On iPhone, workout notifications also
        need the Home Screen app.
      </p>
      <p className="home-guide-site">
        Start at{' '}
        <a href={APPLICATION_URL} target="_blank" rel="noopener noreferrer">
          {APPLICATION_URL}
        </a>
        .
      </p>
      <ol className="home-guide-steps">
        {STEPS.map((step, index) => (
          <li key={index}>
            <p>{step.text}</p>
            <div className="home-guide-shot" aria-hidden="true">
              {step.shot}
            </div>
          </li>
        ))}
      </ol>
      <p className="home-guide-note">
        On Android, open Chrome's <strong>⋮</strong> menu and tap{' '}
        <strong>Add to Home screen</strong> or <strong>Install app</strong>.
      </p>
    </div>
  );
}

export function HomeScreenGuide({ onClose }: { onClose: () => void }) {
  return (
    <PopupDialog
      title="Add to Home Screen"
      kicker="SET UP YOUR PHONE"
      className="home-guide"
      onClose={onClose}
    >
      <HomeScreenGuideContent />
      <footer className="popup-dialog-actions">
        <button type="button" className="popup-primary-action" onClick={onClose}>
          Got it
        </button>
      </footer>
    </PopupDialog>
  );
}
