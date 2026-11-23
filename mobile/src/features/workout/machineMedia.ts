import { useEffect, useState } from 'react';
import type { MachinePhoto, MachineSetting } from '../../../../frontend/src/types';
import { ApiError, apiOrigin } from '../../data/api';
import { sessionToken } from '../../data/session';

// Machine photos are private to their owner, so both reading and uploading them sign in like
// every other request. React Native's XMLHttpRequest is used for both: Android's <Image> drops a
// bearer header, and Expo's fetch can't send a picked file's `{ uri }` form part.

const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';
const images = new Map<string, Promise<string | null>>();

async function signedIn() {
  const origin = new URL(apiOrigin!).origin;
  return { origin, token: await sessionToken(origin) };
}

/** A signed-in image as a data URI, or null when it can't be read. Kept for the session. */
function loadImage(url: string): Promise<string | null> {
  const cached = images.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const { origin, token } = await signedIn();
    if (!token) return null;
    return new Promise<string | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', /^https?:/.test(url) ? url : origin + url);
      xhr.responseType = 'blob';
      xhr.timeout = 15_000;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onerror = xhr.ontimeout = () => resolve(null);
      xhr.onload = () => {
        if (xhr.status !== 200) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(xhr.response);
      };
      xhr.send();
    });
  })();
  images.set(url, promise);
  // A failure is tried again next time rather than remembered.
  void promise.then((result) => {
    if (!result) images.delete(url);
  });
  return promise;
}

/** A machine photo's thumbnail (or any signed-in image) to show, once it has loaded. */
export function useAccountImage(url: string | null | undefined): string | null {
  const [image, setImage] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url || !apiOrigin) return;
    let active = true;
    void loadImage(url).then((uri) => {
      if (active) setImage({ url, uri });
    });
    return () => {
      active = false;
    };
  }, [url]);
  return image && image.url === url ? image.uri : null;
}

/** Saves a photo of a machine for an exercise, with its name and settings, as the web does. */
export async function uploadMachinePhoto(
  exerciseId: string,
  file: { uri: string; name: string; type: string },
  caption: string,
  settings: MachineSetting[],
): Promise<MachinePhoto> {
  const { origin, token } = await signedIn();
  const form = new FormData();
  form.append('caption', caption);
  form.append('machine_settings', JSON.stringify({ settings }));
  form.append('file', file as unknown as Blob);
  return new Promise<MachinePhoto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${origin}/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos`);
    xhr.timeout = 60_000;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onerror = xhr.ontimeout = () => reject(new Error(UNREACHABLE));
    xhr.onload = () => {
      let body: { error?: { message?: string } } | null = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as MachinePhoto);
      else
        reject(
          new ApiError(xhr.status, body?.error?.message ?? 'Relay could not save this photo.'),
        );
    };
    xhr.send(form);
  });
}
