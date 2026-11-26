import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  bodySizeDraft,
  bodySizeLastValue,
  bodySizesPayload,
  type BodySizeDraft,
  type BodySizeUnit,
} from '../../../../frontend/src/bodySizeEntries';
import { BODY_SIZE_FIELDS, type BodySizeLog } from '../../../../frontend/src/bodySizes';
import { localDate } from '../../../../frontend/src/utils';
import { Button } from '../../ui/components';
import { TextField } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { DateField } from './DateField';

/**
 * Logs body measurements for a day, as the web's dialog: every part is optional, a saved day
 * fills in to update, and each empty box hints the part's last measurement.
 */
export function BodySizesSheet({
  date,
  logs,
  size,
  saving,
  onClose,
  onSave,
}: {
  /** The day it opens on, or null while closed. */
  date: string | null;
  logs: BodySizeLog[] | null;
  size: BodySizeUnit;
  saving: boolean;
  onClose: () => void;
  /** Saves the entry; resolves with an error message when it couldn't. */
  onSave: (entry: BodySizeLog) => Promise<string | null>;
}) {
  return (
    <Sheet visible={date !== null} onClose={onClose} title="Log body measurements">
      {date !== null && (
        <SizesForm
          key={date}
          initialDate={date}
          logs={logs}
          size={size}
          saving={saving}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Sheet>
  );
}

function SizesForm({
  initialDate,
  logs,
  size,
  saving,
  onClose,
  onSave,
}: {
  initialDate: string;
  logs: BodySizeLog[] | null;
  size: BodySizeUnit;
  saving: boolean;
  onClose: () => void;
  onSave: (entry: BodySizeLog) => Promise<string | null>;
}) {
  const { colors, type } = useTheme();
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState<BodySizeDraft>(() => bodySizeDraft(logs, initialDate, size));
  const [error, setError] = useState<string | null>(null);
  const stored = logs?.find((row) => row.measurement_date === date);

  async function submit() {
    const checked = bodySizesPayload(stored, date, draft, size);
    if (checked.error !== null) {
      haptics.error();
      setError(checked.error);
      return;
    }
    setError(await onSave(checked.payload));
  }

  return (
    <View style={{ gap: 14 }}>
      <DateField
        label="Date"
        value={date}
        max={localDate()}
        disabled={saving}
        onChange={(next) => {
          setDate(next);
          setDraft(bodySizeDraft(logs, next, size));
          setError(null);
        }}
      />
      <View style={styles.grid}>
        {BODY_SIZE_FIELDS.map(([key, label]) => (
          <TextField
            key={key}
            label={`${label} (${size.unit})`}
            value={draft[key] ?? ''}
            onChangeText={(text) => {
              setDraft((current) => ({ ...current, [key]: text.replace(',', '.') }));
              setError(null);
            }}
            editable={!saving}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder={bodySizeLastValue(logs, date, key, size)}
            style={styles.field}
            inputStyle={[type.number, styles.input]}
          />
        ))}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          label={saving ? 'Saving…' : stored ? 'Update measurements' : 'Save measurements'}
          loading={saving}
          disabled={saving}
          onPress={() => void submit()}
        />
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 10 },
  field: { width: '47%', flexGrow: 1 },
  input: { minHeight: 44, paddingVertical: 8 },
  actions: { gap: 8, marginTop: 2 },
});
