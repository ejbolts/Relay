import { ScrollView, StyleSheet, View } from 'react-native';
import type { MachineView } from '../../../../frontend/src/machineWeights';
import type { MachineWeight, WeightMapping } from '../../../../frontend/src/types';
import { Chip } from '../training/parts';

/**
 * The exercise's machines: every machine together (in the reference machine's weights while
 * normalising, marked "≈"), or one machine as logged; and the way into Machine weights once
 * there is more than one machine to compare.
 */
export function MachineFilter({
  machines,
  mapping,
  view,
  onChange,
  onNormalise,
}: {
  /** Saved machines with sessions in this progress, most used first. */
  machines: MachineWeight[];
  mapping: WeightMapping | null;
  view: MachineView;
  onChange: (view: MachineView) => void;
  onNormalise: () => void;
}) {
  const canNormalise = (mapping?.machines.length ?? 0) > 1;
  if (!machines.length && !canNormalise) return null;
  return (
    <View style={styles.row}>
      {machines.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Machine"
          style={{ flex: 1 }}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={mapping?.enabled ? 'All machines ≈' : 'All machines'}
            selected={view === 'all'}
            onPress={() => onChange('all')}
          />
          {machines.map((machine) => (
            <Chip
              key={machine.id}
              label={machine.caption}
              selected={view === machine.id}
              onPress={() => onChange(machine.id)}
            />
          ))}
        </ScrollView>
      )}
      {canNormalise && (
        <Chip
          label={mapping?.enabled ? 'Normalised' : 'Normalise'}
          accessibilityLabel={
            mapping?.enabled ? 'Machine weights, normalised' : 'Normalise machine weights'
          }
          selected={!!mapping?.enabled}
          onPress={onNormalise}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { gap: 8, paddingRight: 8 },
});
