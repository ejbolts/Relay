import { TipSlot } from './Tips';
import { useEffect, useState } from 'react';
import { CachedTabPanel } from './CachedTabPanel';
import { AccountHeaderActions } from './AccountHeaderActions';
import { useFriendConnections } from './friendConnections';
import { FindPanel } from './SharedProfiles';
import { SocialFeed } from './SocialFeed';
import { PageHeader } from './TodayScreen';
import { useSlidingIndicator } from './motionHooks';
import { useWorkoutFocus } from './workoutFocus';
import type { SharedProfileSummary, TrackedWorkout, User } from './types';

export function SocialScreen({
  active,
  preload = false,
  onOpenProfile,
  onOpenOwnProfile,
  onChooseSharing,
  onOpenSettings,
  account,
  openFeedback,
}: {
  active: boolean;
  /** Reads the friend list and the feed's first page in the background before Social is opened. */
  preload?: boolean;
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
  const [section, setSection] = useState<'feed' | 'friends'>('feed');
  const indicator = useSlidingIndicator<HTMLDivElement>(section);
  const { connections, state, error, refresh } = useFriendConnections(active, preload);
  const requests = connections?.requests.length ?? 0;
  const focusKey = useWorkoutFocus()?.key;

  useEffect(() => {
    // A workout opened from a notification is shown in the feed.
    if (focusKey !== undefined) setSection('feed');
  }, [focusKey]);

  return (
    <section className="social-screen content-page">
      <PageHeader
        title="Social"
        eyebrow={
          connections
            ? `${connections.friends.length} ${connections.friends.length === 1 ? 'friend' : 'friends'}`
            : '\u00a0'
        }
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
          aria-selected={section === 'feed'}
          className={section === 'feed' ? 'active' : ''}
          onClick={() => setSection('feed')}
        >
          Feed
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'friends'}
          aria-label={
            requests > 0
              ? `Friends, ${requests} friend ${requests === 1 ? 'request' : 'requests'}`
              : undefined
          }
          className={section === 'friends' ? 'active' : ''}
          onClick={() => setSection('friends')}
        >
          Friends
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
      <CachedTabPanel active={section === 'feed'}>
        <SocialFeed
          active={active && section === 'feed'}
          preload={preload}
          friends={connections?.friends ?? null}
          onOpenProfile={onOpenProfile}
          onOpenOwnProfile={onOpenOwnProfile}
          onOpenFind={() => setSection('friends')}
          onChooseSharing={onChooseSharing}
        />
      </CachedTabPanel>
      <CachedTabPanel active={section === 'friends'}>
        <FindPanel
          active={active && section === 'friends'}
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
