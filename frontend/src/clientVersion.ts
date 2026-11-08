import releaseMetadata from '../release.json';

/** Sent with every API request so the server can see which release is saving. */
export const CLIENT_VERSION_HEADER = 'X-Relay-Version';
export const CLIENT_VERSION: string = releaseMetadata.version;
/** The server's answer to a save from a release older than it accepts. */
export const CLIENT_OUTDATED_CODE = 'client_outdated';

export function withClientVersion(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set(CLIENT_VERSION_HEADER, CLIENT_VERSION);
  return next;
}

export function isClientOutdated(status: number, code: string | undefined): boolean {
  return status === 426 && code === CLIENT_OUTDATED_CODE;
}
