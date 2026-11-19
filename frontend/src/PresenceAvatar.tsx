import type { PresenceStatus } from './presence';
import { ProfileAvatar, type AvatarUser } from './ProfileAvatar';

/** A friend's avatar, with a dot while they are online or working out. */
export function PresenceAvatar({ user, status }: { user: AvatarUser; status: PresenceStatus }) {
  const dot = status?.kind === 'workout' || status?.kind === 'online' ? status.kind : null;
  return (
    <span className="presence-avatar">
      <ProfileAvatar className="shared-profile-avatar small" user={user} />
      {dot && <span className={`presence-dot ${dot}`} aria-hidden="true" />}
    </span>
  );
}
