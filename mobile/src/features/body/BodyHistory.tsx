import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HISTORY_PAGE_SIZE, prettyDate } from '../../../../frontend/src/appShared';
import {
  bodyGoalKind,
  bodyGoalName,
  bodyHistoryWithWeightChanges,
  goalStartLabel,
  summarizeBodyHistory,
  weightChangeAmount,
  weightChangeLabel,
  type BodyHistoryPeriod,
  type BodyHistoryWeightChange,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { bodyHistoryPeriodLabel } from '../../../../frontend/src/bodyTrend';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { formatWeight, weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, EmptyState } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { MenuButton } from '../../ui/MenuButton';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { bodyTrendPreference } from '../settings/devicePreferences';
import { bodyIcons } from './bodyIcons';

type HistoryView = 'daily' | BodyHistoryPeriod;
const VIEWS: HistoryView[] = ['daily', 'week', 'month'];

const dayMonth = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long' });

/**
 * Body's check-in history, as the web's: daily check-ins, or weekly or monthly averages, each
 * with its change from the row below judged against the goal in force, and a divider where a
 * new goal started. A row's menu edits or deletes it; a divider's edits or removes its goal.
 */
export function BodyHistory({
  measurements,
  goals,
  onEdit,
  onDelete,
  onEditGoal,
  onRemoveGoal,
}: {
  measurements: BodyMeasurement[];
  goals: BodyWeightGoal[];
  onEdit: (measurement: BodyMeasurement) => void;
  onDelete: (measurement: BodyMeasurement) => void;
  onEditGoal: (goal: BodyWeightGoal) => void;
  onRemoveGoal: (goal: BodyWeightGoal) => void;
}) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  // Settings › Bodyweight chart: weekly and monthly rows average or take the median, as on the web.
  const { statistic } = bodyTrendPreference.use();
  const viewLabel = (item: HistoryView) =>
    item === 'daily' ? 'Daily' : bodyHistoryPeriodLabel(item, statistic);
  const [view, setView] = useState<HistoryView>('daily');
  const [rows, setRows] = useState(HISTORY_PAGE_SIZE);
  const daily = bodyHistoryWithWeightChanges(
    measurements
      .slice()
      .sort((first, second) => second.measurement_date.localeCompare(first.measurement_date)),
    goals,
    (measurement) => measurement.measurement_date,
  );
  // A week or month is judged by the goal in force on its last day.
  const summaries = bodyHistoryWithWeightChanges(
    view === 'daily' ? [] : summarizeBodyHistory(measurements, view, statistic),
    goals,
    (summary) => summary.end_date,
  );
  const count = view === 'daily' ? daily.length : summaries.length;
  const divider = (goal: BodyWeightGoal | null) =>
    goal && (
      <GoalDivider
        goal={goal}
        unit={unit}
        onPress={() => {
          haptics.tap();
          showMenu(bodyGoalName(goal, unit), [
            { label: 'Edit goal', onPress: () => onEditGoal(goal) },
            { label: 'Remove goal', destructive: true, onPress: () => onRemoveGoal(goal) },
          ]);
        }}
      />
    );

  return (
    <>
      <Segmented
        accessibilityLabel="Bodyweight records"
        values={VIEWS.map(viewLabel)}
        selectedIndex={VIEWS.indexOf(view)}
        onChange={(index) => {
          setView(VIEWS[index]);
          setRows(HISTORY_PAGE_SIZE);
        }}
      />
      <Card accessibilityLabel="Check-ins">
        <View style={styles.heading}>
          <Text style={[type.eyebrow, { color: colors.muted }]}>HISTORY</Text>
          <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text }]}>
            Check-ins
          </Text>
        </View>
        {count === 0 ? (
          <EmptyState
            icon={bodyIcons.scale}
            title="No check-ins yet"
            message="Your first check-in will appear here."
          />
        ) : (
          <View accessible={false} style={[styles.tableHead, { borderBottomColor: colors.line }]}>
            <Text style={[type.caption, styles.date, { color: colors.muted, fontWeight: '600' }]}>
              {view === 'daily' ? 'Date' : view === 'week' ? 'Week' : 'Month'}
            </Text>
            <Text style={[type.caption, { color: colors.muted, fontWeight: '600', flex: 1 }]}>
              Bodyweight
            </Text>
            <Text style={[type.caption, styles.fat, { color: colors.muted, fontWeight: '600' }]}>
              Body fat
            </Text>
            {view === 'daily' && <View style={styles.moreSpacer} />}
          </View>
        )}
        {view === 'daily' &&
          daily.slice(0, rows).map((measurement, index) => (
            <Fragment key={measurement.id}>
              <Row
                first={index === 0}
                date={dayMonth(measurement.measurement_date)}
                year={measurement.measurement_date.slice(0, 4)}
                weight={formatWeight(measurement.weight_kg, unit)}
                change={measurement.weight_change}
                comparison="previous check-in"
                decimals={2}
                fixed={false}
                detail={measurement.is_sample ? 'Sample' : null}
                notes={measurement.notes}
                fat={measurement.body_fat_pct !== null ? `${measurement.body_fat_pct}%` : '–'}
                menu={
                  <MenuButton
                    accessibilityLabel={`Actions for ${prettyDate(measurement.measurement_date)}`}
                    items={[
                      { label: 'Edit', onPress: () => onEdit(measurement) },
                      {
                        label: 'Delete check-in',
                        destructive: true,
                        onPress: () => onDelete(measurement),
                      },
                    ]}
                    trigger={{ sf: 'ellipsis', color: colors.secondary, size: 15 }}
                    width={32}
                    height={32}
                    fill={colors.surface2}
                  >
                    <View style={[styles.more, { backgroundColor: colors.surface2 }]}>
                      <Icon name="more" size={16} color={colors.secondary} />
                    </View>
                  </MenuButton>
                }
              />
              {divider(measurement.goal_change)}
            </Fragment>
          ))}
        {view !== 'daily' &&
          summaries.slice(0, rows).map((summary, index) => {
            const years =
              summary.start_date.slice(0, 4) +
              (summary.start_date.slice(0, 4) !== summary.end_date.slice(0, 4)
                ? `–${summary.end_date.slice(0, 4)}`
                : '');
            return (
              <Fragment key={summary.start_date}>
                <Row
                  first={index === 0}
                  date={
                    view === 'week'
                      ? `${dayMonth(summary.start_date)} – ${dayMonth(summary.end_date)}`
                      : monthName(summary.start_date)
                  }
                  year={years}
                  weight={`${weightFromKg(summary.weight_kg, unit).toFixed(1)} ${unit}`}
                  change={summary.weight_change}
                  comparison={`previous ${view === 'week' ? 'week' : 'month'} with check-ins`}
                  decimals={1}
                  fixed
                  detail={`${summary.count} ${summary.count === 1 ? 'check-in' : 'check-ins'}`}
                  notes={null}
                  fat={summary.body_fat_pct === null ? '–' : `${summary.body_fat_pct.toFixed(1)}%`}
                />
                {divider(summary.goal_change)}
              </Fragment>
            );
          })}
        {count > rows && (
          <Button
            label="Show more"
            variant="link"
            align="center"
            onPress={() => setRows((shown) => shown + HISTORY_PAGE_SIZE)}
          />
        )}
      </Card>
    </>
  );
}

