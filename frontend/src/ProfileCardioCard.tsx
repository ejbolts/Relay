import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { PaginationControls } from './PaginationControls';
import { dayMonth } from './trainingSummary';
import type { SharedCardioPage, SharedCardioSession } from './types';
import { formatMinutesDuration } from './utils';

const PAGE_SIZE = 5;
interface Props {
  profileId: string;
  sessions: SharedCardioSession[];
  total: number;
  active: boolean;
}

function cardioMetrics(session: SharedCardioSession): string {
  return [
    formatMinutesDuration(session.duration_minutes),
    session.distance_km !== null && session.distance_km !== undefined
      ? `${Number(session.distance_km.toFixed(2))} km`
      : null,
    session.calories_kcal !== null && session.calories_kcal !== undefined
      ? `${session.calories_kcal} kcal`
      : null,
    session.average_heart_rate_bpm ? `${session.average_heart_rate_bpm} bpm avg` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ProfileCardioCard(props: Props) {
  // Changing the viewed account must not reveal the previous account's page or pending response.
  return <CardioPages key={props.profileId} {...props} />;
}

function CardioPages({ profileId, sessions, total, active }: Props) {
  const [request, setRequest] = useState({ page: 1, serial: 0 });
  const [data, setData] = useState<SharedCardioPage & { page: number }>(() => ({
    page: 1,
    sessions: sessions.slice(0, PAGE_SIZE),
    total,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    if (request.serial === 0) {
      setUnavailable(false);
      setData({ page: 1, sessions: sessions.slice(0, PAGE_SIZE), total });
      setLoading(false);
      return;
    }
    setLoading(true);
    api.sharing
      .cardio(profileId, (request.page - 1) * PAGE_SIZE, PAGE_SIZE)
      .then(
        (page) => {
          if (cancelled) return;
          const lastPage = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
          if (request.page > lastPage) {
            setRequest((current) => ({ page: lastPage, serial: current.serial + 1 }));
            return;
          }
          setUnavailable(false);
          setData({ ...page, page: request.page });
        },
        (reason: unknown) => {
          if (cancelled) return;
          setError(authErrorMessage(reason));
          if (reason instanceof ApiError && [403, 404].includes(reason.status))
            setUnavailable(true);
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, sessions, total, active, request]);

  const first = (data.page - 1) * PAGE_SIZE + 1;
  return (
    <section
      className="pulse-card shared-card"
      aria-labelledby="shared-cardio-title"
      aria-busy={loading}
    >
      <header className="pulse-card-header">
        <h2 id="shared-cardio-title">Cardio</h2>
        {data.total > 0 && !unavailable && (
          <span className="num">
            {first}–{first + data.sessions.length - 1} of {data.total}
          </span>
        )}
      </header>
      {!unavailable &&
        (data.sessions.length === 0 ? (
          <p className="shared-card-empty">No cardio sessions yet.</p>
        ) : (
          <ul className="shared-cardio-list">
            {data.sessions.map((session) => (
              <li key={session.id}>
                <span className="shared-cardio-date num">{dayMonth(session.session_date)}</span>
                <span>
                  <strong>
                    {session.activity_type}
                    {session.qualifies_zone2 && <em>Zone 2</em>}
                  </strong>
                  <small className="num">{cardioMetrics(session)}</small>
                  {session.notes && <small className="shared-cardio-notes">{session.notes}</small>}
                </span>
              </li>
            ))}
          </ul>
        ))}
      {loading && (
        <p className="sharing-loading" role="status">
          Loading cardio…
        </p>
      )}
      {error && (
        <div className="profile-cardio-error">
          <p className="inline-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRequest((current) => ({ ...current, serial: current.serial + 1 }))}
          >
            Try again
          </button>
        </div>
      )}
      {!unavailable && (
        <fieldset className="profile-cardio-pagination" disabled={loading}>
          <PaginationControls
            currentPage={data.page}
            totalPages={Math.ceil(data.total / PAGE_SIZE)}
            label="cardio"
            onPageChange={(page) => setRequest((current) => ({ page, serial: current.serial + 1 }))}
          />
        </fieldset>
      )}
    </section>
  );
}
