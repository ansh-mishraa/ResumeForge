export function AtsPanel({
  atsScore,
  fitScore,
  pageCount,
  spacing,
  matched = [],
  missing = [],
  notes = [],
}: {
  atsScore?: number | null;
  fitScore?: number | null;
  pageCount?: number;
  spacing?: string;
  matched?: string[];
  missing?: string[];
  notes?: string[];
}) {
  const ats = Math.round(atsScore ?? 0);
  const fit = Math.round(fitScore ?? 0);

  return (
    <aside className="ats-panel">
      <h2>Match dashboard</h2>
      <div className="ats-gauges">
        <div className="ats-gauge">
          <div
            className="ats-ring"
            style={{ ['--p' as string]: `${ats}%` }}
            data-tone={ats >= 75 ? 'good' : ats >= 55 ? 'mid' : 'low'}
          >
            <span>{ats}</span>
          </div>
          <p>ATS match</p>
        </div>
        <div className="ats-gauge">
          <div
            className="ats-ring"
            style={{ ['--p' as string]: `${fit}%` }}
            data-tone={fit >= 75 ? 'good' : fit >= 55 ? 'mid' : 'low'}
          >
            <span>{fit}</span>
          </div>
          <p>Fit score</p>
        </div>
      </div>

      <div className="ats-meta">
        <div>
          <span className="ats-label">Pages</span>
          <strong>{pageCount ?? 1}</strong>
        </div>
        <div>
          <span className="ats-label">Spacing</span>
          <strong>{spacing || 'normal'}</strong>
        </div>
      </div>

      {matched.length > 0 && (
        <div className="ats-chips">
          <h3>Matched keywords</h3>
          <div className="chip-row">
            {matched.slice(0, 16).map((k) => (
              <span key={k} className="chip ok">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="ats-chips">
          <h3>Still thin on</h3>
          <div className="chip-row">
            {missing.slice(0, 12).map((k) => (
              <span key={k} className="chip warn">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <p className="ats-note">{notes[notes.length - 1]}</p>
      )}
    </aside>
  );
}
