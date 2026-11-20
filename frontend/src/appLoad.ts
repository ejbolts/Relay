export type AppModule = typeof import('./App');

let loading: Promise<AppModule> | null = null;
let loaded: AppModule | null = null;

/**
 * The signed-in app is most of the download, so it is a file of its own. The first file only
 * holds what shows before it: the sign-in screen, or Home's outline. That appears sooner on a
 * device that has never opened Relay, while this loads behind it.
 */
export function loadApp(
  load: () => Promise<AppModule> = () => import('./App'),
): Promise<AppModule> {
  if (!loading) {
    const started = load();
    loading = started;
    started.then(
      (module) => {
        if (loading === started) loaded = module;
      },
      () => undefined,
    );
  }
  return loading;
}

/** The signed-in app when its file has already arrived, so it can show without a pause. */
export function loadedApp(): AppModule | null {
  return loaded;
}

/**
 * Starts loading the signed-in app as the page starts, whether or not anyone is signed in yet,
 * so it is usually ready by the time it is needed. Settles either way once the load has ended.
 */
export function preloadApp(load?: () => Promise<AppModule>): Promise<void> {
  return loadApp(load).then(
    () => undefined,
    () => undefined,
  );
}

/** Forgets a load so the next one starts again. For tests. */
export function resetAppLoad(): void {
  loading = null;
  loaded = null;
}