function Row({
  first,
  date,
  year,
  weight,
  change,
  comparison,
  decimals,
  fixed,
  detail,
  notes,
  fat,
  menu,
}: {
  first: boolean;
  date: string;
  year: string;
  weight: string;
  change: BodyHistoryWeightChange | null;
  comparison: string;
  decimals: number;
  fixed: boolean;
  detail: string | null;
  notes: string | null;
  fat: string;
  menu?: ReactNode;
}) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  return (
    <View
      style={[
        styles.row,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
          paddingTop: 10,
        },
      ]}
    >
      <View style={styles.date}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>{date}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{year}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.weight}>
          <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '600' }]}>
            {weight}
          </Text>
          <WeightChange
            change={change}
            comparison={comparison}
            unit={unit}
            decimals={decimals}
            fixed={fixed}
          />
        </View>
        {!!detail && <Text style={[type.caption, { color: colors.muted }]}>{detail}</Text>}
        {!!notes && (
          <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={2}>
            {notes}
          </Text>
        )}
      </View>
      <Text
        accessibilityLabel={`Body fat ${fat === '–' ? 'not logged' : fat}`}
        style={[type.callout, type.number, styles.fat, { color: colors.secondary }]}
      >
        {fat}
      </Text>
      {menu}
    </View>
  );
}

/** The arrow and amount since the row below, coloured by whether it suits the goal. */
function WeightChange({
  change,
  comparison,
  unit,
  decimals,
  fixed,
}: {
  change: BodyHistoryWeightChange | null;
  comparison: string;
  unit: WeightUnit;
  decimals: number;
  fixed: boolean;
}) {
  const { colors, type } = useTheme();
  if (!change) return null;
  const amount = weightChangeAmount(change, unit, decimals, fixed);
  const color =
    change.status === 'favorable'
      ? colors.good
      : change.status === 'unfavorable'
        ? colors.danger
        : colors.muted;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={weightChangeLabel(change, amount, unit, comparison)}
      style={styles.change}
    >
      <Icon
        name={change.direction === 'up' ? bodyIcons.up : bodyIcons.down}
        size={11}
        color={color}
      />
      <Text style={[type.caption, type.number, { color, fontWeight: '600' }]}>{amount}</Text>
    </View>
  );
}

/** A dotted rule under the oldest row of a new goal, naming the goal and when it started. */
function GoalDivider({
  goal,
  unit,
  onPress,
}: {
  goal: BodyWeightGoal;
  unit: WeightUnit;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  const kind = bodyGoalKind(goal);
  const name = bodyGoalName(goal, unit);
  const date = goalStartLabel(goal.start_date);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`New goal from ${date}: ${name}`}
      accessibilityHint="Edit or remove this goal"
      onPress={onPress}
      style={({ pressed }) => [styles.divider, pressed && { opacity: 0.6 }]}
    >
      <Icon
        name={
          kind === 'maintain' ? bodyIcons.level : kind === 'loss' ? bodyIcons.down : bodyIcons.up
        }
        size={12}
        color={colors.accentText}
      />
      <Text style={[type.caption, { color: colors.accentText, fontWeight: '600' }]}>{name}</Text>
      <View style={[styles.dots, { borderColor: colors.lineStrong }]} />
      <Text style={[type.caption, { color: colors.muted }]}>from {date}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 2 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  date: { width: 72 },
  weight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fat: { width: 52, textAlign: 'right' },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moreSpacer: { width: 32 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  dots: { flex: 1, borderTopWidth: 1.5, borderStyle: 'dotted', height: 0 },
});
