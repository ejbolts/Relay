import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import {
  WORKOUT_TIME_MAX,
  workoutTimeFields,
  workoutTimeFieldValid,
  workoutTimeSeconds,
} from '../../../../frontend/src/workoutTimeCorrection';
import { Button } from '../../ui/components';
import { TextField } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';

/**
 * Corrects the live workout clock, as the web's WorkoutTimeEditor: the training time so far in
 * hours and minutes, and the clock keeps counting from the time entered. Mount it afresh (a new
 * `key`) for each opening, so it starts from the clock as it reads then.
 */
export function WorkoutTimeSheet({
  visible,
  elapsedSeconds,
  onSave,
  onClose,
}: {
  visible: boolean;
  elapsedSeconds: number;
  /** The corrected training time so far, in seconds. */
  onSave: (seconds: number) => void;
  onClose: () => void;
}) {
  const [starting] = useState(() => workoutTimeFields(elapsedSeconds));
  const [hours, setHours] = useState(starting.hours);
  const [minutes, setMinutes] = useState(starting.minutes);
  const minutesField = useRef<ComponentRef<typeof TextInput>>(null);
  // Out-of-range or partly numeric text stops the save, as the web's bounded fields do, and the
  // workout is left alone until both fields are valid.
  const hoursValid = workoutTimeFieldValid(hours, WORKOUT_TIME_MAX.hours);
  const minutesValid = workoutTimeFieldValid(minutes, WORKOUT_TIME_MAX.minutes);
  const valid = hoursValid && minutesValid;
  const save = () => {
    if (valid) onSave(workoutTimeSeconds(hours, minutes));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Workout time so far">
      <View style={styles.fields}>
        <TextField
          label="Hours"
          accessibilityLabel="Hours"
          value={hours}
          onChangeText={setHours}
          keyboardType="number-pad"
          selectTextOnFocus
          returnKeyType="next"
          error={hoursValid ? null : `0 to ${WORKOUT_TIME_MAX.hours}`}
          onSubmitEditing={() => minutesField.current?.focus()}
          style={styles.field}
        />
        <TextField
          ref={minutesField}
          label="Minutes"
          accessibilityLabel="Minutes"
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          selectTextOnFocus
          returnKeyType="done"
          error={minutesValid ? null : `0 to ${WORKOUT_TIME_MAX.minutes}`}
          onSubmitEditing={save}
          style={styles.field}
        />
      </View>
      <View style={styles.actions}>
        <Button label="Set time" onPress={save} disabled={!valid} block />
        <Button label="Cancel" variant="secondary" onPress={onClose} block />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  actions: { gap: 12, marginTop: 20 },
});
