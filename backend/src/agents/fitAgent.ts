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

/** Fit scoring only cares about gap answers, not skill-prune keep/remove. */
function gapAnswersOnly(answers?: UserAnswer[]) {
  return (answers ?? []).filter((a) => (a.kind ?? 'gap') === 'gap');
}

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
- userAnswers may include kind="gap" (skill presence) and kind="prune" (keep/remove off-role skills). IGNORE prune answers for deny/score — they do not mean the candidate lacks a JD skill.
- If gap answers say hasSkill=false for a must-have, weigh that heavily toward deny when multiple critical gaps exist.

Return JSON ONLY in this exact shape (all fields required):
{
  "score": 72,
  "decision": "proceed",
  "reason": "Strong backend overlap; missing one secondary tool.",
  "matchedSkills": ["Node.js", "PostgreSQL"],
  "missingCritical": ["Kubernetes"]
}
decision must be exactly "proceed" or "deny". reason/matchedSkills/missingCritical must always be present (use [] if none).`,
    user: JSON.stringify(
      { profile, analysis, answers: gapAnswersOnly(answers) },
      null,
      2
    ),
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
      const importanceRaw = String(row.importance || 'nice').toLowerCase();
      const kindRaw = String(row.kind || 'gap').toLowerCase();
      const kind = kindRaw === 'prune' ? 'prune' : 'gap';
      const skill = String(row.skill || row.name || `Skill ${idx + 1}`);
      const defaultQ =
        kind === 'prune'
          ? `"${skill}" does not appear relevant to this role. Remove it from the tailored resume?`
          : `Do you have experience with ${skill}? If yes, briefly where/how.`;
      return {
        id: String(row.id || `q-${idx + 1}`),
        kind,
        skill,
        importance:
          kind === 'prune'
            ? 'nice'
            : importanceRaw === 'nice'
              ? 'nice'
              : 'must',
        question: String(row.question || defaultQ),
        reason:
          kind === 'prune' && row.reason
            ? String(row.reason)
            : undefined,
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
        kind: z.enum(['gap', 'prune']),
        skill: z.string(),
        importance: z.enum(['must', 'nice']),
        question: z.string(),
        reason: z.string().optional(),
      })
    ),
  })
);

export async function generateClarifyingQuestions(
  profile: MasterProfile,
  analysis: JdAnalysis
): Promise<ClarifyingQuestion[]> {
  const result = await chatJson({
    system: `You prepare clarifying questions so the tailored resume looks purpose-built for THIS job.

Produce TWO kinds of questions (max 8 total):

1) kind="gap" — JD skills/tools NOT clearly evidenced on the resume.
   - Prefer must-haves, then high-value nice-to-haves.
   - Max 5 gap questions. Skip soft-skill fluff.
   - Direct wording: "Do you have experience with X? If yes, briefly where/how."
   - importance: "must" or "nice" based on the JD.

2) kind="prune" — skills ALREADY on the resume that are clearly OFF-ROLE for this JD
   (different career track / domain noise that would distract recruiters).
   - Ask whether the user wants them REMOVED so the resume reads as a perfect fit for this role.
   - Max 4 prune questions. Only propose skills that are truly irrelevant or far from the role.
   - DO NOT propose pruning skills that are:
       • listed or closely implied in the JD
       • adjacent / transferable to the role domain
       • modern or high-signal in that stack even if not spelled out in the JD
         (examples: JNI or NDK for Android/native roles; TypeScript for JS roles;
          Docker for backend/devops-adjacent; GraphQL near API work; Kotlin near Android/JVM)
   - Include a short "reason" explaining why it looks off-role.
   - importance should be "nice".
   - Question tone: '"Photoshop" is not related to this backend role. Remove it from the tailored resume?'

If nothing to ask, return { "questions": [] }.

Return JSON ONLY:
{
  "questions": [
    { "id": "q-1", "kind": "gap", "skill": "Kubernetes", "importance": "must", "question": "Do you have experience with Kubernetes? If yes, briefly where/how." },
    { "id": "q-2", "kind": "prune", "skill": "Adobe Illustrator", "importance": "nice", "reason": "Design tool unrelated to this backend role", "question": "\\"Adobe Illustrator\\" does not appear relevant to this role. Remove it from the tailored resume?" }
  ]
}`,
    user: JSON.stringify({ profile, analysis }, null, 2),
    schema: questionsSchema,
    temperature: 0.2,
    retryOnSchemaMismatch: true,
  });

  return result.questions;
}
