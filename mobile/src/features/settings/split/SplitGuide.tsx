import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SPLIT_GUIDE_COPY } from '../../../../../frontend/src/splitGuideCopy';
import { Button } from '../../../ui/components';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../../ui/Sheet';
import { useTheme } from '../../../ui/theme';
import { settingsIcons } from '../icons';

export function SplitGuide({ editor = false }: { editor?: boolean }) {
  const { colors, type } = useTheme();
  const [step, setStep] = useState<number | null>(null);
  const steps = editor
    ? [SPLIT_GUIDE_COPY.plan, SPLIT_GUIDE_COPY.reps, SPLIT_GUIDE_COPY.save]
    : Object.values(SPLIT_GUIDE_COPY);
  const current = step ?? 0;
  const close = () => setStep(null);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Splits guide"
        hitSlop={8}
        onPress={() => setStep(0)}
      >
        <Icon name={settingsIcons.guide} size={22} color={colors.accentText} />
      </Pressable>
      <Sheet
        visible={step !== null}
        onClose={close}
        title="Splits guide"
        kicker={`${current + 1} of ${steps.length}`}
      >
        <Text
          accessibilityRole="header"
          style={[type.headline, { color: colors.text, marginBottom: 8 }]}
        >
          {steps[current].title}
        </Text>
        <Text style={[type.body, { color: colors.secondary }]}>{steps[current].body}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          {current > 0 && (
            <Button label="Previous" variant="secondary" onPress={() => setStep(current - 1)} />
          )}
          {current + 1 < steps.length ? (
            <Button label="Next" onPress={() => setStep(current + 1)} />
          ) : (
            <Button label="Done" onPress={close} />
          )}
        </View>
      </Sheet>
    </>
  );
}
