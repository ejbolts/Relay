import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { HISTORY_PAGE_SIZE } from '../../../../frontend/src/appShared';
import type { BodyFigureKind } from '../../../../frontend/src/bodyFigureShapes';
import {
  bodyFigureValues,
  bodySizeChangeText,
  bodySizeChanges,
  bodySizeEditText,
  bodySizeHistory,
  bodySizeShown,
  bodySizeSummary,
  bodySizeUnit,
  figureEntry,
  formatBodySize,
  withBodySizeLog,
} from '../../../../frontend/src/bodySizeEntries';
import {
  BODY_SIZE_FIELDS,
  type BodySizeField,
  type BodySizeLog,
} from '../../../../frontend/src/bodySizes';
import { SEX_LABELS } from '../../../../frontend/src/profileDisplay';
import type { Sex, User } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiSend } from '../../data/api';
import { readJson, writeJson } from '../../data/deviceStorage';
import { useWeightUnit } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { MenuButton } from '../../ui/MenuButton';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { bodyIcons } from './bodyIcons';
import { bodyKeys, bodySizeApi, useBodySizes } from './bodyQueries';
import { BodyFigure } from './BodyFigure';
import { BodySizesSheet } from './BodySizesSheet';

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const dayAndMonth = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// The outline this phone last chose for an account, under the web's localStorage key.
const figureKey = (userId: string) => `gym-logger-body-figure:${encodeURIComponent(userId)}`;

/**
 * The web's Body measurements card: the latest entry drawn on a body outline (earlier values
 * fill parts it lacks, muted), stepping back through entries, typing a part straight onto the
 * figure, and the measurement history filtered by part.
 */
