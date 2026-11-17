import { FollowNotifications } from './FollowNotifications';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { profileButtonLabel } from './friendsActivityData';
import type { User } from './types';

export function ProfileButton({
  onClick,
  name,
  photoUrl,
  friendRequests = 0,
  openFeedback = 0,
}: {
  onClick: () => void;
  name?: string;
  photoUrl?: string | null;
  friendRequests?: number;
  openFeedback?: number;
}) {
  const count = friendRequests + openFeedback;
  return (
    <button
      className="icon-button-pulse profile-button"
      type="button"
      onClick={onClick}
      aria-label={profileButtonLabel(name, friendRequests, openFeedback)}
    >
      {count > 0 && (
        <span className="profile-request-badge" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      )}
      {name ? (
        <ProfileAvatar
          className="profile-button-initial"
          user={{ display_name: name, username: '', profile_photo_url: photoUrl }}
        />
      ) : (
        <Icon name="user" />
      )}
    </button>
  );
}

/** The same signed-in controls sit immediately before Settings on every main tab. */
export function AccountHeaderActions({
  active,
  profile,
  openFeedback = 0,
  onOpenProfile,
}: {
  active: boolean;
  profile?: Pick<User, 'display_name' | 'profile_photo_url'>;
  openFeedback?: number;
  onOpenProfile?: () => void;
}) {
  return (
    <div className="account-header-actions">
      <FollowNotifications active={active} />
      {onOpenProfile && (
        <ProfileButton
          onClick={onOpenProfile}
          name={profile?.display_name}
          photoUrl={profile?.profile_photo_url}
          openFeedback={openFeedback}
        />
      )}
    </div>
  );
}
