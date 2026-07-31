import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { startTailorSession } from '../api';

export function TailorPage() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const [jd, setJd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!profileId) return;
    setError(null);
    setLoading(true);
    try {
      const session = await startTailorSession(profileId, jd);
      navigate(`/session/${session.id}`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to start session');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>Target the role</h1>
        <p>
          Drop the full job description. The agent extracts must-haves, scores
          fit against your profile, and either asks clarifying questions or
          denies a mismatched role.
        </p>
      </section>

      <section className="panel">
        <h2>Job description</h2>
        <p className="hint">
          Include responsibilities, required skills, and nice-to-haves for best
          keyword coverage.
        </p>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the complete job description..."
        />
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={loading || jd.trim().length < 80}
            onClick={run}
          >
            {loading ? 'Analyzing fit… this can take a minute' : 'Analyze & tailor'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Back
          </button>
        </div>
        {loading && (
          <p className="loading-line">
            Running agents: JD parse → fit gate → gap questions…
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}
