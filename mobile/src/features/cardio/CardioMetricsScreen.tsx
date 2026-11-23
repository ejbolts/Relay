import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import {
  cardioMetricDraft,
  cardioMetricErrors,
  parseCardioMetrics,
} from '../../../../frontend/src/cardioForm';
import type { CardioSession } from '../../../../frontend/src/types';
import { Button, Card, ErrorState, Loading, errorMessage } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useCardioOverview } from '../training/trainingQueries';
import { saveCardioMetrics } from './cardioData';
import { CardioError, CardioMetricFields, CardioPage } from './CardioFields';
import { useCardioWrite } from './useCardioWrite';

export function CardioMetricsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const overview = useCardioOverview();
  const session = overview.data?.sessions.find((item) => item.id === id);
  return (
    <CardioPage title="Cardio metrics">
      {session ? (
        <MetricsForm key={session.id} session={session} />
      ) : overview.isPending ? (
        <Loading label="Loading cardio session" />
      ) : (
        <ErrorState
          message={
            overview.isError
              ? errorMessage(overview.error)
              : 'This cardio session is no longer available.'
          }
          onRetry={() => void overview.refetch()}
        />
      )}
    </CardioPage>
  );
}

function MetricsForm({ session }: { session: CardioSession }) {
  const { colors, type } = useTheme();
  const [metrics, setMetrics] = useState(() => cardioMetricDraft(session));
  const [checked, setChecked] = useState(false);
  const { write, saving, saveError } = useCardioWrite();
  const errors = checked ? cardioMetricErrors(metrics, session.activity_type) : {};

  function save() {
    setChecked(true);
    if (Object.keys(cardioMetricErrors(metrics, session.activity_type)).length) return;
    void write(
      () => saveCardioMetrics(session.id, parseCardioMetrics(metrics)),
      'Cardio metrics saved',
    );
  }

  return (
    <>
      <Card>
        <Text style={[type.headline, { color: colors.text }]}>{session.activity_type}</Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          {prettyDate(session.session_date)} · {session.duration_minutes} min
        </Text>
        <CardioMetricFields
          activity={session.activity_type}
          draft={metrics}
          onChange={(key, value) => setMetrics((current) => ({ ...current, [key]: value }))}
          errors={errors}
          disabled={saving}
          estimates={session}
        />
      </Card>
      {saveError && <CardioError message={saveError} />}
      <Button label={saving ? 'Saving…' : 'Save metrics'} disabled={saving} onPress={save} />
    </>
  );
}
