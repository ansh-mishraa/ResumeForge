import { z } from 'zod';
import { chatJson } from '../lib/openai.js';
import type { JdAnalysis, MasterProfile } from '../types/profile.js';

const analysisSchema = z.object({
  jobTitle: z.string(),
  company: z.string().optional(),
  seniority: z.string().optional(),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  domain: z.string().optional(),
});

export async function analyzeJobDescription(
  jobDescription: string
): Promise<JdAnalysis> {
  return chatJson({
    system: `You are an expert ATS and technical recruiter. Extract structured hiring requirements from a job description.
Return JSON only with keys: jobTitle, company, seniority, mustHaveSkills, niceToHaveSkills, keywords, responsibilities, domain.
mustHaveSkills / niceToHaveSkills / keywords / responsibilities must be string arrays.`,
    user: `Job description:\n\n${jobDescription}`,
    schema: analysisSchema,
    temperature: 0.1,
  });
}

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === '' ? undefined : v));

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,|•]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeResumePayload(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;

  const contactRaw =
    raw.contact && typeof raw.contact === 'object'
      ? (raw.contact as Record<string, unknown>)
      : {
          name: raw.name,
          email: raw.email,
          phone: raw.phone,
          location: raw.location,
          linkedin: raw.linkedin,
          github: raw.github,
          website: raw.website,
        };

  let skills = raw.skills;
  if (skills && !Array.isArray(skills) && typeof skills === 'object') {
    skills = Object.entries(skills as Record<string, unknown>).map(
      ([category, value]) => ({
        category,
        skills: asStringArray(value),
      })
    );
  } else if (Array.isArray(skills)) {
    skills = skills.map((item, idx) => {
      if (typeof item === 'string') {
        return { category: 'Skills', skills: [item] };
      }
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        return {
          category: String(row.category || row.name || `Skills ${idx + 1}`),
          skills: asStringArray(row.skills ?? row.items ?? row.list ?? []),
        };
      }
      return { category: 'Skills', skills: [] };
    });
  } else {
    skills = [];
  }

  const experience = Array.isArray(raw.experience)
    ? raw.experience.map((item, idx) => {
        const row = (item || {}) as Record<string, unknown>;
        return {
          id: String(row.id || `exp-${idx + 1}`),
          company: String(row.company || row.employer || 'Unknown'),
          title: String(row.title || row.role || row.position || 'Role'),
          location: row.location ?? undefined,
          startDate: String(row.startDate || row.start || ''),
          endDate: String(row.endDate || row.end || 'Present'),
          bullets: asStringArray(row.bullets ?? row.highlights ?? []),
        };
      })
    : [];

  const education = Array.isArray(raw.education)
    ? raw.education.map((item, idx) => {
        const row = (item || {}) as Record<string, unknown>;
        return {
          id: String(row.id || `edu-${idx + 1}`),
          school: String(row.school || row.institution || row.university || 'Unknown'),
          degree: String(row.degree || row.qualification || ''),
          field: row.field ?? row.major ?? undefined,
          location: row.location ?? undefined,
          startDate: row.startDate ?? row.start ?? undefined,
          endDate: row.endDate ?? row.end ?? undefined,
          details: asStringArray(row.details ?? []),
        };
      })
    : [];

  const projects = Array.isArray(raw.projects)
    ? raw.projects.map((item, idx) => {
        const row = (item || {}) as Record<string, unknown>;
        return {
          id: String(row.id || `proj-${idx + 1}`),
          name: String(row.name || `Project ${idx + 1}`),
          tech: asStringArray(row.tech ?? row.technologies ?? []),
          url: row.url ?? undefined,
          bullets: asStringArray(row.bullets ?? row.highlights ?? []),
        };
      })
    : [];

  return {
    contact: {
      name: String(contactRaw.name || 'Candidate'),
      email: contactRaw.email ?? undefined,
      phone: contactRaw.phone ?? undefined,
      location: contactRaw.location ?? undefined,
      linkedin: contactRaw.linkedin ?? undefined,
      github: contactRaw.github ?? undefined,
      website: contactRaw.website ?? undefined,
    },
    summary:
      raw.summary == null || raw.summary === ''
        ? undefined
        : String(raw.summary),
    experience,
    education,
    projects,
    skills,
    certifications: asStringArray(raw.certifications ?? []),
  };
}

const parseSchema = z.preprocess(
  normalizeResumePayload,
  z.object({
    contact: z.object({
      name: z.string().min(1),
      email: optionalString,
      phone: optionalString,
      location: optionalString,
      linkedin: optionalString,
      github: optionalString,
      website: optionalString,
    }),
    summary: optionalString,
    experience: z.array(
      z.object({
        id: z.string(),
        company: z.string(),
        title: z.string(),
        location: optionalString,
        startDate: z.string(),
        endDate: z.string(),
        bullets: z.array(z.string()),
      })
    ),
    education: z.array(
      z.object({
        id: z.string(),
        school: z.string(),
        degree: z.string(),
        field: optionalString,
        location: optionalString,
        startDate: optionalString,
        endDate: optionalString,
        details: z.array(z.string()).optional(),
      })
    ),
    projects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        tech: z.array(z.string()),
        url: optionalString,
        bullets: z.array(z.string()),
      })
    ),
    skills: z.array(
      z.object({
        category: z.string(),
        skills: z.array(z.string()),
      })
    ),
    certifications: z.array(z.string()).optional(),
  })
);

export async function parseResumeToProfile(
  resumeText: string
): Promise<MasterProfile> {
  return chatJson({
    system: `You convert raw resume text into a structured master career profile JSON.
Rules:
- Do NOT invent employers, degrees, projects, metrics, or skills that are not in the text.
- Give each experience/project/education a short stable id (e.g. exp-1, proj-1).
- Keep bullets faithful; you may lightly clean grammar but not add claims.
- Group skills into an ARRAY of { "category": string, "skills": string[] }. Never use a skills object map.
- summary must be a string or omitted (never null).
- contact must be an object: { name, email?, phone?, location?, linkedin?, github?, website? }.
- CRITICAL LINKS: If the text contains an "EMBEDDED / DETECTED LINKS" section OR any URLs, you MUST map them:
  - linkedin.com → contact.linkedin (full https URL)
  - github.com (profile, not a specific repo if it's the personal profile) → contact.github
  - personal/portfolio/live demo sites → contact.website OR project.url when clearly tied to a project
  - project live demos / repo URLs → that project's "url" field
  - mailto: → contact.email (email address only)
- Prefer full absolute URLs. Never drop LinkedIn/GitHub/portfolio/project links that appear in the source.

Exact shape example:
{
  "contact": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "linkedin": "https://linkedin.com/in/janedoe",
    "github": "https://github.com/janedoe",
    "website": "https://janedoe.dev"
  },
  "summary": "Backend engineer...",
  "experience": [{ "id": "exp-1", "company": "Acme", "title": "Engineer", "startDate": "2022", "endDate": "Present", "bullets": ["Built APIs"] }],
  "education": [{ "id": "edu-1", "school": "MIT", "degree": "B.S.", "field": "CS" }],
  "projects": [{ "id": "proj-1", "name": "App", "tech": ["Node.js"], "url": "https://github.com/janedoe/app", "bullets": ["Shipped X"] }],
  "skills": [{ "category": "Languages", "skills": ["TypeScript", "Python"] }],
  "certifications": []
}`,
    user: `Resume text:\n\n${resumeText}`,
    schema: parseSchema,
    temperature: 0.1,
    retryOnSchemaMismatch: true,
  });
}
