import * as ImagePicker from 'expo-image-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { plural } from '../../../../frontend/src/adminDisplay';
import type { WorkoutSession } from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { UploadStopped } from '../../data/uploadFile';
import { formatBytes, formatSeconds, localDate } from '../../../../frontend/src/utils';
import {
  canDeleteSession,
  ALREADY_PROCESSING_CODES,
  moveItem,
  newerSession,
  PROCESSING_SESSION_STATUSES,
  overallUploadProgress,
  SESSION_POLL_MS,
  sessionKicker,
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
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useAccountGuard } from '../admin/accountGuard';
import { DateField } from '../body/DateField';
import { SettingsPage } from '../settings/SettingsList';
import { ClipPreview } from './ClipPreview';
import type { ClipTransfer } from './clipUpload';
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
 * What the batch is doing with the server: creating its session, uploading clips, starting
 * processing (or reading back whether it started), or stopping. One runs at a time.
 */
type Phase = 'idle' | 'creating' | 'uploading' | 'starting' | 'stopping';

// The phases that can't be interrupted: leaving waits for them, with this reason.
const HOLD_REASONS: Partial<Record<Phase, string>> = {
  creating: 'Wait while the session is created.',
  starting: 'Wait until processing has started.',
  stopping: 'Wait while the upload stops.',
};
const STILL_UPLOADABLE: WorkoutSession['status'][] = ['draft', 'uploading', 'upload_failed'];
const UPLOAD_WAKE_LOCK_TAG = 'relay-video-upload';
/** The server has started work on the batch (or finished it), so it can't be cancelled. */
const processingBegan = (status: WorkoutSession['status']) =>
  PROCESSING_SESSION_STATUSES.includes(status) || status === 'complete' || status === 'failed';

