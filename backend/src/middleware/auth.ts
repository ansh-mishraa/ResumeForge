import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { UnauthorizedError } from '../types/errors.js';
import { asAuthed } from '../types/auth.js';
import { sendErrorResponse } from '../utils/errorResponse.js';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    AuthService.cookieName
  ];
  return cookieToken || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedError();
    const user = AuthService.verifyToken(token);
    asAuthed(req).user = user;
    return next();
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AuthService.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AuthService.cookieName, { path: '/' });
}
