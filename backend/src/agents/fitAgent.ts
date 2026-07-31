import { z } from 'zod';
import { chatJson } from '../lib/openai.js';
import type {
  ClarifyingQuestion,
  FitAssessment,
  JdAnalysis,
  MasterProfile,
  UserAnswer,
} from '../types/profile.js';

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeFit(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;

  const scoreRaw = raw.score ?? raw.fitScore ?? raw.matchScore;
  const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
  const decisionRaw = String(raw.decision ?? raw.verdict ?? '').toLowerCase();
  const decision =
    decisionRaw === 'deny' ||
    decisionRaw === 'reject' ||
    decisionRaw === 'no'
      ? 'deny'
      : 'proceed';

  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    decision,
    reason: String(
      raw.reason ??
        raw.explanation ??
        raw.summary ??
        raw.message ??
        (decision === 'deny'
          ? 'Role does not sufficiently match the candidate skill set.'
          : 'Candidate has enough overlapping skills to proceed.')
    ),
    matchedSkills: asStringArray(
      raw.matchedSkills ?? raw.matched ?? raw.matchingSkills ?? []
    ),
    missingCritical: asStringArray(
      raw.missingCritical ?? raw.missing ?? raw.gaps ?? raw.criticalGaps ?? []
    ),
  };
}

const fitSchema = z.preprocess(
  normalizeFit,
  z.object({
    score: z.number().min(0).max(100),
    decision: z.enum(['proceed', 'deny']),
    reason: z.string().min(1),
    matchedSkills: z.array(z.string()),
    missingCritical: z.array(z.string()),
  })
);

export async function assessFit(
  profile: MasterProfile,
  analysis: JdAnalysis,
  answers?: UserAnswer[]
): Promise<FitAssessment> {
  return chatJson({
    system: `You are a ruthless but fair career advisor. Score how well a candidate's REAL skill set matches a job.

Decision rules:
- score 0-100 based on must-have overlap, transferable experience, seniority alignment.
- DENY (decision="deny") if the role is fundamentally mismatched: different career track, missing most must-haves with no transferable evidence, or user confirmed they lack critical skills.
- PROCEED if there is a realistic path to interview (including transferable skills).
- Never invent skills. Only use profile + userAnswers.
- If userAnswers say hasSkill=false for a must-have, weigh that heavily toward deny when multiple critical gaps exist.

Return JSON ONLY in this exact shape (all fields required):
{
  "score": 72,
  "decision": "proceed",
  "reason": "Strong backend overlap; missing one secondary tool.",
  "matchedSkills": ["Node.js", "PostgreSQL"],
  "missingCritical": ["Kubernetes"]
}
decision must be exactly "proceed" or "deny". reason/matchedSkills/missingCritical must always be present (use [] if none).`,
    user: JSON.stringify({ profile, analysis, answers: answers ?? [] }, null, 2),
    schema: fitSchema,
    temperature: 0.15,
    retryOnSchemaMismatch: true,
  });
}

function normalizeQuestions(input: unknown): unknown {
  if (!input || typeof input !== 'object') return { questions: [] };
  const raw = input as Record<string, unknown>;
  const list = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(raw)
      ? raw
      : [];

  return {
    questions: list.map((item, idx) => {
      const row = (item || {}) as Record<string, unknown>;
      const importanceRaw = String(row.importance || 'must').toLowerCase();
      return {
        id: String(row.id || `q-${idx + 1}`),
        skill: String(row.skill || row.name || `Skill ${idx + 1}`),
        importance: importanceRaw === 'nice' ? 'nice' : 'must',
        question: String(
          row.question || `Do you have experience with ${row.skill || 'this skill'}?`
        ),
      };
    }),
  };
}

const questionsSchema = z.preprocess(
  normalizeQuestions,
  z.object({
    questions: z.array(
      z.object({
        id: z.string(),
        skill: z.string(),
        importance: z.enum(['must', 'nice']),
        question: z.string(),
      })
    ),
  })
);

export async function generateClarifyingQuestions(
  profile: MasterProfile,
  analysis: JdAnalysis
): Promise<ClarifyingQuestion[]> {
  const result = await chatJson({
    system: `Find skills/tools in the JD that are NOT clearly evidenced in the resume.
Ask short yes/no+details questions only for material gaps (prefer must-haves, then high-value nice-to-haves).
Max 6 questions. Skip soft skills fluff. If resume already covers a skill, do not ask.
Each question should be direct: "Do you have experience with X? If yes, briefly where/how."

Return JSON ONLY:
{
  "questions": [
    { "id": "q-1", "skill": "Kubernetes", "importance": "must", "question": "Do you have experience with Kubernetes? If yes, briefly where/how." }
  ]
}
If no gaps, return { "questions": [] }.`,
    user: JSON.stringify({ profile, analysis }, null, 2),
    schema: questionsSchema,
    temperature: 0.2,
    retryOnSchemaMismatch: true,
  });

  return result.questions;
}
