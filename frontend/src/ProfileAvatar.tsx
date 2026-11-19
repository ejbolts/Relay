import { useRef, useState } from 'react';
import { ProfileBorderArt } from './ProfileBorderArt';
import { hasProfileBorderArt } from './profileBorderShapes';
import { profileInitial } from './profileDisplay';
import { PopupDialog } from './PopupDialog';
import type { User } from './types';
import './profilePhotoViewer.css';

export type AvatarUser = Pick<
  User,
  'display_name' | 'username' | 'profile_photo_url' | 'profile_border'
>;

/**
 * The account's photo, or its initial when there is no photo or it cannot load, inside the
 * profile border the account wears.
 */
export function ProfileAvatar({
  user,
  className,
  viewable = false,
  animated = false,
}: {
  user: AvatarUser;
  className: string;
  viewable?: boolean;
  /** Lets the border move. Meant for the few large avatars, not for lists. */
  animated?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewerFailed, setViewerFailed] = useState(false);
  const viewButton = useRef<HTMLButtonElement>(null);
  const url = user.profile_photo_url ?? null;
  const showPhoto = url !== null && url !== failedUrl;
  const border = hasProfileBorderArt(user.profile_border) ? user.profile_border : null;
  const classes = [className, showPhoto && 'has-photo', border && 'avatar-bordered'];
  const avatar = (
    <span className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      {showPhoto ? (
        <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        profileInitial(user)
      )}
      {border && <ProfileBorderArt border={border} animated={animated} />}
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
