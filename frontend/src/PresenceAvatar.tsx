import type { PresenceStatus } from './presence';
import { ProfileAvatar } from './ProfileAvatar';
import type { User } from './types';

/** A friend's avatar, with a dot while they are online or working out. */
export function PresenceAvatar({
  user,
  status,
}: {
  user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
  status: PresenceStatus;
}) {
  const dot = status?.kind === 'workout' || status?.kind === 'online' ? status.kind : null;
  return (
    <span className="presence-avatar">
      <ProfileAvatar className="shared-profile-avatar small" user={user} />
      {dot && <span className={`presence-dot ${dot}`} aria-hidden="true" />}
    </span>
  );
}
