import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
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
  onSave,
}: {
  initialDate: string;
  logs: BodySizeLog[] | null;
  size: BodySizeUnit;
  saving: boolean;
  onSave: (entry: BodySizeLog) => Promise<string | null>;
}) {
  const { colors, type, radius } = useTheme();
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState<BodySizeDraft>(() => bodySizeDraft(logs, initialDate, size));
  const [error, setError] = useState<string | null>(null);
  const stored = logs?.find((row) => row.measurement_date === date);

  async function submit() {
    const checked = bodySizesPayload(stored, date, draft, size);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    setError(await onSave(checked.payload));
  }

  return (
    <View style={{ gap: 16 }}>
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
          <View key={key} style={styles.field}>
            <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
              {label} ({size.unit})
            </Text>
            <TextInput
              value={draft[key] ?? ''}
              onChangeText={(text) => {
                setDraft((current) => ({ ...current, [key]: text.replace(',', '.') }));
                setError(null);
              }}
              editable={!saving}
              keyboardType="decimal-pad"
              returnKeyType="done"
              placeholder={bodySizeLastValue(logs, date, key, size)}
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label} (${size.unit})`}
              style={[
                type.body,
                type.number,
                styles.input,
                { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.md },
              ]}
            />
          </View>
        ))}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={saving ? 'Saving…' : stored ? 'Update measurements' : 'Save measurements'}
        disabled={saving}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 10 },
  field: { width: '47%', flexGrow: 1, gap: 6 },
  input: { height: 44, paddingHorizontal: 12 },
});
