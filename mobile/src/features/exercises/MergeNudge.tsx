import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  DISMISSED_MERGE_SUGGESTIONS_KEY,
  mergeNudgeTarget,
  mergeTargetDetail,
  parseDismissedMergeSuggestions,
} from '../../../../frontend/src/exerciseMergeTargets';
import type { Exercise } from '../../../../frontend/src/types';
import { readJson, writeJson } from '../../data/deviceStorage';
import { Button, Card } from '../../ui/components';
import { useTheme } from '../../ui/theme';

/** Suggestions marked "Not the same" on this phone, kept as the web keeps them on its device. */
const loadDismissed = () =>
  parseDismissedMergeSuggestions(readJson<unknown>(DISMISSED_MERGE_SUGGESTIONS_KEY));

/**
 * Points out the standard exercise a custom exercise most likely duplicates, such as Lateral
 * Raise for "Lateral raises", with a shortcut into the merge.
 */
export function MergeNudge({
  exercise,
  exercises,
  onMerge,
}: {
  exercise: Exercise;
  exercises: Exercise[];
  onMerge: (targetId: string) => void;
}) {
  const { colors, type } = useTheme();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const target = useMemo(
    () => mergeNudgeTarget(exercise, exercises, dismissed),
    [exercise, exercises, dismissed],
  );
  if (!target) return null;
  return (
    <Card accessibilityLabel="Possible duplicate">
      <View style={{ gap: 2 }}>
        <Text style={[type.headline, { color: colors.text }]}>Looks like {target.name}</Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          {mergeTargetDetail(target)}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label="Not the same"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => {
            const next = { ...loadDismissed(), [exercise.id]: target.id };
            writeJson(DISMISSED_MERGE_SUGGESTIONS_KEY, next);
            setDismissed(next);
          }}
        />
        <Button label="Merge" style={{ flex: 1 }} onPress={() => onMerge(target.id)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
});
