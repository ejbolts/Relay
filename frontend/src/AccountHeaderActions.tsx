import { FollowNotifications } from './FollowNotifications';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { profileBadgeText, profileButtonLabel } from './profileButton';
import type { User } from './types';

export function ProfileButton({
  onClick,
  name,
  photoUrl,
  border,
  friendRequests = 0,
  openFeedback = 0,
}: {
  onClick: () => void;
  name?: string;
  photoUrl?: string | null;
  /** The profile border the account wears. */
  border?: string | null;
  friendRequests?: number;
  openFeedback?: number;
}) {
  const badge = profileBadgeText(friendRequests + openFeedback);
  return (
    <button
      className="icon-button-pulse profile-button"
      type="button"
      onClick={onClick}
      aria-label={profileButtonLabel(name, friendRequests, openFeedback)}
    >
      {badge && (
        <span className="profile-request-badge" aria-hidden="true">
          {badge}
        </span>
      )}
      {name ? (
        <ProfileAvatar
          className="profile-button-initial"
          user={{
            display_name: name,
            username: '',
            profile_photo_url: photoUrl,
            profile_border: border,
          }}
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
  profile?: Pick<User, 'display_name' | 'profile_photo_url' | 'profile_border'>;
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
          border={profile?.profile_border}
          openFeedback={openFeedback}
        />
      )}
    </div>
  );
}
