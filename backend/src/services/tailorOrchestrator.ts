import { prisma } from '../lib/db.js';
import { analyzeJobDescription } from '../agents/analyzeAgent.js';
import {
  assessFit,
  generateClarifyingQuestions,
} from '../agents/fitAgent.js';
import { scoreAtsMatch } from '../agents/tailorAgent.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import type {
  ClarifyingQuestion,
  JdAnalysis,
  MasterProfile,
  TailoredResume,
  UserAnswer,
} from '../types/profile.js';
import { fromJson, toJson } from '../utils/json.js';
import { optimizeSinglePage } from './pageOptimizer.js';
import { ProfileService } from './profileService.js';
import {
  detectSpacingFromLatex,
  nextTighterSpacing,
  renderLatex,
} from './latexRenderer.js';
import { compileLatexToPdf, estimateDensity, getPdfPageCount } from './pdfCompiler.js';

function serializeSession<T extends Record<string, unknown>>(row: T) {
  const analysis = fromJson((row as { analysis?: string | null }).analysis, null);
  const clarifyingQs = fromJson<ClarifyingQuestion[] | null>(
    (row as { clarifyingQs?: string | null }).clarifyingQs,
    null
  );
  const userAnswers = fromJson<UserAnswer[] | null>(
    (row as { userAnswers?: string | null }).userAnswers,
    null
  );
  const tailoredContent = fromJson<TailoredResume | null>(
    (row as { tailoredContent?: string | null }).tailoredContent,
    null
  );
  const pageOptimization = fromJson(
    (row as { pageOptimization?: string | null }).pageOptimization,
    null
  );

  return {
    ...row,
    analysis,
    clarifyingQs,
    userAnswers,
    tailoredContent,
    pageOptimization,
  };
}

export class TailorOrchestrator {
  static async startSession(
    userId: string,
    profileId: string,
    jobDescription: string
  ) {
    if (!jobDescription.trim()) {
      throw new ValidationError('Job description is required');
    }

    const profile = await ProfileService.getById(userId, profileId);
    const master = profile.data;

    const session = await prisma.tailorSession.create({
      data: {
        userId,
        profileId,
        jobDescription,
        status: 'ANALYZING',
      },
    });

    try {
      const analysis = await analyzeJobDescription(jobDescription);

      await prisma.tailorSession.update({
        where: { id: session.id },
        data: {
          jobTitle: analysis.jobTitle,
          company: analysis.company,
          analysis: toJson(analysis),
        },
      });

      const fit = await assessFit(master, analysis);

      if (fit.decision === 'deny') {
        const denied = await prisma.tailorSession.update({
          where: { id: session.id },
          data: {
            status: 'DENIED',
            fitScore: fit.score,
            fitReason: fit.reason,
            analysis: toJson({ ...analysis, fit }),
          },
        });
        return serializeSession(denied);
      }

      const questions = await generateClarifyingQuestions(master, analysis);

      if (questions.length === 0) {
        return this.completeTailoring(userId, session.id, []);
      }

      const awaiting = await prisma.tailorSession.update({
        where: { id: session.id },
        data: {
          status: 'AWAITING_ANSWERS',
          fitScore: fit.score,
          fitReason: fit.reason,
          clarifyingQs: toJson(questions),
          analysis: toJson({ ...analysis, fit }),
        },
      });
      return serializeSession(awaiting);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      await prisma.tailorSession.update({
        where: { id: session.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw error;
    }
  }

  static async submitAnswers(
    userId: string,
    sessionId: string,
    answers: UserAnswer[]
  ) {
    const session = await this.getSession(userId, sessionId);
    if (session.status !== 'AWAITING_ANSWERS') {
      throw new ValidationError('Session is not awaiting answers');
    }

    const profile = await ProfileService.getById(userId, session.profileId as string);
    const master = profile.data;
    const analysisObj = (session.analysis as JdAnalysis | null) || {
      jobTitle: 'Unknown',
      mustHaveSkills: [],
      niceToHaveSkills: [],
      keywords: [],
      responsibilities: [],
    };

    const fit = await assessFit(master, analysisObj, answers);

    if (fit.decision === 'deny') {
      const denied = await prisma.tailorSession.update({
        where: { id: sessionId },
        data: {
          status: 'DENIED',
          userAnswers: toJson(answers),
          fitScore: fit.score,
          fitReason: fit.reason,
        },
      });
      return serializeSession(denied);
    }

    await prisma.tailorSession.update({
      where: { id: sessionId },
      data: {
        userAnswers: toJson(answers),
        fitScore: fit.score,
        fitReason: fit.reason,
        status: 'TAILORING',
      },
    });

    return this.completeTailoring(userId, sessionId, answers);
  }

  static async completeTailoring(
    userId: string,
    sessionId: string,
    answers: UserAnswer[]
  ) {
    const raw = await prisma.tailorSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!raw) throw new NotFoundError('Session not found');

    const profile = await ProfileService.getById(userId, raw.profileId);
    const master = profile.data;
    const analysis = fromJson<JdAnalysis>(raw.analysis, {
      jobTitle: 'Unknown',
      mustHaveSkills: [],
      niceToHaveSkills: [],
      keywords: [],
      responsibilities: [],
    });

    try {
      await prisma.tailorSession.update({
        where: { id: sessionId },
        data: { status: 'OPTIMIZING' },
      });

      const result = await optimizeSinglePage({
        profile: master,
        analysis,
        answers,
        sessionId,
      });

      const ats = await scoreAtsMatch(result.tailored, analysis);

      const completed = await prisma.tailorSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          tailoredContent: toJson(result.tailored),
          latexCode: result.latex,
          pdfPath: result.pdfPath,
          atsScore: ats.score,
          pageOptimization: toJson({
            ...result.optimization,
            ats,
          }),
        },
      });
      return serializeSession(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tailoring failed';
      await prisma.tailorSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw error;
    }
  }