export function BodySizesCard() {
  const { colors, type, radius } = useTheme();
  const client = useQueryClient();
  const user = useUser();
  const size = bodySizeUnit(useWeightUnit());
  const query = useBodySizes();
  const logs = query.data ?? null;
  const [shownDate, setShownDate] = useState<string | null>(null);
  const [inlineField, setInlineField] = useState<BodySizeField | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPart, setHistoryPart] = useState<BodySizeField | 'all'>('all');
  const [historyRows, setHistoryRows] = useState(HISTORY_PAGE_SIZE);
  const [chosenFigure, setChosenFigure] = useState<BodyFigureKind>(
    () => readJson<BodyFigureKind>(figureKey(user.id)) ?? 'male',
  );
  // The profile's sex decides the outline; it's only offered until it's set.
  const [savedSex, setSavedSex] = useState<Sex | null>(null);
  const profileSex = user.sex ?? savedSex;
  const figure = profileSex ?? chosenFigure;
  // Each save replaces a whole day, so saves run one after another.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const setLogs = (update: (logs: BodySizeLog[] | null) => BodySizeLog[]) =>
    client.setQueryData<BodySizeLog[]>(bodyKeys.sizes, (current) => update(current ?? null));
  function queueSave(entry: BodySizeLog) {
    const result = saveQueue.current.then(() => bodySizeApi.save(entry));
    saveQueue.current = result.catch(() => undefined);
    return result;
  }

  const shownIndex = Math.max(0, logs?.findIndex((row) => row.measurement_date === shownDate) ?? 0);
  const shown = logs?.[shownIndex];
  const previous = logs?.[shownIndex + 1];
  const { values: figureValues, carried } = bodyFigureValues(logs, shownIndex);
  const changes = bodySizeChanges(shown, previous, size);
  const history = bodySizeHistory(logs, historyPart);
  const partLabel = BODY_SIZE_FIELDS.find(([key]) => key === historyPart)?.[1];

  function saveOnFigure(field: BodySizeField, typed: string): boolean {
    const day = localDate();
    const result = figureEntry({ logs, day, field, typed, shownCm: figureValues[field], size });
    if (result.kind === 'invalid') {
      haptics.error();
      setInlineError(result.error);
      return false;
    }
    setInlineField(null);
    setInlineError(null);
    if (result.kind === 'unchanged') return true;
    haptics.success();
    setLogs((items) => withBodySizeLog(items, result.entry));
    setShownDate(day);
    queueSave(result.entry).catch((reason) => {
      setInlineError(errorMessage(reason));
      // Reload, so the figure shows what is actually stored.
      void client.invalidateQueries({ queryKey: bodyKeys.sizes });
    });
    return true;
  }

  async function saveForm(entry: BodySizeLog): Promise<string | null> {
    setSaving(true);
    try {
      const saved = await queueSave(entry);
      haptics.success();
      setLogs((items) => withBodySizeLog(items, saved));
      setShownDate(saved.measurement_date);
      setFormDate(null);
      showToast('Measurements saved');
      return null;
    } catch (reason) {
      haptics.error();
      return reason instanceof Error ? reason.message : 'Could not save measurements.';
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(date: string) {
    haptics.warning();
    Alert.alert('Delete body measurements?', `Delete the measurements for ${shortDate(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete measurements',
        style: 'destructive',
        onPress: () =>
          void bodySizeApi.remove(date).then(
            () => {
              setLogs((items) => (items ?? []).filter((row) => row.measurement_date !== date));
              showToast('Measurements deleted');
            },
            (reason) => Alert.alert('Could not delete measurements', errorMessage(reason)),
          ),
      },
    ]);
  }

  function chooseFigure(kind: BodyFigureKind) {
    setChosenFigure(kind);
    writeJson(figureKey(user.id), kind);
    // Picking an outline before the profile has a sex offers to save it as the account's sex.
    Alert.alert(
      `Save your sex as ${SEX_LABELS[kind]}?`,
      'It sets your body measurement outline. After you save, only an administrator can change it.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Save',
          onPress: () =>
            void apiSend<User>('/api/profile', 'PATCH', { sex: kind }).then(
              (saved) => setSavedSex(saved.sex ?? kind),
              (reason) => Alert.alert('Could not save your sex', errorMessage(reason)),
            ),
        },
      ],
    );
  }

  const header = (
    <View style={styles.headerRow}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text }]}>
          Body measurements
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About body measurements"
          hitSlop={10}
          onPress={() => {
            haptics.tap();
            Alert.alert(
              'Body measurements',
              'Flex each muscle and measure around it with a relaxed tape, using the same position each time. All fields are optional; enter at least one.',
            );
          }}
        >
          <Icon name={bodyIcons.info} size={17} color={colors.muted} />
        </Pressable>
      </View>
      <Button
        label="Log measurements"
        variant="tonal"
        size="small"
        disabled={logs === null}
        onPress={() => setFormDate(localDate())}
      />
    </View>
  );

  if (!logs) {
    return (
      <Card accessibilityLabel="Body measurements">
        {header}
        {query.isPending ? (
          <Loading label="Loading measurements" />
        ) : (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        )}
      </Card>
    );
  }

  const shownDay = shown?.measurement_date ?? localDate();
  return (
    <Card accessibilityLabel="Body measurements">
      {header}
      <View
        style={[styles.stepperBar, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
      >
        {logs.length > 1 ? (
          <StepButton
            label="Earlier measurements"
            icon="chevronLeft"
            disabled={!previous}
            onPress={() => previous && setShownDate(previous.measurement_date)}
          />
        ) : (
          <View style={styles.stepSpacer} />
        )}
        <Text
          style={[
            type.callout,
            type.number,
            styles.stepperDate,
            { color: colors.text, fontWeight: '600' },
          ]}
          numberOfLines={1}
        >
          {shortDate(shownDay)}
        </Text>
        {logs.length > 1 ? (
          <StepButton
            label="Later measurements"
            icon="chevronRight"
            disabled={shownIndex === 0}
            onPress={() => setShownDate(logs[shownIndex - 1].measurement_date)}
          />
        ) : (
          <View style={styles.stepSpacer} />
        )}
      </View>
      <BodyFigure
        kind={figure}
        unit={size.unit}
        values={Object.fromEntries(
          Object.entries(figureValues).map(([key, cm]) => [key, String(bodySizeShown(cm, size))]),
        )}
        carried={carried}
        onPick={(field) => {
          setInlineError(null);
          setInlineField(field);
        }}
        editing={inlineField}
        editValue={
          inlineField && figureValues[inlineField] != null
            ? bodySizeEditText(figureValues[inlineField]!, size)
            : ''
        }
        invalid={inlineError !== null && inlineField !== null}
        onCommit={saveOnFigure}
        onCancel={() => {
          setInlineField(null);
          setInlineError(null);
        }}
      />
      {inlineError && (
        <Text
          accessibilityRole="alert"
          style={[type.footnote, { color: colors.danger, textAlign: 'center' }]}
        >
          {inlineError}
        </Text>
      )}
      {profileSex === 'male' || profileSex === 'female' ? (
        <View
          accessible
          accessibilityLabel={`${SEX_LABELS[profileSex]}, set on your profile`}
          style={[styles.locked, { backgroundColor: colors.surface2, borderRadius: radius.sm }]}
        >
          <Icon name={bodyIcons[profileSex]} size={15} color={colors.text} />
          <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>
            {SEX_LABELS[profileSex]}
          </Text>
          <Icon name={bodyIcons.lock} size={13} color={colors.muted} />
        </View>
      ) : (
        <Segmented
          accessibilityLabel="Body outline"
          values={['Male', 'Female']}
          selectedIndex={figure === 'female' ? 1 : 0}
          onChange={(index) => chooseFigure(index === 1 ? 'female' : 'male')}
          style={styles.figureSegmented}
        />
      )}
      {shown && (
        <>
          {changes.length > 0 && previous && (
            <View style={{ gap: 8 }}>
              <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>
                Changed since {dayAndMonth(previous.measurement_date)}
              </Text>
              <View style={styles.changes}>
                {changes.map(({ key, label, change }) => (
                  <View
                    key={key}
                    accessible
                    accessibilityLabel={`${label} ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} ${size.unit}`}
                    style={[
                      styles.change,
                      { backgroundColor: colors.surface2, borderRadius: radius.pill },
                    ]}
                  >
                    <Text style={[type.footnote, { color: colors.secondary }]}>{label}</Text>
                    <Text
                      style={[
                        type.footnote,
                        type.number,
                        { color: colors.text, fontWeight: '700' },
                      ]}
                    >
                      {change > 0 ? '↑' : '↓'} {Math.abs(change)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.entryActions}>
            <Button
              label="Edit"
              variant="secondary"
              size="small"
              onPress={() => setFormDate(shown.measurement_date)}
              style={{ flex: 1 }}
            />
            <Button
              label="Delete"
              variant="danger-soft"
              size="small"
              onPress={() => confirmDelete(shown.measurement_date)}
              style={{ flex: 1 }}
            />
          </View>
          <View style={[styles.historySection, { borderTopColor: colors.line }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
              accessibilityLabel={`Measurement history, ${history.length}`}
              onPress={() => {
                haptics.selection();
                setHistoryOpen((open) => !open);
              }}
              style={styles.historyHeader}
            >
              <Text style={[type.footnote, { color: colors.text, fontWeight: '600', flex: 1 }]}>
                Measurement history{' '}
                <Text style={{ color: colors.muted, fontWeight: '400' }}>{history.length}</Text>
              </Text>
              <Icon
                name={historyOpen ? 'chevronUp' : 'chevronDown'}
                size={16}
                color={colors.muted}
              />
            </Pressable>
            {historyOpen && (
              <View style={{ gap: 10, marginTop: 10 }}>
                <PartFilter
                  part={historyPart}
                  onChange={(part) => {
                    setHistoryPart(part);
                    setHistoryRows(HISTORY_PAGE_SIZE);
                  }}
                />
                {history.length === 0 && (
                  <Text style={[type.footnote, { color: colors.muted }]}>
                    No {partLabel?.toLowerCase()} measurements yet.
                  </Text>
                )}
                {history.slice(0, historyRows).map((row, index) => (
                  <View
                    key={row.measurement_date}
                    style={[styles.historyRow, { borderTopColor: colors.line }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                        {shortDate(row.measurement_date)}
                      </Text>
                      {historyPart === 'all' ? (
                        <Text style={[type.footnote, { color: colors.secondary }]}>
                          {bodySizeSummary(row, size)}
                        </Text>
                      ) : (
                        <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>
                            {formatBodySize(row[historyPart]!, size)}
                          </Text>
                          {'  '}
                          {bodySizeChangeText(history, index, historyPart, size)}
                        </Text>
                      )}
                    </View>
                    <MenuButton
                      accessibilityLabel={`Actions for measurements ${row.measurement_date}`}
                      items={[
                        { label: 'Edit', onPress: () => setFormDate(row.measurement_date) },
                        ...(historyPart === 'all'
                          ? [
                              {
                                label: 'Delete',
                                destructive: true,
                                onPress: () => confirmDelete(row.measurement_date),
                              },
                            ]
                          : []),
                      ]}
                      trigger={{ sf: 'ellipsis', color: colors.secondary, size: 15 }}
                      width={32}
                      height={32}
                      fill={colors.surface2}
                    >
                      <View style={[styles.more, { backgroundColor: colors.surface2 }]}>
                        <Icon name="more" size={16} color={colors.secondary} />
                      </View>
                    </MenuButton>
                  </View>
                ))}
                {history.length > historyRows && (
                  <Button
                    label="Show more"
                    variant="link"
                    align="center"
                    onPress={() => setHistoryRows((rows) => rows + HISTORY_PAGE_SIZE)}
                  />
                )}
              </View>
            )}
          </View>
        </>
      )}
      <BodySizesSheet
        date={formDate}
        logs={logs}
        size={size}
        saving={saving}
        onClose={() => setFormDate(null)}
        onSave={saveForm}
      />
    </Card>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stepButton,
        { borderRadius: radius.sm },
        pressed && !disabled && { backgroundColor: colors.surface3 },
        disabled && { opacity: 0.3 },
      ]}
    >
      <Icon name={icon} size={18} color={colors.secondary} />
    </Pressable>
  );
}

/** The history's body-part filter, as a compact native menu. */
function PartFilter({
  part,
  onChange,
}: {
  part: BodySizeField | 'all';
  onChange: (part: BodySizeField | 'all') => void;
}) {
  const { colors, type, radius } = useTheme();
  const label = BODY_SIZE_FIELDS.find(([key]) => key === part)?.[1] ?? 'All measurements';
  return (
    <View style={styles.filter}>
      <Text style={[type.footnote, { color: colors.secondary }]}>Body part</Text>
      <MenuButton
        accessibilityLabel={`Body part, ${label}`}
        title="Body part"
        items={[
          { label: 'All measurements', checked: part === 'all', onPress: () => onChange('all') },
          ...BODY_SIZE_FIELDS.map(([key, name]) => ({
            label: name,
            checked: part === key,
            onPress: () => onChange(key),
          })),
        ]}
        trigger={{ text: label, color: colors.text }}
        width={170}
        height={36}
        fill={colors.surface2}
        cornerRadius={radius.sm}
      >
        <View
          style={[
            styles.filterButton,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.lineStrong,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>{label}</Text>
          <Icon name="chevronDown" size={14} color={colors.muted} />
        </View>
      </MenuButton>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    padding: 2,
  },
  stepperDate: { flex: 1, textAlign: 'center', fontSize: 14 },
  stepButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepSpacer: { width: 44, height: 40 },
  figureSegmented: { alignSelf: 'center', width: 184 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    minHeight: 36,
    gap: 6,
    paddingHorizontal: 14,
  },
  changes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  change: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  entryActions: { flexDirection: 'row', gap: 8 },
  historySection: { borderTopWidth: 1, paddingTop: 12 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filterButton: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
});
