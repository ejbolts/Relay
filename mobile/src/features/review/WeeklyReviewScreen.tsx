import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  blockSuggestion,
  blockSuggestionLabel,
  goalDirectionChangedOn,
} from '../../../../frontend/src/trainingBlockSuggestion';
import { blockOn, blockProgress } from '../../../../frontend/src/trainingBlocks';
import { dayMonth, formatVolume } from '../../../../frontend/src/trainingSummary';
import type { PersonalRecord, TrackedWorkout } from '../../../../frontend/src/types';
import {
  recordDisplayValue,
  weightFromKg,
  type WeightUnit,
} from '../../../../frontend/src/weightUnits';
import {
  reviewHasActivity,
  weeklyReview,
  type WeeklyReview,
} from '../../../../frontend/src/weeklyReview';
import {
  blockProgressText,
  cardioReviewEmptyText,
  reviewDelta,
  reviewEmptyText,
  reviewNumber,
  reviewRecordDetail,
  reviewWeekName,
  reviewWeeksLimit,
  reviewZoneShare,
} from '../../../../frontend/src/weeklyReviewDisplay';
import { useWeightUnit } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, cardSurface } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';
import { blockRoutes } from '../blocks/routes';
import { useTrainingBlocks } from '../blocks/blockQueries';
import { useBodyGoals } from '../body/bodyQueries';
import { trainingRoute } from '../training/routes';
import { markWeeklyReviewShown } from './noticeMemory';
import { useWeeklyReview } from './useWeeklyReview';

/**
 * The web's weekly review popup as a screen: it opens on last week, with arrows to earlier weeks
 * and this week so far. Each week's figures sit against the week before; records, Cardio and
 * Body open their screens, and the training block row offers a new block when there's a reason.
 */
export function WeeklyReviewScreen() {
  const { colors, type, space } = useTheme();
  const router = useRouter();
  const user = useUser();
  const unit = useWeightUnit();
  const review = useWeeklyReview();
  const { data, available, currentStart } = review;
  const [requestedWeeksAgo, setWeeksAgo] = useState(1);
  const limit = reviewWeeksLimit(data.muscleWeeks.length);
  const weeksAgo = Math.min(requestedWeeksAgo, limit);
  const week = useMemo(() => weeklyReview({ ...data, weeksAgo }), [data, weeksAgo]);

  // Seeing it here reads the bell's notice, as opening the web's popup does.
  useEffect(() => {
    if (available) markWeeklyReviewShown(user.id, currentStart);
  }, [available, user.id, currentStart]);

  /** Closes the review first, as the web's popup does, then opens the other screen. */
  const leave = (open: () => void) => {
    if (router.canGoBack()) router.back();
    open();
  };
  const step = (by: number) => {
    haptics.selection();
    setWeeksAgo(weeksAgo + by);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
              <Text style={[type.body, { color: colors.accentText, fontWeight: '600' }]}>
                Got it
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      >
        <View accessibilityLabel="Review week" style={styles.nav}>
          <StepButton
            label="Previous week"
            icon="chevronLeft"
            disabled={weeksAgo >= limit}
            onPress={() => step(1)}
          />
          <Text
            accessibilityLiveRegion="polite"
            style={[type.headline, { color: colors.text, flex: 1, textAlign: 'center' }]}
          >
            {reviewWeekName(weeksAgo)}
          </Text>
          <StepButton
            label="Next week"
            icon="chevronRight"
            disabled={weeksAgo === 0}
            onPress={() => step(-1)}
          />
        </View>
        <WeekSummary
          review={week}
          unit={unit}
          isCurrentWeek={weeksAgo === 0}
          onOpenExercise={(id) =>
            leave(() =>
              router.push(
                { pathname: '/training/exercise/[id]', params: { id } },
                { withAnchor: true },
              ),
            )
          }
          onOpenRecords={() => leave(() => router.navigate(trainingRoute('exercises')))}
          onOpenCardio={() => leave(() => router.navigate(trainingRoute('cardio')))}
          onOpenBody={() => leave(() => router.navigate('/body'))}
        />
        {/* About today rather than the week on show, so it stays with the two latest weeks. */}
        {weeksAgo <= 1 && (
          <BlockRow
            workouts={data.workouts}
            records={data.records}
            today={data.today}
            weekStartDay={data.weekStartDay}
            onStart={() => leave(() => router.push(blockRoutes.edit()))}
          />
        )}
      </ScrollView>
    </>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: colors.surface2 },
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.6 },
      ]}
    >
      <Icon name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}

