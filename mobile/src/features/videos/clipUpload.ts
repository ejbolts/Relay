import { File, Paths, UploadType, type UploadTask } from 'expo-file-system';
import type { Clip } from '../../../../frontend/src/types';
import { acceptedVideoName } from '../../../../frontend/src/videoSessions';
import { ApiError, apiOrigin, clientVersionHeaders } from '../../data/api';
import { newId } from '../../data/deviceStorage';
import { sessionToken } from '../../data/session';
import { uploadFile, UploadStopped } from '../../data/uploadFile';

const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';
const FAILED = 'Upload failed.';
// A phone video can be hundreds of megabytes on a slow connection.
const FALLBACK_TIMEOUT_MS = 30 * 60_000;
// How often a stopped transfer is cancelled again until it settles (see `stop`).
const CANCEL_AGAIN_MS = 250;

/** One clip on its way to the server, which can be stopped. */
export interface ClipTransfer {
  done: Promise<Clip>;
  stop: () => void;
}

export interface ClipFile {
  uri: string;
  name: string;
  type: string;
}

const fileNameOf = (uri: string) =>
  decodeURIComponent(uri.split(/[/?#]/).filter(Boolean).pop() ?? '');
const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'mp4';

/**
 * Uploads one clip straight from a file: the phone streams it from disk rather than building the
 * whole multipart body in memory (React Native's own multipart upload does that on iOS, which a
 * long original clip can exhaust). It sends the web's form fields, the session's bearer and the
 * app's version headers, and reports progress.
 *
 * - The server checks the uploaded file's extension, so a file whose own name has none (an
 *   Android `content://` video, say) is first copied into the cache under a name that does.
 * - Expo Go's file API reads only the project's own folders. Where it refuses the file, the clip
 *   goes through `uploadFile` (React Native's multipart upload) instead; that path still holds
 *   the body in memory on iOS, but only Expo Go takes it.
 * - The native transfer runs in a foreground session, so it ends with the app.
 */
export function startClipUpload(
  path: string,
  clip: ClipFile,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): ClipTransfer {
  let stopped = false;
  let settled = false;
  let task: UploadTask | null = null;
  let cancelAgain: ReturnType<typeof setInterval> | undefined;
  const controller = new AbortController();

  const fallback = () => {
    if (stopped) throw new UploadStopped();
    return uploadFile<Clip>(path, 'POST', clip, {
      fields,
      failure: FAILED,
      timeoutMs: FALLBACK_TIMEOUT_MS,
      onProgress,
      signal: controller.signal,
    });
  };

  async function send(): Promise<Clip> {
    const origin = new URL(apiOrigin!).origin;
    let source = new File(clip.uri);
    let copy: File | null = null;
    if (!acceptedVideoName(fileNameOf(clip.uri))) {
      try {
        copy = new File(Paths.cache, `relay-clip-${newId()}.${extensionOf(clip.name)}`);
        await source.copy(copy);
        source = copy;
      } catch {
        copy = null;
        return fallback();
      }
    }
    try {
      const token = await sessionToken(origin);
      if (stopped) throw new UploadStopped();
      let result: { body: string; status: number };
      try {
        const current = source.createUploadTask(origin + path, {
          httpMethod: 'POST',
          uploadType: UploadType.MULTIPART,
          fieldName: 'file',
          mimeType: clip.type,
          parameters: fields,
          headers: {
            ...clientVersionHeaders(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          sessionType: 'foreground',
          onProgress: ({ bytesSent, totalBytes }) => {
            // A cancel that reached the task before it started is lost natively; any sign of
            // life from a stopped transfer cancels it again.
            if (stopped) {
              current.cancel();
              return;
            }
            if (totalBytes > 0)
              onProgress(Math.min(100, Math.round((bytesSent / totalBytes) * 100)));
          },
        });
        task = current;
        if (stopped) throw new UploadStopped();
        result = await current.uploadAsync();
      } catch (caught) {
        if (stopped || caught instanceof UploadStopped) throw new UploadStopped();
        if (/permission/i.test(String(caught))) return await fallback();
        throw new Error(UNREACHABLE);
      }
      if (stopped) throw new UploadStopped();
      let body: { error?: { message?: string; code?: string } } | null = null;
      try {
        body = result.body ? JSON.parse(result.body) : null;
      } catch {
        body = null;
      }
      if (result.status >= 200 && result.status < 300) return body as Clip;
      throw new ApiError(result.status, body?.error?.message ?? FAILED, body?.error?.code);
    } finally {
      try {
        copy?.delete();
      } catch {
        // The cache is cleared by the system in time.
      }
    }
  }

  const done = send().finally(() => {
    settled = true;
    clearInterval(cancelAgain);
  });

  return {
    done,
    stop() {
      if (stopped) return;
      stopped = true;
      controller.abort();
      task?.cancel();
      // The native task can start after a cancel and reset its cancelled flag (on both platforms),
      // so the cancel is repeated until the transfer settles. The server-side session cancel that
      // follows a stop refuses any clip that still arrives.
      if (!settled)
        cancelAgain = setInterval(() => {
          if (settled) clearInterval(cancelAgain);
          else task?.cancel();
        }, CANCEL_AGAIN_MS);
    },
  };
}
