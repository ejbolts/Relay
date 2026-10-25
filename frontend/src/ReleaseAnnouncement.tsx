import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import {
  formatReleaseDate,
  type Release,
  type ReleaseHighlight,
  type ReleaseVideo,
} from './releaseMetadata';

/** A small party popper beside the version in the What's new header. */
function ReleaseConfetti() {
  return (
    <svg className="release-confetti" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="release-confetti-cone" d="M2.8 21.2 7.5 9.3l7.2 7.2z" />
      <path className="release-confetti-stripe" d="M5.1 15.3l3.6 3.6M6.4 12l5.6 5.6" />
      <path
        className="release-confetti-streamer"
        d="M10.2 8.6c-.4-2.4 1-4 3.2-3.8M15.4 13.8c2.4.4 4-1 3.8-3.2"
      />
      <circle className="release-confetti-blue" cx="16.6" cy="3.6" r="1.2" />
      <circle className="release-confetti-green" cx="20.6" cy="8" r="1.1" />
      <rect
        className="release-confetti-pink"
        x="18.4"
        y="14.6"
        width="2.4"
        height="2.4"
        rx=".5"
        transform="rotate(25 19.6 15.8)"
      />
      <rect
        className="release-confetti-gold"
        x="11.2"
        y="1.4"
        width="2"
        height="2"
        rx=".4"
        transform="rotate(-20 12.2 2.4)"
      />
    </svg>
  );
}

function ReleaseDate({ release }: { release: Release }) {
  return release.date ? (
    <time className="release-date" dateTime={release.date}>
      {formatReleaseDate(release.date)}
    </time>
  ) : (
    <span className="release-date">Date not recorded</span>
  );
}

function ReleaseTrailer({ video }: { video: ReleaseVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.volume = 0.5;
    element.muted = false;
  }, []);

  return (
    <figure className="release-trailer">
      {failed ? (
        <img src={video.poster} alt={video.alt} decoding="async" />
      ) : (
        <video
          ref={ref}
          src={video.url}
          poster={video.poster}
          aria-label={video.alt}
          loop
          playsInline
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
    </figure>
  );
}

function ReleaseScreenshot({
  image,
  highlight,
  index = 0,
}: {
  image: NonNullable<Release['image']>;
  highlight?: ReleaseHighlight;
  index?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed && !highlight) return null;

  return (
    <figure className={`release-screenshot${highlight ? ' release-feature' : ''}`}>
      {!failed && (
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          aria-label={highlight ? `View ${highlight.title} full size` : undefined}
        >
          <img
            src={image.url}
            alt={image.alt}
            referrerPolicy="no-referrer"
            decoding="async"
            loading={index === 0 ? 'eager' : 'lazy'}
            onError={() => setFailed(true)}
          />
        </a>
      )}
      <figcaption>
        {highlight ? (
          <>
            <h4>{highlight.title}</h4>
            <p>{highlight.description}</p>
          </>
        ) : (
          <>{image.alt} Select the image to view it full size.</>
        )}
      </figcaption>
    </figure>
  );
}

function ReleaseDetails({ release, linkLabel }: { release: Release; linkLabel: string }) {
  return (
    <>
      {release.highlights ? (
        <div className="release-showcase" role="group" aria-label="Release highlights">
          {release.highlights.map((highlight, index) => (
            <ReleaseScreenshot
              key={highlight.title}
              image={highlight.image}
              highlight={highlight}
              index={index}
            />
          ))}
        </div>
      ) : (
        release.image && <ReleaseScreenshot key={release.image.url} image={release.image} />
      )}
      <ul>
        {release.changes.map((change, index) => (
          <li key={index}>{change}</li>
        ))}
      </ul>
      <a href={release.url} target="_blank" rel="noopener noreferrer">
        {linkLabel} <span aria-hidden="true">↗</span>
      </a>
    </>
  );
}

function EarlierRelease({ release }: { release: Release }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <li className={`release-history-item ${open ? 'open' : ''}`.trim()}>
      <h4>
        <button
          type="button"
          className="release-history-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="release-history-version num">{release.version}</span>
          <span className="release-history-copy">
            <span className="release-history-title">{release.title}</span>
            <ReleaseDate release={release} />
          </span>
          <span className="release-chevron" aria-hidden="true">
            <Icon name="chevron-down" />
          </span>
        </button>
      </h4>
      <div id={detailsId} className="release-history-details" hidden={!open}>
        {open && (
          <>
            {release.video && <ReleaseTrailer video={release.video} />}
            <p>{release.summary}</p>
            <ReleaseDetails
              release={release}
              linkLabel={`Read ${release.version} notes on GitHub`}
            />
          </>
        )}
      </div>
    </li>
  );
}

export function ReleaseAnnouncement({
  release,
  history = [],
  onClose,
}: {
  release: Release;
  history?: Release[];
  onClose: () => void;
}) {
  const [compact, setCompact] = useState(false);
  const detailsId = useId();
  const historyHeadingId = useId();
  const changeCount = release.changes.length;

  return (
    <PopupDialog
      title={`Version ${release.version}`}
      titleBadge={<ReleaseConfetti />}
      kicker="WHAT'S NEW"
      className="release-announcement"
      onClose={onClose}
    >
      <div className="release-announcement-body">
        <h3>{release.title}</h3>
        <ReleaseDate release={release} />
        {release.video && <ReleaseTrailer video={release.video} />}
        <p>{release.summary}</p>
        <button
          type="button"
          className={`release-compact-toggle ${compact ? '' : 'open'}`.trim()}
          aria-expanded={!compact}
          aria-controls={detailsId}
          onClick={() => setCompact((value) => !value)}
        >
          {compact
            ? `Show ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`
            : 'Hide changes'}
          <span className="release-chevron" aria-hidden="true">
            <Icon name="chevron-down" />
          </span>
        </button>
        <div id={detailsId} className="release-current-details" hidden={compact}>
          {!compact && <ReleaseDetails release={release} linkLabel="Read more on GitHub" />}
        </div>
        {history.length > 0 && (
          <section className="release-history" aria-labelledby={historyHeadingId}>
            <h3 id={historyHeadingId}>Earlier versions</h3>
            <ul>
              {history.map((earlier) => (
                <EarlierRelease key={earlier.version} release={earlier} />
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" className="popup-primary-action" onClick={onClose}>
          Got it
        </button>
      </footer>
    </PopupDialog>
  );
}
