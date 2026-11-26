import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLOUR_MODES,
  COLOUR_THEMES,
  DARK_STYLES,
  LIGHT_STYLES,
  type ColourModeId,
} from '../../../../frontend/src/appearanceChoices';
import {
  BODY_TREND_DURATION_OPTIONS,
  type BodyTrendStatistic,
} from '../../../../frontend/src/bodyTrend';
import { Button, Card, CardHeader } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon, type IconPair } from '../../ui/Icon';
import { themedPalette, useTheme } from '../../ui/theme';
import {
  bodyTrendPreference,
  colourMode,
  colourTheme,
  darkStyle,
  lightStyle,
  reduceMotion,
} from './devicePreferences';
import { settingsIcons } from './icons';
import { ChoiceRow, Section, SettingsPage, SwitchRow } from './SettingsList';

const MODE_ICONS: Record<ColourModeId, IconPair> = {
  dark: settingsIcons.moon,
  light: settingsIcons.sun,
  auto: settingsIcons.contrast,
};

const THEME_ROWS = Array.from({ length: Math.ceil(COLOUR_THEMES.length / 2) }, (_, row) =>
  COLOUR_THEMES.slice(row * 2, row * 2 + 2),
);

export function AppearanceScreen() {
  const { scheme, colors, type, radius } = useTheme();
  const mode = colourMode.use();
  const accent = colourTheme.use();
  const dark = darkStyle.use();
  const light = lightStyle.use();
  const reduced = reduceMotion.use();

  const cardChoiceStyle = (selected: boolean) => ({
    backgroundColor: selected ? colors.accentSoft : colors.surface2,
    borderColor: selected ? colors.accentText : colors.lineStrong,
    borderRadius: radius.lg,
  });

  return (
    <SettingsPage>
      <Card>
        <CardHeader title="App theme" />

        <View accessibilityRole="radiogroup" accessibilityLabel="Mode" style={styles.row}>
          {COLOUR_MODES.map((option) => {
            const selected = mode === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityLabel={option.name}
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  if (selected) return;
                  haptics.selection();
                  colourMode.set(option.id);
                }}
                style={({ pressed }) => [
                  styles.modeTile,
                  cardChoiceStyle(selected),
                  pressed && { opacity: 0.78 },
                ]}
              >
                <Icon
                  name={MODE_ICONS[option.id]}
                  size={22}
                  color={selected ? colors.accentText : colors.secondary}
                />
                <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {scheme === 'dark' ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Dark style" style={styles.row}>
            {DARK_STYLES.map((option) => {
              const selected = dark === option.id;
              const preview = themedPalette('dark', accent, option.id, light);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={option.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    if (selected) return;
                    haptics.selection();
                    darkStyle.set(option.id);
                  }}
                  style={({ pressed }) => [
                    styles.styleTile,
                    cardChoiceStyle(selected),
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <View
                    accessibilityElementsHidden
                    style={[
                      styles.stylePreviewPage,
                      {
                        backgroundColor: preview.page,
                        borderColor: 'rgba(255,255,255,0.22)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.stylePreviewCard,
                        {
                          backgroundColor: preview.surface,
                          borderColor:
                            option.id === 'oled' ? 'rgba(255,255,255,0.42)' : preview.cardBorder,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel="Light style" style={styles.row}>
            {LIGHT_STYLES.map((option) => {
              const selected = light === option.id;
              const preview = themedPalette('light', accent, dark, option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={option.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    if (selected) return;
                    haptics.selection();
                    lightStyle.set(option.id);
                  }}
                  style={({ pressed }) => [
                    styles.styleTile,
                    cardChoiceStyle(selected),
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <View
                    accessibilityElementsHidden
                    style={[
                      styles.stylePreviewPage,
                      {
                        backgroundColor: preview.page,
                        borderColor: preview.lineStrong,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.stylePreviewCard,
                        {
                          backgroundColor: preview.surface,
                          borderColor:
                            option.id === 'stained' ? `${preview.accent}4d` : preview.lineStrong,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Accent colour"
          style={styles.themeGrid}
        >
          {THEME_ROWS.map((pair, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {pair.map((theme) => {
                const selected = accent === theme.id;
                return (
                  <Pressable
                    key={theme.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${theme.name}, ${theme.detail}`}
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      if (selected) return;
                      haptics.selection();
                      colourTheme.set(theme.id);
                    }}
                    style={({ pressed }) => [
                      styles.themeTile,
                      cardChoiceStyle(selected),
                      pressed && { opacity: 0.78 },
                    ]}
                  >
                    <View
                      accessibilityElementsHidden
                      style={[
                        styles.radio,
                        selected
                          ? {
                              borderColor: colors.accent,
                              borderWidth: 5,
                              backgroundColor: colors.onAccent,
                            }
                          : {
                              borderColor: colors.lineStrong,
                              borderWidth: 1.5,
                            },
                      ]}
                    />
                    <View
                      accessibilityElementsHidden
                      style={[
                        styles.swatchDot,
                        {
                          backgroundColor: theme.accent,
                          borderColor:
                            scheme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(16,24,32,0.18)',
                        },
                      ]}
                    />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
                        {theme.name}
                      </Text>
                      <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
                        {theme.detail}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      <Section
        title="Motion"
        action={
          <Button
            label="?"
            accessibilityLabel="About reduced motion"
            variant="link"
            size="small"
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  modeTile: {
    flex: 1,
    minHeight: 74,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  styleTile: {
    flex: 1,
    minHeight: 86,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stylePreviewPage: {
    width: 48,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  stylePreviewCard: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  themeGrid: { gap: 10 },
  themeTile: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1.25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: { width: 18, height: 18, borderRadius: 9 },
  swatchDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  tileLabel: { fontSize: 13, fontWeight: '600' },
});
