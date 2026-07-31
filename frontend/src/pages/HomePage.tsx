import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiErrorMessage,
  createProfileFromText,
  deleteProfile,
  listProfiles,
  renameProfile,
  uploadResume,
  type ProfileSummary,
} from '../api';

export function HomePage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [resumeText, setResumeText] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refreshProfiles() {
    try {
      setProfiles(await listProfiles());
    } catch {
      setProfiles([]);
    }
  }

  useEffect(() => {
    void refreshProfiles();
  }, []);

  function requireLabel(): string | null {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError('Name this resume first (e.g. “SWE master”, “Frontend 2026”).');
      return null;
    }
    return trimmed;
  }

  async function handlePaste() {
    const resumeLabel = requireLabel();
    if (!resumeLabel) return;
    if (resumeText.trim().length < 40) {
      setError('Paste a fuller resume before continuing.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const profile = await createProfileFromText(resumeText, resumeLabel);
      setResumeText('');
      setLabel('');
      await refreshProfiles();
      navigate(`/tailor/${profile.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to parse resume'));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    const resumeLabel = requireLabel();
    if (!resumeLabel) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const profile = await uploadResume(file, resumeLabel);
      setLabel('');
      await refreshProfiles();
      navigate(`/tailor/${profile.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRename(id: string) {
    const trimmed = editLabel.trim();
    if (trimmed.length < 2) {
      setError('Resume name must be at least 2 characters.');
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await renameProfile(id, trimmed);
      setEditingId(null);
      await refreshProfiles();
    } catch (err) {
      setError(apiErrorMessage(err, 'Rename failed'));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(profile: ProfileSummary) {
    const ok = window.confirm(
      `Delete “${profile.label}”? This also removes its tailor sessions and saved LaTeX.`
    );
    if (!ok) return;
    setBusyId(profile.id);
    setError(null);
    try {
      await deleteProfile(profile.id);
      await refreshProfiles();
    } catch (err) {
      setError(apiErrorMessage(err, 'Delete failed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="hero">
        <h1>ResumeForge</h1>
        <p>
          Name each master resume you store, then tailor it per job. Reopen,
          rename, or delete versions anytime — your history stays organized.
        </p>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Add a master resume</h2>
          <p className="hint">
            Give it a clear nickname first, then paste or upload. That name is
            how it appears in your library — not the person name inside the CV.
          </p>

          <label className="label" htmlFor="resume-label">
            Resume name <span className="req">*</span>
          </label>
          <input
            id="resume-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. “Backend master”, “ML applications”, “Internship CV”'
            maxLength={80}
            disabled={loading}
          />

          <label className="label" htmlFor="resume" style={{ marginTop: 14 }}>
            Paste resume text
          </label>
          <textarea
            id="resume"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume here..."
            disabled={loading}
          />

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={loading || label.trim().length < 2 || resumeText.trim().length < 40}
              onClick={handlePaste}
            >
              {loading ? 'Parsing…' : 'Save & continue'}
            </button>
            <label
              className={`btn btn-ghost${loading || label.trim().length < 2 ? ' is-disabled' : ''}`}
              style={{ cursor: loading || label.trim().length < 2 ? 'not-allowed' : 'pointer' }}
            >
              Upload file
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                hidden
                disabled={loading || label.trim().length < 2}
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className="btn btn-ghost" onClick={() => navigate('/history')}>
              Past sessions
            </button>
          </div>
          {label.trim().length < 2 && (
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Enter a resume name to unlock save / upload.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <h2>Your resume library</h2>
          <p className="hint">
            Each entry is a named master profile you can tailor, rename, or remove.
          </p>
          {profiles.length === 0 ? (
            <p className="hint">No resumes saved yet.</p>
          ) : (
            <ul className="profile-list">
              {profiles.map((p) => (
                <li key={p.id} className="profile-row">
                  <div className="profile-meta">
                    {editingId === p.id ? (
                      <div className="rename-row">
                        <input
                          type="text"
                          value={editLabel}
                          maxLength={80}
                          autoFocus
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void onRename(p.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          className="btn btn-primary"
                          disabled={busyId === p.id}
                          onClick={() => void onRename(p.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <strong>{p.label || 'Untitled resume'}</strong>
                        <span>
                          {p.name}
                          {p.email ? ` · ${p.email}` : ''}
                          {typeof p._count?.sessions === 'number'
                            ? ` · ${p._count.sessions} session${p._count.sessions === 1 ? '' : 's'}`
                            : ''}
                          {' · '}
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                  {editingId !== p.id && (
                    <div className="profile-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/tailor/${p.id}`)}
                      >
                        Tailor
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={busyId === p.id}
                        onClick={() => {
                          setEditingId(p.id);
                          setEditLabel(p.label || '');
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busyId === p.id}
                        onClick={() => void onDelete(p)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
