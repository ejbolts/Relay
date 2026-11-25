import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { plural } from '../../../../frontend/src/adminDisplay';
import type { WorkoutSession } from '../../../../frontend/src/types';
import { formatBytes, formatSeconds } from '../../../../frontend/src/utils';
import {
  canDeleteSession,
  overallUploadProgress,
  sessionKicker,
  sessionRetryLabel,
  sessionStatusDetail,
  sessionStatusText,
  VIDEO_FILE_TYPES,
  youtubeReady,
} from '../../../../frontend/src/videoSessions';
import { useExercises } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { DateField } from '../body/DateField';
import { SettingsPage } from '../settings/SettingsList';
import { ClipPreview } from './ClipPreview';
import { videoIcons } from './icons';
import { clipFromAsset, useVideoHealth, useYouTubeConnection, type PhoneClip } from './videoData';
import {
  syncVideoUploadSession,
  useVideoUploadState,
  videoUploadActions,
} from './videoUploadStore';
import { YouTubeCard } from './YouTubeCard';

/**
 * The web's videos tab: record or pick each set's video, upload the batch, then follow it while
 * the server stitches it and sends it to the connected YouTube channel. Uploads live in the
 * app-level store, so leaving this screen keeps them running while Relay stays open.
 */
export function VideosScreen() {
  const user = useUser();
  const { colors, type } = useTheme();
  const allowed = user.can_upload_videos !== false;
  useEffect(() => {
    syncVideoUploadSession(user.id, allowed);
  }, [user.id, allowed]);
  if (!allowed)
    return (
      <SettingsPage>
        <Text style={[type.callout, { color: colors.secondary }]}>
          Video uploads are disabled for this account. Ask the administrator to enable them.
        </Text>
      </SettingsPage>
    );
  return <VideoUploader />;
}

