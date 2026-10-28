import type { ReactNode } from 'react';
import { SharedProfileScreen, type SharedWorkoutListProps } from './SharedProfiles';
import { useSettingsPageJump } from './settingsNavigation';
import { useUserSession } from './userContext';

export function ProfileScreen({
  onOpenMember,
  onOpenSplits,
  dataRevision = null,
  active,
  renderWorkouts,
  onChooseSharing,
}: {
  onOpenMember?: (person: { id: string; display_name: string }) => void;
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
        onOpenMember={onOpenMember}
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
