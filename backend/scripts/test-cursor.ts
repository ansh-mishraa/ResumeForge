import dotenv from 'dotenv';
dotenv.config({ override: true });

import { Agent, CursorAgentError } from '@cursor/sdk';
import path from 'node:path';
import fs from 'node:fs';

const cwd = path.resolve('.cursor-agent-cwd');
fs.mkdirSync(cwd, { recursive: true });

async function main() {
  if (!process.env.CURSOR_API_KEY?.trim()) {
    throw new Error('CURSOR_API_KEY missing');
  }

  console.log('Calling Cursor Agent.prompt...');
  try {
    const result = await Agent.prompt(
      'Do not use tools. Reply with JSON only, no markdown: {"ok":true,"message":"hello"}',
      {
        apiKey: process.env.CURSOR_API_KEY,
        model: { id: process.env.CURSOR_MODEL || 'auto' },
        local: { cwd, settingSources: [] },
      }
    );
    console.log(
      JSON.stringify(
        {
          status: result.status,
          result: (result.result || '').slice(0, 500),
          error: result.error,
          model: result.model,
        },
        null,
        2
      )
    );
  } catch (error) {
    if (error instanceof CursorAgentError) {
      console.error('CursorAgentError:', error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
