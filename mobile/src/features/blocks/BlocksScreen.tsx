import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { blockColor } from '../../../../frontend/src/blockColors';
import {
  blocksInYear,
  firstBlockYear,
  joinedDetails,
  lastBlockYear,
  toggledBlock,
  workoutCountLabel,
} from '../../../../frontend/src/trainingBlockSegments';
import {
  blockWeekCells,
  comparedBlockName,
  prComparison,
  previousRegularBlock,
  signedPercent,
  weeklyVolumeChange,
} from '../../../../frontend/src/trainingBlockStats';
import {
  blockDay,
  blockOn,
  blockProgress,
  blockRange,
  daysLeftLabel,
} from '../../../../frontend/src/trainingBlocks';
import type { TrainingBlock, TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { Button, Card, ErrorState, errorMessage, IconButton, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { trainingIcons } from '../training/icons';
import { Badge } from '../training/parts';
import { useBlockSummary, useTrainingBlocks } from './blockQueries';
import { nativeBlockColor } from './BlockScopeChip';
import { BlockTimeline } from './BlockTimeline';
import { blockRoutes } from './routes';
import { LandscapeChartView } from '../body/LandscapeChart';

/**
 * Every training block, one year at a time, as the web's overview: the year's bar, the block in
 * progress, and the year's blocks to open (their summary) or edit.
 */
export function BlocksScreen() {
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const blocks = useTrainingBlocks();
  const today = localDate();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [selected, setSelected] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ date: string; key: number } | null>(null);
  const [landscape, setLandscape] = useState(false);
  const config = blocks.data;
  // The arrows move the timeline to a year; scrolling it moves the year and list along.
  const goToYear = (next: number) => {
    setYear(next);
    setScrollRequest((request) => ({ date: `${next}-01-01`, key: (request?.key ?? 0) + 1 }));
  };

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New training block"
            hitSlop={8}
            onPress={() => router.push(blockRoutes.edit())}
          >
            <Icon name="plus" size={22} color={colors.accentText} />
          </Pressable>
        ),
      }}
    />
  );
  if (!config)
    return (
      <>
        {header}
        {blocks.isError ? (
          <ErrorState message={errorMessage(blocks.error)} onRetry={() => void blocks.refetch()} />
        ) : (
          <Loading label="Loading training blocks" />
        )}
      </>
    );

  const first = firstBlockYear(config, today);
  const last = lastBlockYear(config, today);
  const shownYear = Math.min(Math.max(year, first), last);
  const current = blockOn(config.blocks, today);
  const { count, listed, earlier } = blocksInYear(config, shownYear);
  const highlighted = config.blocks.some((item) => item.id === selected) ? selected : null;
  const choose = (blockId: string) => {
    const next = toggledBlock(config.blocks, highlighted, blockId);
    setSelected(next);
    const block = config.blocks.find((item) => item.id === next);
    if (block) setYear(Number(block.start_date.slice(0, 4)));
  };

  return (
    <>
      {header}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={
          <RefreshControl
            refreshing={blocks.isRefetching}
            onRefresh={() => void blocks.refetch()}
          />
        }
      >
        {config.blocks.length === 0 ? (
          <Card>
            <Text style={[type.headline, { color: colors.text }]}>No blocks yet</Text>
            <Button label="Start a block" onPress={() => router.push(blockRoutes.edit())} />
          </Card>
        ) : (
          <>
            <Card accessibilityLabel="Training timeline">
              {/* The web's timeline header: year arrows either side, full screen at the end. */}
              <View style={styles.years}>
                <IconButton
                  icon="chevronLeft"
                  accessibilityLabel="Previous year"
                  disabled={shownYear <= first}
                  onPress={() => goToYear(shownYear - 1)}
                />
                <View style={styles.yearTitle} accessibilityLiveRegion="polite">
                  <Text style={[type.title, type.number, { color: colors.text }]}>{shownYear}</Text>
                  <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>
                    {count} block{count === 1 ? '' : 's'}
                  </Text>
                </View>
                <IconButton
                  icon="chevronRight"
                  accessibilityLabel="Next year"
                  disabled={shownYear >= last}
                  onPress={() => goToYear(shownYear + 1)}
                />
                <IconButton
                  icon={trainingIcons.expand}
                  accessibilityLabel="View Training timeline full screen in landscape"
                  onPress={() => setLandscape(true)}
                  style={{ backgroundColor: colors.surface2, borderColor: colors.lineStrong }}
                />
              </View>
              <BlockTimeline
                config={config}
                today={today}
                selected={highlighted}
                onSelect={choose}
                onCentreYear={setYear}
                scrollRequest={scrollRequest}
              />
            </Card>
            {current && !current.end_date && shownYear === thisYear && (
              <View style={{ gap: 8 }}>
                <Text
                  accessibilityRole="header"
                  accessibilityLabel="Now"
                  style={[type.eyebrow, styles.eyebrow, { color: colors.muted }]}
                >
                  NOW
                </Text>
                <BlockNowCard
                  key={current.id}
                  config={config}
                  block={current}
                  today={today}
                  onOpen={() => router.push(blockRoutes.summary(current.id))}
                />
              </View>
            )}
            {/* Each block on its own card, with its colour as a stripe down the side. */}
            <View accessibilityLabel={`${shownYear} training blocks`} style={{ gap: 10 }}>
              {listed.map((item) => (
                <BlockRow
                  key={item.id}
                  config={config}
                  block={item}
                  today={today}
                  current={item.id === current?.id}
                  highlighted={item.id === highlighted}
                  onOpen={() => router.push(blockRoutes.summary(item.id))}
                  onEdit={() => router.push(blockRoutes.edit(item.id))}
                />
              ))}
              {earlier && (
                <Card style={styles.blockCard}>
                  <View style={styles.row}>
                    <View style={[styles.stripe, { backgroundColor: colors.deemph }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.headline, { color: colors.text }]}>Before blocks</Text>
                      <Text style={[type.footnote, { color: colors.secondary }]}>
                        {joinedDetails(
                          blockRange(config.history_start!, config.blocks[0].start_date),
                          workoutCountLabel(config.earlier_workout_count),
                        )}
                      </Text>
                    </View>
                  </View>
                </Card>
              )}
              {!listed.length && !earlier && (
                <Card>
                  <Text style={[type.callout, styles.empty, { color: colors.secondary }]}>
                    No blocks in {shownYear}.
                  </Text>
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
      {config.blocks.length > 0 && (
        <LandscapeChartView
          title="Training timeline"
          visible={landscape}
          onClose={() => setLandscape(false)}
        >
          {(size) => (
            <View style={{ gap: 10 }}>
              <BlockTimeline
                config={config}
                today={today}
                selected={highlighted}
                onSelect={choose}
                barHeight={Math.max(40, Math.min(120, size.height - 70))}
              />
              <SelectedBlockDetail config={config} blockId={highlighted} today={today} />
            </View>
          )}
        </LandscapeChartView>
      )}
    </>
  );
}

/** The landscape view's line for the chosen block: its colour, name, dates and workouts. */
function SelectedBlockDetail({
  config,
  blockId,
  today,
}: {
  config: TrainingBlocks;
  blockId: string | null;
  today: string;
}) {
  const { colors, type } = useTheme();
  const block = config.blocks.find((item) => item.id === blockId);
  return (
    <View style={styles.fullDetail} accessibilityLiveRegion="polite">
      {block && (
        <>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: nativeBlockColor(blockColor(config.blocks, block, today), colors),
              },
            ]}
          />
          <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>
            {block.name}
          </Text>
          <Text style={[type.callout, { color: colors.secondary }]}>
            {joinedDetails(
              blockRange(block.start_date, block.end_date),
              workoutCountLabel(block.workout_count),
            )}
          </Text>
        </>
      )}
    </View>
  );
}

