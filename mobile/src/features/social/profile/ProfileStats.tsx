import type { SharedProfile } from '../../../../../frontend/src/types';
import { HeadToHeadCard } from './HeadToHeadCard';
import { ProfileBodySizesCard } from './ProfileBodySizesCard';
import { ProfileBodyWeightCard } from './ProfileBodyWeightCard';
import { ProfileConsistencyCard } from './ProfileConsistencyCard';
import { ProfileTrainingTimeCard } from './ProfileTrainingTimeCard';

/**
 * The profile stats sections, in the web's order, each respecting the member's sharing choices:
 * head-to-head lifts (friends only), consistency calendar, training time, body-weight chart and
 * body measurements.
 */
export function ProfileStats({ profile }: { profile: SharedProfile }) {
  return (
    <>
      {!profile.is_you && (
        <HeadToHeadCard
          key={`lifts:${profile.id}`}
          member={profile}
          workoutTypes={profile.consistency?.workout_types}
        />
      )}
      {profile.consistency && (
        <ProfileConsistencyCard
          key={`consistency:${profile.id}`}
          consistency={profile.consistency}
          profileId={profile.id}
          isYou={profile.is_you}
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
