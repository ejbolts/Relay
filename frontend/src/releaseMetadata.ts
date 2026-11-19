export interface ReleaseImage {
  url: string;
  alt: string;
}

/** A muted, looping trailer bundled with the app under /releases/. */
export interface ReleaseVideo {
  url: string;
  /** Still frame shown before playback and instead of a video that cannot play. */
  poster: string;
  alt: string;
}

export interface ReleaseHighlight {
  title: string;
  description: string;
  image: ReleaseImage;
}

export interface Release {
  version: string;
  /** Calendar date of these release notes, without a timezone. Optional for older servers. */
  date?: string;
  title: string;
  summary: string;
  changes: string[];
  url: string;
  image?: ReleaseImage;
  /** Shown above the summary; older clients ignore it and use the image or highlights. */
  video?: ReleaseVideo;
  /** Ordered feature previews, shown before the change list. Image is the older-client fallback. */
  highlights?: ReleaseHighlight[];
  /**
   * Set on a silent patch: the earlier release of the same minor whose notes this file still
   * carries. The app keeps announcing that release, so the patch shows no new notes.
   */
  notesVersion?: string;
  /** A silent patch's changes, held back for the next minor or major release's notes. */
  silentChanges?: string[];
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validImage(value: unknown): value is ReleaseImage {
  if (!value || typeof value !== 'object') return false;
  const image = value as Partial<ReleaseImage>;
  return (
    text(image.alt) &&
    text(image.url) &&
    /^https:\/\/raw\.githubusercontent\.com\/[^\s\\]+$/.test(image.url)
  );
}

// Same-origin files keep their video/mp4 type and byte-range support, which iOS needs to play them.
function bundledAsset(value: unknown, extensions: RegExp): value is string {
  return typeof value === 'string' && /^\/releases\/[\w.-]+$/.test(value) && extensions.test(value);
}

function validVideo(value: unknown): value is ReleaseVideo {
  if (!value || typeof value !== 'object') return false;
  const video = value as Partial<ReleaseVideo>;
  return (
    text(video.alt) &&
    bundledAsset(video.url, /\.mp4$/) &&
    bundledAsset(video.poster, /\.(?:jpe?g|png|webp)$/)
  );
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatReleaseDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Shortens a `.0` patch release for headings, so 1.0.0 reads as 1.0. */
export function formatReleaseVersion(version: string): string {
  return version.replace(/^(\d+\.\d+)\.0$/, '$1');
}

/** Reject incomplete notes and unsafe links before displaying a server response. */
export function parseRelease(value: unknown): Release | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Partial<Release>;
  if (
    !text(release.version) ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version) ||
    !text(release.title) ||
    !text(release.summary) ||
    !Array.isArray(release.changes) ||
    !release.changes.length ||
    !release.changes.every(text) ||
    !text(release.url)
  ) {
    return null;
  }
  if (!/^https:\/\/github\.com\/[^\s\\]+$/.test(release.url)) {
    return null;
  }
  if (release.date !== undefined && !validDate(release.date)) return null;
  if (!validSilentPatch(release)) return null;
  if (release.image !== undefined && !validImage(release.image)) return null;
  if (release.video !== undefined && !validVideo(release.video)) return null;
  if (
    release.highlights !== undefined &&
    (!Array.isArray(release.highlights) ||
      !release.highlights.length ||
      !release.highlights.every(
        (highlight) =>
          highlight &&
          text(highlight.title) &&
          text(highlight.description) &&
          validImage(highlight.image),
      ))
  )
    return null;
  return release as Release;
}

/**
 * A silent patch names the announced release it follows, an earlier patch of the same minor, and
 * lists what it changed so the next minor or major release can announce it. Both or neither.
 */
function validSilentPatch(release: Partial<Release>): boolean {
  const { notesVersion, silentChanges } = release;
  if (notesVersion === undefined && silentChanges === undefined) return true;
  if (
    !text(notesVersion) ||
    !/^\d+\.\d+\.\d+$/.test(notesVersion) ||
    !Array.isArray(silentChanges) ||
    !silentChanges.length ||
    !silentChanges.every(text)
  ) {
    return false;
  }
  const [major, minor] = release.version!.split('.');
  const [notesMajor, notesMinor] = notesVersion.split('.');
  return (
    major === notesMajor &&
    minor === notesMinor &&
    compareVersions(notesVersion, release.version!) < 0
  );
}

/** The version whose notes are shown and announced: the running one, unless it is a silent patch. */
export function announcedVersion(release: Release): string {
  return release.notesVersion ?? release.version;
}

/** The notes to show for a release, under the version they announce. */
export function announcedRelease(release: Release): Release {
  if (release.notesVersion === undefined) return release;
  const notes: Release = { ...release, version: release.notesVersion };
  delete notes.notesVersion;
  delete notes.silentChanges;
  return notes;
}

/** Compare the numeric `major.minor.patch` parts of two release versions. */
export function compareVersions(left: string, right: string): number {
  const parts = (version: string) => version.split('-')[0].split('.').map(Number);
  const [a, b] = [parts(left), parts(right)];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** Accept earlier releases only when each is valid, unique and listed newest first. */
export function parseReleaseHistory(value: unknown, currentVersion: string): Release[] | null {
  if (!Array.isArray(value)) return null;
  const releases = value.map(parseRelease);
  let newer = currentVersion;
  for (const release of releases) {
    // Earlier versions lists announced releases only; a silent patch's changes join the next one.
    if (!release || release.notesVersion || compareVersions(release.version, newer) >= 0) {
      return null;
    }
    newer = release.version;
  }
  return releases as Release[];
}
