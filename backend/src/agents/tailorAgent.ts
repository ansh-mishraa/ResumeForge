import { z } from 'zod';
import { chatJson } from '../lib/openai.js';
import type {
  JdAnalysis,
  MasterProfile,
  TailoredResume,
  UserAnswer,
} from '../types/profile.js';

const tailoredSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    website: z.string().optional(),
  }),
  summary: z.string(),
  experience: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      title: z.string(),
      location: z.string().optional(),
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
      field: z.string().optional(),
      location: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      details: z.array(z.string()).optional(),
    })
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tech: z.array(z.string()),
      url: z.string().optional(),
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
});

export async function tailorResume(params: {
  profile: MasterProfile;
  analysis: JdAnalysis;
  answers: UserAnswer[];
  densityHint?: 'sparse' | 'balanced' | 'tight' | 'overflow';
}): Promise<TailoredResume> {
  const density = params.densityHint ?? 'balanced';

  const densityGuide =
    density === 'overflow'
      ? 'Content is overflowing one page. Cut weakest bullets first, keep 2-3 bullets per role max, shorten every bullet to <=18 words, drop least relevant projects.'
      : density === 'sparse'
        ? 'Page has empty space. Prefer 3-4 strong bullets per recent role, slightly richer summary (3 lines), keep relevant projects. Do NOT invent facts — expand only by reframing verified experience with JD keywords.'
        : density === 'tight'
          ? 'Keep concise: 2-3 bullets/role, short summary, prioritize highest-match content.'
          : 'Target a dense single page: sharp bullets, JD keyword alignment, no fluff.';

  return chatJson({
    system: `You are an elite resume writer optimizing for ATS keyword match AND human readability.

Hard rules:
1. NEVER fabricate employers, titles, degrees, metrics, or skills the candidate does not have.
2. You MAY include skills the user confirmed in answers (hasSkill=true), using their details when provided.
3. You MUST NOT include skills the user denied (hasSkill=false).
4. Mirror JD terminology where honest (e.g. "REST APIs" if they built APIs).
5. Bullets: Action verb + what + method/tech + outcome/metric when available. Short and sharp.
6. Reorder skills so JD keywords appear first within categories.
7. Drop irrelevant experience/projects; keep strongest JD-aligned ones.
8. Summary: 2-3 lines max, role-targeted, keyword-rich, no fluff.
9. Output must fit a clean single-column ATS-friendly resume.
10. ${densityGuide}
11. CONTACT & PROJECT LINKS ARE MANDATORY TO PRESERVE: copy contact.linkedin, contact.github, contact.website, contact.email, contact.phone, contact.location EXACTLY from the profile when present. For every kept project that has a url in the profile, keep that exact url. Never omit LinkedIn/GitHub/portfolio/project live links.`,
    user: JSON.stringify(
      {
        profile: params.profile,
        analysis: params.analysis,
        answers: params.answers,
      },
      null,
      2
    ),
    schema: tailoredSchema,
    temperature: 0.25,
    retryOnSchemaMismatch: true,
  }).then((tailored) => preserveProfileLinks(params.profile, tailored));
}

function preserveProfileLinks(
  profile: MasterProfile,
  tailored: TailoredResume
): TailoredResume {
  const contact = {
    ...tailored.contact,
    email: tailored.contact.email || profile.contact.email,
    phone: tailored.contact.phone || profile.contact.phone,
    location: tailored.contact.location || profile.contact.location,
    linkedin: profile.contact.linkedin || tailored.contact.linkedin,
    github: profile.contact.github || tailored.contact.github,
    website: profile.contact.website || tailored.contact.website,
    name: tailored.contact.name || profile.contact.name,
  };

  const profileUrlById = new Map(
    profile.projects.map((p) => [p.id, p.url] as const)
  );
  const profileUrlByName = new Map(
    profile.projects
      .filter((p) => p.url)
      .map((p) => [p.name.toLowerCase(), p.url] as const)
  );

  const projects = tailored.projects.map((p) => ({
    ...p,
    url:
      p.url ||
      profileUrlById.get(p.id) ||
      profileUrlByName.get(p.name.toLowerCase()),
  }));

  return { ...tailored, contact, projects };
}

const atsSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;
  const toArr = (v: unknown) =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [];
  const scoreRaw = raw.score ?? raw.atsScore;
  const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    matchedKeywords: toArr(raw.matchedKeywords ?? raw.matched ?? []),
    missingKeywords: toArr(raw.missingKeywords ?? raw.missing ?? []),
    notes: toArr(raw.notes ?? raw.comments ?? []),
  };
}, z.object({
  score: z.number().min(0).max(100),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  notes: z.array(z.string()),
}));

export async function scoreAtsMatch(
  tailored: TailoredResume,
  analysis: JdAnalysis
) {
  return chatJson({
    system: `Score ATS keyword coverage of the tailored resume vs JD analysis.
Be honest. Only count keywords actually present in the tailored content.

Return JSON ONLY:
{
  "score": 80,
  "matchedKeywords": ["React", "TypeScript"],
  "missingKeywords": ["GraphQL"],
  "notes": ["Strong frontend keyword coverage"]
}`,
    user: JSON.stringify({ tailored, analysis }, null, 2),
    schema: atsSchema,
    temperature: 0.1,
    retryOnSchemaMismatch: true,
  });
}
