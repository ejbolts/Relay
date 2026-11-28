import { useEffect, useRef, useState } from 'react';
import { friendInviteIdFromScan, openFriendInvite } from './friendInvite';
import { Icon } from './Icon';
import { openTrainInvite, trainInviteTokenFromScan } from './trainTogetherInvite';

/*
 * Scans a friend's QR code with the camera without leaving Relay. An installed web app on
 * iPhone cannot receive links from the system camera (they open in Safari, with its own
 * sign-in), so scanning has to happen here. If Relay becomes a native app with universal or
 * app links, the system camera could open friend links directly in the app and this scanner
 * may no longer be needed; keep the #friend=<account id> link format so printed codes still work.
 */

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error';
type Notice = 'not-friend-code' | 'not-relay-code' | 'own-code' | null;

const SCAN_INTERVAL_MS = 120;
const MAX_FRAME_SIZE = 640;

const CAMERA_MESSAGES: Record<Exclude<CameraState, 'starting' | 'scanning'>, string> = {
  denied: 'Allow camera access to scan a code.',
  unavailable: 'No camera is available here.',
  error: 'The camera could not start.',
};

function cameraStateFor(reason: unknown): CameraState {
  const name = reason instanceof DOMException ? reason.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable';
  return 'error';
}

export function FriendQrScanner({
  userId,
  mode = 'friend',
  paused = false,
  onScanned,
  onScannedTrain,
}: {
  userId: string;
  mode?: 'friend' | 'train';
  paused?: boolean;
  onScanned?: (accountId: string) => void;
  onScannedTrain?: (token: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [notice, setNotice] = useState<Notice>(null);
  const [attempt, setAttempt] = useState(0);
  const onScannedRef = useRef(onScanned);
  onScannedRef.current = onScanned;
  const onScannedTrainRef = useRef(onScannedTrain);
  onScannedTrainRef.current = onScannedTrain;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const lastTrainTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!paused) lastTrainTokenRef.current = null;
  }, [paused]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    async function start() {
      const canvas =
        typeof navigator.mediaDevices?.getUserMedia === 'function'
          ? document.createElement('canvas')
          : null;
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !context) {
        setCamera('unavailable');
        return;
      }
      setCamera('starting');
      try {
        const [media, decoder] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          }),
          // Loaded only when someone scans, so the decoder stays out of the main bundle.
          import('jsqr'),
        ]);
        stream = media;
        if (stopped || !video.current) return;
        video.current.srcObject = media;
        await video.current.play();
        if (stopped) return;
        setCamera('scanning');
        let last = 0;
        const scan = (time: number) => {
          if (stopped) return;
          frame = requestAnimationFrame(scan);
          const source = video.current;
          if (!source || time - last < SCAN_INTERVAL_MS || source.readyState < 2) return;
          last = time;
          const scale = Math.min(
            1,
            MAX_FRAME_SIZE / Math.max(source.videoWidth, source.videoHeight),
          );
          const width = Math.round(source.videoWidth * scale);
          const height = Math.round(source.videoHeight * scale);
          if (!width || !height) return;
          canvas.width = width;
          canvas.height = height;
          context.drawImage(source, 0, 0, width, height);
          const image = context.getImageData(0, 0, width, height);
          const code = decoder.default(image.data, width, height, {
            inversionAttempts: 'dontInvert',
          });
          if (pausedRef.current) return;
          if (!code) {
            lastTrainTokenRef.current = null;
            return;
          }
          const trainToken = trainInviteTokenFromScan(code.data);
          if (trainToken) {
            if (mode === 'train') {
              if (lastTrainTokenRef.current === trainToken) return;
              lastTrainTokenRef.current = trainToken;
              setNotice(null);
              if (onScannedTrainRef.current) onScannedTrainRef.current(trainToken);
              else openTrainInvite(trainToken);
            } else {
              stopped = true;
              cancelAnimationFrame(frame);
              if (onScannedTrainRef.current) onScannedTrainRef.current(trainToken);
              else openTrainInvite(trainToken);
            }
            return;
          }
          const id = friendInviteIdFromScan(code.data);
          if (!id) setNotice(mode === 'train' ? 'not-relay-code' : 'not-friend-code');
          else if (id === userId) setNotice('own-code');
          else {
            stopped = true;
            cancelAnimationFrame(frame);
            if (onScannedRef.current) onScannedRef.current(id);
            else openFriendInvite(id);
          }
        };
        frame = requestAnimationFrame(scan);
      } catch (reason) {
        if (!stopped) setCamera(cameraStateFor(reason));
      }
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [userId, mode, attempt]);

  const failed = camera === 'denied' || camera === 'unavailable' || camera === 'error';
  return (
    <div className="friend-invite-body">
      <div className="friend-scan-frame" aria-busy={camera === 'starting'}>
        <video ref={video} muted playsInline aria-label="Camera view for scanning a QR code" />
        {camera === 'scanning' && <span className="friend-scan-guide" aria-hidden="true" />}
        {failed && (
          <div className="friend-scan-problem">
            <Icon name="camera" />
            <p role="alert">{CAMERA_MESSAGES[camera]}</p>
            {camera !== 'unavailable' && (
              <button
                type="button"
                className="profile-secondary"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
      <p className="friend-scan-notice" role="status">
        {notice === 'not-friend-code'
          ? 'That isn’t a Relay friend code.'
          : notice === 'not-relay-code'
            ? 'That isn’t a Relay code.'
            : notice === 'own-code'
              ? 'That’s your own code.'
              : ''}
      </p>
    </div>
  );
}
