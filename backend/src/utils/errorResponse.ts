import type { Response } from 'express';
import { AppError } from '../types/errors.js';

export function sendSuccessResponse<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendErrorResponse(res: Response, error: unknown) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { message: error.message, code: error.code },
    });
  }

  console.error('Unhandled error', error);
  return res.status(500).json({
    success: false,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
}
