import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type ExtractedLink = {
  url: string;
  label?: string;
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/g, '');
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('mailto:')
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProtocol);
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function classifyLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('github.com')) return 'GitHub';
  if (lower.startsWith('mailto:')) return 'Email';
  if (lower.includes('gitlab.com')) return 'GitLab';
  if (
    lower.includes('portfolio') ||
    lower.includes('vercel.app') ||
    lower.includes('netlify.app')
  ) {
    return 'Portfolio';
  }
  return 'Link';
}

function dedupeLinks(links: ExtractedLink[]): ExtractedLink[] {
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  for (const link of links) {
    const key = link.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function extractUrlsFromText(text: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const urlRe =
    /\b((?:https?:\/\/|www\.)[^\s<>"'）】\]]+|linkedin\.com\/in\/[^\s<>"']+|github\.com\/[^\s<>"']+)/gi;
  for (const match of text.matchAll(urlRe)) {
    const url = normalizeUrl(match[1]);
    if (url) links.push({ url, label: classifyLabel(url) });
  }
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  for (const match of text.matchAll(emailRe)) {
    links.push({ url: `mailto:${match[0]}`, label: 'Email' });
  }
  return links;
}

async function extractPdfAnnotationLinks(buffer: Buffer): Promise<ExtractedLink[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const links: ExtractedLink[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const annotations = await page.getAnnotations({ intent: 'display' });
    for (const ann of annotations as Array<Record<string, unknown>>) {
      if (String(ann.subtype || '') !== 'Link') continue;
      const rawUrl =
        (typeof ann.url === 'string' && ann.url) ||
        (typeof ann.unsafeUrl === 'string' && ann.unsafeUrl) ||
        '';
      const url = normalizeUrl(rawUrl);
      if (!url) continue;
      const contents =
        typeof ann.contents === 'string' && ann.contents.trim()
          ? ann.contents.trim()
          : undefined;
      links.push({ url, label: contents || classifyLabel(url) });
    }
  }

  await doc.destroy();
  return links;
}

async function extractPdfTextWithPdfjs(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let line = '';
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const str = item.str || '';
      const y = item.transform?.[5];
      if (lastY != null && y != null && Math.abs(lastY - y) > 6) {
        chunks.push(line.trim());
        line = str;
      } else {
        line +=
          (line && !line.endsWith(' ') && str && !str.startsWith(' ') ? ' ' : '') +
          str;
      }
      if (y != null) lastY = y;
    }
    if (line.trim()) chunks.push(line.trim());
    chunks.push('');
  }

  await doc.destroy();
  return chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatLinksAppendix(links: ExtractedLink[]): string {
  if (!links.length) return '';
  const lines = [
    '',
    '=== EMBEDDED / DETECTED LINKS (preserve these exact URLs in contact and projects) ===',
    ...links.map((l) => `- ${l.label || 'Link'}: ${l.url}`),
    '=== END LINKS ===',
  ];
  return lines.join('\n');
}

export async function extractPdfResumeText(buffer: Buffer): Promise<string> {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
    data: Buffer
  ) => Promise<{ text: string }>;

  let text = '';
  try {
    text = await extractPdfTextWithPdfjs(buffer);
  } catch {
    const parsed = await pdfParse(buffer);
    text = parsed.text || '';
  }

  text = text.replace(/\u0000/g, '').trim();

  let annotationLinks: ExtractedLink[] = [];
  try {
    annotationLinks = await extractPdfAnnotationLinks(buffer);
  } catch {
    annotationLinks = [];
  }

  const textLinks = extractUrlsFromText(text);
  const links = dedupeLinks([...annotationLinks, ...textLinks]);
  return `${text}${formatLinksAppendix(links)}`.trim();
}

export function extractLinksFromHtml(html: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(re)) {
    const url = normalizeUrl(match[1]);
    if (!url) continue;
    const label = match[2].replace(/<[^>]+>/g, '').trim() || classifyLabel(url);
    links.push({ url, label });
  }
  return dedupeLinks(links);
}
