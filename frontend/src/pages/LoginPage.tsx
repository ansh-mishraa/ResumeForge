import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiErrorMessage, useAuth } from '../auth';

export function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err, 'Authentication failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-stage">
      <div className="auth-copy">
        <p className="auth-kicker">Private workspace</p>
        <h1 className="auth-brand">ResumeForge</h1>
        <p className="auth-lead">
          Sign in to keep resumes, fit checks, and LaTeX outputs locked to your
          account — and reopen every past session anytime.
        </p>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-tabs" role="tablist" aria-label="Account mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>

        <div className="auth-fields">
          {mode === 'register' && (
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we address you?"
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-submit" disabled={busy} type="submit">
          {busy
            ? 'Working…'
            : mode === 'login'
              ? 'Continue'
              : 'Create account'}
        </button>

        <p className="auth-footnote">
          {mode === 'login'
            ? 'First time here? Switch to Create account — your first signup keeps any local sessions already on this machine.'
            : 'Already registered? Switch to Sign in above.'}
        </p>
      </form>
    </div>
  );
}
