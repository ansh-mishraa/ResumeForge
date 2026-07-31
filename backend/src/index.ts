import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { profileRouter } from './routes/profiles.js';
import { tailorRouter } from './routes/tailor.js';
import { authRouter } from './routes/auth.js';
import { sendErrorResponse } from './utils/errorResponse.js';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  const provider = (process.env.AI_PROVIDER || 'cursor').toLowerCase();
  res.json({
    success: true,
    data: {
      status: 'ok',
      aiProvider: provider,
      cursorConfigured: Boolean(process.env.CURSOR_API_KEY?.trim()),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      cursorModel: process.env.CURSOR_MODEL || 'auto',
      latexHint:
        'Install tectonic (recommended) or pdflatex for local PDF downloads',
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/tailor', tailorRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    return sendErrorResponse(res, err);
  }
);

app.listen(port, () => {
  console.log(`Resume Tailor API listening on http://localhost:${port}`);
}).setTimeout(10 * 60 * 1000);
