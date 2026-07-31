import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiErrorMessage, listSessions, type SessionSummary } from '../api';

export function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load sessions')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Your sessions</h1>
        <p>
          Reopen any past tailor run — completed LaTeX, denied fits, and
          in-progress Q&amp;A all live here under your account.
        </p>
      </section>

      <section className="panel">
        <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            New tailor
          </button>
        </div>
        {loading && <p className="loading-line">Loading history…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && sessions.length === 0 && (
          <p className="hint">No sessions yet. Upload a resume and tailor one.</p>
        )}
        {sessions.length > 0 && (
          <ul className="profile-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>
                    {s.jobTitle || 'Untitled role'}
                    {s.company ? ` · ${s.company}` : ''}
                  </strong>
                  <span>
                    {s.profile?.label || s.profile?.name || 'Profile'} · {s.status}
                    {s.atsScore != null ? ` · ATS ${Math.round(s.atsScore)}` : ''}
                    {s.fitScore != null ? ` · Fit ${Math.round(s.fitScore)}` : ''}
                    {' · '}
                    {new Date(s.createdAt).toLocaleString()}
                    {s.hasLatex ? ' · LaTeX saved' : ''}
                  </span>
                </div>
                <Link className="btn btn-ghost" to={`/session/${s.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
