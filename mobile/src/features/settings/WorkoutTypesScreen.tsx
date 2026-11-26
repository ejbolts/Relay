import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkoutType } from '../../../../frontend/src/types';
import {
  NEW_WORKOUT_TYPE_COLOR,
  workoutTypeNameError,
} from '../../../../frontend/src/workoutTypes';
import { useWorkoutTypes } from '../../data/queries';
import { errorMessage, ErrorState, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { promptText, showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { ColourSheet } from './ColourSheet';
import { useWorkoutTypeActions } from './settingsData';
import { Row, Section, SectionError, SettingsPage } from './SettingsList';

type Colouring = { kind: 'existing'; type: WorkoutType } | { kind: 'new'; name: string };

/**
 * The account's workout types and their calendar colours, as Settings › Workout types on the
 * web: add, recolour and remove (removed types can be restored); custom types can be renamed.
 */
export function WorkoutTypesScreen() {
  const router = useRouter();
  const types = useWorkoutTypes();
  const actions = useWorkoutTypeActions();
  const [error, setError] = useState<string | null>(null);
  const [colouring, setColouring] = useState<Colouring | null>(null);
  const busy = actions.create.isPending || actions.update.isPending || actions.remove.isPending;

  if (types.isError && !types.data)
    return <ErrorState message={errorMessage(types.error)} onRetry={() => void types.refetch()} />;
  // The built-in types stand in until the account's own arrive.
  if (types.isPlaceholderData) return <Loading label="Loading workout types" />;
  const all = types.data ?? [];
  const active = all.filter((type) => !type.archived);
  const removed = all.filter((type) => type.archived);

  const fail = (reason: unknown) => setError(errorMessage(reason));
  function addType() {
    setError(null);
    promptText({
      title: 'New workout type',
      value: '',
      placeholder: 'For example, Arms or Legs',
      submitLabel: 'Next',
      onSubmit: (name) => {
        const invalid = workoutTypeNameError(name, all);
        if (invalid) setError(invalid);
        else setColouring({ kind: 'new', name: name.trim() });
      },
    });
  }
  function rename(type: WorkoutType) {
    setError(null);
    promptText({
      title: `Rename ${type.name}`,
      value: type.name,
      submitLabel: 'Rename',
      onSubmit: (name) => {
        if (name.trim() === type.name) return;
        const invalid = workoutTypeNameError(name, all, type.id);
        if (invalid) {
          setError(invalid);
          return;
        }
        actions.update.mutate(
          { id: type.id, name: name.trim() },
          { onSuccess: (saved) => showToast(`Renamed to ${saved.name}`), onError: fail },
        );
      },
    });
  }
  function restore(type: WorkoutType) {
    setError(null);
    actions.update.mutate(
      { id: type.id, archived: false },
      { onSuccess: (saved) => showToast(`${saved.name} restored`), onError: fail },
    );
  }
  function remove(type: WorkoutType) {
    setError(null);
    actions.remove.mutate(type, {
      onSuccess: () =>
        showToast(
          `${type.name} removed`,
          { label: 'Undo', run: () => restore(type) },
          { duration: 'important' },
        ),
      onError: fail,
    });
  }
  function saveColour(color: string) {
    if (!colouring) return;
    setColouring(null);
    setError(null);
    if (colouring.kind === 'new')
      actions.create.mutate(
        { name: colouring.name, color },
        { onSuccess: (created) => showToast(`${created.name} added`), onError: fail },
      );
    else
      actions.update.mutate(
        { id: colouring.type.id, color },
        { onSuccess: (saved) => showToast(`${saved.name} colour saved`), onError: fail },
      );
  }
  function typeMenu(type: WorkoutType) {
    setError(null);
    showMenu(type.name, [
      {
        label: 'Edit exercises',
        onPress: () =>
          router.push({ pathname: '/settings/type-exercises', params: { id: type.id } }),
      },
      { label: 'Change colour', onPress: () => setColouring({ kind: 'existing', type }) },
      ...(type.is_custom ? [{ label: 'Rename', onPress: () => rename(type) }] : []),
      { label: 'Remove', destructive: true, onPress: () => remove(type) },
    ]);
  }

  return (
    <>
      <SettingsPage>
        <Section>
          {active.map((type) => (
            <TypeRow key={type.id} type={type} disabled={busy} onPress={() => typeMenu(type)} />
          ))}
          <Row
            label="Add workout type"
            icon="plus"
            chevron={false}
            disabled={busy}
            onPress={addType}
          />
        </Section>
        <SectionError message={error} />
        {removed.length > 0 && (
          <Section title="Removed types">
            {removed.map((type) => (
              <TypeRow
                key={type.id}
                type={type}
                disabled={busy}
                action="Restore"
                onPress={() => restore(type)}
              />
            ))}
          </Section>
        )}
      </SettingsPage>
      <ColourSheet
        visible={!!colouring}
        title={`${colouring?.kind === 'existing' ? colouring.type.name : (colouring?.name ?? '')} colour`}
        color={colouring?.kind === 'existing' ? colouring.type.color : NEW_WORKOUT_TYPE_COLOR}
        saveLabel={colouring?.kind === 'new' ? 'Add type' : 'Save colour'}
        isNew={colouring?.kind === 'new'}
        onSave={saveColour}
        onClose={() => setColouring(null)}
      />
    </>
  );
}

function TypeRow({
  type,
  disabled,
  action,
  onPress,
}: {
  type: WorkoutType;
  disabled: boolean;
  /** A text action in place of the options chevron, such as Restore. */
  action?: string;
  onPress: () => void;
}) {
  const { colors, type: font } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action ? `${action} ${type.name}` : `${type.name} options`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
    >
      <View style={[styles.dot, { backgroundColor: type.color }]} />
      <Text style={[font.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
        {type.name}
      </Text>
      {type.is_custom && !action && (
        <Text style={[font.footnote, { color: colors.muted }]}>Custom</Text>
      )}
      {action ? (
        <Text style={[font.body, { color: colors.accentText, fontWeight: '600' }]}>{action}</Text>
      ) : (
        <Icon name="more" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
