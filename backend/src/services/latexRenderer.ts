import type { TailoredResume } from '../types/profile.js';

export type SpacingPreset = 'airy' | 'normal' | 'compact' | 'dense' | 'ultradense';

export const SPACING_ORDER: SpacingPreset[] = [
  'airy',
  'normal',
  'compact',
  'dense',
  'ultradense',
];

const SPACING: Record<
  SpacingPreset,
  {
    margins: string;
    sectionSep: string;
    itemSep: string;
    bulletSep: string;
    fontSize: string;
  }
> = {
  airy: {
    margins: '0.55in',
    sectionSep: '11pt',
    itemSep: '7pt',
    bulletSep: '3pt',
    fontSize: '10pt',
  },
  normal: {
    margins: '0.5in',
    sectionSep: '8pt',
    itemSep: '5pt',
    bulletSep: '2pt',
    fontSize: '10pt',
  },
  compact: {
    margins: '0.4in',
    sectionSep: '6pt',
    itemSep: '3pt',
    bulletSep: '1pt',
    fontSize: '10pt',
  },
  dense: {
    margins: '0.35in',
    sectionSep: '5pt',
    itemSep: '2pt',
    bulletSep: '0.5pt',
    fontSize: '9.5pt',
  },
  ultradense: {
    margins: '0.3in',
    sectionSep: '4pt',
    itemSep: '1.5pt',
    bulletSep: '0pt',
    fontSize: '9pt',
  },
};

export function nextTighterSpacing(
  current: SpacingPreset | string | undefined
): SpacingPreset | null {
  const idx = SPACING_ORDER.indexOf((current as SpacingPreset) || 'normal');
  const from = idx >= 0 ? idx : SPACING_ORDER.indexOf('normal');
  if (from >= SPACING_ORDER.length - 1) return null;
  return SPACING_ORDER[from + 1];
}

