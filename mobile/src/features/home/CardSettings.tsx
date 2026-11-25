import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spotlightOptions } from '../../../../frontend/src/homeInsights';
import {
  activityCardSettings,
  homeSectionSettings,
  TRAINING_BLOCK_CARD_STYLES,
  updateHomeSectionSettings,
  type BodyCheckInMode,
  type CardioGoalCardStyle,
  type HomeLayout,
  type HomeSectionId,
  type HomeSectionSettings,
} from '../../../../frontend/src/homeLayout';
import { homeCardioGoals } from '../../../../frontend/src/homeStats';
import { averageOf } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard } from '../../data/queries';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';
import { useExerciseLibrary } from '../training/trainingQueries';
import { useSpotlightNames } from './InsightCards';
import { SparkBars } from './Sparks';
import { useActivityWeeks } from './StatCards';

/** The sections with display options, and the settings each one keeps. */
export const CARD_SETTINGS: Partial<Record<HomeSectionId, keyof HomeSectionSettings>> = {
  'combined-check-in': 'check_in',
  'training-block': 'training_block',
  workouts: 'workouts',
  'cardio-sessions': 'cardio_sessions',
  zone2: 'zone2',
  'exercise-spotlight': 'exercise_spotlight',
  'cardio-distance': 'cardio_distance',
};

/** A section's options, as the web's Customise dialogs offer them, changing the draft layout. */
export function CardSettingsForm({
  id,
  layout,
  onChange,
}: {
  id: HomeSectionId;
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
}) {
  switch (id) {
    case 'combined-check-in': {
      const { mode } = homeSectionSettings(layout, 'check_in');
      const options: { id: BodyCheckInMode; label: string }[] = [
        { id: 'weight', label: 'Weight only' },
        { id: 'fat', label: 'Body fat only' },
        { id: 'combined-single', label: 'Combined' },
      ];
      return (
        <Choices
          title="Check-in"
          options={options.map((option) => ({
            key: option.id,
            label: option.label,
            selected:
              mode === option.id || (mode === 'combined' && option.id === 'combined-single'),
            onSelect: () =>
              onChange(updateHomeSectionSettings(layout, 'check_in', { mode: option.id })),
          }))}
        />
      );
    }
    case 'training-block': {
      const { style } = homeSectionSettings(layout, 'training_block');
      return (
        <Choices
          title="Design"
          options={TRAINING_BLOCK_CARD_STYLES.map((option) => ({
            key: option.id,
            label: option.label,
            selected: style === option.id,
            onSelect: () =>
              onChange(updateHomeSectionSettings(layout, 'training_block', { style: option.id })),
          }))}
        />
      );
    }
    case 'workouts':
    case 'cardio-sessions':
      return <ActivitySettings id={id} layout={layout} onChange={onChange} />;
    case 'zone2':
      return <CardioGoalSettings layout={layout} onChange={onChange} />;
    case 'exercise-spotlight':
      return <SpotlightSettings layout={layout} onChange={onChange} />;
    case 'cardio-distance': {
      const { period } = homeSectionSettings(layout, 'cardio_distance');
      return (
        <Choices
          title="Period"
          options={(
            [
              ['week', 'This week'],
              ['month', 'This month'],
            ] as const
          ).map(([key, label]) => ({
            key,
            label,
            selected: period === key,
            onSelect: () =>
              onChange(updateHomeSectionSettings(layout, 'cardio_distance', { period: key })),
          }))}
        />
      );
    }
    default:
      return null;
  }
}

