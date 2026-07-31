import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { TailorOrchestrator } from '../services/tailorOrchestrator.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/errorResponse.js';
import { NotFoundError, ValidationError } from '../types/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asAuthed } from '../types/auth.js';

export const tailorRouter = Router();
tailorRouter.use(requireAuth);

tailorRouter.get('/sessions', async (req, res) => {
  try {
    const profileId =
      typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
    const sessions = await TailorOrchestrator.listSessions(
      asAuthed(req).user.id,
      profileId
    );
    return sendSuccessResponse(res, sessions);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

tailorRouter.get('/sessions/:id', async (req, res) => {
  try {
    const session = await TailorOrchestrator.getSession(
      asAuthed(req).user.id,
      req.params.id
    );
    return sendSuccessResponse(res, session);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

tailorRouter.post('/sessions', async (req, res) => {
  try {
    const schema = z.object({
      profileId: z.string().uuid(),
      jobDescription: z.string().min(80),
    });
    const body = schema.parse(req.body);
    const session = await TailorOrchestrator.startSession(
      asAuthed(req).user.id,
      body.profileId,
      body.jobDescription
    );
    return sendSuccessResponse(res, session, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

tailorRouter.post('/sessions/:id/answers', async (req, res) => {
  try {
    const schema = z.object({
      answers: z.array(
        z.object({
          questionId: z.string(),
          skill: z.string(),
          kind: z.enum(['gap', 'prune']).optional(),
          hasSkill: z.boolean(),
          details: z.string().optional(),
        })
      ),
    });
    const body = schema.parse(req.body);
    const session = await TailorOrchestrator.submitAnswers(
      asAuthed(req).user.id,
      req.params.id,
      body.answers
    );
    return sendSuccessResponse(res, session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

tailorRouter.post('/sessions/:id/fit-page', async (req, res) => {
  try {
    const session = await TailorOrchestrator.fitToSinglePageSpacingOnly(
      asAuthed(req).user.id,
      req.params.id
    );
    return sendSuccessResponse(res, session);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

tailorRouter.get('/sessions/:id/latex', async (req, res) => {
  try {
    const session = await TailorOrchestrator.getSession(
      asAuthed(req).user.id,
      req.params.id
    );
    if (!session.latexCode) throw new NotFoundError('LaTeX not ready yet');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="resume-${String(session.id).slice(0, 8)}.tex"`
    );
    return res.send(session.latexCode);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

tailorRouter.get('/sessions/:id/pdf', async (req, res) => {
  try {
    const session = await TailorOrchestrator.getSession(
      asAuthed(req).user.id,
      req.params.id
    );
    if (!session.pdfPath || !fs.existsSync(String(session.pdfPath))) {
      throw new NotFoundError(
        'PDF not available. Install tectonic or pdflatex, or copy the LaTeX into Overleaf.'
      );
    }
    return res.download(
      path.resolve(String(session.pdfPath)),
      `resume-${session.company || 'tailored'}.pdf`
    );
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});