export function detectSpacingFromLatex(latex: string): SpacingPreset {
  if (latex.includes('margin=0.3in') || latex.includes('[9pt,')) return 'ultradense';
  if (latex.includes('margin=0.35in') || latex.includes('[9.5pt,')) return 'dense';
  if (latex.includes('margin=0.4in')) return 'compact';
  if (latex.includes('margin=0.55in')) return 'airy';
  return 'normal';
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, (m) => `\\${m}`)
    .replace(/[#\$%&_]/g, (m) => `\\${m}`)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function escHref(url: string): string {
  return url
    .replace(/\\/g, '\\\\')
    .replace(/(%|\$|#|&|_)/g, '\\$1')
    .replace(/([{}])/g, '\\$1');
}

function linkLine(resume: TailoredResume): string {
  const c = resume.contact;
  const parts: string[] = [];
  if (c.email) {
    parts.push(
      `\\href{mailto:${escHref(c.email)}}{\\underline{${esc(c.email)}}}`
    );
  }
  if (c.phone) parts.push(esc(c.phone));
  if (c.location) parts.push(esc(c.location));
  if (c.linkedin) {
    parts.push(`\\href{${escHref(c.linkedin)}}{\\underline{LinkedIn}}`);
  }
  if (c.github) {
    parts.push(`\\href{${escHref(c.github)}}{\\underline{GitHub}}`);
  }
  if (c.website) {
    parts.push(`\\href{${escHref(c.website)}}{\\underline{Portfolio}}`);
  }
  return parts.join(' $|$ ');
}

export function renderLatex(
  resume: TailoredResume,
  spacing: SpacingPreset = 'normal'
): string {
  const s = SPACING[spacing];
  const lines: string[] = [];

  lines.push(`\\documentclass[${s.fontSize},letterpaper]{article}`);
  lines.push(`\\usepackage[margin=${s.margins}]{geometry}`);
  lines.push(`\\usepackage{enumitem}`);
  lines.push(`\\usepackage[hidelinks]{hyperref}`);
  lines.push(`\\usepackage{titlesec}`);
  lines.push(`\\usepackage{xcolor}`);
  lines.push(`\\usepackage[T1]{fontenc}`);
  lines.push(`\\usepackage{lmodern}`);
  lines.push(`\\pdfgentounicode=1`);
  lines.push(`\\pagestyle{empty}`);
  lines.push(`\\setlength{\\parindent}{0pt}`);
  lines.push(`\\titlespacing*{\\section}{0pt}{${s.sectionSep}}{4pt}`);
  lines.push(
    `\\titleformat{\\section}{\\large\\bfseries\\uppercase}{}{0em}{}[\\titlerule]`
  );
  lines.push(
    `\\setlist[itemize]{leftmargin=*,nosep,topsep=1pt,itemsep=${s.bulletSep},parsep=0pt}`
  );
  lines.push(`\\begin{document}`);

  lines.push(`\\begin{center}`);
  lines.push(`{\\LARGE\\bfseries ${esc(resume.contact.name)}}\\\\[4pt]`);
  lines.push(`${linkLine(resume)}`);
  lines.push(`\\end{center}`);

  if (resume.summary?.trim()) {
    lines.push(`\\section*{Summary}`);
    lines.push(esc(resume.summary.trim()));
  }

  if (resume.skills.length) {
    lines.push(`\\section*{Skills}`);
    for (const cat of resume.skills) {
      lines.push(
        `\\textbf{${esc(cat.category)}:} ${esc(cat.skills.join(', '))}\\\\[${s.itemSep}]`
      );
    }
  }

  if (resume.experience.length) {
    lines.push(`\\section*{Experience}`);
    for (const exp of resume.experience) {
      lines.push(
        `\\textbf{${esc(exp.title)}} \\hfill ${esc(exp.startDate)} -- ${esc(exp.endDate)}\\\\`
      );
      lines.push(
        `\\textit{${esc(exp.company)}${exp.location ? `, ${esc(exp.location)}` : ''}}`
      );
      if (exp.bullets.length) {
        lines.push(`\\begin{itemize}`);
        for (const b of exp.bullets) lines.push(`  \\item ${esc(b)}`);
        lines.push(`\\end{itemize}`);
      }
      lines.push(`\\vspace{${s.itemSep}}`);
    }
  }

  if (resume.projects.length) {
    lines.push(`\\section*{Projects}`);
    for (const p of resume.projects) {
      const tech = p.tech.length ? ` $|$ \\textit{${esc(p.tech.join(', '))}}` : '';
      const name = p.url
        ? `\\href{${escHref(p.url)}}{\\textbf{\\underline{${esc(p.name)}}}}`
        : `\\textbf{${esc(p.name)}}`;
      lines.push(`${name}${tech}`);
      if (p.bullets.length) {
        lines.push(`\\begin{itemize}`);
        for (const b of p.bullets) lines.push(`  \\item ${esc(b)}`);
        lines.push(`\\end{itemize}`);
      }
      lines.push(`\\vspace{${s.itemSep}}`);
    }
  }

  if (resume.education.length) {
    lines.push(`\\section*{Education}`);
    for (const ed of resume.education) {
      const dates =
        ed.startDate || ed.endDate
          ? ` \\hfill ${esc([ed.startDate, ed.endDate].filter(Boolean).join(' -- '))}`
          : '';
      lines.push(`\\textbf{${esc(ed.school)}}${dates}\\\\`);
      lines.push(
        `\\textit{${esc(ed.degree)}${ed.field ? ` in ${esc(ed.field)}` : ''}${ed.location ? ` — ${esc(ed.location)}` : ''}}`
      );
      if (ed.details?.length) {
        lines.push(`\\begin{itemize}`);
        for (const d of ed.details) lines.push(`  \\item ${esc(d)}`);
        lines.push(`\\end{itemize}`);
      }
      lines.push(`\\vspace{${s.itemSep}}`);
    }
  }

  if (resume.certifications?.length) {
    lines.push(`\\section*{Certifications}`);
    lines.push(esc(resume.certifications.join(' · ')));
  }

  lines.push(`\\end{document}`);
  return lines.join('\n');
}
