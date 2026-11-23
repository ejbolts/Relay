import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import {
  workoutTimeFields,
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
  const save = () => onSave(workoutTimeSeconds(hours, minutes));

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
          maxLength={2}
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
          maxLength={2}
          onSubmitEditing={save}
          style={styles.field}
        />
      </View>
      <View style={styles.actions}>
        <Button label="Set time" onPress={save} block />
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