function VideoUploader() {
  const { colors, type } = useTheme();
  const youtube = useYouTubeConnection();
  const health = useVideoHealth();
  const { step, name, date, notes, clips, session, busy, message, processFailed, phase } =
    useVideoUploadState();
  // The one clip whose preview is open; stays local so leaving releases the video player.
  const [previewing, setPreviewing] = useState<string | null>(null);
  const settleQuestionRef = useRef<((choice: 'keep' | 'stop') => void) | null>(null);
  const ready = youtubeReady(youtube.data ?? null);
  const concurrency = health.data?.upload_concurrency ?? 2;
  const inputStyle = useInputStyle();

  // If the screen unmounts while a Stop and discard alert was somehow still pending, unblock the
  // background upload instead of leaving it waiting on a closed dialog.
  useEffect(
    () => () => {
      settleQuestionRef.current?.('keep');
      settleQuestionRef.current = null;
    },
    [],
  );

  async function addVideos(source: 'camera' | 'library') {
    if (!ready) {
      videoUploadActions.setMessage('Connect your YouTube channel before adding clips.');
      return;
    }
    videoUploadActions.setMessage(null);
    try {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        videoUploadActions.setMessage(
          'Allow camera access in your phone’s settings to record a set.',
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['videos'],
        allowsMultipleSelection: source === 'library',
        // Keep the original file: the server encodes every clip itself.
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const added = result.assets.map((asset, index) => clipFromAsset(asset, clips.length + index));
      const accepted = added.filter((clip): clip is PhoneClip => clip !== null);
      if (accepted.length !== added.length)
        videoUploadActions.setMessage(`Only ${VIDEO_FILE_TYPES} video files were added.`);
      videoUploadActions.addClips(accepted);
    } catch (reason) {
      videoUploadActions.setMessage(errorMessage(reason));
    }
  }

  function chooseSource() {
    showMenu('Add set videos', [
      { label: 'Record a set', onPress: () => void addVideos('camera') },
      { label: 'Choose videos', onPress: () => void addVideos('library') },
    ]);
  }

  function confirmStopAndDiscard(target: WorkoutSession) {
    if (phase === 'starting' || phase === 'stopping') return;
    // While the question is open, the batch doesn't start processing even if its last clip
    // finishes behind it, so Stop and discard never races a start.
    const settle = videoUploadActions.beginStopQuestion();
    settleQuestionRef.current = settle;
    const answer = (choice: 'keep' | 'stop') => {
      if (settleQuestionRef.current === settle) settleQuestionRef.current = null;
      settle(choice);
    };
    Alert.alert(
      'Stop and discard this upload?',
      'Uploading stops, and this session and the clips sent so far are deleted.',
      [
        { text: 'Keep uploading', style: 'cancel', onPress: () => answer('keep') },
        {
          text: 'Stop and discard',
          style: 'destructive',
          onPress: () => {
            answer('stop');
            void videoUploadActions.stopAndDiscard(target);
          },
        },
      ],
      { cancelable: true, onDismiss: () => answer('keep') },
    );
  }

  function confirmDelete(target: WorkoutSession) {
    Alert.alert('Delete this session?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void videoUploadActions.deleteSession(target),
      },
    ]);
  }

  const banner = message && (
    <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
      {message}
    </Text>
  );

  if (step === 'progress' && session) {
    const overall = overallUploadProgress(clips);
    const failed = clips.some((clip) => clip.status === 'failed');
    return (
      <SettingsPage>
        <Heading eyebrow="Uploading session" title={session.name} />
        {banner}
        <Card>
          <View style={styles.between}>
            <Text style={[type.callout, { color: colors.secondary }]}>Overall upload</Text>
            <Text style={[type.headline, type.number, { color: colors.text }]}>{overall}%</Text>
          </View>
          <Progress percent={overall} label="Overall upload" />
        </Card>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          Keep Relay open until every upload finishes.
        </Text>
        {clips.map((clip) => (
          <Card key={clip.clientId} style={{ gap: 6 }}>
            <View style={styles.between}>
              <Text numberOfLines={1} style={[type.callout, { color: colors.text, flex: 1 }]}>
                {clip.name}
              </Text>
              <Text
                style={[
                  type.footnote,
                  { color: clip.status === 'failed' ? colors.danger : colors.muted },
                ]}
              >
                {clip.status} · {clip.progress}%
              </Text>
            </View>
            <Progress percent={clip.progress} label={`${clip.name} upload`} />
            {clip.error && (
              <Text style={[type.footnote, { color: colors.danger }]}>{clip.error}</Text>
            )}
          </Card>
        ))}
        {failed && (
          <Button
            label="Retry failed uploads"
            disabled={busy || phase !== 'idle'}
            onPress={() => void videoUploadActions.retryFailedUploads(concurrency)}
          />
        )}
        {phase === 'starting' && (
          <Text style={[type.callout, { color: colors.secondary }]}>Starting processing…</Text>
        )}
        {processFailed && !failed && !busy && phase === 'idle' && (
          <Button
            label="Start processing"
            onPress={() => void videoUploadActions.retryProcessingStart(session)}
          />
        )}
        <Button
          label={phase === 'stopping' ? 'Stopping…' : 'Cancel session'}
          variant="secondary"
          disabled={phase === 'starting' || phase === 'stopping'}
          onPress={videoUploadActions.cancelSession}
        />
        <Button
          label={phase === 'stopping' ? 'Stopping…' : 'Stop and discard'}
          variant="danger-soft"
          disabled={phase === 'starting' || phase === 'stopping'}
          onPress={() => confirmStopAndDiscard(session)}
        />
      </SettingsPage>
    );
  }

  if (step === 'processing' && session) {
    const detail = sessionStatusDetail(session.status);
    return (
      <SettingsPage>
        <Heading eyebrow={sessionKicker(session.status)} title={session.name} />
        {banner}
        <Card>
          <Text style={[type.headline, { color: colors.text }]}>
            {sessionStatusText(session.status)}
          </Text>
          {detail && <Text style={[type.callout, { color: colors.secondary }]}>{detail}</Text>}
        </Card>
        {session.processing_error && (
          <Text style={[type.callout, { color: colors.danger }]}>{session.processing_error}</Text>
        )}
        {session.status === 'failed' && (
          <Button
            label={sessionRetryLabel(session)}
            onPress={videoUploadActions.retryFailedSession}
          />
        )}
        {session.status === 'cancelled' && (
          <Button label="Start a new upload" onPress={videoUploadActions.reset} />
        )}
        {canDeleteSession(session) && (
          <Button
            label="Delete this session"
            variant="danger"
            disabled={busy}
            onPress={() => confirmDelete(session)}
          />
        )}
      </SettingsPage>
    );
  }

  if (step === 'complete' && session) {
    const open = (url: string | null) => url && void Linking.openURL(url);
    return (
      <SettingsPage>
        <Heading eyebrow="Session complete" title={session.name} />
        {banner}
        {youtube.data?.privacy_status === 'private' && (
          <Card>
            <Text style={[type.callout, { color: colors.secondary }]}>
              Watch your private video on YouTube while signed in to your connected channel.
            </Text>
          </Card>
        )}
        <Button
          label="Open full YouTube video"
          icon="external"
          disabled={!session.youtube_url}
          onPress={() => open(session.youtube_url)}
        />
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          Sets
        </Text>
        <Card style={{ gap: 0, padding: 0 }}>
          {session.timestamps.map((timestamp) => (
            <Pressable
              key={timestamp.clip_id}
              accessibilityRole="link"
              onPress={() => open(timestamp.youtube_url ?? session.youtube_url)}
              style={({ pressed }) => [styles.timestamp, pressed && { opacity: 0.6 }]}
            >
              <Text style={[type.callout, type.number, { color: colors.accentText }]}>
                {formatSeconds(timestamp.start_seconds)}
              </Text>
              <Text style={[type.callout, { color: colors.text, flex: 1 }]}>{timestamp.label}</Text>
            </Pressable>
          ))}
        </Card>
        <Button
          label="Upload another session"
          variant="secondary"
          onPress={videoUploadActions.reset}
        />
        <Button
          label="Delete this session"
          variant="danger"
          disabled={busy}
          onPress={() => confirmDelete(session)}
        />
      </SettingsPage>
    );
  }

  const totalBytes = clips.reduce((sum, clip) => sum + (clip.size ?? 0), 0);
  return (
    <SettingsPage>
      <YouTubeCard disabled={busy} />
      {banner}
      <Heading eyebrow="Workout videos" title="Upload your sets" />
      <Card>
        <Field label="Session name">
          <TextInput
            accessibilityLabel="Session name"
            value={name}
            onChangeText={videoUploadActions.setName}
            placeholder="e.g. Saturday lower body"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </Field>
        <DateField label="Workout date" value={date} onChange={videoUploadActions.setDate} />
        <Field label="Notes">
          <TextInput
            accessibilityLabel="Notes"
            value={notes}
            onChangeText={videoUploadActions.setNotes}
            multiline
            placeholder="Anything useful to keep with this session"
            placeholderTextColor={colors.muted}
            style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
          />
        </Field>
      </Card>
      <Button
        label="Add set videos"
        icon={videoIcons.record}
        variant="secondary"
        disabled={!ready || busy}
        onPress={chooseSource}
      />
      {clips.length > 0 && (
        <View style={{ gap: 12 }}>
          <View style={styles.between}>
            <Text style={[type.headline, { color: colors.text }]}>
              {plural(clips.length, 'clip')}
            </Text>
            <Text style={[type.footnote, { color: colors.muted }]}>
              {formatBytes(totalBytes)} total
            </Text>
          </View>
          {clips.map((clip, index) => (
            <ClipCard
              key={clip.clientId}
              clip={clip}
              index={index}
              last={index === clips.length - 1}
              previewing={previewing === clip.clientId}
              onPreview={() => setPreviewing(clip.clientId)}
              onLabel={(label) => videoUploadActions.setClipLabel(clip.clientId, label)}
              onMove={(to) => videoUploadActions.moveClip(index, to)}
              onRemove={() => videoUploadActions.removeClip(clip.clientId)}
            />
          ))}
        </View>
      )}
      <Button
        label="Upload session"
        loading={phase === 'creating'}
        disabled={!clips.length || !name.trim() || !date || busy || !ready}
        onPress={() => void videoUploadActions.startUpload(concurrency, ready)}
      />
    </SettingsPage>
  );
}

