import Constants, { ExecutionEnvironment } from 'expo-constants';
import { File, Paths, UploadType, type UploadTask } from 'expo-file-system';
import type { Clip } from '../../../../frontend/src/types';
import { acceptedVideoName } from '../../../../frontend/src/videoSessions';
import { ApiError, apiOrigin, clientVersionHeaders } from '../../data/api';
import { newId } from '../../data/deviceStorage';
import { sessionToken } from '../../data/session';
import { uploadFile, UploadStopped } from '../../data/uploadFile';

const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';
const FAILED = 'Upload failed.';
const UNREADABLE = 'Relay couldn’t read this video on your phone. Pick it again, then try again.';
// A phone video can be hundreds of megabytes on a slow connection.
const FALLBACK_TIMEOUT_MS = 30 * 60_000;

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
const refusedRead = (error: unknown) => /permission/i.test(String(error));
/** Expo Go, whose file API may read only the project's own folders. */
const inExpoGo = () => Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Uploads one clip straight from a file: the phone streams it from disk rather than building the
 * whole multipart body in memory (React Native's own multipart upload does that on iOS, which a
 * long original clip can exhaust). It sends the web's form fields, the session's bearer and the
 * app's version headers, and reports progress.
 *
 * - The server checks the uploaded file's extension, so a file whose own name has none (an
 *   Android `content://` video, say) is first copied into the cache under a name that does.
 * - Only in Expo Go, where the file API may refuse to read a picked file, does the clip go
 *   through `uploadFile` (React Native's multipart upload) instead. That path holds the body in
 *   memory on iOS, so an installed app reports a file it can't read or copy as an error.
 * - The native transfer runs in a foreground session, so it ends with the app.
 * - Stopping cancels the native transfer once. Expo's task can lose a cancel that arrives
 *   before its native start, so a stopped transfer that still completes is reported as stopped
 *   (its result is ignored), and the server refuses a clip that finishes after its session was
 *   cancelled or deleted.
 */
export function startClipUpload(
  path: string,
  clip: ClipFile,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
  boundToken?: string,
): ClipTransfer {
  let stopped = false;
  let task: UploadTask | null = null;
  const controller = new AbortController();

  const fallback = () => {
    if (stopped) throw new UploadStopped();
    return uploadFile<Clip>(path, 'POST', clip, {
      fields,
      failure: FAILED,
      timeoutMs: FALLBACK_TIMEOUT_MS,
      onProgress,
      signal: controller.signal,
      ...(boundToken !== undefined ? { token: boundToken } : {}),
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
      } catch (caught) {
        copy = null;
        if (inExpoGo() && refusedRead(caught)) return fallback();
        throw new Error(UNREADABLE);
      }
    }
    try {
      const token = boundToken ?? (await sessionToken(origin));
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
            if (!stopped && totalBytes > 0)
              onProgress(Math.min(100, Math.round((bytesSent / totalBytes) * 100)));
          },
        });
        task = current;
        if (stopped) throw new UploadStopped();
        result = await current.uploadAsync();
      } catch (caught) {
        if (stopped || caught instanceof UploadStopped) throw new UploadStopped();
        if (refusedRead(caught)) {
          if (inExpoGo()) return await fallback();
          throw new Error(UNREADABLE);
        }
        throw new Error(UNREACHABLE);
      }
      // A stopped transfer that completed anyway (its cancel was lost) changes nothing here.
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

  return {
    done: send(),
    stop() {
      if (stopped) return;
      stopped = true;
      controller.abort();
      task?.cancel();
    },
  };
}
