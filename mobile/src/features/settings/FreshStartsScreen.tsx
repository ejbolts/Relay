import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import { blockDay } from '../../../../frontend/src/trainingBlocks';
import { freshStartDateError } from '../../../../frontend/src/trainingSettings';
import type { TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys } from '../../data/queries';
import { Button, errorMessage, ErrorState, Loading } from '../../ui/components';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { promptText } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { Row, Section, SectionError, SettingsPage } from './SettingsList';

const PATH = '/api/training-blocks';
const KEY = ['training-blocks'] as const;

export function FreshStartsScreen() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => apiGet<TrainingBlocks>(PATH, signal),
  });
  const [date, setDate] = useState(localDate);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ date, remove }: { date: string; remove?: boolean }) =>
      remove
        ? apiSend<TrainingBlocks>(`${PATH}/fresh-starts/${date}`, 'DELETE')
        : apiSend<TrainingBlocks>(`${PATH}/fresh-starts`, 'POST', { start_date: date }),
    onSuccess: (saved, { remove }) => {
      client.setQueryData(KEY, saved);
      void client.invalidateQueries({ queryKey: KEY });
      void client.invalidateQueries({ queryKey: queryKeys.personalRecords });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(remove ? 'Fresh start removed' : 'Fresh start saved');
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  if (waitingForNetwork(query))
    return <ErrorState message={OFFLINE_MESSAGE} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <Loading label="Loading fresh starts" />;
  if (!query.data)
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const starts = [...(query.data.fresh_starts ?? [])].reverse();
  function add() {
    const invalid = freshStartDateError(date, localDate(), starts);
    setError(invalid);
    if (!invalid) save.mutate({ date });
  }
  function remove(date: string) {
    Alert.alert('Remove fresh start?', blockDay(date, true), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setError(null);
          save.mutate({ date, remove: true });
        },
      },
    ]);
  }
  function chooseDate() {
    promptText({
      title: 'Fresh start date',
      value: date,
      placeholder: 'YYYY-MM-DD',
      submitLabel: 'Set date',
      onSubmit: (next) => {
        const trimmed = next.trim();
        const invalid = freshStartDateError(trimmed, localDate(), []);
        setError(invalid);
        if (!invalid) setDate(trimmed);
      },
    });
  }
  return (
    <SettingsPage>
      <Section
        title="New baseline"
        action={
          <Button
            label="?"
            accessibilityLabel="About fresh starts"
            variant="link"
            onPress={() =>
              Alert.alert(
                'Fresh starts',
                'Lifts from a fresh start form a new baseline until your next fresh start. All-time records still count.',
              )
            }
          />
        }
      >
        <Row
          label="Fresh start date"
          value={blockDay(date, true)}
          disabled={save.isPending}
          onPress={chooseDate}
        />
        <Row
          label="Start fresh"
          icon="plus"
          disabled={save.isPending}
          chevron={false}
          onPress={add}
        />
      </Section>
      <SectionError message={error} />
      {starts.length > 0 && (
        <Section title="Saved fresh starts">
          {starts.map((item, index) => (
            <Row
              key={item}
              label={blockDay(item, true)}
              value={index === 0 ? 'Current' : undefined}
              accessibilityLabel={`Remove fresh start on ${blockDay(item, true)}${index === 0 ? ', current' : ''}`}
              disabled={save.isPending}
              onPress={() => remove(item)}
            />
          ))}
        </Section>
      )}
    </SettingsPage>
  );
}
