import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { filterMachines, machineLastUsedLabel } from '../../../../frontend/src/machineHistory';
import type { MachinePhotoUsage } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { ErrorState, Loading, errorMessage } from '../../ui/components';
import { TextField } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { useAllMachinePhotos } from '../workout/loggerQueries';
import type { MachineFilter } from './MachinePhotos';

/** Past this many machines, the list gets a search field, as on the web. */
const SEARCH_THRESHOLD = 6;

/**
 * Choose one saved machine to list only the workouts that pinned it, as the web's Filter by
 * machine dialog does: each machine with its exercise, when it was last used and how often.
 */
export function MachineFilterSheet({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (filter: MachineFilter) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter by machine"
      kicker="Sessions"
      keyboardShouldPersistTaps="handled"
    >
      {/* Opened again, the search starts empty. */}
      {visible && <MachineChoices onSelect={onSelect} />}
    </Sheet>
  );
}

function MachineChoices({ onSelect }: { onSelect: (filter: MachineFilter) => void }) {
  const { colors, type } = useTheme();
  const query = useAllMachinePhotos();
  const [search, setSearch] = useState('');
  const [today] = useState(localDate);
  const machines = query.data;

  if (!machines) {
    if (waitingForNetwork(query))
      return <ErrorState message={OFFLINE_MESSAGE} onRetry={() => void query.refetch()} />;
    if (query.isError)
      return (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      );
    return <Loading label="Loading machines…" />;
  }
  if (!machines.length)
    return (
      <Text style={[type.callout, styles.message, { color: colors.muted }]}>
        No saved machine photos yet. While logging an exercise, tap Choose machine, then Add machine
        photo to save one.
      </Text>
    );

  const visible = filterMachines(machines, search);
  return (
    <View style={{ gap: 10 }}>
      {machines.length > SEARCH_THRESHOLD && (
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search machines or exercises"
          accessibilityLabel="Search machines"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      )}
      {visible.length === 0 ? (
        <Text style={[type.callout, styles.message, { color: colors.muted }]}>
          No machines match “{search.trim()}”.
        </Text>
      ) : (
        <View accessibilityLabel="Saved machines" style={{ gap: 8 }}>
          {visible.map((machine) => (
            <MachineOption
              key={machine.id}
              machine={machine}
              today={today}
              onPress={() => {
                haptics.selection();
                onSelect({ photo: machine, exerciseName: machine.exercise_name });
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function MachineOption({
  machine,
  today,
  onPress,
}: {
  machine: MachinePhotoUsage;
  today: string;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const image = useAuthorisedImage(machine.thumbnail_url);
  const caption = machine.caption || 'Machine';
  const lastUsed = machineLastUsedLabel(machine.last_used_date, today);
  const count =
    machine.workout_count > 0
      ? `${machine.workout_count} ${machine.workout_count === 1 ? 'workout' : 'workouts'}`
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[caption, machine.exercise_name, lastUsed, count]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: radius.md },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.surface3, borderRadius: radius.sm }]}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
        ) : (
          <Icon name={{ sf: 'photo', md: 'photo' }} size={18} color={colors.muted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: colors.text }]} numberOfLines={2}>
          {caption}
        </Text>
        <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
          {machine.exercise_name}
        </Text>
        <Text
          style={[
            type.footnote,
            { color: colors.muted },
            !machine.last_used_date && { fontStyle: 'italic' },
          ]}
        >
          {lastUsed}
        </Text>
      </View>
      {machine.workout_count > 0 && (
        <Text style={[type.headline, type.number, { color: colors.accentText }]}>
          {machine.workout_count}×
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  message: { textAlign: 'center', paddingVertical: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    minHeight: 64,
  },
  thumb: {
    width: 64,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
