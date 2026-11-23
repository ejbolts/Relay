import { File, UploadType } from 'expo-file-system';
import type { Clip } from '../../../../frontend/src/types';
import { acceptedVideoName } from '../../../../frontend/src/videoSessions';
import { ApiError, apiOrigin, clientVersionHeaders } from '../../data/api';
import { sessionToken } from '../../data/session';
import { uploadFile, UploadStopped } from '../../data/uploadFile';

const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';
const FAILED = 'Upload failed.';
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

/**
 * Uploads one clip straight from its file: the phone streams it from disk rather than building
 * the whole multipart body in memory (React Native's own multipart upload does that on iOS, which
 * a long original clip can exhaust). It sends the web's form fields, the session's bearer and the
 * app's version headers, and reports progress.
 *
 * Expo Go's file API reads only the project's own folders. Where it refuses a picked file, or the
 * file's own name lacks the video extension the server checks, the clip goes through
 * `uploadFile` (React Native's multipart upload) instead.
 */
export function startClipUpload(
  path: string,
  clip: ClipFile,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): ClipTransfer {
  let stopped = false;
  let stopCurrent = () => {};
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
    const fileName = decodeURIComponent(clip.uri.split('/').pop() ?? '');
    if (!acceptedVideoName(fileName)) return fallback();
    const token = await sessionToken(origin);
    if (stopped) throw new UploadStopped();
    let result: { body: string; status: number };
    try {
      const task = new File(clip.uri).createUploadTask(origin + path, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: clip.type,
        parameters: fields,
        headers: {
          ...clientVersionHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) onProgress(Math.min(100, Math.round((bytesSent / totalBytes) * 100)));
        },
      });
      stopCurrent = () => task.cancel();
      result = await task.uploadAsync();
    } catch (caught) {
      if (stopped) throw new UploadStopped();
      if (/permission/i.test(String(caught))) return fallback();
      throw new Error(UNREACHABLE);
    }
    let body: { error?: { message?: string; code?: string } } | null = null;
    try {
      body = result.body ? JSON.parse(result.body) : null;
    } catch {
      body = null;
    }
    if (result.status >= 200 && result.status < 300) return body as Clip;
    throw new ApiError(result.status, body?.error?.message ?? FAILED, body?.error?.code);
  }

  return {
    done: send(),
    stop() {
      stopped = true;
      stopCurrent();
      controller.abort();
    },
  };
}
