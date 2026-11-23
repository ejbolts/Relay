import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkoutImportOptions } from '../../../../frontend/src/types';
import {
  defaultImportOptions,
  IMPORT_FILE_TYPES,
  IMPORT_GUIDE_INTRO,
  IMPORT_SOURCE_HINTS,
  IMPORT_SOURCES,
  STRONG_DISTANCE_UNITS,
  STRONG_UNITS_NOTE,
  STRONG_WEIGHT_UNITS,
} from '../../../../frontend/src/workoutImport';
import {
  WORKOUT_CSV_TEMPLATE_NAME,
  workoutCsvTemplate,
} from '../../../../frontend/src/workoutCsvTemplate';
import { useWeightUnit } from '../../data/queries';
import { Button, errorMessage } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { ChoiceRow, Row, Section, SettingsPage } from '../settings/SettingsList';
import { pickFile, shareText } from './dataApi';
import { dataIcons } from './icons';
import { importError, reviewImport, useImportSession } from './importSession';

const SOURCE_ICONS = {
  strengthlevel: require('../../../assets/import-apps/strengthlevel.png'),
  hevy: require('../../../assets/import-apps/hevy.png'),
  strong: require('../../../assets/import-apps/strong.png'),
  gym: require('../../../assets/icon.png'),
};

/**
 * Importing workouts from a CSV, with the web's import guide on the same screen: the app the
 * file came from, Strong's units, the file, and the import history with undo.
 */
export function ImportScreen() {
  const router = useRouter();
  const { colors, type, space } = useTheme();
  const unit = useWeightUnit();
  const [chosen, setChosen] = useState<WorkoutImportOptions | null>(null);
  const options = chosen ?? defaultImportOptions(unit);
  const session = useImportSession();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = picking || session.reviewing || session.saving;

  function change(next: WorkoutImportOptions) {
    setChosen(next);
    setError(null);
  }

  async function choose() {
    if (busy) return;
    setError(null);
    setPicking(true);
    try {
      const file = await pickFile(IMPORT_FILE_TYPES, 'text/csv');
      if (!file) return;
      if (await reviewImport(file, options)) router.push('/data/import-review');
      else setError(importError() ?? 'Could not review that CSV file.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPicking(false);
    }
  }

  async function shareTemplate() {
    try {
      await shareText(
        WORKOUT_CSV_TEMPLATE_NAME,
        // The byte order mark lets spreadsheet apps open the file as UTF-8.
        `﻿${workoutCsvTemplate(unit)}`,
        'text/csv',
        'Workout template',
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <SettingsPage>
      <Text style={[type.callout, { color: colors.secondary }]}>{IMPORT_GUIDE_INTRO}</Text>
      <View style={{ gap: space.sm }}>
        <View style={styles.sources} accessibilityRole="radiogroup">
          {IMPORT_SOURCES.map((app) => {
            const selected = options.source === app.id;
            return (
              <Pressable
                key={app.id}
                accessibilityRole="radio"
                accessibilityLabel={app.name}
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => change({ ...options, source: app.id })}
                style={({ pressed }) => [
                  styles.source,
                  {
                    backgroundColor: selected ? colors.accentSoft : colors.surface,
                    borderColor: selected ? colors.accent : colors.line,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Image source={SOURCE_ICONS[app.id]} style={styles.sourceIcon} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    type.footnote,
                    { color: selected ? colors.accentText : colors.text, fontWeight: '600' },
                  ]}
                >
                  {app.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[type.footnote, { color: colors.secondary, paddingHorizontal: 4 }]}
        >
          {IMPORT_SOURCE_HINTS[options.source]}
        </Text>
      </View>
      {options.source === 'strong' && (
        <View style={{ gap: 6 }}>
          <Section>
            <ChoiceRow
              label="Workout weights in file"
              icon={dataIcons.weight}
              iconTint="#0ea5e9"
              value={options.weight_unit}
              choices={[...STRONG_WEIGHT_UNITS]}
              onChange={(weight_unit) => change({ ...options, weight_unit })}
              disabled={busy}
            />
            <ChoiceRow
              label="Distances in file"
              icon={dataIcons.distance}
              iconTint="#10b981"
              value={options.distance_unit}
              choices={[...STRONG_DISTANCE_UNITS]}
              onChange={(distance_unit) => change({ ...options, distance_unit })}
              disabled={busy}
            />
          </Section>
          <Text style={[type.footnote, { color: colors.muted, paddingHorizontal: 16 }]}>
            {STRONG_UNITS_NOTE}
          </Text>
        </View>
      )}
      <View style={{ gap: space.sm }}>
        <Button
          label={busy ? 'Reviewing…' : 'Choose CSV file'}
          icon={dataIcons.upload}
          disabled={busy}
          onPress={() => void choose()}
        />
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        {options.source === 'gym' && (
          <Button
            variant="link"
            label="Using your own spreadsheet? Share the template"
            onPress={() => void shareTemplate()}
          />
        )}
      </View>
      <Section>
        <Row
          label="Import history"
          icon={dataIcons.history}
          iconTint="#64748b"
          onPress={() => router.push('/data/import-history')}
        />
      </Section>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  sources: { flexDirection: 'row', gap: 8 },
  source: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  sourceIcon: { width: 40, height: 40, borderRadius: 10 },
});
