import type { SharedProfile } from '../../../../../frontend/src/types';
import { HeadToHeadCard } from './HeadToHeadCard';
import { ProfileBodySizesCard } from './ProfileBodySizesCard';
import { ProfileBodyWeightCard } from './ProfileBodyWeightCard';
import { ProfileConsistencyCard } from './ProfileConsistencyCard';
import { ProfileTrainingTimeCard } from './ProfileTrainingTimeCard';

/**
 * The profile stats sections, in the web's order, each respecting the member's sharing choices:
 * head-to-head lifts (friends only), consistency calendar, training time, body-weight chart and
 * body measurements. A trained day or a logged lift opens the matching workouts in the history.
 */
export function ProfileStats({
  profile,
  selectedDate,
  onOpenDay,
  onOpenLift,
}: {
  profile: SharedProfile;
  /** The day the history is filtered to, marked on the calendar. */
  selectedDate: string | null;
  onOpenDay: (date: string) => void;
  /** Opens the member's workouts with one of their exercises. */
  onOpenLift: (exerciseId: string) => void;
}) {
  return (
    <>
      {!profile.is_you && (
        <HeadToHeadCard key={`lifts:${profile.id}`} member={profile} onOpenLift={onOpenLift} />
      )}
      {profile.consistency && (
        <ProfileConsistencyCard
          key={`consistency:${profile.id}`}
          consistency={profile.consistency}
          isYou={profile.is_you}
          selectedDate={selectedDate}
          onOpenDay={onOpenDay}
        />
      )}
      {profile.training_time && (
        <ProfileTrainingTimeCard
          key={`time:${profile.id}`}
          allTime={profile.training_time}
          pastYear={profile.training_time_past_year}
        />
      )}
      {profile.body_weight && (
        <ProfileBodyWeightCard
          key={`weight:${profile.id}`}
          measurements={profile.body_weight}
          goals={profile.goals}
        />
      )}
      {profile.body_sizes && (
        <ProfileBodySizesCard
          key={`sizes:${profile.id}`}
          entries={profile.body_sizes}
          sex={profile.sex}
        />
      )}
    </>
  );
}
