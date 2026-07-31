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

function normSkill(s: string) {
  return s.trim().toLowerCase();
}

/** Skills the user agreed to remove (prune answers with hasSkill=false). */
export function skillsMarkedForRemoval(answers: UserAnswer[]): Set<string> {
  const set = new Set<string>();
  for (const a of answers) {
    if ((a.kind ?? 'gap') === 'prune' && a.hasSkill === false && a.skill.trim()) {
      set.add(normSkill(a.skill));
    }
  }
  return set;
}

/** Deterministically strip pruned skills from the tailored resume. */
export function applySkillPruning(
  tailored: TailoredResume,
  answers: UserAnswer[]
): TailoredResume {
  const remove = skillsMarkedForRemoval(answers);
  if (remove.size === 0) return tailored;

  const skills = tailored.skills
    .map((cat) => ({
      ...cat,
      skills: cat.skills.filter((s) => !remove.has(normSkill(s))),
    }))
    .filter((cat) => cat.skills.length > 0);

  const projects = tailored.projects.map((p) => ({
    ...p,
    tech: (p.tech || []).filter((t) => !remove.has(normSkill(t))),
  }));

  return { ...tailored, skills, projects };
}

export async function tailorResume(params: {
  profile: MasterProfile;
  analysis: JdAnalysis;
  answers: UserAnswer[];
  densityHint?: 'sparse' | 'balanced' | 'tight' | 'overflow';
}): Promise<TailoredResume> {
  const density = params.densityHint ?? 'balanced';

  const densityGuide =
    density === 'overflow'
      ? 'Content is overflowing one page. Cut weakest bullets first, keep 2-3 bullets per role max, shorten every bullet (still XYZ), drop least relevant projects. NEVER drop skills the user did not authorize for removal.'
      : density === 'sparse'
        ? 'Page has empty space. Prefer 3-4 strong XYZ bullets per recent role, slightly richer summary (3 lines), keep relevant projects. Do NOT invent facts — expand only by reframing verified experience with JD keywords.'
        : density === 'tight'
          ? 'Keep concise: 2-3 XYZ bullets/role, short summary, prioritize highest-match content.'
          : 'Target a dense single page: sharp XYZ bullets, JD keyword alignment, no fluff.';

  const pruned = [...skillsMarkedForRemoval(params.answers)];
  const keepFromPrune = params.answers
    .filter((a) => (a.kind ?? 'gap') === 'prune' && a.hasSkill === true)
    .map((a) => a.skill);
  const confirmedGaps = params.answers
    .filter((a) => (a.kind ?? 'gap') === 'gap' && a.hasSkill === true)
    .map((a) => ({ skill: a.skill, details: a.details }));
  const deniedGaps = params.answers
    .filter((a) => (a.kind ?? 'gap') === 'gap' && a.hasSkill === false)
    .map((a) => a.skill);

  return chatJson({
    system: `You are an elite resume writer. Your job is to make the candidate look like a PERFECT FIT for this specific role — honest, ATS-strong, and role-focused.

Hard rules:
1. NEVER fabricate employers, titles, degrees, metrics, or skills the candidate does not have.
2. Gap answers (kind="gap"):
   - hasSkill=true → you MAY include that skill and weave details into bullets when provided.
   - hasSkill=false → you MUST NOT claim that skill.
3. Prune answers (kind="prune"):
   - hasSkill=false → REMOVE that skill entirely from skills sections and project tech lists.
   - hasSkill=true → KEEP that skill even if it is not in the JD.
4. Skills strategy (role-designed resume):
   - Lead with JD must-haves / keywords the candidate actually has.
   - REMOVE skills that are clearly off-domain for this role UNLESS the user explicitly kept them via a prune answer.
   - KEEP adjacent, transferable, and high-signal modern skills already on the profile that strengthen the same track — even when the JD does not name them.
     Examples: JNI/NDK for Android/native; TypeScript for JS; Docker/K8s-adjacent for backend; GraphQL near API work; Kotlin near Android/JVM.
   - Do NOT invent trending skills the candidate never had.
5. GOOGLE XYZ BULLET FORMAT (mandatory for EVERY experience and project bullet):
   Structure each bullet as: Accomplished [X] as measured by [Y], by doing [Z].
   - X = what you achieved / impact
   - Y = metric, scope, or concrete evidence (use real numbers from the profile when available; otherwise use honest qualitative scope — never invent metrics)
   - Z = how / methods / tech / collaboration
   Write naturally (you may lead with a strong past-tense verb); every bullet must still contain achievement + evidence + method.
   Bad: "Worked on APIs and fixed bugs."
   Good: "Cut p95 API latency 35% for checkout traffic by introducing Redis caching and batching DB reads."
   Keep bullets tight (ideally ≤22 words) while preserving XYZ.
6. Mirror JD terminology where honest (e.g. "REST APIs" if they built APIs).
7. Reorder / emphasize experience and projects that best match this JD; de-emphasize or drop weakly related ones (do not invent replacements).
8. Summary: 2–3 lines, role-targeted, keyword-rich, no fluff — sound like the ideal hire for THIS job title.
9. Output must fit a clean single-column ATS-friendly resume.
10. ${densityGuide}
11. CONTACT & PROJECT LINKS ARE MANDATORY TO PRESERVE: copy contact.linkedin, contact.github, contact.website, contact.email, contact.phone, contact.location EXACTLY from the profile when present. For every kept project that has a url in the profile, keep that exact url. Never omit LinkedIn/GitHub/portfolio/project live links.`,
    user: JSON.stringify(
      {
        profile: params.profile,
        analysis: params.analysis,
        answers: params.answers,
        skillDirectives: {
          removeSkills: pruned,
          keepDespiteOffJd: keepFromPrune,
          confirmedGapSkills: confirmedGaps,
          deniedGapSkills: deniedGaps,
        },
      },
      null,
      2
    ),
    schema: tailoredSchema,
    temperature: 0.25,
    retryOnSchemaMismatch: true,
  }).then((tailored) =>
    applySkillPruning(
      preserveProfileLinks(params.profile, tailored),
      params.answers
    )
  );
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