function ActivitySettings({
  id,
  layout,
  onChange,
}: {
  id: 'workouts' | 'cardio-sessions';
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
}) {
  const key = id === 'workouts' ? 'workouts' : 'cardio_sessions';
  const { weeks } = activityCardSettings(layout, key);
  const history = useActivityWeeks().weeks.map((week) =>
    id === 'workouts' ? week.workouts : week.cardioSessions,
  );
  return (
    <Choices
      title="History & average"
      options={([4, 8, 12] as const).map((count) => {
        const values = history.slice(-count);
        return {
          key: String(count),
          label: `${count} weeks`,
          detail: `${(averageOf(values) ?? 0).toFixed(1)} / week`,
          preview: <SparkBars values={values} label={`${count}-week preview`} />,
          selected: weeks === count,
          onSelect: () => onChange(updateHomeSectionSettings(layout, key, { weeks: count })),
        };
      })}
    />
  );
}

function CardioGoalSettings({
  layout,
  onChange,
}: {
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
}) {
  const value = homeSectionSettings(layout, 'zone2');
  const { goals } = homeCardioGoals(useDashboard().data, localDate());
  const zone = goals.some((goal) => goal.zone === value.zone) ? value.zone : null;
  const styles: { id: CardioGoalCardStyle; label: string }[] = [
    { id: 'progress', label: 'Progress bar' },
    { id: 'ring', label: 'Ring' },
    { id: 'list', label: 'List' },
  ];
  return (
    <>
      <Choices
        title="Track"
        options={[
          { zone: null, label: 'All goals' },
          ...goals.map((goal) => ({
            zone: goal.zone,
            label: `Zone ${goal.zone} · ${goal.goal_minutes} min`,
          })),
        ].map((option) => ({
          key: String(option.zone ?? 'all'),
          label: option.label,
          selected: zone === option.zone,
          onSelect: () =>
            onChange(updateHomeSectionSettings(layout, 'zone2', { zone: option.zone })),
        }))}
      />
      <Choices
        title="Design"
        options={styles.map((style) => ({
          key: style.id,
          label: style.label,
          selected: value.style === style.id,
          onSelect: () => onChange(updateHomeSectionSettings(layout, 'zone2', { style: style.id })),
        }))}
      />
    </>
  );
}

function SpotlightSettings({
  layout,
  onChange,
}: {
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
}) {
  const value = homeSectionSettings(layout, 'exercise_spotlight');
  const names = useSpotlightNames();
  const options = spotlightOptions(useExerciseLibrary().data ?? [], names);
  const chosen = options.some((option) => option.id === value.exercise_id)
    ? value.exercise_id
    : null;
  return (
    <Choices
      title="Exercise"
      options={[{ id: null, name: 'Most trained' }, ...options].map((option) => ({
        key: option.id ?? 'auto',
        label: option.name,
        selected: chosen === option.id,
        onSelect: () =>
          onChange(
            updateHomeSectionSettings(layout, 'exercise_spotlight', { exercise_id: option.id }),
          ),
      }))}
    />
  );
}

/** One choice of several, as a list with a tick on the chosen row. */
function Choices({
  title,
  options,
}: {
  title: string;
  options: {
    key: string;
    label: string;
    detail?: string;
    preview?: ReactNode;
    selected: boolean;
    onSelect: () => void;
  }[];
}) {
  const { colors, type, radius } = useTheme();
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text style={[type.eyebrow, { color: colors.muted }]}>{title.toUpperCase()}</Text>
      <View style={{ backgroundColor: colors.surface2, borderRadius: radius.lg }}>
        {options.map((option, index) => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: option.selected }}
            onPress={() => {
              haptics.selection();
              option.onSelect();
            }}
            style={({ pressed }) => [
              choiceStyles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.line,
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { color: colors.text }]}>{option.label}</Text>
              {!!option.detail && (
                <Text style={[type.footnote, type.number, { color: colors.muted }]}>
                  {option.detail}
                </Text>
              )}
            </View>
            {option.preview && <View style={choiceStyles.preview}>{option.preview}</View>}
            <View style={choiceStyles.tick}>
              {option.selected && <Icon name="check" size={16} color={colors.accentText} />}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const choiceStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, padding: 12 },
  preview: { width: 88 },
  tick: { width: 20, alignItems: 'center' },
});
