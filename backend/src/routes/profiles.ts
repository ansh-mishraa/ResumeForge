import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { ProfileService } from '../services/profileService.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/errorResponse.js';
import { ValidationError } from '../types/errors.js';
import type { MasterProfile } from '../types/profile.js';
import { requireAuth } from '../middleware/auth.js';
import { asAuthed } from '../types/auth.js';

const uploadDir = path.resolve('uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get('/', async (req, res) => {
  try {
    const profiles = await ProfileService.list(asAuthed(req).user.id);
    return sendSuccessResponse(res, profiles);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

profileRouter.get('/:id', async (req, res) => {
  try {
    const profile = await ProfileService.getById(
      asAuthed(req).user.id,
      req.params.id
    );
    return sendSuccessResponse(res, profile);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

profileRouter.post('/text', async (req, res) => {
  try {
    const schema = z.object({
      resumeText: z.string().min(40),
      label: z.string().min(2).max(80),
    });
    const body = schema.parse(req.body);
    const profile = await ProfileService.createFromText(
      asAuthed(req).user.id,
      body.resumeText,
      body.label
    );
    return sendSuccessResponse(res, profile, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

profileRouter.post(
  '/upload',
  (req, res, next) => {
    upload.single('resume')(req, res, (err: unknown) => {
      if (err) {
        const message =
          err instanceof Error ? err.message : 'File upload failed';
        return sendErrorResponse(res, new ValidationError(message));
      }
      return next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) throw new ValidationError('Resume file is required');
      if (!req.file.size) throw new ValidationError('Uploaded file is empty');
      const label =
        typeof req.body?.label === 'string' ? req.body.label : '';

      const profile = await ProfileService.createFromFile(
        asAuthed(req).user.id,
        req.file.path,
        req.file.mimetype,
        req.file.originalname,
        label
      );
      fs.unlink(req.file.path, () => undefined);
      return sendSuccessResponse(res, profile, 201);
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => undefined);
      console.error('Resume upload failed', {
        error: error instanceof Error ? error.message : error,
        name: req.file?.originalname,
        mime: req.file?.mimetype,
        size: req.file?.size,
      });
      return sendErrorResponse(res, error);
    }
  }
);

profileRouter.patch('/:id/label', async (req, res) => {
  try {
    const schema = z.object({ label: z.string().min(2).max(80) });
    const body = schema.parse(req.body);
    const profile = await ProfileService.rename(
      asAuthed(req).user.id,
      req.params.id,
      body.label
    );
    return sendSuccessResponse(res, profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

profileRouter.put('/:id', async (req, res) => {
  try {
    const data = req.body as MasterProfile;
    if (!data?.contact?.name) throw new ValidationError('Invalid profile payload');
    const profile = await ProfileService.updateData(
      asAuthed(req).user.id,
      req.params.id,
      data
    );
    return sendSuccessResponse(res, profile);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});

profileRouter.delete('/:id', async (req, res) => {
  try {
    await ProfileService.delete(asAuthed(req).user.id, req.params.id);
    return sendSuccessResponse(res, { deleted: true });
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});
