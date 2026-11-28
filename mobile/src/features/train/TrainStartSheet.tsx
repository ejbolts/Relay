import { StyleSheet, Text, View } from 'react-native';
import { memberName, partners } from '../../../../frontend/src/trainTogether';
import {
  partnerExerciseChips,
  partnerStartTemplate,
  partnerWorkoutName,
  unmatchedExercisesNotice,
} from '../../../../frontend/src/trainTogetherView';
import { localDate } from '../../../../frontend/src/utils';
import { useExercises } from '../../data/queries';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { useWorkout } from '../workout/WorkoutProvider';
import { usePartnerColours } from './partnerColours';
import { PartnerAvatar } from './PartnerAvatar';
import { trainActions, useTrainState } from './trainStore';

/** Long enough for the sheet to close before the logger opens over the app. */
const AFTER_CLOSE_MS = 350;

/**
 * After joining with no workout open: start with the partner's exercises (your own matching
 * ones), or open the normal Start menu.
 */
export function TrainStartSheet() {
  const { colors, type, radius } = useTheme();
  const workout = useWorkout();
  const exercises = useExercises().data;
  const partnerId = useTrainState((state) => state.startWith);
  const session = useTrainState((state) => state.read?.session ?? null);
  const tones = usePartnerColours();
  const partner = partners(session).find((member) => member.user_id === partnerId) ?? null;
  const visible = !!partner && !workout.live;
  if (!partner) return null;
  const name = memberName(partner);
  const theirs = partner.workout;
  const chips = theirs ? partnerExerciseChips(theirs) : [];
  const matched = chips.filter((chip) => chip.matched).length;

  function close() {
    trainActions().closeStartWith();
  }

  function startWithTheirs() {
    if (!theirs) return;
    const { template, unmatched } = partnerStartTemplate(theirs, exercises ?? [], localDate());
    close();
    setTimeout(() => {
      workout.start({ kind: 'template', template, name: template.sourceWorkout.name });
      const notice = unmatchedExercisesNotice(unmatched.length);
      if (notice) showToast(notice);
    }, AFTER_CLOSE_MS);
  }

  function startOwn() {
    close();
    setTimeout(() => workout.openStartMenu(), AFTER_CLOSE_MS);
  }

  return (
    <Sheet visible={visible} onClose={close} title={`Train with ${name}`}>
      <View style={styles.person}>
        <PartnerAvatar
          member={partner}
          size={42}
          ring={tones[partner.user_id]?.accent}
          live={!!theirs}
        />
        <Text style={[type.callout, { color: colors.secondary, flexShrink: 1 }]} numberOfLines={2}>
          {theirs
            ? `${name}’s ${partnerWorkoutName(theirs)} · ${chips.length} ${chips.length === 1 ? 'exercise' : 'exercises'}`
            : 'No workout open'}
        </Text>
      </View>
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View
              key={chip.id}
              style={[
                styles.chip,
                {
                  borderRadius: radius.sm,
                  backgroundColor: chip.matched ? colors.surface2 : 'transparent',
                  borderColor: chip.matched ? colors.lineStrong : colors.muted,
                  borderStyle: chip.matched ? 'solid' : 'dashed',
                },
              ]}
            >
              <Text
                style={[type.footnote, { color: chip.matched ? colors.text : colors.muted }]}
                numberOfLines={1}
              >
                {chip.matched ? chip.name : `${chip.name} · no match`}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {theirs && matched > 0 && (
          <Button
            label={`Start with ${name}’s exercises`}
            block
            size="large"
            disabled={!exercises}
            onPress={startWithTheirs}
          />
        )}
        <Button
          label="Start my own workout"
          variant="secondary"
          block
          size="large"
          onPress={startOwn}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  actions: { gap: 10, marginTop: 4 },
});
