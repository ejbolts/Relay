import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { blockColor } from '../../../../frontend/src/blockColors';
import { blocksCoachSteps } from '../../../../frontend/src/setupGuideCoach';
import {
  blockFormDraft,
  blockFormInput,
  blockFormTitle,
  blockPlanOptions,
  blockRemoveMessage,
  blockStartOptions,
  createdBlockSelection,
  type BlockFormDraft,
} from '../../../../frontend/src/trainingBlockForm';
import { addDays } from '../../../../frontend/src/trainingSummary';
import type { TrainingBlock, TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { Button, ErrorState, errorMessage, Loading } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { DateField } from '../body/DateField';
import {
  createBlock,
  removeBlock,
  selectBlock,
  updateBlock,
  useTrainingBlocks,
} from './blockQueries';
import { BlockColorField } from './BlockColorField';
import { nativeBlockColor } from './BlockScopeChip';
import { ChoiceTiles, FieldLabel, HeaderTextButton } from './parts';
import { haptics } from '../../ui/haptics';
import { TextField } from '../../ui/controls';
import { CoachSpacer, CoachTarget, GuideCoach } from '../guides/GuideCoach';
import {
  exitSetupGuide,
  finishSetupGuide,
  useExitGuideOnLeave,
  useSetupGuide,
} from '../guides/setupGuides';

/** Starts a training block, or edits or removes a saved one, as the web's block form. */
export function BlockFormScreen({ blockId }: { blockId?: string }) {
  const blocks = useTrainingBlocks();
  if (!blocks.data)
    return blocks.isError ? (
      <ErrorState message={errorMessage(blocks.error)} onRetry={() => void blocks.refetch()} />
    ) : (
      <Loading label="Loading training blocks" />
    );
  const editing = blockId ? blocks.data.blocks.find((item) => item.id === blockId) : undefined;
  if (blockId && !editing) return null;
  return <BlockForm key={blockId ?? 'new'} config={blocks.data} editing={editing ?? null} />;
}

function BlockForm({ config, editing }: { config: TrainingBlocks; editing: TrainingBlock | null }) {
  const { colors, type, space } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const today = localDate();
  const [draft, setDraft] = useState<BlockFormDraft>(() => blockFormDraft(editing, today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The training blocks guide coaches a new block's form, as the web's.
  const guide = useSetupGuide('blocks');
  const [guideStep, setGuideStep] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useExitGuideOnLeave('blocks');
  const coachSteps = blocksCoachSteps(guide?.facts.lift, draft.name);
  const change = (values: Partial<BlockFormDraft>) => {
    setDraft((current) => ({ ...current, ...values }));
    setError(null);
  };
  // The colour a block gets without a choice: its tone, or the accent for a new current block.
  const automatic = nativeBlockColor(
    editing ? blockColor(config.blocks, { ...editing, color: null }, today) : 'var(--accent)',
    colors,
  );

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const input = blockFormInput(draft);
      if (editing) {
        await updateBlock(client, editing.id, input);
        showToast('Training block saved');
      } else {
        const next = await createBlock(client, input);
        const selection = createdBlockSelection(next, draft.start, today);
        if (selection) selectBlock(selection);
        finishSetupGuide('blocks');
        showToast('Training block started');
      }
      haptics.success();
      router.back();
    });

  const remove = () => {
    if (!editing) return;
    Alert.alert('Remove training block?', blockRemoveMessage(editing.name), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove block',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await removeBlock(client, editing.id);
            showToast('Training block removed');
            router.back();
          }),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: blockFormTitle(!!editing),
          headerRight: () => (
            <CoachTarget id={!editing && 'blocks.submit'} header radius={10}>
              <HeaderTextButton
                label={editing ? 'Save' : 'Start'}
                accessibilityLabel={editing ? 'Save block' : 'Start block'}
                busy={busy}
                disabled={!draft.name.trim()}
                onPress={() => void save()}
              />
            </CoachTarget>
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 }}
      >
        <CoachTarget id={!editing && 'blocks.name'} style={{ gap: 8 }}>
          <FieldLabel>Block name</FieldLabel>
          <TextField
            accessibilityLabel="Block name"
            value={draft.name}
            maxLength={80}
            placeholder="e.g. Winter strength"
            editable={!busy}
            autoFocus={!editing}
            onChangeText={(name) => change({ name })}
          />
        </CoachTarget>
        <BlockColorField
          value={draft.color}
          automatic={automatic}
          disabled={busy}
          onChange={(color) => change({ color })}
        />
        <CoachTarget id={!editing && 'blocks.start'} style={{ gap: 10 }}>
          <ChoiceTiles
            label="Starts"
            options={blockStartOptions(draft, today)}
            value={draft.preset}
            disabled={busy}
            onChange={(preset) => {
              const option = blockStartOptions(draft, today).find((item) => item.value === preset);
              change({ preset, start: option?.date ?? draft.start });
            }}
          />
          {draft.preset === 'custom' && (
            <DateField
              label="Start date"
              value={draft.start}
              max={today}
              disabled={busy}
              onChange={(start) => change({ start })}
            />
          )}
        </CoachTarget>
        <CoachTarget id={!editing && 'blocks.end'} style={{ gap: 10 }}>
          <ChoiceTiles
            label="Ends"
            options={blockPlanOptions(draft)}
            value={draft.plan}
            disabled={busy}
            onChange={(plan) => change({ plan })}
          />
          {draft.plan === 'custom' && (
            <DateField
              label="Planned end"
              value={draft.planEnd}
              min={addDays(draft.start, 1)}
              disabled={busy}
              onChange={(planEnd) => change({ planEnd })}
            />
          )}
        </CoachTarget>
        {!!error && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        {editing && (
          <Button label="Remove block" variant="danger" disabled={busy} onPress={remove} />
        )}
        <CoachSpacer />
      </ScrollView>
      {guide && !editing && (
        <GuideCoach
          step={coachSteps[guideStep]}
          index={guideStep}
          total={coachSteps.length}
          scroll={scroll}
          onNext={() => setGuideStep(guideStep + 1)}
          onBack={guideStep > 0 ? () => setGuideStep(guideStep - 1) : undefined}
          onExit={() => exitSetupGuide('blocks')}
        />
      )}
    </KeyboardAvoidingView>
  );
}
