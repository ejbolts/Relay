import { apiOrigin, ApiError, clientVersionHeaders } from './api';
import { sessionToken } from './session';

const TIMEOUT_MS = 60_000;
const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';

/** An upload stopped on purpose, through its `signal`, rather than one that failed. */
export class UploadStopped extends Error {
  constructor() {
    super('Upload stopped.');
    this.name = 'UploadStopped';
  }
}

/**
 * Sends a file on the phone (a picked photo's `file://` URI) as a multipart form, signed in like
 * every other request. Expo replaces the global `fetch` with `expo/fetch`, which can't send React
 * Native's `{ uri }` form parts, so this uses React Native's XMLHttpRequest, which streams them.
 * `fields` go in the same form before the file; `failure` is shown when the server gives no
 * reason.
 */
export async function uploadFile<T>(
  path: string,
  method: 'POST' | 'PUT',
  file: { uri: string; name: string; type: string },
  {
    field = 'file',
    fields = {},
    failure = 'Relay could not complete this request.',
    timeoutMs = TIMEOUT_MS,
    onProgress,
    signal,
  }: {
    field?: string;
    fields?: Record<string, string>;
    failure?: string;
    /** Large files, such as workout videos, need longer than a photo. */
    timeoutMs?: number;
    /** The share sent so far, from 0 to 100. */
    onProgress?: (percent: number) => void;
    /** Aborting stops the upload and rejects with `UploadStopped`. */
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const origin = new URL(apiOrigin!).origin;
  const token = await sessionToken(origin);
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append(field, file as unknown as Blob);
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, origin + path);
    xhr.timeout = timeoutMs;
    if (onProgress)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // The release and build headers every other request sends, so uploads count and gate alike.
    for (const [name, value] of Object.entries(clientVersionHeaders()))
      xhr.setRequestHeader(name, value);
    xhr.withCredentials = false;
    if (signal) {
      if (signal.aborted) {
        reject(new UploadStopped());
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.onabort = () => reject(new UploadStopped());
    }
    xhr.onerror = () => reject(new Error(UNREACHABLE));
    xhr.ontimeout = () => reject(new Error(UNREACHABLE));
    xhr.onload = () => {
      let body: { error?: { message?: string; code?: string } } | null = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body?.error?.message ?? failure, body?.error?.code));
    };
    xhr.send(form);
  });
}
