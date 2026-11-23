import { presenceDot, type PresenceStatus } from './presenceStatus';
import { ProfileAvatar, type AvatarUser } from './ProfileAvatar';

/** A friend's avatar, with a dot while they are online or working out. */
export function PresenceAvatar({ user, status }: { user: AvatarUser; status: PresenceStatus }) {
  const dot = presenceDot(status);
  return (
    <span className="presence-avatar">
      <ProfileAvatar className="shared-profile-avatar small" user={user} />
      {dot && <span className={`presence-dot ${dot}`} aria-hidden="true" />}
    </span>
  );
}
