import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { blockColor } from '../../../../frontend/src/blockColors';
import {
  blockYearSegments,
  blocksInYear,
  firstBlockYear,
  joinedDetails,
  lastBlockYear,
  segmentInYear,
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
  MONTHS,
  blockDay,
  blockOn,
  blockProgress,
  blockRange,
  daysLeftLabel,
} from '../../../../frontend/src/trainingBlocks';
import type { TrainingBlock, TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { Button, Card, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Badge, Divider } from '../training/parts';
import { useBlockSummary, useTrainingBlocks } from './blockQueries';
import { nativeBlockColor } from './BlockScopeChip';
import { blockRoutes } from './routes';

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
  const config = blocks.data;

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
              <View style={styles.years}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  accessibilityState={{ disabled: shownYear <= first }}
                  disabled={shownYear <= first}
                  hitSlop={8}
                  onPress={() => setYear(shownYear - 1)}
                  style={{ opacity: shownYear <= first ? 0.3 : 1 }}
                >
                  <Icon name="chevronLeft" size={18} color={colors.accentText} />
                </Pressable>
                <View style={{ alignItems: 'center' }} accessibilityLiveRegion="polite">
                  <Text style={[type.headline, type.number, { color: colors.text }]}>
                    {shownYear}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {count} block{count === 1 ? '' : 's'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  accessibilityState={{ disabled: shownYear >= last }}
                  disabled={shownYear >= last}
                  hitSlop={8}
                  onPress={() => setYear(shownYear + 1)}
                  style={{ opacity: shownYear >= last ? 0.3 : 1 }}
                >
                  <Icon name="chevronRight" size={18} color={colors.accentText} />
                </Pressable>
              </View>
              <YearBar
                config={config}
                year={shownYear}
                today={today}
                selected={highlighted}
                onSelect={choose}
              />
            </Card>
            {current && !current.end_date && shownYear === thisYear && (
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
                  Now
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
            <Card accessibilityLabel={`${shownYear} training blocks`} style={styles.list}>
              {listed.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <Divider inset={44} />}
                  <BlockRow
                    config={config}
                    block={item}
                    today={today}
                    current={item.id === current?.id}
                    highlighted={item.id === highlighted}
                    onOpen={() => router.push(blockRoutes.summary(item.id))}
                    onEdit={() => router.push(blockRoutes.edit(item.id))}
                  />
                </View>
              ))}
              {earlier && (
                <View>
                  {listed.length > 0 && <Divider inset={44} />}
                  <View style={styles.row}>
                    <View style={[styles.swatch, { backgroundColor: colors.surface3 }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                        Before blocks
                      </Text>
                      <Text style={[type.caption, { color: colors.secondary }]}>
                        {joinedDetails(
                          blockRange(config.history_start!, config.blocks[0].start_date),
                          workoutCountLabel(config.earlier_workout_count),
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {!listed.length && !earlier && (
                <Text style={[type.callout, styles.empty, { color: colors.secondary }]}>
                  No blocks in {shownYear}.
                </Text>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

/** One year of the overview's bar: each block in its colour, the planned rest paler. */
function YearBar({
  config,
  year,
  today,
  selected,
  onSelect,
}: {
  config: TrainingBlocks;
  year: number;
  today: string;
  selected: string | null;
  onSelect: (blockId: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const segments = blockYearSegments(config, today).flatMap((segment) => {
    const place = segmentInYear(segment, year);
    return place ? [{ segment, place }] : [];
  });
  // Today's place along the year, when the bar shows this year.
  const todayLeft =
    today.slice(0, 4) === String(year)
      ? segmentInYear({ start: today, end: `${year + 1}-01-01` }, year)?.left
      : undefined;
  return (
    <View style={{ gap: 4 }}>
      <View style={[styles.yearBar, { backgroundColor: colors.surface2, borderRadius: radius.sm }]}>
        {segments.map(({ segment, place }) => {
          const color = segment.color ? nativeBlockColor(segment.color, colors) : colors.surface3;
          const block = config.blocks.find((item) => item.id === segment.blockId);
          const isSelected = !!segment.blockId && segment.blockId === selected;
          const style = [
            styles.yearSegment,
            {
              left: `${place.left * 100}%`,
              width: `${place.width * 100}%`,
              backgroundColor: color,
              opacity: segment.planned ? 0.35 : 1,
              borderColor: isSelected ? colors.text : 'transparent',
            },
          ] as const;
          if (!block || segment.planned)
            return <View key={segment.key} pointerEvents="none" style={style} />;
          return (
            <Pressable
              key={segment.key}
              accessibilityRole="button"
              accessibilityLabel={`${block.name}, ${blockRange(block.start_date, block.end_date)}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(block.id)}
              style={style}
            />
          );
        })}
        {todayLeft !== undefined && (
          <View
            pointerEvents="none"
            style={[
              styles.todayLine,
              { left: `${todayLeft * 100}%`, backgroundColor: colors.text },
            ]}
          />
        )}
      </View>
      <View style={styles.months} importantForAccessibility="no-hide-descendants">
        {MONTHS.map((month) => (
          <Text key={month} style={[type.caption, styles.month, { color: colors.muted }]}>
            {month.charAt(0)}
          </Text>
        ))}
      </View>
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
  const { colors, type, radius } = useTheme();
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
    <View
      style={[
        styles.row,
        highlighted && { backgroundColor: colors.accentSoft, borderRadius: radius.md },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${block.name}${current ? ', current' : ''}${block.deload ? ', deload' : ''}, ${range}. Open summary`}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
      >
        <View
          style={[
            styles.swatch,
            { backgroundColor: nativeBlockColor(blockColor(config.blocks, block, today), colors) },
          ]}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.title}>
            <Text
              style={[type.callout, { color: colors.text, fontWeight: '600', flexShrink: 1 }]}
              numberOfLines={1}
            >
              {block.name}
            </Text>
            {current && <Badge label="Current" />}
            {block.deload && <Badge label="Deload" />}
          </View>
          <Text style={[type.caption, { color: colors.secondary }]}>{range}</Text>
          {!!plan && <Text style={[type.caption, { color: colors.accentText }]}>{plan}</Text>}
          {!!workouts && <Text style={[type.caption, { color: colors.muted }]}>{workouts}</Text>}
        </View>
      </Pressable>
      <Button
        label="Edit"
        variant="secondary"
        accessibilityLabel={`Edit ${block.name}`}
        onPress={onEdit}
        style={styles.edit}
      />
    </View>
  );
}

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
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {joinedDetails(
              weeks ? `Week ${week} of ${weeks}` : `Week ${week}`,
              daysLeft !== null ? daysLeftLabel(daysLeft) : '',
            )}
          </Text>
        </View>
        {cells.length > 0 && (
          <View style={styles.weeks} importantForAccessibility="no-hide-descendants">
            {cells.map((cell, index) => (
              <View
                key={index}
                style={[
                  styles.week,
                  {
                    borderRadius: radius.sm / 2,
                    backgroundColor:
                      cell.state === 'done'
                        ? color
                        : cell.state === 'now'
                          ? colors.accentSoft
                          : colors.surface2,
                    borderColor: cell.state === 'now' ? color : 'transparent',
                  },
                ]}
              >
                {!!cell.label && (
                  <Text
                    style={[
                      styles.weekLabel,
                      { color: cell.state === 'done' ? colors.page : colors.secondary },
                    ]}
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
  years: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearBar: { height: 28, overflow: 'hidden' },
  yearSegment: { position: 'absolute', top: 2, bottom: 2, borderRadius: 4, borderWidth: 2 },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  months: { flexDirection: 'row' },
  month: { flex: 1, textAlign: 'center' },
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 32, height: 32, borderRadius: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  edit: { minHeight: 34, paddingHorizontal: 12 },
  empty: { paddingVertical: 16, textAlign: 'center' },
  nowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  weeks: { flexDirection: 'row', gap: 3 },
  week: { flex: 1, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  weekLabel: { fontSize: 9, fontWeight: '700' },
});
