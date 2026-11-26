import { useEffect, useState } from 'react';
import { apiOrigin, clientVersionHeaders } from './api';
import { sessionToken } from './session';

// Images the API serves only to signed-in members (profile and workout photos), as data URIs.
// Android's <Image> drops the bearer header of an image request, so the server answers 401;
// React Native's XMLHttpRequest sends it. Each upload gets a new URL, so a cached image never
// goes stale. The cache keeps the most recent images only.
const MAX_CACHED = 60;
const loaded = new Map<string, Promise<string | null>>();
/** Synchronous mirror of resolved images so remounting an Avatar never flashes initials. */
const resolved = new Map<string, string>();

function remember(url: string, promise: Promise<string | null>) {
  loaded.delete(url);
  loaded.set(url, promise);
  while (loaded.size > MAX_CACHED) {
    const oldest = loaded.keys().next().value!;
    loaded.delete(oldest);
    resolved.delete(oldest);
  }
}

/** Seeds a freshly uploaded image URL with its local preview URI so views show it at once. */
export function rememberAuthorisedImage(url: string, uri: string) {
  resolved.set(url, uri);
  remember(url, Promise.resolve(uri));
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
    // Bound to the session when asked for: none, or a change before it was read, loads nothing.
    const token = await sessionToken(origin).catch(() => null);
    if (!token) return null;
    return new Promise<string | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', /^https?:/.test(url) ? url : origin + url);
      xhr.responseType = 'blob';
      xhr.timeout = 15_000;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      for (const [name, value] of Object.entries(clientVersionHeaders()))
        xhr.setRequestHeader(name, value);
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
    if (loaded.get(url) !== promise) return;
    if (result) resolved.set(url, result);
    else loaded.delete(url);
  });
  return promise;
}

/** The image at `url` as a data URI once it has loaded, else null. */
export function useAuthorisedImage(url: string | null | undefined): string | null {
  const cached = url ? (resolved.get(url) ?? null) : null;
  const [image, setImage] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url || resolved.has(url)) return;
    let cancelled = false;
    void loadAuthorisedImage(url).then((uri) => {
      if (!cancelled) setImage({ url, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!url) return null;
  if (cached) return cached;
  return image?.url === url ? image.uri : null;
}
