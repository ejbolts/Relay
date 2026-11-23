import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import type Svg from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import {
  defaultWorkoutCardStats,
  workoutCardStats,
  workoutCardSvg,
  type WorkoutCardLayout,
  type WorkoutCardStat,
  type WorkoutCardStyle,
} from '../../../../frontend/src/workoutCardDrawing';
import { useWeightUnit } from '../../data/queries';
import { Button, errorMessage } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { Segmented } from '../training/parts';
import { socialIcons } from './icons';
import {
  exportWorkoutCsv,
  shareWorkoutCard,
  workoutCardHeight,
  workoutCardLogo,
} from './workoutShare';

const STYLES: WorkoutCardStyle[] = ['midnight', 'paper'];
const LAYOUTS: WorkoutCardLayout[] = ['portrait', 'compact'];

/**
 * The web's Export menu for a saved workout: its share card, with the same styles, layouts and
 * stats, shared as an image, or its sets as a CSV file. The phone's share sheet also saves or
 * copies them, which the web offers as Download PNG and Copy image. A cardio session shares the
 * same card (`csv` off), as the web's Cardio history does, since it has no sets to export.
 */
export function ShareWorkoutSheet({
  workout,
  records,
  csv = true,
  onClose,
}: {
  workout: TrackedWorkout;
  records: number;
  /** Offer Export CSV beside Share image. */
  csv?: boolean;
  onClose: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const { width: screen } = useWindowDimensions();
  const [style, setStyle] = useState<WorkoutCardStyle>('midnight');
  const [layout, setLayout] = useState<WorkoutCardLayout>('portrait');
  const [selected, setSelected] = useState<WorkoutCardStat[]>(() =>
    defaultWorkoutCardStats(workout),
  );
  const [showDate, setShowDate] = useState(true);
  const [logo, setLogo] = useState<string | null>(null);
  const [action, setAction] = useState<'share' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<Svg>(null);

  useEffect(() => {
    let cancelled = false;
    workoutCardLogo().then(
      (uri) => !cancelled && setLogo(uri),
      () => !cancelled && setLogo(''),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = workoutCardStats(workout, unit, records);
  const svg =
    logo === null
      ? null
      : workoutCardSvg({
          workout,
          stats: stats.filter((stat) => selected.includes(stat.id)),
          style,
          showDate,
          layout,
          logo,
        });
  const previewWidth = Math.min(screen - 48, 360);
  const previewHeight = svg ? (previewWidth * workoutCardHeight(svg)) / 1080 : previewWidth * 1.25;
  const busy = action !== null;

  function shareImage() {
    const drawing = card.current;
    if (!drawing || !svg || busy) return;
    setAction('share');
    setError(null);
    drawing.toDataURL(
      (png) => {
        shareWorkoutCard(workout, png)
          .catch(() => setError('Could not share the card. Try again.'))
          .finally(() => setAction(null));
      },
      { width: 1080, height: workoutCardHeight(svg) },
    );
  }

  async function exportCsv() {
    if (busy) return;
    setAction('export');
    setError(null);
    try {
      await exportWorkoutCsv(workout);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setAction(null);
    }
  }

  const xmlProps = {
    xml: svg,
    width: previewWidth,
    height: previewHeight,
    ref: card,
  } as unknown as ComponentProps<typeof SvgXml>;
  return (
    <Sheet visible onClose={onClose} title="Share workout">
      <View
        accessibilityLabel="Workout card preview"
        accessibilityRole="image"
        style={[
          styles.preview,
          { width: previewWidth, height: previewHeight, borderRadius: radius.lg },
          { backgroundColor: colors.surface2 },
        ]}
      >
        {svg !== null && <SvgXml {...xmlProps} />}
      </View>
      <Segmented
        accessibilityLabel="Card style"
        values={['Midnight', 'Paper']}
        selectedIndex={STYLES.indexOf(style)}
        onChange={(index) => setStyle(STYLES[index])}
      />
      <Segmented
        accessibilityLabel="Layout"
        values={['Portrait', 'Compact']}
        selectedIndex={LAYOUTS.indexOf(layout)}
        onChange={(index) => setLayout(LAYOUTS[index])}
      />
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          Include stats
        </Text>
        {stats.map((stat) => (
          <ToggleRow
            key={stat.id}
            label={stat.label}
            detail={stat.value}
            value={selected.includes(stat.id)}
            disabled={busy}
            onChange={(on) =>
              setSelected((current) =>
                on ? [...current, stat.id] : current.filter((id) => id !== stat.id),
              )
            }
          />
        ))}
        <ToggleRow label="Workout date" value={showDate} disabled={busy} onChange={setShowDate} />
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <View style={{ gap: 10 }}>
        <Button
          label={action === 'share' ? 'Sharing…' : 'Share image'}
          icon={socialIcons.share}
          disabled={busy || svg === null}
          onPress={shareImage}
        />
        {csv && (
          <Button
            label={action === 'export' ? 'Exporting…' : 'Export CSV'}
            variant="secondary"
            disabled={busy}
            onPress={() => void exportCsv()}
          />
        )}
      </View>
    </Sheet>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      {!!detail && (
        <Text style={[type.callout, type.number, { color: colors.secondary }]}>{detail}</Text>
      )}
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          void Haptics.selectionAsync();
          onChange(next);
        }}
        trackColor={{ true: colors.good, false: colors.surface3 }}
        thumbColor={Platform.OS === 'android' ? '#ffffff' : undefined}
        ios_backgroundColor={colors.surface3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: 'center', overflow: 'hidden' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
