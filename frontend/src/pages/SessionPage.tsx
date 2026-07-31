import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  apiErrorMessage,
  downloadLatex,
  downloadPdfBlob,
  fitSessionToPage,
  getSession,
  submitAnswers,
  type ClarifyingQuestion,
  type TailorSession,
} from '../api';
import { AtsPanel } from '../components/AtsPanel';
import { ResumePreview } from '../components/ResumePreview';

type AnswerDraft = {
  questionId: string;
  skill: string;
  kind: 'gap' | 'prune';
  hasSkill: boolean | null;
  details: string;
};

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<TailorSession | null>(null);
  const [answers, setAnswers] = useState<AnswerDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLatex, setShowLatex] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => {
        setSession(s);
        const qs = (s.clarifyingQs || []) as ClarifyingQuestion[];
        setAnswers(
          qs.map((q) => ({
            questionId: q.id,
            skill: q.skill,
            kind: q.kind === 'prune' ? 'prune' : 'gap',
            hasSkill: null,
            details: '',
          }))
        );
      })
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load session')))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const canSubmit = useMemo(
    () => answers.length > 0 && answers.every((a) => a.hasSkill !== null),
    [answers]
  );

  async function onSubmitAnswers() {
    if (!sessionId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitAnswers(
        sessionId,
        answers.map((a) => ({
          questionId: a.questionId,
          skill: a.skill,
          kind: a.kind,
          hasSkill: Boolean(a.hasSkill),
          details: a.kind === 'gap' && a.details ? a.details : undefined,
        }))
      );
      setSession(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Submit failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLatex() {
    if (!session?.latexCode) return;
    await navigator.clipboard.writeText(session.latexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function onDownloadTex() {
    if (!sessionId) return;
    try {
      const text = await downloadLatex(sessionId);
      triggerBrowserDownload(
        new Blob([text], { type: 'text/plain;charset=utf-8' }),
        `resume-${sessionId.slice(0, 8)}.tex`
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'LaTeX download failed'));
    }
  }

  async function onDownloadPdf() {
    if (!sessionId) return;
    try {
      const blob = await downloadPdfBlob(sessionId);
      triggerBrowserDownload(blob, `resume-${session?.company || 'tailored'}.pdf`);
    } catch (err) {
      setError(apiErrorMessage(err, 'PDF download failed'));
    }
  }

  async function onFitPage() {
    if (!sessionId) return;
    setFitting(true);
    setError(null);
    try {
      const updated = await fitSessionToPage(sessionId);
      setSession(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not tighten spacing'));
    } finally {
      setFitting(false);
    }
  }

  if (loading) {
    return <p className="loading-line">Loading session…</p>;
  }

  if (!session) {
    return <p className="error">{error || 'Session not found'}</p>;
  }

  if (session.status === 'DENIED') {
    return (
      <section className="panel denied">
        <span className="status-pill danger">Application not recommended</span>
        <h2 style={{ marginTop: 14 }}>
          This role does not match your skill set
        </h2>
        <p className="hint">
          Fit score: {session.fitScore ?? '—'}/100
          {session.company ? ` · ${session.company}` : ''}
          {session.jobTitle ? ` · ${session.jobTitle}` : ''}
        </p>
        <p>{session.fitReason}</p>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate('/history')}>
            Back to sessions
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Choose another role
          </button>
        </div>
      </section>
    );
  }

  if (session.status === 'AWAITING_ANSWERS') {
    const qs = session.clarifyingQs || [];
    const gapQs = qs.filter((q) => (q.kind ?? 'gap') === 'gap');
    const pruneQs = qs.filter((q) => q.kind === 'prune');

    return (
      <>
        <section className="hero">
          <h1>Shape this resume for the role</h1>
          <p>
            Fit looks plausible ({session.fitScore ?? '—'}/100). Confirm missing
            skills honestly, and decide whether to drop off-role skills so the
            tailored resume reads as a perfect fit — denied skills are never
            fabricated; kept adjacent/trending skills stay.
          </p>
        </section>
        <section className="panel">
          {gapQs.length > 0 && (
            <div className="qa-group">
              <h2 className="qa-group-title">Skill gaps from the JD</h2>
              <p className="hint">
                Only say yes if you truly have the skill. Details help rewrite
                bullets in Google XYZ format.
              </p>
              {qs.map((q, idx) => {
                if ((q.kind ?? 'gap') !== 'gap') return null;
                const draft = answers[idx];
                return (
                  <div className="qa-item" key={q.id}>
                    <div className="qa-skill">
                      {q.skill} · {q.importance}
                    </div>
                    <strong>{q.question}</strong>
                    <div className="qa-controls">
                      <button
                        type="button"
                        className={`choice ${draft?.hasSkill === true ? 'active' : ''}`}
                        onClick={() =>
                          setAnswers((prev) =>
                            prev.map((a, i) =>
                              i === idx ? { ...a, hasSkill: true } : a
                            )
                          )
                        }
                      >
                        Yes, I have it
                      </button>
                      <button
                        type="button"
                        className={`choice ${draft?.hasSkill === false ? 'active' : ''}`}
                        onClick={() =>
                          setAnswers((prev) =>
                            prev.map((a, i) =>
                              i === idx
                                ? { ...a, hasSkill: false, details: '' }
                                : a
                            )
                          )
                        }
                      >
                        No
                      </button>
                    </div>
                    {draft?.hasSkill && (
                      <input
                        type="text"
                        placeholder="Optional: where / how you used it"
                        value={draft.details}
                        onChange={(e) =>
                          setAnswers((prev) =>
                            prev.map((a, i) =>
                              i === idx ? { ...a, details: e.target.value } : a
                            )
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pruneQs.length > 0 && (
            <div className="qa-group">
              <h2 className="qa-group-title">Off-role skills to trim?</h2>
              <p className="hint">
                These look far from the job description. Remove them to focus the
                resume on this role. Adjacent or trending stack skills (e.g. JNI
                for Android) are not suggested for removal.
              </p>
              {qs.map((q, idx) => {
                if (q.kind !== 'prune') return null;
                const draft = answers[idx];
                return (
                  <div className="qa-item qa-prune" key={q.id}>
                    <div className="qa-skill">
                      {q.skill}
                      {q.reason ? ` · ${q.reason}` : ''}
                    </div>
                    <strong>{q.question}</strong>
                    <div className="qa-controls">
                      <button
                        type="button"
                        className={`choice ${draft?.hasSkill === false ? 'active danger' : ''}`}
                        onClick={() =>
                          setAnswers((prev) =>
                            prev.map((a, i) =>
                              i === idx ? { ...a, hasSkill: false } : a
                            )
                          )
                        }
                      >
                        Remove from resume
                      </button>
                      <button
                        type="button"
                        className={`choice ${draft?.hasSkill === true ? 'active' : ''}`}
                        onClick={() =>
                          setAnswers((prev) =>
                            prev.map((a, i) =>
                              i === idx ? { ...a, hasSkill: true } : a
                            )
                          )
                        }
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={!canSubmit || submitting}
              onClick={onSubmitAnswers}
            >
              {submitting
                ? 'Tailoring with XYZ bullets…'
                : 'Generate tailored resume'}
            </button>
          </div>
          {submitting && (
            <p className="loading-line">
              Rewriting experience &amp; projects in Google XYZ format, aligning
              skills to the JD, then fitting a single page…
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      </>
    );
  }

  if (session.status === 'COMPLETED' && session.latexCode) {
    const ats = session.pageOptimization?.ats;
    const spacing = session.pageOptimization?.spacing || 'normal';
    const atMaxDensity = spacing === 'ultradense';

    return (
      <>
        <section className="hero">
          <h1>Your tailored resume</h1>
          <p>
            Preview the result, review ATS coverage, then copy LaTeX or download
            PDF. “Fit to one page” only tightens spacing — never drops content or
            keywords.
          </p>
        </section>

        <div className="result-toolbar panel">
          <div className="actions" style={{ marginTop: 0 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={fitting || atMaxDensity}
              onClick={() => void onFitPage()}
              title={
                atMaxDensity
                  ? 'Already at maximum density without removing content'
                  : 'Tighten margins and spacing only'
              }
            >
              {fitting
                ? 'Tightening spacing…'
                : atMaxDensity
                  ? 'Max density reached'
                  : 'Fit to one page'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={copyLatex}>
              {copied ? 'Copied' : 'Copy LaTeX'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onDownloadTex}>
              Download .tex
            </button>
            <button className="btn btn-ghost" type="button" onClick={onDownloadPdf}>
              Download PDF
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowLatex((v) => !v)}
            >
              {showLatex ? 'Hide LaTeX' : 'Show LaTeX'}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/history')}>
              All sessions
            </button>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Spacing: <strong>{spacing}</strong>
            {(session.pageOptimization?.pageCount ?? 1) > 1
              ? ' · Currently over one page — use Fit to one page to compress layout.'
              : ' · Layout targets a single page.'}
          </p>
          {error && <p className="error">{error}</p>}
        </div>

        <div className="result-layout">
          <div className="result-preview">
            {session.tailoredContent ? (
              <ResumePreview
                resume={session.tailoredContent}
                spacing={spacing}
              />
            ) : (
              <section className="panel">
                <p className="hint">
                  Structured preview unavailable. Use Show LaTeX or download
                  PDF.
                </p>
              </section>
            )}
          </div>
          <AtsPanel
            atsScore={session.atsScore ?? ats?.score}
            fitScore={session.fitScore}
            pageCount={session.pageOptimization?.pageCount}
            spacing={spacing}
            matched={ats?.matchedKeywords || []}
            missing={ats?.missingKeywords || []}
            notes={ats?.notes || session.pageOptimization?.notes || []}
          />
        </div>

        {showLatex && (
          <section className="panel" style={{ marginTop: 18 }}>
            <h2>LaTeX source</h2>
            <p className="hint">Paste into Overleaf if you prefer compiling there.</p>
            <textarea className="latex-box" readOnly value={session.latexCode} />
          </section>
        )}
      </>
    );
  }

  if (session.status === 'FAILED') {
    return (
      <section className="panel denied">
        <h2>Something failed</h2>
        <p>{session.errorMessage || 'Unknown error'}</p>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Start over
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="loading-line">Status: {session.status}…</p>
    </section>
  );
}
