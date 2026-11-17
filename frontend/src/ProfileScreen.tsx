import type { ReactNode } from 'react';
import { SharedProfileScreen, type SharedWorkoutListProps } from './SharedProfiles';
import { useSettingsPageJump } from './settingsNavigation';
import { useUserSession } from './userContext';

export function ProfileScreen({
  onOpenSplits,
  dataRevision = null,
  active,
  renderWorkouts,
  onChooseSharing,
}: {
  onOpenSplits?: (routineId?: string) => void;
  dataRevision?: string | null;
  active: boolean;
  renderWorkouts: (props: SharedWorkoutListProps) => ReactNode;
  onChooseSharing: () => void;
}) {
  const { user, updateUser } = useUserSession();
  useSettingsPageJump('profile', active);
  if (!user) return null;

  return (
    <div className="profile-screen" data-settings-page="profile">
      <SharedProfileScreen
        onOpenSplits={onOpenSplits}
        dataRevision={dataRevision}
        active={active}
        profileId={user.id}
        ownProfile={{ user, onSaved: updateUser }}
        onChooseSharing={onChooseSharing}
        renderWorkouts={renderWorkouts}
      />
    </div>
  );
}