/** A change against the week before, coloured when one direction is better. */
function Delta({
  change,
  format,
  unit,
  better,
}: {
  change: number | null;
  format?: (value: number) => string;
  unit?: string;
  better?: 'up' | 'down' | null;
}) {
  const { colors, type } = useTheme();
  const delta = reviewDelta(change, { format, unit, better });
  if (!delta) return null;
  const color = { good: colors.good, bad: colors.danger, neutral: colors.muted }[delta.tone];
  return (
    <Text accessibilityLabel={delta.label} style={[type.caption, type.number, { color }]}>
      {` ${delta.text}`}
    </Text>
  );
}

function Block({
  title,
  figure,
  children,
}: {
  title: string;
  figure?: ReactNode;
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={styles.blockHeader}>
        <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text, flex: 1 }]}>
          {title}
        </Text>
        {figure}
      </View>
      {children}
    </Card>
  );
}

function Figure({ children }: { children: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
      {children}
    </Text>
  );
}

function EmptyLine({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.callout, { color: colors.secondary }]}>{children}</Text>;
}

function WeekSummary({
  review,
  unit,
  isCurrentWeek,
  onOpenExercise,
  onOpenRecords,
  onOpenCardio,
  onOpenBody,
}: {
  review: WeeklyReview;
  unit: WeightUnit;
  isCurrentWeek: boolean;
  onOpenExercise: (exerciseId: string) => void;
  onOpenRecords: () => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const { training, previousTraining, muscles, cardio, body } = review;
  const bodyChange =
    body.averageKg !== null && body.previousAverageKg !== null
      ? body.averageKg - body.previousAverageKg
      : null;
  const stats = [
    {
      label: 'Workouts',
      value: String(training.workouts),
      change: training.workouts - previousTraining.workouts,
    },
    { label: 'Sets', value: String(training.sets), change: training.sets - previousTraining.sets },
    {
      label: 'Volume',
      value: formatVolume(training.volumeKg, unit),
      change: training.volumeKg - previousTraining.volumeKg,
      format: (value: number) => formatVolume(value, unit),
    },
  ];
  return (
    <>
      <Text style={[type.footnote, { color: colors.secondary, textAlign: 'center' }]}>
        {dayMonth(review.weekStart)} – {dayMonth(review.weekEnd)}
        {!review.complete && ' · so far'}
      </Text>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            accessible
            style={[cardSurface(colors), styles.stat, { borderRadius: radius.lg }]}
          >
            <Text style={[type.caption, { color: colors.muted }]}>{stat.label}</Text>
            <Text style={[type.headline, type.number, { color: colors.text }]}>{stat.value}</Text>
            <Delta change={stat.change} format={stat.format} />
          </View>
        ))}
      </View>
      {!reviewHasActivity(review) && (
        <Text style={[type.callout, { color: colors.secondary, textAlign: 'center' }]}>
          {reviewEmptyText(isCurrentWeek)}
        </Text>
      )}

      <Block
        title="Records"
        figure={
          <Figure>
            {review.recordCount}
            <Delta change={review.recordCount - review.previousRecordCount} />
          </Figure>
        }
      >
        {review.records.length > 0 ? (
          review.records
            .slice(0, 3)
            .map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                unit={unit}
                onPress={() => onOpenExercise(record.exercise_id)}
              />
            ))
        ) : (
          <EmptyLine>No new strength records.</EmptyLine>
        )}
        {review.records.length > 3 && (
          <Button
            label={`All ${review.recordCount} in Progress`}
            variant="link"
            style={styles.link}
            onPress={onOpenRecords}
          />
        )}
      </Block>

      <Block
        title="Sets per muscle"
        figure={
          muscles && (
            <Figure>
              {muscles.atGoal} at goal
              <Delta
                change={
                  muscles.previousAtGoal === null ? null : muscles.atGoal - muscles.previousAtGoal
                }
              />
            </Figure>
          )
        }
      >
        {muscles && muscles.totalSets > 0 ? (
          muscles.movers.length > 0 && (
            <View accessibilityLabel="Biggest changes on the week before" style={{ gap: 6 }}>
              {muscles.movers.map((item) => (
                <View key={item.muscle} accessible style={styles.line}>
                  <Text style={[type.callout, { color: colors.text, flex: 1 }]}>{item.muscle}</Text>
                  <Text style={[type.callout, type.number, { color: colors.text }]}>
                    {reviewNumber(item.sets)}
                    <Delta change={item.change} />
                  </Text>
                </View>
              ))}
            </View>
          )
        ) : (
          <EmptyLine>No working sets logged.</EmptyLine>
        )}
      </Block>

      <Block
        title="Cardio"
        figure={
          cardio && (
            <Figure>
              {reviewNumber(cardio.totalMinutes)} min
              <Delta
                change={
                  cardio.previousTotalMinutes === null
                    ? null
                    : cardio.totalMinutes - cardio.previousTotalMinutes
                }
              />
            </Figure>
          )
        }
      >
        {cardio && cardio.zones.length > 0 ? (
          <View style={{ gap: 8 }}>
            {cardio.zones.map((zone) => (
              <View key={zone.zone} accessible style={styles.line}>
                <Text style={[type.footnote, { color: colors.text, width: 52 }]}>
                  Zone {zone.zone}
                </Text>
                <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
                  <View
                    style={{
                      width: `${reviewZoneShare(zone)}%`,
                      height: '100%',
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Text style={[type.footnote, type.number, { color: colors.text }]}>
                  {reviewNumber(zone.minutes)} / {reviewNumber(zone.goalMinutes)} min
                  <Delta
                    change={
                      zone.previousMinutes === null ? null : zone.minutes - zone.previousMinutes
                    }
                  />
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyLine>{cardioReviewEmptyText(cardio) ?? ''}</EmptyLine>
        )}
        <Button label="Cardio" variant="link" style={styles.link} onPress={onOpenCardio} />
      </Block>

      <Block
        title="Body weight"
        figure={
          body.averageKg !== null && (
            <Figure>
              {weightFromKg(body.averageKg, unit).toFixed(1)} {unit}
              <Delta
                change={bodyChange === null ? null : weightFromKg(bodyChange, unit)}
                format={(value) => value.toFixed(1)}
                unit={` ${unit}`}
                better={null}
              />
            </Figure>
          )
        }
      >
        {body.averageKg === null && <EmptyLine>No check-ins logged.</EmptyLine>}
        <Button label="Body" variant="link" style={styles.link} onPress={onOpenBody} />
      </Block>
    </>
  );
}

function RecordRow({
  record,
  unit,
  onPress,
}: {
  record: PersonalRecord;
  unit: WeightUnit;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  const detail = reviewRecordDetail(record, unit);
  const name = record.exercise_name ?? 'Exercise';
  const value = recordDisplayValue(record, unit);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, detail.kind, detail.date, detail.bodyweight, value]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      // The web's record tile: a raised row with the record's kind and date over its bodyweight.
      style={({ pressed }) => [
        styles.line,
        styles.record,
        { backgroundColor: colors.surface2 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name="trophy" size={18} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
          {detail.kind} · {detail.date}
        </Text>
        {!!detail.bodyweight && (
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
            {detail.bodyweight}
          </Text>
        )}
      </View>
      <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
        {value}
      </Text>
    </Pressable>
  );
}

/**
 * Where the running training block is up to, and an offer to start one when there's a reason to
 * today. Nothing when neither applies.
 */
function BlockRow({
  workouts,
  records,
  today,
  weekStartDay,
  onStart,
}: {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  today: string;
  weekStartDay: number;
  onStart: () => void;
}) {
  const { colors, type } = useTheme();
  const blocks = useTrainingBlocks().data?.blocks;
  // Without the goals the other reasons still apply.
  const goals = useBodyGoals().data;
  const block = blocks ? blockOn(blocks, today) : null;
  const suggestion = useMemo(
    () =>
      blocks
        ? blockSuggestion({
            workouts,
            records,
            blocks,
            today,
            goalChangedOn: goalDirectionChangedOn(goals ?? []),
            weekStartDay,
          })
        : null,
    [blocks, workouts, records, today, goals, weekStartDay],
  );
  if (!block && !suggestion) return null;
  const progress = block ? blockProgress(block, today) : null;
  return (
    <Block
      title="Training block"
      figure={progress && <Figure>{blockProgressText(progress)}</Figure>}
    >
      {block && <Text style={[type.callout, { color: colors.text }]}>{block.name}</Text>}
      {suggestion && (
        <>
          <EmptyLine>{blockSuggestionLabel(suggestion)}</EmptyLine>
          <Button
            label={block ? 'Start a new block' : 'Start a block'}
            variant="link"
            style={styles.link}
            onPress={onStart}
          />
        </>
      )}
    </Block>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, gap: 2 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  record: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 12 },
  // Section links sit at the start, as the web's, not centred like a button.
  link: { alignSelf: 'flex-start' },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
});
