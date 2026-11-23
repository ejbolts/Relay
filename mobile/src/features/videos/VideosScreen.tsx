import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WorkoutSession } from '../../../../frontend/src/types';
import { formatBytes, formatSeconds, localDate } from '../../../../frontend/src/utils';
import {
  canDeleteSession,
  moveItem,
  overallUploadProgress,
  SESSION_POLL_MS,
  sessionRetryLabel,
  sessionStatusDetail,
  sessionStatusText,
  TERMINAL_SESSION_STATUSES,
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
import { videoIcons } from './icons';
import {
  clipFromAsset,
  useVideoHealth,
  useYouTubeConnection,
  videoApi,
  type PhoneClip,
} from './videoData';
import { YouTubeCard } from './YouTubeCard';

type Step = 'upload' | 'progress' | 'processing' | 'complete';

/**
 * The web's videos tab: record or pick each set's video, upload the batch, then follow it while
 * the server stitches it and sends it to the connected YouTube channel.
 */
export function VideosScreen() {
  const user = useUser();
  const { colors, type } = useTheme();
  if (user.can_upload_videos === false)
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
  const [step, setStep] = useState<Step>('upload');
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDate);
  const [notes, setNotes] = useState('');
  const [clips, setClips] = useState<PhoneClip[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = youtubeReady(youtube.data ?? null);
  const inputStyle = useInputStyle();

  useEffect(() => {
    if (!session || step !== 'processing' || TERMINAL_SESSION_STATUSES.includes(session.status))
      return;
    const timer = setInterval(() => {
      videoApi
        .get(session.id)
        .then((next) => {
          setSession(next);
          if (next.status === 'complete') setStep('complete');
        })
        .catch((reason: unknown) => setMessage(errorMessage(reason)));
    }, SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [session, step]);

  function updateClip(clientId: string, update: Partial<PhoneClip>) {
    setClips((current) =>
      current.map((clip) => (clip.clientId === clientId ? { ...clip, ...update } : clip)),
    );
  }

  async function addVideos(source: 'camera' | 'library') {
    if (!ready) {
      setMessage('Connect your YouTube channel before adding clips.');
      return;
    }
    setMessage(null);
    try {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setMessage('Allow camera access in your phone’s settings to record a set.');
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
        setMessage(`Only ${VIDEO_FILE_TYPES} video files were added.`);
      setClips((current) => [...current, ...accepted]);
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  function chooseSource() {
    showMenu('Add set videos', [
      { label: 'Record a set', onPress: () => void addVideos('camera') },
      { label: 'Choose videos', onPress: () => void addVideos('library') },
    ]);
  }

  async function uploadClips(target: WorkoutSession, selected: PhoneClip[]) {
    const concurrency = health.data?.upload_concurrency ?? 2;
    let next = 0;
    let failed = false;
    async function worker() {
      while (next < selected.length) {
        const clip = selected[next++];
        updateClip(clip.clientId, { status: 'uploading', progress: 0, error: undefined });
        try {
          await videoApi.uploadClip(
            target.id,
            clip,
            clips.findIndex((item) => item.clientId === clip.clientId),
            (progress) => updateClip(clip.clientId, { progress }),
          );
          updateClip(clip.clientId, { status: 'uploaded', progress: 100 });
        } catch (reason) {
          failed = true;
          updateClip(clip.clientId, { status: 'failed', error: errorMessage(reason) });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
    return !failed;
  }

  async function beginProcessing(target: WorkoutSession) {
    try {
      setSession(await videoApi.process(target.id));
      setStep('processing');
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  async function startUpload() {
    if (!name.trim() || !date || !clips.length || busy || !ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await videoApi.create({
        name: name.trim(),
        workout_date: date,
        notes: notes.trim() || null,
        expected_clip_count: clips.length,
      });
      setSession(created);
      setStep('progress');
      if (await uploadClips(created, clips)) await beginProcessing(created);
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function retryFailedUploads() {
    if (!session || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const failed = clips.filter((clip) => clip.status === 'failed');
      if (await uploadClips(session, failed)) await beginProcessing(session);
    } finally {
      setBusy(false);
    }
  }

  async function cancelSession() {
    if (!session) return;
    try {
      setSession(await videoApi.cancel(session.id));
      setStep('processing');
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  function retryFailedSession() {
    if (!session) return;
    const retry = session.youtube_video_id ? videoApi.retryYoutube : videoApi.retryProcessing;
    retry(session.id)
      .then(setSession)
      .catch((reason: unknown) => setMessage(errorMessage(reason)));
  }

  function reset() {
    setClips([]);
    setSession(null);
    setName('');
    setDate(localDate());
    setNotes('');
    setMessage(null);
    setStep('upload');
  }

  function confirmDelete(target: WorkoutSession) {
    Alert.alert('Delete this session?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setMessage(null);
          try {
            await videoApi.remove(target.id);
            reset();
          } catch (reason) {
            setMessage(errorMessage(reason));
          } finally {
            setBusy(false);
          }
        },
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
            disabled={busy}
            onPress={() => void retryFailedUploads()}
          />
        )}
        <Button
          label="Cancel session"
          variant="secondary"
          disabled={busy}
          onPress={() => void cancelSession()}
        />
      </SettingsPage>
    );
  }

  if (step === 'processing' && session) {
    const detail = sessionStatusDetail(session.status);
    return (
      <SettingsPage>
        <Heading eyebrow="Processing session" title={session.name} />
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
          <Button label={sessionRetryLabel(session)} onPress={retryFailedSession} />
        )}
        {session.status === 'cancelled' && <Button label="Start a new upload" onPress={reset} />}
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
        <Button label="Upload another session" variant="secondary" onPress={reset} />
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
            onChangeText={setName}
            placeholder="e.g. Saturday lower body"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </Field>
        <DateField label="Workout date" value={date} onChange={setDate} />
        <Field label="Notes">
          <TextInput
            accessibilityLabel="Notes"
            value={notes}
            onChangeText={setNotes}
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
            <Text style={[type.headline, { color: colors.text }]}>{clips.length} clips</Text>
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
              onLabel={(label) => updateClip(clip.clientId, { exerciseLabel: label })}
              onMove={(to) => setClips((current) => moveItem(current, index, to))}
              onRemove={() =>
                setClips((current) => current.filter((item) => item.clientId !== clip.clientId))
              }
            />
          ))}
        </View>
      )}
      <Button
        label="Upload session"
        disabled={!clips.length || !name.trim() || !date || busy || !ready}
        onPress={() => void startUpload()}
      />
    </SettingsPage>
  );
}

function ClipCard({
  clip,
  index,
  last,
  onLabel,
  onMove,
  onRemove,
}: {
  clip: PhoneClip;
  index: number;
  last: boolean;
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
