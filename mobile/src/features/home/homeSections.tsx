import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  activityCardSettings,
  homeSectionRows,
  homeSectionSettings,
  type HomeLayout,
  type HomeSectionId,
} from '../../../../frontend/src/homeLayout';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { FriendsActivityCard } from '../social';
import { CheckInCard } from './CheckInCard';
import { ConsistencyCard } from './ConsistencyCard';
import { BodyweightTrendCard, CardioGoalCard } from './HalfCards';
import {
  BodyGoalCard,
  CardioDistanceCard,
  ExerciseSpotlightCard,
  FriendsWeekCard,
  MuscleFreshnessCard,
} from './InsightCards';
import { MuscleSetsCard } from './MuscleSetsCard';
import { ProfileCard } from './ProfileCard';
import { RecordsCard } from './RecordsCard';
import { BodyweightStat, CardioSessionsStat, WorkoutsStat } from './StatCards';
import { ThisWeekCard } from './ThisWeekCard';
import { UpNextCard } from './UpNextCard';

export interface HomeCardContext {
  layout: HomeLayout;
  /** The card's share of the six-column row; under 6 draws the compact version. */
  span: number;
  liveDate: string | null;
  onPressDay: (date: string, entry: HeatmapDay | undefined) => void;
  onOpenLive: () => void;
}

/**
 * Every Home section the app draws, keyed as the saved layout names them (frontend/src/
 * homeLayout.ts). A null entry is a section the app doesn't draw yet: Home and the layout editor
 * skip it, as the web skips the training block while there is no block, and moving the other
 * cards keeps its place in the saved order.
 */
export const HOME_CARDS: Record<HomeSectionId, ((context: HomeCardContext) => ReactNode) | null> = {
  'next-workout': () => <UpNextCard />,
  profile: () => <ProfileCard />,
  // The training block card comes from Training's blocks stream; the coordinator places it here.
  'training-block': null,
  workouts: ({ layout }) => <WorkoutsStat settings={activityCardSettings(layout, 'workouts')} />,
  'cardio-sessions': ({ layout }) => (
    <CardioSessionsStat settings={activityCardSettings(layout, 'cardio_sessions')} />
  ),
  'weekly-bodyweight': () => <BodyweightStat />,
  'this-week': ({ liveDate, onPressDay, onOpenLive }) => (
    <ThisWeekCard liveDate={liveDate} onPressDay={onPressDay} onOpenLive={onOpenLive} />
  ),
  consistency: ({ liveDate, onPressDay, onOpenLive }) => (
    <ConsistencyCard liveDate={liveDate} onPressDay={onPressDay} onOpenLive={onOpenLive} />
  ),
  'muscle-sets': () => <MuscleSetsCard />,
  zone2: ({ layout }) => <CardioGoalCard settings={homeSectionSettings(layout, 'zone2')} />,
  'bodyweight-trend': () => <BodyweightTrendCard />,
  'combined-check-in': ({ layout }) => (
    <CheckInCard settings={homeSectionSettings(layout, 'check_in')} />
  ),
  records: () => <RecordsCard />,
  friends: () => <FriendsActivityCard />,
  'body-goal': ({ span }) => <BodyGoalCard compact={span < 6} />,
  'exercise-spotlight': ({ layout }) => (
    <ExerciseSpotlightCard settings={homeSectionSettings(layout, 'exercise_spotlight')} />
  ),
  'muscle-freshness': ({ span }) => <MuscleFreshnessCard compact={span < 6} />,
  'cardio-distance': ({ layout }) => (
    <CardioDistanceCard settings={homeSectionSettings(layout, 'cardio_distance')} />
  ),
  'friends-week': ({ span }) => <FriendsWeekCard compact={span < 6} />,
};

export const appDrawsSection = (id: HomeSectionId) => HOME_CARDS[id] !== null;

/**
 * The visible sections in the saved order, packed into the web's six-column rows: three stat
 * cards or two half cards share a row, and a compact card leaves the rest of its row empty.
 */
export function HomeSections({
  visible,
  ...context
}: Omit<HomeCardContext, 'span'> & { visible: HomeSectionId[] }) {
  return homeSectionRows(visible, context.layout.widths).map((row) => {
    const used = row.reduce((total, item) => total + item.span, 0);
    if (row.length === 1 && used === 6)
      return (
        <Fragment key={row[0].id}>{HOME_CARDS[row[0].id]?.({ ...context, span: 6 })}</Fragment>
      );
    return (
      <View
        key={row.map((item) => item.id).join()}
        style={{ flexDirection: 'row', gap: row.every((item) => item.span === 2) ? 8 : 12 }}
      >
        {row.map((item) => (
          <View key={item.id} style={{ flex: item.span, minWidth: 0 }}>
            {HOME_CARDS[item.id]?.({ ...context, span: item.span })}
          </View>
        ))}
        {used < 6 && <View style={{ flex: 6 - used }} />}
      </View>
    );
  });
}