function ClipCard({
  clip,
  index,
  last,
  previewing,
  onPreview,
  onLabel,
  onMove,
  onRemove,
}: {
  clip: PhoneClip;
  index: number;
  last: boolean;
  previewing: boolean;
  onPreview: () => void;
  onLabel: (label: string) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const exercises = useExercises();
  const inputStyle = useInputStyle();
  const typed = clip.exerciseLabel.trim().toLocaleLowerCase();
  // The web's datalist: a few saved exercises that match what's typed.
  const suggestions = typed
    ? (exercises.data ?? [])
        .map((exercise) => exercise.name)
        .filter((name) => name.toLocaleLowerCase().includes(typed) && name !== clip.exerciseLabel)
        .slice(0, 3)
    : [];
  const set = index + 1;
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.between}>
        <Text style={[type.footnote, { color: colors.accentText, fontWeight: '700' }]}>
          Set {set}
        </Text>
        <Text style={[type.footnote, { color: colors.muted }]}>
          {[
            clip.durationMs ? formatSeconds(Math.round(clip.durationMs / 1000)) : null,
            clip.size ? formatBytes(clip.size) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text numberOfLines={1} style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
        {clip.name}
      </Text>
      <ClipPreview uri={clip.uri} name={clip.name} active={previewing} onOpen={onPreview} />
      <TextInput
        accessibilityLabel={`Set ${set} exercise`}
        value={clip.exerciseLabel}
        onChangeText={onLabel}
        placeholder="Exercise, e.g. Back squat"
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      {suggestions.length > 0 && (
        <View style={styles.row}>
          {suggestions.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              onPress={() => onLabel(name)}
              style={[styles.chip, { backgroundColor: colors.surface2, borderRadius: radius.pill }]}
            >
              <Text style={[type.footnote, { color: colors.text }]}>{name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <IconButton
          icon={videoIcons.up}
          label={`Move set ${set} up`}
          disabled={index === 0}
          onPress={() => onMove(index - 1)}
        />
        <IconButton
          icon={videoIcons.down}
          label={`Move set ${set} down`}
          disabled={last}
          onPress={() => onMove(index + 1)}
        />
        <View style={{ flex: 1 }} />
        <Button
          label="Remove"
          variant="link"
          onPress={onRemove}
          accessibilityLabel={`Remove set ${set}`}
        />
      </View>
    </Card>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: (typeof videoIcons)[keyof typeof videoIcons];
  label: string;
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
      onPress={onPress}
      style={[
        styles.iconButton,
        { backgroundColor: colors.surface2, borderRadius: radius.md },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.eyebrow, { color: colors.muted }]}>{eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
        {title}
      </Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.footnote, { color: colors.secondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function Progress({ percent, label }: { percent: number; label: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.surface3, borderRadius: radius.pill }]}
    >
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          backgroundColor: colors.accent,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}

function useInputStyle() {
  const { colors, type, radius } = useTheme();
  return [
    type.body,
    styles.input,
    { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.md },
  ];
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { paddingHorizontal: 12, paddingVertical: 10 },
  track: { height: 8, overflow: 'hidden' },
  timestamp: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
});
