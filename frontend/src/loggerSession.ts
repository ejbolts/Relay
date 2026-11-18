/** Which live workout the mounted logger belongs to, so it is rebuilt only for another session. */
export interface LoggerSession {
  workout: string;
  /** The draft's session id when the logger was mounted; empty before the draft had one. */
  mountedId: string;
  /** The id a logger mounted without one gave its own draft on its first save. */
  ownId: string | null;
}

/**
 * A new workout mounts before its draft exists, and the logger names the session on its first
 * save. That first name belongs to the logger already on screen, so it must not rebuild it:
 * a rebuild drops whatever it loaded on arrival, such as the last-used machine. A different id
 * is another device's session and does need a fresh logger.
 */
export function nextLoggerSession(
  previous: LoggerSession | null,
  workout: string,
  draftSessionId: string | undefined,
): LoggerSession {
  const id = draftSessionId ?? '';
  if (!previous || previous.workout !== workout) return { workout, mountedId: id, ownId: null };
  if (!id || id === previous.mountedId || id === previous.ownId) return previous;
  if (!previous.mountedId && previous.ownId === null) return { ...previous, ownId: id };
  return { workout, mountedId: id, ownId: null };
}

export const loggerSessionKey = (session: LoggerSession) =>
  `active-${session.workout}-${session.mountedId}`;
