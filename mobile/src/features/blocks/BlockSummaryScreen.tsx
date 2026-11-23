import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  deloadBlockInput,
  deloadMessage,
  nextBlockInput,
  nextBlockPlanOptions,
  type NextBlockPlan,
} from '../../../../frontend/src/trainingBlockForm';
import {
  summaryKicker,
  summaryRange,
  summaryTiles,
} from '../../../../frontend/src/trainingBlockStats';
import { blockOn, nextBlockName } from '../../../../frontend/src/trainingBlocks';
import type {
  TrainingBlock,
  TrainingBlockInput,
  TrainingBlocks,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useWeightUnit } from '../../data/queries';
import { Button, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { trainingRoute } from '../training/routes';
import { Note } from '../training/parts';
import { createBlock, selectBlock, useBlockSummary, useTrainingBlocks } from './blockQueries';
import { ChoiceTiles, FieldLabel } from './parts';

type View_ = 'summary' | 'next' | 'deload';

/** A block's summary screen, by id. */
export function BlockSummaryScreen({ blockId }: { blockId: string }) {
  const blocks = useTrainingBlocks();
  const block = blocks.data?.blocks.find((item) => item.id === blockId);
  if (!blocks.data)
    return blocks.isError ? (
      <ErrorState message={errorMessage(blocks.error)} onRetry={() => void blocks.refetch()} />
    ) : (
      <Loading label="Loading training blocks" />
    );
  if (!block) return <Note>This training block was removed.</Note>;
  return <BlockSummary block={block} config={blocks.data} />;
}

/**
 * What the block added up to, compared with the last regular block. While it is the block in
 * progress, the next block or a deload week can start from here, which ends it.
 */
function BlockSummary({ block, config }: { block: TrainingBlock; config: TrainingBlocks }) {
  const { colors, type, radius, space } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const unit = useWeightUnit();
  const today = localDate();
  const summary = useBlockSummary(block.id);
  const [view, setView] = useState<View_>('summary');
  const [name, setName] = useState(() => nextBlockName(config.blocks));
  const [plan, setPlan] = useState<NextBlockPlan>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = blockOn(config.blocks, today)?.id === block.id && !block.end_date;
  const title =
    view === 'next' ? 'Start next block' : view === 'deload' ? 'Deload week' : block.name;

  async function start(input: TrainingBlockInput, notice: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createBlock(client, input);
      selectBlock('current');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(notice);
      router.back();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: view === 'summary' ? '' : title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      >
        {view === 'summary' && (
          <>
            <View style={{ gap: 4 }}>
              <Text style={[type.eyebrow, { color: colors.accentText }]}>
                {summaryKicker(block, today).toUpperCase()}
              </Text>
              <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
                {block.name}
              </Text>
              <Text style={[type.footnote, { color: colors.secondary }]}>
                {summaryRange(block, today)}
              </Text>
            </View>
            {summary.data ? (
              <>
                <View style={styles.tiles}>
                  {summaryTiles(summary.data.block, summary.data.previous, unit).map((tile) => (
                    <View
                      key={tile.label}
                      accessible
                      accessibilityLabel={[tile.label, tile.value, tile.change?.text]
                        .filter(Boolean)
                        .join(', ')}
                      style={[
                        styles.tile,
                        { backgroundColor: colors.surface, borderRadius: radius.lg },
                      ]}
                    >
                      <Text style={[type.caption, { color: colors.muted }]}>{tile.label}</Text>
                      <Text style={[type.title, type.number, { color: colors.text }]}>
                        {tile.value}
                      </Text>
                      {tile.change && (
                        <View style={styles.change}>
                          {tile.change.direction !== 'same' && (
                            <Icon
                              name={
                                tile.change.direction === 'up'
                                  ? { sf: 'arrow.up', md: 'arrow-upward' }
                                  : { sf: 'arrow.down', md: 'arrow-downward' }
                              }
                              size={11}
                              color={tile.change.direction === 'up' ? colors.good : colors.danger}
                            />
                          )}
                          <Text
                            style={[
                              type.caption,
                              {
                                color:
                                  tile.change.direction === 'up'
                                    ? colors.good
                                    : tile.change.direction === 'down'
                                      ? colors.danger
                                      : colors.muted,
                                fontWeight: '600',
                              },
                            ]}
                          >
                            {tile.change.text}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
                {summary.data.previous && (
                  <Text style={[type.footnote, { color: colors.secondary }]}>
                    Compared with {summary.data.previous.name}
                  </Text>
                )}
              </>
            ) : summary.isError ? (
              <Note
                action={
                  <Button label="Retry" variant="link" onPress={() => void summary.refetch()} />
                }
              >
                Could not load the summary.
              </Note>
            ) : (
              <Loading label="Loading summary" />
            )}
            <View style={{ gap: 8 }}>
              {running && <Button label="Start next block" onPress={() => setView('next')} />}
              {running && !block.deload && (
                <Button
                  label="Deload week first"
                  variant="secondary"
                  onPress={() => setView('deload')}
                />
              )}
              <Button
                label="View progress"
                variant="secondary"
                onPress={() => {
                  selectBlock(running ? 'current' : block.id);
                  router.navigate(trainingRoute('exercises'));
                }}
              />
            </View>
          </>
        )}
        {view === 'next' && (
          <>
            <View style={{ gap: 8 }}>
              <FieldLabel>Block name</FieldLabel>
              <TextInput
                accessibilityLabel="Block name"
                value={name}
                maxLength={80}
                editable={!busy}
                onChangeText={setName}
                style={[
                  type.body,
                  styles.field,
                  { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.text },
                ]}
              />
            </View>
            <ChoiceTiles
              label="Ends"
              options={nextBlockPlanOptions(today).map((item) => ({
                value: item.id,
                label: item.label,
                detail: item.detail,
              }))}
              value={plan}
              disabled={busy}
              onChange={setPlan}
            />
            <Button
              label={busy ? 'Starting…' : 'Start block'}
              disabled={busy || !name.trim()}
              onPress={() =>
                void start(nextBlockInput(name, plan, today), 'Training block started')
              }
            />
            <Button
              label="Back"
              variant="secondary"
              disabled={busy}
              onPress={() => setView('summary')}
            />
          </>
        )}
        {view === 'deload' && (
          <>
            <Text style={[type.body, { color: colors.text }]}>{deloadMessage(today)}</Text>
            <Button
              label={busy ? 'Starting…' : 'Start deload'}
              disabled={busy}
              onPress={() => void start(deloadBlockInput(today), 'Deload week started')}
            />
            <Button
              label="Back"
              variant="secondary"
              disabled={busy}
              onPress={() => setView('summary')}
            />
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 2 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  field: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
});