  static async getSession(userId: string, id: string) {
    const session = await prisma.tailorSession.findFirst({
      where: { id, userId },
      include: {
        profile: {
          select: { id: true, name: true, email: true, label: true },
        },
      },
    });
    if (!session) throw new NotFoundError('Session not found');
    return serializeSession(session);
  }

  /**
   * Tighten LaTeX spacing only — never rewrite or drop resume content/keywords.
   */
  static async fitToSinglePageSpacingOnly(userId: string, sessionId: string) {
    const raw = await prisma.tailorSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!raw) throw new NotFoundError('Session not found');
    if (raw.status !== 'COMPLETED' || !raw.latexCode) {
      throw new ValidationError('Session must be completed with LaTeX before fitting');
    }

    const tailored = fromJson<TailoredResume | null>(raw.tailoredContent, null);
    if (!tailored) {
      throw new ValidationError('Missing tailored resume content');
    }

    const opt = fromJson<Record<string, unknown>>(raw.pageOptimization, {});
    const current =
      (typeof opt.spacing === 'string' && opt.spacing) ||
      detectSpacingFromLatex(raw.latexCode);

    const tighter = nextTighterSpacing(current);
    if (!tighter) {
      throw new ValidationError(
        'Already at maximum density. Spacing cannot be reduced further without removing content — which this action will not do.'
      );
    }

    const latex = renderLatex(tailored, tighter);
    let pdfPath: string | null = raw.pdfPath;
    let pageCount =
      typeof opt.pageCount === 'number' ? opt.pageCount : 1;

    const compiled = await compileLatexToPdf(latex, `${sessionId}-fit-${tighter}`);
    if (compiled) {
      pdfPath = compiled.pdfPath;
      pageCount = await getPdfPageCount(compiled.pdfPath);
    }

    const notes = Array.isArray(opt.notes) ? [...(opt.notes as string[])] : [];
    notes.push(
      `Fit-to-page (spacing only): ${current} → ${tighter}; content/keywords unchanged`
    );

    const updated = await prisma.tailorSession.update({
      where: { id: sessionId },
      data: {
        latexCode: latex,
        pdfPath,
        pageOptimization: toJson({
          ...opt,
          pageCount,
          spacing: tighter,
          strategy: 'reduce_spacing',
          density: estimateDensity(latex),
          notes,
        }),
      },
      include: {
        profile: {
          select: { id: true, name: true, email: true, label: true },
        },
      },
    });

    return serializeSession(updated);
  }

  static async listSessions(userId: string, profileId?: string) {
    return prisma.tailorSession.findMany({
      where: {
        userId,
        ...(profileId ? { profileId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        profileId: true,
        jobTitle: true,
        company: true,
        status: true,
        fitScore: true,
        atsScore: true,
        createdAt: true,
        latexCode: true,
        profile: {
          select: { id: true, name: true, label: true },
        },
      },
    }).then((rows) =>
      rows.map(({ latexCode, ...rest }) => ({
        ...rest,
        hasLatex: Boolean(latexCode),
      }))
    );
  }
}
