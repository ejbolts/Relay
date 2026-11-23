import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import type Svg from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import type { CardioSession } from '../../../../frontend/src/types';
import {
  cardioWorkoutForSharing,
  defaultWorkoutCardStats,
  workoutCardStats,
  workoutCardSvg,
  type WorkoutCardLayout,
  type WorkoutCardStat,
  type WorkoutCardStyle,
} from '../../../../frontend/src/workoutCardDrawing';
import { useWeightUnit } from '../../data/queries';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { socialIcons } from '../social/icons';
import { shareWorkoutCard, workoutCardHeight, workoutCardLogo } from '../social/workoutShare';
import { Segmented } from '../training/parts';

const STYLES: WorkoutCardStyle[] = ['midnight', 'paper'];
const LAYOUTS: WorkoutCardLayout[] = ['portrait', 'compact'];

/**
 * A cardio session's share card, as the web's Share card in Cardio history: the workout card
 * drawn for the session, with its styles, layouts and stats, shared as a PNG through the phone's
 * share sheet (which also saves or copies it).
 */
export function CardioShareSheet({
  session,
  onClose,
}: {
  session: CardioSession;
  onClose: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const { width: screen } = useWindowDimensions();
  const [workout] = useState(() => cardioWorkoutForSharing(session));
  const [style, setStyle] = useState<WorkoutCardStyle>('midnight');
  const [layout, setLayout] = useState<WorkoutCardLayout>('portrait');
  const [selected, setSelected] = useState<WorkoutCardStat[]>(() =>
    defaultWorkoutCardStats(workout),
  );
  const [showDate, setShowDate] = useState(true);
  const [logo, setLogo] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
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

  const stats = workoutCardStats(workout, unit, 0);
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

  function shareImage() {
    const drawing = card.current;
    if (!drawing || !svg || sharing) return;
    setSharing(true);
    setError(null);
    drawing.toDataURL(
      (png) => {
        shareWorkoutCard(workout, png)
          .catch(() => setError('Could not share the card. Try again.'))
          .finally(() => setSharing(false));
      },
      { width: 1080, height: workoutCardHeight(svg) },
    );
  }

  const xmlProps = {
    xml: svg,
    width: previewWidth,
    height: previewHeight,
    ref: card,
  } as unknown as ComponentProps<typeof SvgXml>;
  return (
    <Sheet visible onClose={onClose} title="Share cardio">
      <View
        accessibilityLabel="Cardio card preview"
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
            disabled={sharing}
            onChange={(on) =>
              setSelected((current) =>
                on ? [...current, stat.id] : current.filter((id) => id !== stat.id),
              )
            }
          />
        ))}
        <ToggleRow label="Date" value={showDate} disabled={sharing} onChange={setShowDate} />
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={sharing ? 'Sharing…' : 'Share image'}
        icon={socialIcons.share}
        disabled={sharing || svg === null}
        onPress={shareImage}
      />
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
