import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../types/errors.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.resolve(__dirname, '../../generated');

async function detectEngine(): Promise<'tectonic' | 'pdflatex' | null> {
  if (process.env.LATEX_ENGINE) {
    return process.env.LATEX_ENGINE as 'tectonic' | 'pdflatex';
  }
  for (const eng of ['tectonic', 'pdflatex'] as const) {
    try {
      await execFileAsync(eng, ['--version'], { windowsHide: true });
      return eng;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function compileLatexToPdf(
  latex: string,
  basename: string
): Promise<{ pdfPath: string; texPath: string } | null> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const texPath = path.join(GENERATED_DIR, `${basename}.tex`);
  const pdfPath = path.join(GENERATED_DIR, `${basename}.pdf`);
  await fs.writeFile(texPath, latex, 'utf8');

  const engine = await detectEngine();
  if (!engine) {
    return null;
  }

  try {
    if (engine === 'tectonic') {
      await execFileAsync(
        'tectonic',
        ['-o', GENERATED_DIR, texPath],
        { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
      );
    } else {
      await execFileAsync(
        'pdflatex',
        ['-interaction=nonstopmode', `-output-directory=${GENERATED_DIR}`, texPath],
        { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(`LaTeX compilation failed: ${message}`, 500, 'LATEX_COMPILE_FAILED');
  }

  try {
    await fs.access(pdfPath);
  } catch {
    throw new AppError('PDF was not produced by LaTeX engine', 500, 'PDF_MISSING');
  }

  return { pdfPath, texPath };
}

export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const bytes = await fs.readFile(pdfPath);
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** Heuristic fill ratio from text length vs page — used when PDF unavailable */
export function estimateDensity(latex: string): 'sparse' | 'balanced' | 'tight' | 'overflow' {
  const content = latex
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = content.split(' ').filter(Boolean).length;
  if (words < 280) return 'sparse';
  if (words < 420) return 'balanced';
  if (words < 560) return 'tight';
  return 'overflow';
}