/** Keeps the phone awake while clips upload, releasing when the upload ends, stops or unmounts. */
function useUploadWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let released = false;
    void activateKeepAwakeAsync(UPLOAD_WAKE_LOCK_TAG)
      .then(() => {
        if (released) return deactivateKeepAwake(UPLOAD_WAKE_LOCK_TAG);
      })
      .catch(() => {
        // Upload still works; wake locks are a best-effort guard only.
      });
    return () => {
      released = true;
      void deactivateKeepAwake(UPLOAD_WAKE_LOCK_TAG).catch(() => undefined);
    };
  }, [active]);
}

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
  // Every clip uploaded but the request to start processing failed: offer to start it again.
  const [processFailed, setProcessFailed] = useState(false);
  const [phase, setPhaseState] = useState<Phase>('idle');
  // Read synchronously, so a second action in the same frame sees the first.
  const phaseRef = useRef<Phase>('idle');
  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }
  // A function, so a check after an await reads the phase as it is then.
  const currentPhase = () => phaseRef.current;
  useUploadWakeLock(phase === 'creating' || phase === 'uploading' || phase === 'starting');
  const ready = youtubeReady(youtube.data ?? null);
  const guard = useAccountGuard();
  // The batch's uploads: `stopped` keeps workers from starting another clip, and each transfer
  // in flight can be cancelled. Both outlive renders, so a stop reaches every worker at once.
  const stopped = useRef(false);
  const transfers = useRef(new Set<ClipTransfer>());

  function stopUploads() {
    stopped.current = true;
    for (const transfer of transfers.current) transfer.stop();
    transfers.current.clear();
    // Clips cut off part-way can be sent again with Retry failed uploads.
    setClips((current) =>
      current.map((clip) =>
        clip.status === 'uploading' || clip.status === 'waiting'
          ? { ...clip, status: 'failed', error: 'Stopped.' }
          : clip,
      ),
    );
  }

  /** Shows a session as the server reports it, whichever request it came from. */
  function follow(next: WorkoutSession) {
    setSession(next);
    if (next.status === 'complete') setStep('complete');
    else if (!STILL_UPLOADABLE.includes(next.status)) setStep('processing');
    else setStep('progress');
  }

  /**
   * Stops every upload, then cancels the session once the server confirms it, and with `discard`
   * deletes it and its clips too. If processing had already started, the session can't be
   * cancelled: the screen shows its status instead. Resolves true once everything asked is done.
   */
  async function stopAndCancel(target: WorkoutSession, discard: boolean): Promise<boolean> {
    setPhase('stopping');
    stopUploads();
    setProcessFailed(false);
    setMessage(null);
    const check = guard();
    try {
      let cancelled: WorkoutSession;
      try {
        cancelled = await videoApi.cancel(target.id);
      } catch (reason) {
        if (!check.open()) return false;
        if (!(reason instanceof ApiError && reason.code === 'cannot_cancel')) {
          setMessage(errorMessage(reason));
          return false;
        }
        // Refused: read the session back to see why.
        let latest: WorkoutSession;
        try {
          latest = await videoApi.get(target.id);
        } catch (readFailure) {
          if (check.open()) setMessage(errorMessage(readFailure));
          return false;
        }
        if (!check.open()) return false;
        if (latest.id === target.id && latest.status === 'cancelled') {
          // An earlier cancel reached the server but its answer was lost: it is cancelled.
          cancelled = latest;
        } else if (processingBegan(latest.status)) {
          follow(latest);
          setMessage('Processing had already started, so this session carries on.');
          return false;
        } else {
          follow(latest);
          setMessage(errorMessage(reason));
          return false;
        }
      }
      if (!check.open()) return false;
      follow(cancelled);
      if (!discard) return true;
      try {
        await videoApi.remove(target.id);
      } catch (reason) {
        if (check.open())
          setMessage(`The session is cancelled but couldn’t be deleted. ${errorMessage(reason)}`);
        return false;
      }
      return true;
    } finally {
      setPhase('idle');
    }
  }

  // The batch exists only on this screen, so it can't be left while it is being created,
  // uploaded or started. Leaving an upload asks first, then stops every clip, cancels the session
  // and deletes it, and leaves only once the server has confirmed both. While a session is being
  // created or processing is starting, leaving waits.
  const holding = step === 'progress' || phase !== 'idle';
  // A leave confirmed by the server, waiting for the screen to stop holding. State, not a ref,
  // so setting it renders and the effect below runs even when nothing else changes.
  const [leave, setLeave] = useState<(() => void) | null>(null);
  // The open Stop and discard question, answered with what was chosen.
  const stopQuestion = useRef<Promise<'keep' | 'stop'> | null>(null);
  // The session as last shown, for handlers that run after the screen moved on.
  const latestSession = useRef<WorkoutSession | null>(null);
  useEffect(() => {
    latestSession.current = session;
  });

  /** Starts processing once any open Stop and discard question has been answered Keep. */
  async function startWhenAnswered(target: WorkoutSession) {
    const question = stopQuestion.current;
    if (question && (await question) === 'stop') return;
    if (currentPhase() === 'uploading') await beginProcessing(target);
  }
  usePreventRemove(holding, ({ repeat }) => {
    const reason = HOLD_REASONS[currentPhase()];
    if (reason) {
      showToast(reason);
      return;
    }
    const target = session;
    if (!target) {
      repeat();
      return;
    }
    // While the question is open, the batch doesn't start processing even if its last clip
    // finishes behind it (startWhenAnswered), so Stop and discard never races a start.
    let answer!: (choice: 'keep' | 'stop') => void;
    stopQuestion.current = new Promise((resolve) => (answer = resolve));
    const settle = (choice: 'keep' | 'stop') => {
      stopQuestion.current = null;
      answer(choice);
    };
    Alert.alert(
      'Stop and discard this upload?',
      'Uploading stops, and this session and the clips sent so far are deleted.',
      [
        { text: 'Keep uploading', style: 'cancel', onPress: () => settle('keep') },
        {
          text: 'Stop and discard',
          style: 'destructive',
          onPress: () => {
            settle('stop');
            // Checked again now: the batch may have moved on while the question was open.
            const latest = latestSession.current;
            if (
              currentPhase() === 'starting' ||
              currentPhase() === 'stopping' ||
              !latest ||
              latest.id !== target.id ||
              !STILL_UPLOADABLE.includes(latest.status)
            ) {
              if (latest && processingBegan(latest.status))
                setMessage('Processing had already started, so this session carries on.');
              return;
            }
            void stopAndCancel(target, true).then((done) => {
              // Leaves once the screen no longer holds; otherwise it stays with the reason shown.
              if (done) setLeave(() => repeat);
            });
          },
        },
      ],
      { cancelable: true, onDismiss: () => settle('keep') },
    );
  });
  useEffect(() => {
    if (!holding && leave) leave();
  }, [holding, leave]);

  // Signing out unmounts the screen: stop sending this account's clips.
  useEffect(() => {
    const running = transfers.current;
    return () => {
      stopped.current = true;
      for (const transfer of running) transfer.stop();
    };
  }, []);
  const inputStyle = useInputStyle();

  const sessionId = session?.id ?? null;
  const finished = session ? TERMINAL_SESSION_STATUSES.includes(session.status) : false;
  useEffect(() => {
    // One status check at a time: the next starts only after the last has answered, and a reply
    // that arrives after leaving this state is dropped. A late reply can't move a finished
    // session back (newerSession).
    if (!sessionId || step !== 'processing' || finished) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const next = await videoApi.get(sessionId);
        if (!active) return;
        setSession((current) => newerSession(current, next));
        if (next.status === 'complete') setStep('complete');
      } catch (reason) {
        if (active) setMessage(errorMessage(reason));
      } finally {
        if (active) timer = setTimeout(() => void check(), SESSION_POLL_MS);
      }
    };
    timer = setTimeout(() => void check(), SESSION_POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sessionId, step, finished]);

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
      while (next < selected.length && !stopped.current) {
        const clip = selected[next++];
        if (stopped.current) return;
        updateClip(clip.clientId, { status: 'uploading', progress: 0, error: undefined });
        const transfer = videoApi.uploadClip(
          target.id,
          clip,
          clips.findIndex((item) => item.clientId === clip.clientId),
          (progress) => {
            if (!stopped.current) updateClip(clip.clientId, { progress });
          },
        );
        transfers.current.add(transfer);
        try {
          await transfer.done;
          if (!stopped.current) updateClip(clip.clientId, { status: 'uploaded', progress: 100 });
        } catch (reason) {
          failed = true;
          if (stopped.current || reason instanceof UploadStopped) return;
          updateClip(clip.clientId, { status: 'failed', error: errorMessage(reason) });
        } finally {
          transfers.current.delete(transfer);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
    return !failed && !stopped.current;
  }

  /**
   * Starts processing the uploaded batch. When the answer is lost or refused, the session is read
   * back first: if the server already started it, the screen follows it; otherwise Start
   * processing stays offered. Retrying asks the same session again, so it can't make another.
   * Cancel and leaving wait while this runs.
   */
  async function beginProcessing(target: WorkoutSession) {
    setPhase('starting');
    setProcessFailed(false);
    const check = guard();
    try {
      try {
        const started = await videoApi.process(target.id);
        if (check.open()) follow(started);
        return;
      } catch (reason) {
        if (!check.open()) return;
        const alreadyStarted =
          reason instanceof ApiError && ALREADY_PROCESSING_CODES.includes(reason.code ?? '');
        try {
          const latest = await videoApi.get(target.id);
          if (!check.open()) return;
          if (alreadyStarted || !STILL_UPLOADABLE.includes(latest.status)) {
            follow(latest);
            return;
          }
        } catch {
          // Still unreachable: offer Start processing again below.
        }
        setProcessFailed(true);
        setMessage(errorMessage(reason));
      }
    } finally {
      if (currentPhase() === 'starting') setPhase('idle');
    }
  }

  async function startUpload() {
    if (!name.trim() || !date || !clips.length || busy || !ready) return;
    if (currentPhase() !== 'idle') return;
    setBusy(true);
    setMessage(null);
    stopped.current = false;
    setPhase('creating');
    const check = guard();
    try {
      const created = await videoApi.create({
        name: name.trim(),
        workout_date: date,
        notes: notes.trim() || null,
        expected_clip_count: clips.length,
      });
      if (!check.open()) return;
      setSession(created);
      setStep('progress');
      setPhase('uploading');
      const uploaded = await uploadClips(created, clips);
      if (uploaded && currentPhase() === 'uploading') await startWhenAnswered(created);
    } catch (reason) {
      if (check.open()) setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
      if (currentPhase() === 'creating' || currentPhase() === 'uploading') setPhase('idle');
    }
  }

  async function retryFailedUploads() {
    if (!session || busy || currentPhase() !== 'idle') return;
    setBusy(true);
    setMessage(null);
    stopped.current = false;
    setPhase('uploading');
    try {
      const failed = clips.filter((clip) => clip.status === 'failed');
      const uploaded = await uploadClips(session, failed);
      if (uploaded && currentPhase() === 'uploading') await startWhenAnswered(session);
    } finally {
      setBusy(false);
      if (currentPhase() === 'uploading') setPhase('idle');
    }
  }

  function cancelSession() {
    // Waits for a start that is on its way, so the two never cross.
    if (!session || currentPhase() === 'starting' || currentPhase() === 'stopping') return;
    void stopAndCancel(session, false);
  }

  async function retryProcessingStart(target: WorkoutSession) {
    if (busy || currentPhase() !== 'idle') return;
    setBusy(true);
    setMessage(null);
    try {
      await beginProcessing(target);
    } finally {
      setBusy(false);
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
    stopUploads();
    setProcessFailed(false);
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
            disabled={busy || phase !== 'idle'}
            onPress={() => void retryFailedUploads()}
          />
        )}
        {phase === 'starting' && (
          <Text style={[type.callout, { color: colors.secondary }]}>Starting processing…</Text>
        )}
        {processFailed && !failed && !busy && phase === 'idle' && (
          <Button label="Start processing" onPress={() => void retryProcessingStart(session)} />
        )}
        <Button
          label={phase === 'stopping' ? 'Stopping…' : 'Cancel session'}
          variant="secondary"
          disabled={phase === 'starting' || phase === 'stopping'}
          onPress={cancelSession}
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
      <ClipPreview uri={clip.uri} name={clip.name} />
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
