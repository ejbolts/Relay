import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  EXPORT_CHOICES,
  EXPORT_EXCLUDED,
  exportFileNames,
  exportFilesNote,
  exportRangeLabel,
  exportWorkoutDates,
} from '../../../../frontend/src/dataExport';
import {
  dateRangeForDates,
  TIME_RANGE_OPTIONS,
  type TimeRange,
} from '../../../../frontend/src/dateRanges';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard, useWorkoutHistory } from '../../data/queries';
import { Button, errorMessage } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useBodyMeasurements } from '../body/bodyQueries';
import { ChoiceRow, Section, SwitchRow, SettingsPage } from '../settings/SettingsList';
import { downloadFile, exportPaths, shareFiles } from './dataApi';
import { dataIcons } from './icons';

const TIME_FRAMES = TIME_RANGE_OPTIONS.map((option) => ({
  value: option.value as TimeRange,
  label: option.label,
}));

/** The web's Export Relay data: workouts and bodyweight as CSV, handed to the share sheet. */
export function ExportScreen() {
  const { colors, type, space } = useTheme();
  const history = useWorkoutHistory();
  const dashboard = useDashboard();
  const measurements = useBodyMeasurements();
  const [workouts, setWorkouts] = useState(true);
  const [bodyweight, setBodyweight] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeRange>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workoutDates = exportWorkoutDates(
    history.data ?? [],
    dashboard.data?.history?.last_workout_date,
  );
  const bodyweightDates = (measurements.data ?? []).map((item) => item.measurement_date);
  const dates = [...(workouts ? workoutDates : []), ...(bodyweight ? bodyweightDates : [])];
  const range = dateRangeForDates(dates, timeFrame);

  function change(apply: () => void) {
    apply();
    setError(null);
  }

  async function share() {
    if (busy || (!workouts && !bodyweight)) return;
    setBusy(true);
    setError(null);
    try {
      const names = exportFileNames(range, localDate());
      const failure = 'Could not export your data. Try again.';
      // Prepare every selected file before sharing, so a failed request creates no partial export.
      const files = await Promise.all([
        workouts ? downloadFile(exportPaths.workouts(range), names.workouts, failure) : null,
        bodyweight ? downloadFile(exportPaths.bodyweight(range), names.bodyweight, failure) : null,
      ]);
      await shareFiles(
        files.filter((file) => file !== null).map((file) => ({ file, type: 'text/csv' })),
        'Export Relay data',
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage>
      <Section title="Data to export">
        <SwitchRow
          label={EXPORT_CHOICES.workouts.label}
          icon={dataIcons.workouts}
          iconTint="#2c74d0"
          value={workouts}
          disabled={busy}
          onChange={(value) => change(() => setWorkouts(value))}
        />
        <SwitchRow
          label={EXPORT_CHOICES.bodyweight.label}
          icon={dataIcons.bodyweight}
          iconTint="#10b981"
          value={bodyweight}
          disabled={busy}
          onChange={(value) => change(() => setBodyweight(value))}
        />
      </Section>
      <View style={{ gap: 6 }}>
        <Section>
          <ChoiceRow
            label="Export time frame"
            icon={dataIcons.calendar}
            iconTint="#f59e0b"
            value={timeFrame}
            choices={TIME_FRAMES}
            disabled={busy}
            onChange={(value) => change(() => setTimeFrame(value))}
          />
        </Section>
        <Text style={[type.footnote, { color: colors.muted, paddingHorizontal: 16 }]}>
          {exportRangeLabel(range, dates)}
        </Text>
      </View>
      <View style={{ gap: space.sm }}>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          {exportFilesNote(workouts, bodyweight, 'Shares')} {EXPORT_EXCLUDED}
        </Text>
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <Button
          label={busy ? 'Preparing…' : 'Share CSV'}
          icon={dataIcons.share}
          disabled={busy || (!workouts && !bodyweight)}
          onPress={() => void share()}
        />
      </View>
    </SettingsPage>
  );
}
