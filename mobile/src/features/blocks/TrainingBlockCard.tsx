import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  blockEndedLabel,
  blockWeekLabel,
  homeBlockCard,
} from '../../../../frontend/src/trainingBlockHome';
import {
  blockFinished,
  blockProgress,
  daysLeftLabel,
} from '../../../../frontend/src/trainingBlocks';
import { weekStartDayFrom } from '../../../../frontend/src/trainingSummary';
import type { TrainingBlock, TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard, useWorkoutHistory } from '../../data/queries';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { blockRoutes } from './routes';
import { useTrainingBlocks } from './blockQueries';
import { BlockStrip } from './BlockStrip';

/** Home's card style: the progress bar, the timeline strip, or both (the default). */
export type TrainingBlockCardStyle = 'progress' | 'timeline' | 'both';

function CardShell({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors, radius, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: radius.card,
          padding: space.lg,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      {children}
    </Pressable>
  );
}

function Top({ tag, tagColor }: { tag?: string; tagColor?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.top}>
      <Text style={[type.eyebrow, { color: colors.muted }]}>TRAINING BLOCK</Text>
      {!!tag && <Text style={[type.caption, { color: tagColor, fontWeight: '700' }]}>{tag}</Text>}
    </View>
  );
}

/** Home's card before the first block, so starting one is a tap away. */
export function TrainingBlockOfferCard({ onStart }: { onStart: () => void }) {
  const { colors, type } = useTheme();
  return (
    <CardShell label="Training block, no block running. Start a block" onPress={onStart}>
      <Top />
      <Text style={[type.headline, { color: colors.text }]}>No block running</Text>
      <View style={styles.cta}>
        <Icon name="plus" size={14} color={colors.accentText} />
        <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
          Start a block
        </Text>
      </View>
    </CardShell>
  );
}

/**
 * Home's card for the block covering today: its week, days left and progress when a planned end
 * is set, and the timeline. Once the planned end has passed it offers the block's summary.
 */
export function TrainingBlockCard({
  block,
  config,
  today,
  style = 'both',
  onOpen,
  onSummary,
}: {
  block: TrainingBlock;
  config: TrainingBlocks;
  today: string;
  style?: TrainingBlockCardStyle;
  onOpen: () => void;
  /** Once the planned end has passed, the card opens the block's summary instead. */
  onSummary?: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const { daysLeft, progress } = blockProgress(block, today);
  const strip =
    style !== 'progress' ? <BlockStrip config={config} currentId={block.id} today={today} /> : null;
  if (onSummary && block.planned_end_date) {
    const ended = blockEndedLabel({ ...block, planned_end_date: block.planned_end_date }, today);
    return (
      <CardShell label={`${block.name}, finished, ${ended}. See your summary`} onPress={onSummary}>
        <Top tag="Finished" tagColor={colors.good} />
        <Text style={[type.headline, { color: colors.text }]}>{block.name}</Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>{ended}</Text>
        <View style={styles.cta}>
          <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
            See your summary
          </Text>
          <Icon name="chevronRight" size={12} color={colors.accentText} />
        </View>
        {strip}
      </CardShell>
    );
  }
  const week = blockWeekLabel(block, today);
  const left = daysLeft !== null ? daysLeftLabel(daysLeft) : null;
  const past = daysLeft !== null && daysLeft < 0;
  return (
    <CardShell label={[block.name, week, left].filter(Boolean).join(', ')} onPress={onOpen}>
      <Top tag={left ?? undefined} tagColor={past ? colors.gold : colors.accentText} />
      <Text style={[type.headline, { color: colors.text }]}>{block.name}</Text>
      <Text style={[type.footnote, { color: colors.secondary }]}>{week}</Text>
      {style !== 'timeline' && progress !== null && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${block.name} progress`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={[styles.track, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              borderRadius: radius.pill,
              backgroundColor: past ? colors.gold : colors.accent,
            }}
          />
        </View>
      )}
      {strip}
    </CardShell>
  );
}

/**
 * Home's training block card, ready to place: the block covering today (or its summary once the
 * planned end has passed), or, before the first block, an offer to start one after a few weeks
 * of training. Renders nothing otherwise, including while the blocks load.
 */
export function HomeTrainingBlockCard({ style }: { style?: TrainingBlockCardStyle }) {
  const router = useRouter();
  const blocks = useTrainingBlocks();
  const workouts = useWorkoutHistory().data;
  const dashboard = useDashboard().data;
  const today = localDate();
  const weekStartDay = weekStartDayFrom(
    dashboard?.weekly_sets?.week_start ?? dashboard?.zone2?.week_start,
  );
  const config = blocks.data;
  const card = useMemo(
    () =>
      homeBlockCard({
        blocks: config?.blocks ?? [],
        loading: blocks.isPending,
        error: blocks.isError,
        workouts: workouts ?? [],
        today,
        weekStartDay,
      }),
    [config, blocks.isPending, blocks.isError, workouts, today, weekStartDay],
  );
  if (!card) return null;
  if (card.kind === 'offer')
    return <TrainingBlockOfferCard onStart={() => router.push(blockRoutes.edit())} />;
  return (
    <TrainingBlockCard
      block={card.block}
      config={config ?? { blocks: [] }}
      today={today}
      style={style}
      onOpen={() => router.push(blockRoutes.overview)}
      onSummary={
        blockFinished(card.block, today)
          ? () => router.push(blockRoutes.summary(card.block.id))
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  track: { height: 6, overflow: 'hidden', marginTop: 4 },
});
