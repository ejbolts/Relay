import { useRef, useState } from 'react';
import { profileInitial } from './profileDisplay';
import { PopupDialog } from './PopupDialog';
import type { User } from './types';
import './profilePhotoViewer.css';

/** The account's photo, or its initial when there is no photo or it cannot load. */
export function ProfileAvatar({
  user,
  className,
  viewable = false,
}: {
  user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
  className: string;
  viewable?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewerFailed, setViewerFailed] = useState(false);
  const viewButton = useRef<HTMLButtonElement>(null);
  const url = user.profile_photo_url ?? null;
  const showPhoto = url !== null && url !== failedUrl;
  const avatar = (
    <span className={showPhoto ? `${className} has-photo` : className} aria-hidden="true">
      {showPhoto ? (
        <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        profileInitial(user)
      )}
    </span>
  );
  if (!viewable || !showPhoto) return avatar;
  return (
    <>
      <button
        ref={viewButton}
        type="button"
        className="profile-photo-view"
        aria-label={`View ${user.display_name || user.username}'s profile photo`}
        aria-haspopup="dialog"
        onClick={() => {
          setViewerFailed(false);
          setViewingUrl(url);
        }}
      >
        {avatar}
      </button>
      {viewingUrl === url && (
        <PopupDialog
          title="Profile photo"
          className="profile-photo-viewer"
          onClose={() => {
            setViewingUrl(null);
            requestAnimationFrame(() => viewButton.current?.focus());
          }}
        >
          <div className="profile-photo-viewer-content">
            {viewerFailed ? (
              <p role="alert">This photo could not be loaded. Close and try again.</p>
            ) : (
              <img
                src={url}
                alt={`${user.display_name || user.username}'s profile photo`}
                onError={() => setViewerFailed(true)}
              />
            )}
          </div>
        </PopupDialog>
      )}
    </>
  );
}
