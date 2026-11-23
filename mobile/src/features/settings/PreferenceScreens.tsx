import { Alert } from 'react-native';
import {
  COLOUR_MODES,
  COLOUR_THEMES,
  DARK_STYLES,
  LIGHT_STYLES,
} from '../../../../frontend/src/appearanceChoices';
import {
  BODY_TREND_DURATION_OPTIONS,
  type BodyTrendStatistic,
} from '../../../../frontend/src/bodyTrend';
import { Button } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import {
  bodyTrendPreference,
  colourMode,
  colourTheme,
  darkStyle,
  lightStyle,
  reduceMotion,
} from './devicePreferences';
import { ChoiceRow, Section, SettingsPage, SwitchRow } from './SettingsList';

const choices = <T,>(items: readonly { id: T; name: string }[]) =>
  items.map(({ id, name }) => ({ value: id, label: name }));

export function AppearanceScreen() {
  const { scheme } = useTheme();
  const mode = colourMode.use();
  const accent = colourTheme.use();
  const dark = darkStyle.use();
  const light = lightStyle.use();
  const reduced = reduceMotion.use();

  return (
    <SettingsPage>
      <Section title="Theme">
        <ChoiceRow
          label="Appearance"
          value={mode}
          choices={choices(COLOUR_MODES)}
          onChange={colourMode.set}
        />
        <ChoiceRow
          label="Accent colour"
          value={accent}
          choices={choices(COLOUR_THEMES)}
          onChange={colourTheme.set}
        />
        {scheme === 'dark' ? (
          <ChoiceRow
            label="Dark style"
            value={dark}
            choices={choices(DARK_STYLES)}
            onChange={darkStyle.set}
          />
        ) : (
          <ChoiceRow
            label="Light style"
            value={light}
            choices={choices(LIGHT_STYLES)}
            onChange={lightStyle.set}
          />
        )}
      </Section>
      <Section
        title="Motion"
        action={
          <Button
            label="?"
            accessibilityLabel="About reduced motion"
            variant="link"
            onPress={() =>
              Alert.alert(
                'Reduce animations',
                'Relay also follows your phone’s Reduce Motion setting.',
              )
            }
          />
        }
      >
        <SwitchRow label="Reduce animations" value={reduced} onChange={reduceMotion.set} />
      </Section>
    </SettingsPage>
  );
}

export function BodyweightDefaultsScreen() {
  const value = bodyTrendPreference.use();
  return (
    <SettingsPage>
      <Section>
        <ChoiceRow<BodyTrendStatistic>
          label="Default statistic"
          value={value.statistic}
          choices={[
            { value: 'average', label: 'Average' },
            { value: 'median', label: 'Median' },
          ]}
          onChange={(statistic) => bodyTrendPreference.set({ ...value, statistic })}
        />
        <ChoiceRow
          label="Default duration"
          value={value.duration}
          choices={[...BODY_TREND_DURATION_OPTIONS]}
          onChange={(duration) => bodyTrendPreference.set({ ...value, duration })}
        />
      </Section>
    </SettingsPage>
  );
}
