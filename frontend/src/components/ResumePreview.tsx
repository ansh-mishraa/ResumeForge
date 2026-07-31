import type { CSSProperties } from 'react';

export type PreviewResume = {
  contact: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  };
  summary?: string;
  experience: Array<{
    id: string;
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: Array<{
    id: string;
    school: string;
    degree: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    details?: string[];
  }>;
  projects: Array<{
    id: string;
    name: string;
    tech: string[];
    url?: string;
    bullets: string[];
  }>;
  skills: Array<{ category: string; skills: string[] }>;
  certifications?: string[];
};

const densityStyle: Record<string, CSSProperties> = {
  airy: { ['--rv-gap' as string]: '1.1rem', ['--rv-bullet' as string]: '0.45rem', fontSize: '13.5px' },
  normal: { ['--rv-gap' as string]: '0.9rem', ['--rv-bullet' as string]: '0.35rem', fontSize: '13px' },
  compact: { ['--rv-gap' as string]: '0.7rem', ['--rv-bullet' as string]: '0.25rem', fontSize: '12.5px' },
  dense: { ['--rv-gap' as string]: '0.55rem', ['--rv-bullet' as string]: '0.18rem', fontSize: '12px' },
  ultradense: { ['--rv-gap' as string]: '0.4rem', ['--rv-bullet' as string]: '0.12rem', fontSize: '11.5px' },
};

export function ResumePreview({
  resume,
  spacing = 'normal',
}: {
  resume: PreviewResume;
  spacing?: string;
}) {
  const c = resume.contact;
  const links = [
    c.email ? { href: `mailto:${c.email}`, label: c.email } : null,
    c.phone ? { href: undefined, label: c.phone } : null,
    c.location ? { href: undefined, label: c.location } : null,
    c.linkedin ? { href: c.linkedin, label: 'LinkedIn' } : null,
    c.github ? { href: c.github, label: 'GitHub' } : null,
    c.website ? { href: c.website, label: 'Portfolio' } : null,
  ].filter(Boolean) as Array<{ href?: string; label: string }>;

  return (
    <article className="resume-sheet" style={densityStyle[spacing] || densityStyle.normal}>
      <header className="rv-header">
        <h1>{c.name}</h1>
        <p className="rv-links">
          {links.map((l, i) => (
            <span key={`${l.label}-${i}`}>
              {i > 0 && <span className="rv-sep">|</span>}
              {l.href ? (
                <a href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ) : (
                l.label
              )}
            </span>
          ))}
        </p>
      </header>

      {resume.summary?.trim() && (
        <section className="rv-section">
          <h2>Summary</h2>
          <p>{resume.summary}</p>
        </section>
      )}

      {resume.skills?.length > 0 && (
        <section className="rv-section">
          <h2>Skills</h2>
          {resume.skills.map((cat) => (
            <p key={cat.category} className="rv-skills">
              <strong>{cat.category}:</strong> {cat.skills.join(', ')}
            </p>
          ))}
        </section>
      )}

      {resume.experience?.length > 0 && (
        <section className="rv-section">
          <h2>Experience</h2>
          {resume.experience.map((exp) => (
            <div key={exp.id} className="rv-block">
              <div className="rv-row">
                <strong>{exp.title}</strong>
                <span>
                  {exp.startDate} – {exp.endDate}
                </span>
              </div>
              <em>
                {exp.company}
                {exp.location ? `, ${exp.location}` : ''}
              </em>
              <ul>
                {exp.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {resume.projects?.length > 0 && (
        <section className="rv-section">
          <h2>Projects</h2>
          {resume.projects.map((p) => (
            <div key={p.id} className="rv-block">
              <div className="rv-row">
                <strong>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}
                </strong>
                {p.tech?.length ? <em>{p.tech.join(', ')}</em> : null}
              </div>
              <ul>
                {p.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {resume.education?.length > 0 && (
        <section className="rv-section">
          <h2>Education</h2>
          {resume.education.map((ed) => (
            <div key={ed.id} className="rv-block">
              <div className="rv-row">
                <strong>{ed.school}</strong>
                <span>
                  {[ed.startDate, ed.endDate].filter(Boolean).join(' – ')}
                </span>
              </div>
              <em>
                {ed.degree}
                {ed.field ? ` in ${ed.field}` : ''}
                {ed.location ? ` — ${ed.location}` : ''}
              </em>
              {ed.details?.length ? (
                <ul>
                  {ed.details.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      )}

      {resume.certifications && resume.certifications.length > 0 && (
        <section className="rv-section">
          <h2>Certifications</h2>
          <p>{resume.certifications.join(' · ')}</p>
        </section>
      )}
    </article>
  );
}
