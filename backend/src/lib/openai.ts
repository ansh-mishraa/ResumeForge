import { Agent, CursorAgentError } from '@cursor/sdk';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AppError } from '../types/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_CWD = path.resolve(__dirname, '../../.cursor-agent-cwd');

function ensureAgentCwd() {
  fs.mkdirSync(AGENT_CWD, { recursive: true });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new AppError('AI returned invalid JSON', 502, 'AI_INVALID_JSON');
  }
}

function resolveModel(): { id: string; params?: Array<{ id: string; value: string }> } {
  const modelId = process.env.CURSOR_MODEL || 'auto';
  if (modelId === 'auto-smart') {
    return {
      id: 'auto-smart',
      params: [
        {
          id: 'optimize_for',
          value: process.env.CURSOR_OPTIMIZE_FOR || 'balanced',
        },
      ],
    };
  }
  return { id: modelId };
}

async function chatViaCursor(system: string, user: string): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      'CURSOR_API_KEY is not set. Create one at https://cursor.com/dashboard/integrations and add it to backend/.env',
      500,
      'MISSING_API_KEY'
    );
  }

  ensureAgentCwd();

  const prompt = `${system}

CRITICAL OUTPUT RULES:
- Do not use tools, edit files, or explore the workspace.
- Reply with a single JSON object only. No markdown, no commentary.

USER INPUT:
${user}`;

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: resolveModel(),
      local: { cwd: AGENT_CWD, settingSources: [] },
    });

    if (result.status !== 'finished') {
      throw new AppError(
        result.error?.message || `Cursor agent run ended with status ${result.status}`,
        502,
        'CURSOR_RUN_FAILED'
      );
    }

    const text = result.result?.trim();
    if (!text) {
      throw new AppError('Empty response from Cursor model', 502, 'AI_EMPTY');
    }
    return text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof CursorAgentError) {
      throw new AppError(
        `Cursor SDK error: ${error.message}`,
        502,
        'CURSOR_SDK_ERROR'
      );
    }
    throw error;
  }
}

async function chatViaOpenAI(system: string, user: string, temperature?: number): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OPENAI_API_KEY is not set', 500, 'MISSING_API_KEY');
  }

  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  const completion = await openai.chat.completions.create({
    model,
    temperature: temperature ?? 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new AppError('Empty response from AI model', 502, 'AI_EMPTY');
  }
  return raw;
}

export async function chatJson<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
  retryOnSchemaMismatch?: boolean;
}): Promise<T> {
  const provider = (process.env.AI_PROVIDER || 'cursor').toLowerCase();
  const hasCursor = Boolean(process.env.CURSOR_API_KEY?.trim());
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());

  const runOnce = async (system: string, user: string) => {
    if (provider === 'openai') {
      return chatViaOpenAI(system, user, params.temperature);
    }
    if (provider === 'cursor') {
      return chatViaCursor(system, user);
    }
    if (hasCursor) {
      return chatViaCursor(system, user);
    }
    if (hasOpenAI) {
      return chatViaOpenAI(system, user, params.temperature);
    }
    throw new AppError(
      'No AI key configured. Set CURSOR_API_KEY (recommended with Pro) or OPENAI_API_KEY in backend/.env',
      500,
      'MISSING_API_KEY'
    );
  };

  let raw = await runOnce(params.system, params.user);
  let parsed = extractJson(raw);
  let result = params.schema.safeParse(parsed);

  if (!result.success && params.retryOnSchemaMismatch) {
    raw = await runOnce(
      `${params.system}

Your previous JSON did not match the required schema. Fix it.
Validation errors:
${result.error.message}
Return corrected JSON only.`,
      params.user
    );
    parsed = extractJson(raw);
    result = params.schema.safeParse(parsed);
  }

  if (!result.success) {
    throw new AppError(
      `AI response failed validation: ${result.error.message}`,
      502,
      'AI_SCHEMA_MISMATCH'
    );
  }

  return result.data;
}
