import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService.js';
import {
  clearAuthCookie,
  requireAuth,
  setAuthCookie,
} from '../middleware/auth.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/errorResponse.js';
import { ValidationError } from '../types/errors.js';
import { asAuthed } from '../types/auth.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const { user, token } = await AuthService.register(
      body.email,
      body.password,
      body.name
    );
    setAuthCookie(res, token);
    return sendSuccessResponse(res, { user, token }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const body = schema.parse(req.body);
    const { user, token } = await AuthService.login(body.email, body.password);
    setAuthCookie(res, token);
    return sendSuccessResponse(res, { user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendErrorResponse(res, new ValidationError(error.message));
    }
    return sendErrorResponse(res, error);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return sendSuccessResponse(res, { loggedOut: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await AuthService.getUserById(asAuthed(req).user.id);
    return sendSuccessResponse(res, { user });
  } catch (error) {
    return sendErrorResponse(res, error);
  }
});
