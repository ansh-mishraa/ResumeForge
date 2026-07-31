import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { ValidationError } from '../types/errors.js';
import {
  extractLinksFromHtml,
  extractPdfResumeText,
  formatLinksAppendix,
} from './pdfExtract.js';

function extractUrlsFromPlainText(text: string): string {
  // Already handled inside extractPdfResumeText for PDFs; for txt/docx append if needed
  const urlRe =
    /\b((?:https?:\/\/|www\.)[^\s<>"']+|linkedin\.com\/in\/[^\s<>"']+|github\.com\/[^\s<>"']+)/gi;
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const links: string[] = [];
  for (const m of text.matchAll(urlRe)) links.push(m[1]);
  for (const m of text.matchAll(emailRe)) links.push(`mailto:${m[0]}`);
  if (!links.length) return text;
  const unique = [...new Set(links.map((l) => l.trim()))];
  return `${text}${formatLinksAppendix(
    unique.map((url) => ({
      url: /^https?:\/\//i.test(url) || url.startsWith('mailto:') ? url : `https://${url}`,
      label: url.includes('linkedin')
        ? 'LinkedIn'
        : url.includes('github')
          ? 'GitHub'
          : url.startsWith('mailto:')
            ? 'Email'
            : 'Link',
    }))
  )}`;
}

export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
  originalName: string
): Promise<string> {
  const lower = originalName.toLowerCase();
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    throw new ValidationError('Uploaded file could not be read');
  }

  if (!buffer.length) {
    throw new ValidationError('Uploaded file is empty');
  }

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    try {
      const text = await extractPdfResumeText(buffer);
      if (!text) {
        throw new ValidationError(
          'Could not extract text from this PDF. Try a text-based PDF, or paste the resume as text.'
        );
      }
      return text;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`PDF parse failed: ${message}`);
    }
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    try {
      const [raw, html] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);
      const text = raw.value?.trim();
      if (!text) throw new ValidationError('Could not extract text from DOCX');
      const links = extractLinksFromHtml(html.value || '');
      return `${text}${formatLinksAppendix(links)}`.trim();
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`DOCX parse failed: ${message}`);
    }
  }

  if (mimeType.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return extractUrlsFromPlainText(buffer.toString('utf8').trim());
  }

  throw new ValidationError('Unsupported file type. Upload PDF, DOCX, or TXT.');
}
