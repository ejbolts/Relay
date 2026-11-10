import { TipSlot } from './Tips';
import { useState } from 'react';
import { CachedTabPanel } from './CachedTabPanel';
import { AccountHeaderActions } from './AccountHeaderActions';
import { useFriendConnections } from './friendConnections';
import { FriendsList } from './FriendsList';
import { FindPanel } from './SharedProfiles';
import { PageHeader } from './TodayScreen';
import { useSlidingIndicator } from './motionHooks';
import type { SharedProfileSummary, TrackedWorkout, User } from './types';

export function SocialScreen({
  active,
  onOpenProfile,
  onOpenOwnProfile,
  onChooseSharing,
  onOpenSettings,
  account,
  openFeedback,
}: {
  active: boolean;
  onOpenProfile: (
    profile: Pick<SharedProfileSummary, 'id' | 'display_name'>,
    workout?: Pick<TrackedWorkout, 'id' | 'workout_date'>,
  ) => void;
  onOpenOwnProfile: () => void;
  onChooseSharing: () => void;
  onOpenSettings: () => void;
  account?: User;
  openFeedback?: number;
}) {
  const [section, setSection] = useState<'friends' | 'find'>('friends');
  const indicator = useSlidingIndicator<HTMLDivElement>(section);
  const { connections, state, error, refresh, updateReactions } = useFriendConnections(active);
  const requests = connections?.requests.length ?? 0;

  return (
    <section className="social-screen content-page">
      <PageHeader
        title="Social"
        eyebrow="Friends · sessions · reactions"
        onOpenSettings={onOpenSettings}
        accountActions={
          <AccountHeaderActions
            active={active}
            profile={account}
            openFeedback={openFeedback}
            onOpenProfile={onOpenOwnProfile}
          />
        }
      />
      <div
        ref={indicator}
        className="segmented-control slide-indicator"
        role="tablist"
        aria-label="Social sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'friends'}
          className={section === 'friends' ? 'active' : ''}
          onClick={() => setSection('friends')}
        >
          Friends
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'find'}
          aria-label={
            requests > 0
              ? `Find, ${requests} friend ${requests === 1 ? 'request' : 'requests'}`
              : undefined
          }
          className={section === 'find' ? 'active' : ''}
          onClick={() => setSection('find')}
        >
          Find
          {requests > 0 && (
            <span className="segmented-badge" aria-hidden="true">
              {requests > 9 ? '9+' : requests}
            </span>
          )}
        </button>
      </div>
      <TipSlot
        id="friends"
        eligible={active && state === 'ready' && connections?.friends.length === 0}
      />
      <CachedTabPanel active={section === 'friends'}>
        <FriendsList
          connections={connections}
          state={state}
          error={error}
          onRetry={refresh}
          onOpenFriend={onOpenProfile}
          onOpenFind={() => setSection('find')}
          onChooseSharing={onChooseSharing}
          onReactionsChange={updateReactions}
        />
      </CachedTabPanel>
      <CachedTabPanel active={section === 'find'}>
        <FindPanel
          active={active && section === 'find'}
          connections={connections}
          state={state}
          error={error}
          onRetry={refresh}
          onChanged={refresh}
          onOpenProfile={onOpenProfile}
          onChooseSharing={onChooseSharing}
        />
      </CachedTabPanel>
    </section>
  );
}
