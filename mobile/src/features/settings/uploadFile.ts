import { apiOrigin, ApiError } from '../../data/api';
import { sessionToken } from '../../data/session';

const TIMEOUT_MS = 60_000;
const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';

/**
 * Sends a file on the phone (a picked photo's `file://` URI) as a multipart form, signed in like
 * every other request. Expo replaces the global `fetch` with `expo/fetch`, which can't send React
 * Native's `{ uri }` form parts, so this uses React Native's XMLHttpRequest, which streams them.
 */
export async function uploadFile<T>(
  path: string,
  method: 'POST' | 'PUT',
  file: { uri: string; name: string; type: string },
  field = 'file',
): Promise<T> {
  const origin = new URL(apiOrigin!).origin;
  const token = await sessionToken(origin);
  const form = new FormData();
  form.append(field, file as unknown as Blob);
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, origin + path);
    xhr.timeout = TIMEOUT_MS;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.withCredentials = false;
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
      else
        reject(
          new ApiError(
            xhr.status,
            body?.error?.message ?? 'Relay could not complete this request.',
            body?.error?.code,
          ),
        );
    };
    xhr.send(form);
  });
}
