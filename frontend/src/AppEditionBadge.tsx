import { useContext } from 'react';
import { CLIENT_VERSION } from './clientVersion';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';

/** "Web beta" with the running version; opens What's new. Tinted with the user's accent. */
export function AppEditionBadge() {
  const announcement = useContext(ReleaseAnnouncementContext);
  const content = (
    <>
      Web beta <span className="app-edition-version">v{CLIENT_VERSION}</span>
    </>
  );
  if (!announcement) return <span className="app-edition-badge">{content}</span>;
  return (
    <button
      type="button"
      className="app-edition-badge"
      aria-label={`Relay web beta, version ${CLIENT_VERSION}. What's new`}
      onClick={announcement.show}
    >
      {content}
    </button>
  );
}
