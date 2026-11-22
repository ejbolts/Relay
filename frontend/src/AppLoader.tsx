import { useEffect, useState } from 'react';
import { loadApp, loadedApp, type AppModule } from './appLoad';
import { AuthLoading, AuthUnreachable } from './AuthGate';

type Load = { app: AppModule | null; failed: boolean };

/**
 * The signed-in app, behind Home's outline until its file has arrived. It shows the moment the
 * file is in: a Suspense boundary would hold it back for a fraction of a second after showing
 * the outline, which is most of the time a returning device needs to open.
 *
 * When the file cannot be downloaded (no connection on a first visit, or a new release replaced
 * it since this page loaded) it offers to try again, which reloads the page and its files.
 */
export function AppLoader({
  load,
  onRetry = () => window.location.reload(),
}: {
  /** Replaces the download. For tests. */
  load?: () => Promise<AppModule>;
  onRetry?: () => void;
}) {
  const [state, setState] = useState<Load>(() => ({ app: loadedApp(), failed: false }));
  useEffect(() => {
    let current = true;
    loadApp(load).then(
      (app) => {
        if (current) setState({ app, failed: false });
      },
      () => {
        if (current) setState({ app: null, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [load]);

  if (state.failed)
    return (
      <AuthUnreachable
        message="Relay could not finish loading. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  if (!state.app) return <AuthLoading />;
  const { App } = state.app;
  return <App />;
}