function BlockRow({
  config,
  block,
  today,
  current,
  highlighted,
  onOpen,
  onEdit,
}: {
  config: TrainingBlocks;
  block: TrainingBlock;
  today: string;
  current: boolean;
  highlighted: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { colors, type } = useTheme();
  const plan =
    current && block.planned_end_date
      ? joinedDetails(
          daysLeftLabel(blockProgress(block, today).daysLeft!),
          `Planned end ${blockDay(block.planned_end_date, block.planned_end_date.slice(0, 4) !== today.slice(0, 4))}`,
        )
      : '';
  const range = blockRange(block.start_date, block.end_date);
  const workouts = workoutCountLabel(block.workout_count);
  return (
    <Card
      style={[
        styles.blockCard,
        highlighted && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${block.name}${current ? ', current' : ''}${block.deload ? ', deload' : ''}, ${range}. Open summary`}
          onPress={onOpen}
          style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
        >
          <View
            style={[
              styles.stripe,
              {
                backgroundColor: nativeBlockColor(blockColor(config.blocks, block, today), colors),
              },
            ]}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.title}>
              <Text
                style={[type.headline, { color: colors.text, flexShrink: 1 }]}
                numberOfLines={2}
              >
                {block.name}
              </Text>
              {current && <Badge label="Current" tone="good" sentence />}
              {block.deload && <Badge label="Deload" tone="gold" sentence />}
            </View>
            <Text style={[type.footnote, { color: colors.secondary }]}>{range}</Text>
            {!!plan && (
              <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                {plan}
              </Text>
            )}
            {!!workouts && (
              <Text style={[type.footnote, { color: colors.secondary }]}>{workouts}</Text>
            )}
          </View>
        </Pressable>
        <Button
          label="Edit"
          variant="secondary"
          size="small"
          accessibilityLabel={`Edit ${block.name}`}
          onPress={onEdit}
        />
      </View>
    </Card>
  );
}

/** A block colour at an opacity (a two-digit hex alpha); colours that aren't #rrggbb stay solid. */
const tint = (color: string, alpha: string) =>
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;

/** The block in progress: its weeks so far and how it compares with the last regular block. */
function BlockNowCard({
  config,
  block,
  today,
  onOpen,
}: {
  config: TrainingBlocks;
  block: TrainingBlock;
  today: string;
  onOpen: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const { week, weeks, daysLeft } = blockProgress(block, today);
  const previous = previousRegularBlock(config, block);
  // The comparison is extra detail; the card still shows the block's progress without it.
  const now = useBlockSummary(previous ? block.id : undefined).data;
  const before = useBlockSummary(previous?.id).data;
  const change =
    now && before && previous
      ? weeklyVolumeChange(now.block, before.block, block, previous, today)
      : null;
  const cells = blockWeekCells(week, weeks);
  const color = nativeBlockColor(blockColor(config.blocks, block, today), colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${block.name}, ${weeks ? `week ${week} of ${weeks}` : `week ${week}`}. Open summary`}
      onPress={onOpen}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      <Card>
        <View style={styles.nowTop}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[type.headline, { color: colors.text, flex: 1 }]} numberOfLines={1}>
            {block.name}
          </Text>
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
            {joinedDetails(
              weeks ? `Week ${week} of ${weeks}` : `Week ${week}`,
              daysLeft !== null ? daysLeftLabel(daysLeft) : '',
            )}
          </Text>
        </View>
        {cells.length > 0 && (
          // One connected strip, as the web's: weeks done in the block's colour, this week lighter.
          <View
            style={[styles.weeks, { borderRadius: radius.sm, backgroundColor: colors.surface2 }]}
            importantForAccessibility="no-hide-descendants"
          >
            {cells.map((cell, index) => (
              <View
                key={index}
                style={[
                  styles.week,
                  cell.state === 'done' && { backgroundColor: tint(color, 'b3') },
                  cell.state === 'now' && { backgroundColor: tint(color, '4d') },
                ]}
              >
                {!!cell.label && (
                  <Text
                    style={[
                      styles.weekLabel,
                      {
                        color:
                          cell.state === 'done' || cell.state === 'now'
                            ? colors.text
                            : colors.secondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {cell.label}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
        {now && before && previous && before.block.workout_count > 0 && (
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {comparedBlockName(previous, block)}:{' '}
            {change !== null && (
              <Text>
                <Text
                  style={{ color: change >= 0 ? colors.good : colors.danger, fontWeight: '700' }}
                >
                  {signedPercent(change)}
                </Text>{' '}
                volume per week ·{' '}
              </Text>
            )}
            {prComparison(now.block, before.block)}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  years: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yearTitle: { flex: 1, alignItems: 'center' },
  eyebrow: { paddingHorizontal: 6 },
  fullDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  blockCard: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  stripe: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 36 },
  title: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  empty: { paddingVertical: 16, textAlign: 'center' },
  nowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weeks: { flexDirection: 'row', overflow: 'hidden' },
  week: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontSize: 11, fontWeight: '700' },
});
