import { useEffect, useState } from 'react';
import { apiOrigin } from './api';
import { sessionToken } from './session';

// Images the API serves only to signed-in members (profile and workout photos), as data URIs.
// Android's <Image> drops the bearer header of an image request, so the server answers 401;
// React Native's XMLHttpRequest sends it. Each upload gets a new URL, so a cached image never
// goes stale. The cache keeps the most recent images only.
const MAX_CACHED = 60;
const loaded = new Map<string, Promise<string | null>>();

function remember(url: string, promise: Promise<string | null>) {
  loaded.delete(url);
  loaded.set(url, promise);
  while (loaded.size > MAX_CACHED) loaded.delete(loaded.keys().next().value!);
}

/** Reads a signed-in image as a data URI, or null when it can't be read. */
export function loadAuthorisedImage(url: string): Promise<string | null> {
  const cached = loaded.get(url);
  if (cached) {
    remember(url, cached);
    return cached;
  }
  const promise = (async () => {
    if (!apiOrigin) return null;
    const origin = new URL(apiOrigin).origin;
    const token = await sessionToken(origin);
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
  remember(url, promise);
  // A failure is tried again next time rather than remembered.
  void promise.then((result) => {
    if (!result) loaded.delete(url);
  });
  return promise;
}

/** The image at `url` as a data URI once it has loaded, else null. */
export function useAuthorisedImage(url: string | null | undefined): string | null {
  const [image, setImage] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void loadAuthorisedImage(url).then((uri) => {
      if (!cancelled) setImage({ url, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url && image?.url === url ? image.uri : null;
}
